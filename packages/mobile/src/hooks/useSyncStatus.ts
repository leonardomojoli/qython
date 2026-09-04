import { useState, useCallback, useEffect } from 'react';
import { getMetadata, syncAll } from '../services/syncService';
import { getObject, STORAGE_KEYS } from '../services/storage';
import type { SyncMetadata, QueuedOperation } from '../types/offline';

interface SyncStatus {
  lastMedicationsSync: string | null;
  lastInteractionsSync: string | null;
  lastUserDataSync: string | null;
  medicationsCount: number;
  interactionsCount: number;
  patientsCount: number;
  consultationsCount: number;
  isSyncing: boolean;
  pendingQueueCount: number;
  triggerSync: () => Promise<void>;
  refresh: () => void;
}

export function useSyncStatus(): SyncStatus {
  const [metadata, setMetadata] = useState<SyncMetadata>(getMetadata());
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);

  const refresh = useCallback(() => {
    setMetadata(getMetadata());
    const queue = getObject<QueuedOperation[]>(STORAGE_KEYS.OFFLINE_QUEUE) || [];
    setPendingQueueCount(queue.length);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const triggerSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncAll();
    } finally {
      setIsSyncing(false);
      refresh();
    }
  }, [refresh]);

  return {
    lastMedicationsSync: metadata.lastMedicationsSync,
    lastInteractionsSync: metadata.lastInteractionsSync,
    lastUserDataSync: metadata.lastUserDataSync,
    medicationsCount: metadata.medicationsCount,
    interactionsCount: metadata.interactionsCount,
    patientsCount: metadata.patientsCount,
    consultationsCount: metadata.consultationsCount,
    isSyncing,
    pendingQueueCount,
    triggerSync,
    refresh,
  };
}
