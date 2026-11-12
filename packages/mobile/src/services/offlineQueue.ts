import api from './api';
import { setObject, getObject, STORAGE_KEYS } from './storage';
import type { QueuedOperation } from '../types/offline';

const BACKOFF_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s

let processing = false;

/** Id provisório de um registro criado sem rede (vira o id do servidor quando a fila é enviada). */
export function isTempId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('temp_');
}

function getQueue(): QueuedOperation[] {
  return getObject<QueuedOperation[]>(STORAGE_KEYS.OFFLINE_QUEUE) || [];
}

function saveQueue(queue: QueuedOperation[]): void {
  setObject(STORAGE_KEYS.OFFLINE_QUEUE, queue);
}

/** Atualiza campos de uma operação já na fila (sem mexer nas outras). */
function patch(id: string, fields: Partial<QueuedOperation>): void {
  saveQueue(getQueue().map((op) => (op.id === id ? { ...op, ...fields } : op)));
}

export function enqueue(operation: Omit<QueuedOperation, 'id' | 'retryCount' | 'maxRetries' | 'createdAt'>): void {
  const queue = getQueue();
  const op: QueuedOperation = {
    ...operation,
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
  };
  queue.push(op);
  saveQueue(queue);
}

export function getCount(): number {
  return getQueue().length;
}

export function removeById(id: string): void {
  const queue = getQueue().filter((op) => op.id !== id);
  saveQueue(queue);
}

export function getAll(): QueuedOperation[] {
  return getQueue();
}

/** Esgotou as tentativas (ou o servidor recusou): fica na fila, parada, até o usuário mandar tentar de novo. */
export function isFailed(op: QueuedOperation): boolean {
  return op.retryCount >= op.maxRetries;
}

/**
 * Edita a operação que cria um registro local (ainda sem id do servidor): a edição vira parte da criação,
 * em vez de se perder. Devolve false se a criação já foi enviada ou saiu da fila.
 */
export function mergeIntoQueuedCreate(tempId: string, fields: Record<string, unknown>): boolean {
  let found = false;
  saveQueue(
    getQueue().map((op) => {
      if (op.tempId !== tempId) return op;
      found = true;
      return { ...op, payload: { ...op.payload, ...fields }, retryCount: 0, error: undefined };
    }),
  );
  return found;
}

/**
 * Edição de um registro que já existe no servidor: se já há uma edição esperando na fila para o mesmo
 * endereço, a nova a substitui (vale a última), em vez de empilhar várias.
 */
export function enqueueOrReplace(
  operation: Omit<QueuedOperation, 'id' | 'retryCount' | 'maxRetries' | 'createdAt'>,
): void {
  const queue = getQueue();
  const existing = queue.find(
    (op) => op.type === operation.type && op.endpoint === operation.endpoint && op.method === operation.method,
  );
  if (existing) {
    saveQueue(
      queue.map((op) =>
        op.id === existing.id ? { ...op, payload: operation.payload, retryCount: 0, error: undefined } : op,
      ),
    );
    return;
  }
  enqueue(operation);
}

/**
 * O servidor criou o registro que estava com id provisório. A partir daqui o id provisório não existe mais:
 * as operações que dependiam dele passam a apontar para o id real, e o cache troca o registro local pelo
 * do servidor (senão, na próxima sincronização, o mesmo paciente apareceria duas vezes).
 */
function resolveTempId(tempId: string, record: { id: number } & Record<string, any>): void {
  const realId = record.id;

  saveQueue(
    getQueue().map((op) => {
      const dependsOn = op.dependsOnTempId === tempId;
      const payloadRef = op.payload?.patient_id === tempId;
      if (!dependsOn && !payloadRef && !op.endpoint.includes(tempId)) return op;
      return {
        ...op,
        endpoint: op.endpoint.split(tempId).join(String(realId)),
        payload: payloadRef ? { ...op.payload, patient_id: realId } : op.payload,
        dependsOnTempId: dependsOn ? undefined : op.dependsOnTempId,
      };
    }),
  );

  swapInCache(STORAGE_KEYS.PATIENTS, tempId, record);
  swapInCache(STORAGE_KEYS.CONSULTATIONS, tempId, record);

  // Consultas feitas offline com este paciente passam a apontar para ele.
  const consultations = getObject<Array<Record<string, any>>>(STORAGE_KEYS.CONSULTATIONS);
  if (consultations?.some((c) => c.patient_id === tempId)) {
    setObject(
      STORAGE_KEYS.CONSULTATIONS,
      consultations.map((c) =>
        c.patient_id === tempId
          ? { ...c, patient_id: realId, patient_name: c.patient_name ?? record.full_name ?? null }
          : c,
      ),
    );
  }
}

