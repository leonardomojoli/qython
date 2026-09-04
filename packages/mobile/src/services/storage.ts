import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV({
  id: 'qython-offline',
  encryptionKey: 'qython-offline-v1',
});

export const STORAGE_KEYS = {
  // Sync data
  MEDICATIONS: 'sync:medications',
  INTERACTIONS: 'sync:interactions',
  PATIENTS: 'sync:patients',
  CONSULTATIONS: 'sync:consultations',

  // Sync metadata
  SYNC_METADATA: 'sync:metadata',

  // Offline queue
  OFFLINE_QUEUE: 'offline:queue',
  QUEUE_PROCESSING_LOCK: 'offline:queue_lock',

  // Settings
  AUTO_SYNC_ENABLED: 'settings:auto_sync',
  SYNC_FREQUENCY_MINUTES: 'settings:sync_frequency',
} as const;

export function setObject<T>(key: string, value: T): void {
  storage.set(key, JSON.stringify(value));
}

export function getObject<T>(key: string): T | null {
  const raw = storage.getString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function removeKey(key: string): void {
  storage.delete(key);
}

export function getCacheSize(): number {
  const keys = storage.getAllKeys();
  let totalSize = 0;
  for (const key of keys) {
    const val = storage.getString(key);
    if (val) totalSize += val.length * 2; // UTF-16 rough estimate
  }
  return totalSize;
}

export function clearAllSyncData(): void {
  const syncKeys = Object.values(STORAGE_KEYS).filter(k => k.startsWith('sync:'));
  for (const key of syncKeys) {
    storage.delete(key);
  }
}
