// O modo offline por dentro: criar paciente e consulta sem rede, enviar a fila depois e sincronizar.
// A rede e o armazenamento são de mentira; o que se testa é a lógica do app.
const mockStore = new Map<string, string>();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockGet = jest.fn();

jest.mock('../src/services/storage', () => ({
  STORAGE_KEYS: {
    MEDICATIONS: 'sync:medications',
    INTERACTIONS: 'sync:interactions',
    PATIENTS: 'sync:patients',
    CONSULTATIONS: 'sync:consultations',
    SYNC_METADATA: 'sync:metadata',
    OFFLINE_QUEUE: 'offline:queue',
  },
  setObject: (key: string, value: unknown) => void mockStore.set(key, JSON.stringify(value)),
  getObject: (key: string) => {
    const raw = mockStore.get(key);
    return raw ? JSON.parse(raw) : null;
  },
}));
jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: {
    post: (...a: unknown[]) => mockPost(...a),
    put: (...a: unknown[]) => mockPut(...a),
    patch: jest.fn(),
    delete: jest.fn(),
    get: (...a: unknown[]) => mockGet(...a),
  },
}));

import { STORAGE_KEYS } from '../src/services/storage';
import { getAll, processQueue } from '../src/services/offlineQueue';
import {
  createConsultationOfflineAware,
  createPatientOfflineAware,
  updatePatientOfflineAware,
} from '../src/services/offlineMutations';
import { syncUserData } from '../src/services/syncService';

const read = (key: string) => JSON.parse(mockStore.get(key) || 'null');
const patientData = { full_name: 'Maria da Silva' } as any;
const consultationData = (patient_id: unknown) =>
  ({ specialty: 'Clínica Médica', is_first_consultation: true, rawNotes: 'dor de cabeça', patient_id }) as any;

const networkError = () => Object.assign(new Error('Network Error'), { response: undefined });
const httpError = (status: number, detail = 'erro') => ({ response: { status, data: { detail } }, message: detail });

beforeEach(() => {
  mockStore.clear();
  mockPost.mockReset();
  mockPut.mockReset();
  mockGet.mockReset();
  // A espera entre tentativas (1 s, 5 s, 15 s) não deve atrasar o teste.
  jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as any);
});

afterEach(() => jest.restoreAllMocks());

describe('criar sem rede', () => {
  it('guarda o paciente no aparelho e põe o envio na fila, com ids provisórios únicos', async () => {
    const a = await createPatientOfflineAware(patientData, false);
    const b = await createPatientOfflineAware({ full_name: 'João' } as any, false);
    expect(String(a.id)).toMatch(/^temp_/);
    expect(a.id).not.toBe(b.id);
    expect(a._isLocal).toBe(true);
    expect(read(STORAGE_KEYS.PATIENTS).map((p: any) => p.full_name)).toEqual(['João', 'Maria da Silva']);
    expect(getAll().map((op) => op.type)).toEqual(['CREATE_PATIENT', 'CREATE_PATIENT']);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('com "online", mas sem alcançar o servidor, também guarda para depois', async () => {
    mockPost.mockRejectedValue(networkError());
    const saved = await createPatientOfflineAware(patientData, true);
    expect(saved._isLocal).toBe(true);
    expect(getAll()).toHaveLength(1);
  });

  it('servidor indisponível (503) também vale para guardar', async () => {
    mockPost.mockRejectedValue(httpError(503));
    expect((await createPatientOfflineAware(patientData, true))._isLocal).toBe(true);
  });

  it('se o servidor RECUSOU (422), mostra o erro e não finge que salvou', async () => {
    mockPost.mockRejectedValue(httpError(422, 'nome muito curto'));
    await expect(createPatientOfflineAware(patientData, true)).rejects.toMatchObject({ response: { status: 422 } });
    expect(read(STORAGE_KEYS.PATIENTS)).toBeNull();
    expect(getAll()).toHaveLength(0);
  });

  it('a consulta de um paciente criado offline guarda o nome e depende do cadastro', async () => {
    const patient = await createPatientOfflineAware(patientData, false);
    const consultation = await createConsultationOfflineAware(consultationData(patient.id), false);
    expect(consultation.patient_id).toBe(patient.id);
    expect(consultation.patient_name).toBe('Maria da Silva');
    const [createPatient, createConsultation] = getAll();
    expect(createConsultation.dependsOnTempId).toBe(createPatient.tempId);
  });
});

describe('editar sem rede', () => {
  it('a edição de um paciente ainda não enviado entra no próprio cadastro da fila', async () => {
    const patient = await createPatientOfflineAware(patientData, false);
    await updatePatientOfflineAware(patient.id, { full_name: 'Maria S. Silva', phone: '1199' } as any, false);
    const ops = getAll();
    expect(ops).toHaveLength(1);
    expect(ops[0].payload).toMatchObject({ full_name: 'Maria S. Silva', phone: '1199' });
    expect(read(STORAGE_KEYS.PATIENTS)[0].full_name).toBe('Maria S. Silva');
  });

  it('várias edições do mesmo paciente do servidor viram uma só (vale a última)', async () => {
    mockStore.set(STORAGE_KEYS.PATIENTS, JSON.stringify([{ id: 7, full_name: 'Ana' }]));
    await updatePatientOfflineAware(7, { full_name: 'Ana B' } as any, false);
    await updatePatientOfflineAware(7, { full_name: 'Ana Beatriz' } as any, false);
    const ops = getAll();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ type: 'UPDATE_PATIENT', endpoint: '/patients/7' });
    expect(ops[0].payload.full_name).toBe('Ana Beatriz');
  });
});