function swapInCache(key: string, tempId: string, record: { id: number } & Record<string, any>): void {
  const items = getObject<Array<Record<string, any>>>(key);
  if (!items || !items.some((item) => item.id === tempId)) return;
  // Se a sincronização já trouxe o registro do servidor, basta tirar o provisório; senão, troca um pelo outro.
  const alreadyThere = items.some((item) => item.id === record.id);
  setObject(
    key,
    alreadyThere
      ? items.filter((item) => item.id !== tempId)
      : items.map((item) => (item.id === tempId ? record : item)),
  );
}

function describe(err: any): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return err?.message || `HTTP ${err?.response?.status}`;
}

// 4xx quer dizer que o servidor entendeu e recusou: repetir o mesmo pedido não muda nada.
// Exceções: 401 (acesso vencido, a fila pausa) e 408/429 (tente mais tarde).
function isPermanent(status?: number): boolean {
  return !!status && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}

/**
 * Envia a fila, na ordem em que foi feita.
 *  - Sem rota até o servidor: para tudo, sem gastar tentativas (voltar a conexão é que destrava).
 *  - Erro temporário (5xx, 408, 429): tenta de novo com espera, até esgotar as tentativas.
 *  - Recusa do servidor (4xx): marca como falha; só sai dela se o usuário mandar tentar de novo.
 * `retryFailed` é o botão "Sincronizar" da tela de pendências: zera as tentativas das que falharam.
 */
export async function processQueue(options: { retryFailed?: boolean } = {}): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    if (options.retryFailed) {
      saveQueue(getQueue().map((op) => (isFailed(op) ? { ...op, retryCount: 0, error: undefined } : op)));
    }

    for (const id of getQueue().map((op) => op.id)) {
      let op = getQueue().find((q) => q.id === id);
      if (!op || isFailed(op)) continue;

      // Depende de um registro que ainda não foi criado no servidor.
      if (op.dependsOnTempId) {
        const dependency = getQueue().find((q) => q.tempId === op!.dependsOnTempId);
        if (dependency) {
          patch(op.id, { error: 'Aguardando o cadastro do paciente ser enviado' });
          continue;
        }
        // O cadastro saiu da fila sem ser enviado: este atendimento nunca terá um paciente válido.
        patch(op.id, { retryCount: op.maxRetries, error: 'O paciente deste registro não foi enviado' });
        continue;
      }

      while (op && !isFailed(op)) {
        try {
          const response = await makeRequest(op.method, op.endpoint, op.payload);
          removeById(op.id);
          if (op.tempId && response?.data?.id != null) {
            resolveTempId(op.tempId, response.data);
          }
          break;
        } catch (err: any) {
          const status = err?.response?.status;

          // 401: acesso vencido; pausa a fila inteira.
          if (status === 401) return;

          // Sem resposta: sem rede até o servidor. Não é culpa da operação.
          if (!err?.response) {
            patch(op.id, { lastAttempt: new Date().toISOString(), error: 'Sem conexão com o servidor' });
            return;
          }

          const retryCount = isPermanent(status) ? op.maxRetries : op.retryCount + 1;
          patch(op.id, { retryCount, lastAttempt: new Date().toISOString(), error: describe(err) });
          op = getQueue().find((q) => q.id === id);
          if (op && !isFailed(op)) {
            await sleep(BACKOFF_DELAYS[Math.min(retryCount - 1, BACKOFF_DELAYS.length - 1)]);
          }
        }
      }
    }
  } finally {
    processing = false;
  }
}

async function makeRequest(method: string, endpoint: string, payload: Record<string, unknown>) {
  switch (method) {
    case 'POST':
      return api.post(endpoint, payload);
    case 'PUT':
      return api.put(endpoint, payload);
    case 'PATCH':
      return api.patch(endpoint, payload);
    case 'DELETE':
      return api.delete(endpoint);
    default:
      return api.post(endpoint, payload);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
