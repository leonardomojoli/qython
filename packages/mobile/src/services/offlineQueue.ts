import api from './api';
import { setObject, getObject, storage, STORAGE_KEYS } from './storage';
import type { QueuedOperation } from '../types/offline';

const BACKOFF_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s

let processing = false;

function getQueue(): QueuedOperation[] {
  return getObject<QueuedOperation[]>(STORAGE_KEYS.OFFLINE_QUEUE) || [];
}

function saveQueue(queue: QueuedOperation[]): void {
  setObject(STORAGE_KEYS.OFFLINE_QUEUE, queue);
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

export async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    let queue = getQueue();
    const tempIdMap = new Map<string, number>();

    for (let i = 0; i < queue.length; i++) {
      const op = queue[i];

      // Resolve temp ID dependencies
      let payload = { ...op.payload };
      if (op.dependsOnTempId && tempIdMap.has(op.dependsOnTempId)) {
        const resolvedId = tempIdMap.get(op.dependsOnTempId);
        if (payload.patient_id && String(payload.patient_id).startsWith('temp_')) {
          payload = { ...payload, patient_id: resolvedId };
        }
      }

      try {
        const response = await makeRequest(op.method, op.endpoint, payload);

        // Track temp ID resolution
        if (op.tempId && response?.data?.id) {
          tempIdMap.set(op.tempId, response.data.id);
        }

        // Remove successful operation
        queue = queue.filter((q) => q.id !== op.id);
        saveQueue(queue);
        i--;
      } catch (err: any) {
        const status = err?.response?.status;

        // 401: auth expired, pause entire queue
        if (status === 401) {
          break;
        }

        // Update retry count
        op.retryCount++;
        op.lastAttempt = new Date().toISOString();
        op.error = err.message || `HTTP ${status}`;

        if (op.retryCount >= op.maxRetries) {
          // Max retries reached, keep in queue but mark error
          queue[i] = op;
          saveQueue(queue);
          continue;
        }

        queue[i] = op;
        saveQueue(queue);

        // Backoff delay
        const delay = BACKOFF_DELAYS[Math.min(op.retryCount - 1, BACKOFF_DELAYS.length - 1)];
        await sleep(delay);
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