describe('enviar a fila', () => {
  async function offlineVisit() {
    const patient = await createPatientOfflineAware(patientData, false);
    const consultation = await createConsultationOfflineAware(consultationData(patient.id), false);
    return { patient, consultation };
  }

  it('o paciente é criado primeiro e a consulta sai com o id real; o cache troca o provisório pelo real', async () => {
    await offlineVisit();
    mockPost.mockImplementation(async (url: string, body: any) => {
      if (url === '/patients') return { data: { id: 41, full_name: body.full_name } };
      return { data: { id: 900, patient_id: body.patient_id, specialty: body.specialty } };
    });

    await processQueue();

    expect(mockPost.mock.calls.map(([url]) => url)).toEqual(['/patients', '/consultations']);
    expect(mockPost.mock.calls[1][1].patient_id).toBe(41);
    expect(getAll()).toHaveLength(0);
    expect(read(STORAGE_KEYS.PATIENTS)).toEqual([{ id: 41, full_name: 'Maria da Silva' }]);
    const consultations = read(STORAGE_KEYS.CONSULTATIONS);
    expect(consultations).toHaveLength(1);
    expect(consultations[0]).toMatchObject({ id: 900, patient_id: 41 });
  });

  it('se a sincronização já trouxe o paciente real antes do envio, o provisório some sem duplicar', async () => {
    const patient = await createPatientOfflineAware(patientData, false);
    // Uma sincronização intercalada já devolveu o registro do servidor (o POST tinha passado, a resposta se perdeu).
    mockStore.set(
      STORAGE_KEYS.PATIENTS,
      JSON.stringify([...read(STORAGE_KEYS.PATIENTS), { id: 41, full_name: 'Maria da Silva' }]),
    );
    mockPost.mockResolvedValue({ data: { id: 41, full_name: 'Maria da Silva' } });
    await processQueue();
    const ids = read(STORAGE_KEYS.PATIENTS).map((p: any) => p.id);
    expect(ids).toEqual([41]);
    expect(ids).not.toContain(patient.id);
  });

  it('se o paciente subiu e a consulta não, a próxima rodada já usa o id real (nada se perde entre rodadas)', async () => {
    await offlineVisit();
    let consultationFails = true;
    mockPost.mockImplementation(async (url: string, body: any) => {
      if (url === '/patients') return { data: { id: 41, full_name: body.full_name } };
      if (consultationFails) throw httpError(503);
      return { data: { id: 900, patient_id: body.patient_id } };
    });

    await processQueue();
    const [stuck] = getAll();
    expect(stuck.type).toBe('CREATE_CONSULTATION');
    expect(stuck.retryCount).toBe(3);
    expect(stuck.payload.patient_id).toBe(41); // já reescrito para o id real
    expect(stuck.dependsOnTempId).toBeUndefined();

    consultationFails = false;
    await processQueue(); // automática: não mexe no que esgotou as tentativas
    expect(getAll()).toHaveLength(1);
    await processQueue({ retryFailed: true }); // o botão "Sincronizar"
    expect(getAll()).toHaveLength(0);
    expect(read(STORAGE_KEYS.CONSULTATIONS)[0]).toMatchObject({ id: 900, patient_id: 41 });
  });

  it('sem rede até o servidor, não gasta tentativas e para a fila toda', async () => {
    await offlineVisit();
    mockPost.mockRejectedValue(networkError());
    await processQueue();
    await processQueue();
    await processQueue();
    expect(mockPost).toHaveBeenCalledTimes(3); // uma por rodada: parou na primeira
    for (const op of getAll()) expect(op.retryCount).toBe(0);
    expect(getAll()[0].error).toMatch(/Sem conexão/);
  });

  it('recusa do servidor (422) vale como falha na hora, e a consulta dependente espera sem ser enviada', async () => {
    await offlineVisit();
    mockPost.mockRejectedValue(httpError(422, 'CPF inválido'));
    await processQueue();
    const [patientOp, consultationOp] = getAll();
    expect(patientOp.retryCount).toBe(patientOp.maxRetries);
    expect(patientOp.error).toBe('CPF inválido');
    expect(consultationOp.error).toMatch(/Aguardando/);
    expect(mockPost).toHaveBeenCalledTimes(1);

    mockPost.mockClear();
    await processQueue(); // sem retryFailed, a falha não se repete sozinha
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('consulta cujo cadastro de paciente saiu da fila sem ser enviado é marcada como falha, não enviada com id inválido', async () => {
    await offlineVisit();
    const [patientOp] = getAll();
    mockStore.set(
      STORAGE_KEYS.OFFLINE_QUEUE,
      JSON.stringify(getAll().filter((op) => op.id !== patientOp.id)),
    );
    await processQueue();
    expect(mockPost).not.toHaveBeenCalled();
    const [orphan] = getAll();
    expect(orphan.retryCount).toBe(orphan.maxRetries);
    expect(orphan.error).toMatch(/paciente/);
  });

  it('acesso vencido (401) pausa a fila inteira sem gastar tentativas', async () => {
    await offlineVisit();
    mockPost.mockRejectedValue(httpError(401));
    await processQueue();
    expect(mockPost).toHaveBeenCalledTimes(1);
    for (const op of getAll()) expect(op.retryCount).toBe(0);
  });

  it('a edição guardada de um paciente existente é enviada no endereço dele', async () => {
    mockStore.set(STORAGE_KEYS.PATIENTS, JSON.stringify([{ id: 7, full_name: 'Ana' }]));
    await updatePatientOfflineAware(7, { full_name: 'Ana Beatriz' } as any, false);
    mockPut.mockResolvedValue({ data: { id: 7 } });
    await processQueue();
    expect(mockPut).toHaveBeenCalledWith('/patients/7', { full_name: 'Ana Beatriz' });
    expect(getAll()).toHaveLength(0);
  });
});

describe('sincronizar do servidor', () => {
  const consultation = (id: number, created: string) => ({ id, created_at: created, patient_id: null });
  const page = (over: Record<string, unknown>) => ({
    data: { patients: [], consultations: [], consultations_has_more: false, server_timestamp: 'T1', ...over },
  });

  it('desce as consultas em páginas até acabar, e o marco da próxima diferença é o da primeira página', async () => {
    mockGet
      .mockResolvedValueOnce(
        page({ patients: [{ id: 1, full_name: 'Ana' }], consultations: [consultation(3, '2026-03-01')], consultations_has_more: true, server_timestamp: 'T-primeira' }),
      )
      .mockResolvedValueOnce(
        page({ consultations: [consultation(2, '2026-02-01'), consultation(1, '2026-01-01')], server_timestamp: 'T-ultima' }),
      );

    const result = await syncUserData();

    expect(result).toMatchObject({ success: true, isFullSync: true, serverTimestamp: 'T-primeira' });
    expect(mockGet.mock.calls.map(([, o]) => o.params)).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 100 },
    ]);
    expect(read(STORAGE_KEYS.CONSULTATIONS).map((c: any) => c.id)).toEqual([3, 2, 1]);
    expect(read(STORAGE_KEYS.SYNC_METADATA)).toMatchObject({ lastUserDataSync: 'T-primeira', consultationsCount: 3, patientsCount: 1 });
  });

  it('a descarga completa não apaga o que foi criado sem rede e ainda não subiu', async () => {
    await createPatientOfflineAware(patientData, false);
    mockGet.mockResolvedValue(page({ patients: [{ id: 1, full_name: 'Ana' }] }));
    await syncUserData();
    const names = read(STORAGE_KEYS.PATIENTS).map((p: any) => p.full_name);
    expect(names).toEqual(['Maria da Silva', 'Ana']);
  });

  it('por diferença, pede só o que mudou desde o último marco, funde e mantém a ordem', async () => {
    mockGet.mockResolvedValueOnce(page({ consultations: [consultation(1, '2026-01-01')] }));
    await syncUserData();
    mockGet.mockResolvedValueOnce(page({ consultations: [consultation(2, '2026-02-01')], server_timestamp: 'T2' }));
    const result = await syncUserData();
    expect(result.isFullSync).toBe(false);
    expect(mockGet.mock.calls[1][1].params).toMatchObject({ since: 'T1', limit: 100, offset: 0 });
    expect(read(STORAGE_KEYS.CONSULTATIONS).map((c: any) => c.id)).toEqual([2, 1]);
  });

  it('falha de rede devolve erro sem estragar o que já estava guardado', async () => {
    mockStore.set(STORAGE_KEYS.PATIENTS, JSON.stringify([{ id: 1, full_name: 'Ana' }]));
    mockGet.mockRejectedValue(networkError());
    const result = await syncUserData();
    expect(result.success).toBe(false);
    expect(read(STORAGE_KEYS.PATIENTS)).toEqual([{ id: 1, full_name: 'Ana' }]);
  });
});
