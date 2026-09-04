import api from './api';
import { setObject, getObject, STORAGE_KEYS } from './storage';
import type { SyncMetadata, SyncResult } from '../types/offline';
import type { Medication, DrugInteraction } from '../types/pharmacy';
import type { Patient, Consultation } from '../types/ambulatory';

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

function getMetadata(): SyncMetadata {
  return getObject<SyncMetadata>(STORAGE_KEYS.SYNC_METADATA) || {
    lastMedicationsSync: null,
    lastInteractionsSync: null,
    lastUserDataSync: null,
    medicationsCount: 0,
    interactionsCount: 0,
    patientsCount: 0,
    consultationsCount: 0,
  };
}

function updateMetadata(partial: Partial<SyncMetadata>): void {
  const current = getMetadata();
  setObject(STORAGE_KEYS.SYNC_METADATA, { ...current, ...partial });
}

export async function syncMedications(country?: string): Promise<SyncResult> {
  try {
    const metadata = getMetadata();
    const params: Record<string, string> = {};
    if (metadata.lastMedicationsSync) params.since = metadata.lastMedicationsSync;
    if (country) params.country = country;

    const response = await api.get('/sync/medications', { params });
    const { medications, server_timestamp, is_full_sync } = response.data;

    if (is_full_sync) {
      setObject(STORAGE_KEYS.MEDICATIONS, medications);
    } else {
      const existing = getObject<Medication[]>(STORAGE_KEYS.MEDICATIONS) || [];
      const merged = mergeById(existing, medications);
      setObject(STORAGE_KEYS.MEDICATIONS, merged);
    }

    updateMetadata({
      lastMedicationsSync: server_timestamp,
      medicationsCount: is_full_sync
        ? medications.length
        : (getObject<Medication[]>(STORAGE_KEYS.MEDICATIONS) || []).length,
    });

    return {
      success: true,
      recordsUpdated: medications.length,
      serverTimestamp: server_timestamp,
      isFullSync: is_full_sync,
    };
  } catch (err: any) {
    return {
      success: false,
      recordsUpdated: 0,
      serverTimestamp: '',
      isFullSync: false,
      error: err.message || 'Sync failed',
    };
  }
}

export async function syncInteractions(): Promise<SyncResult> {
  try {
    const metadata = getMetadata();
    const params: Record<string, string> = {};
    if (metadata.lastInteractionsSync) params.since = metadata.lastInteractionsSync;

    const response = await api.get('/sync/interactions', { params });
    const { interactions, server_timestamp, is_full_sync } = response.data;

    if (is_full_sync) {
      setObject(STORAGE_KEYS.INTERACTIONS, interactions);
    } else {
      const existing = getObject<DrugInteraction[]>(STORAGE_KEYS.INTERACTIONS) || [];
      const merged = mergeInteractions(existing, interactions);
      setObject(STORAGE_KEYS.INTERACTIONS, merged);
    }

    updateMetadata({
      lastInteractionsSync: server_timestamp,
      interactionsCount: is_full_sync
        ? interactions.length
        : (getObject<DrugInteraction[]>(STORAGE_KEYS.INTERACTIONS) || []).length,
    });

    return {
      success: true,
      recordsUpdated: interactions.length,
      serverTimestamp: server_timestamp,
      isFullSync: is_full_sync,
    };
  } catch (err: any) {
    return {
      success: false,
      recordsUpdated: 0,
      serverTimestamp: '',
      isFullSync: false,
      error: err.message || 'Sync failed',
    };
  }
}

export async function syncUserData(): Promise<SyncResult> {
  try {
    const metadata = getMetadata();
    const params: Record<string, string> = {};
    if (metadata.lastUserDataSync) params.since = metadata.lastUserDataSync;

    const response = await api.get('/sync/user-data', { params });
    const { patients, consultations, server_timestamp } = response.data;
    const isFullSync = !metadata.lastUserDataSync;

    if (isFullSync) {
      setObject(STORAGE_KEYS.PATIENTS, patients);
      setObject(STORAGE_KEYS.CONSULTATIONS, consultations);
    } else {
      const existingPatients = getObject<Patient[]>(STORAGE_KEYS.PATIENTS) || [];
      const existingConsultations = getObject<Consultation[]>(STORAGE_KEYS.CONSULTATIONS) || [];
      setObject(STORAGE_KEYS.PATIENTS, mergeById(existingPatients, patients));
      setObject(STORAGE_KEYS.CONSULTATIONS, mergeById(existingConsultations, consultations));
    }

    updateMetadata({
      lastUserDataSync: server_timestamp,
      patientsCount: (getObject<Patient[]>(STORAGE_KEYS.PATIENTS) || []).length,
      consultationsCount: (getObject<Consultation[]>(STORAGE_KEYS.CONSULTATIONS) || []).length,
    });

    return {
      success: true,
      recordsUpdated: patients.length + consultations.length,
      serverTimestamp: server_timestamp,
      isFullSync,
    };
  } catch (err: any) {
    return {
      success: false,
      recordsUpdated: 0,
      serverTimestamp: '',
      isFullSync: false,
      error: err.message || 'Sync failed',
    };
  }
}

export async function syncAll(): Promise<void> {
  await Promise.allSettled([
    syncMedications(),
    syncInteractions(),
    syncUserData(),
  ]);
}

export async function syncAllIfStale(): Promise<void> {
  const metadata = getMetadata();
  const now = Date.now();

  const isStale = (timestamp: string | null): boolean => {
    if (!timestamp) return true;
    return now - new Date(timestamp).getTime() > STALE_THRESHOLD_MS;
  };

  const tasks: Promise<SyncResult>[] = [];

  if (isStale(metadata.lastMedicationsSync)) tasks.push(syncMedications());
  if (isStale(metadata.lastInteractionsSync)) tasks.push(syncInteractions());
  if (isStale(metadata.lastUserDataSync)) tasks.push(syncUserData());

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}

export { getMetadata };

// Merge arrays by ID, updating existing records (upsert)
function mergeById<T extends { id: number }>(existing: T[], incoming: T[]): T[] {
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

// Merge interactions by composite key (no id field)
function mergeInteractions(existing: DrugInteraction[], incoming: DrugInteraction[]): DrugInteraction[] {
  const key = (i: DrugInteraction) => `${i.active_principle_a}|${i.active_principle_b}`;
  const map = new Map(existing.map((item) => [key(item), item]));
  for (const item of incoming) {
    map.set(key(item), item);
  }
  return Array.from(map.values());
}
