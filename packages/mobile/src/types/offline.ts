export type OperationType =
  | 'CREATE_PATIENT'
  | 'UPDATE_PATIENT'
  | 'CREATE_CONSULTATION'
  | 'CREATE_PRESCRIPTION';

export interface QueuedOperation {
  id: string;
  type: OperationType;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  payload: Record<string, unknown>;
  tempId?: string;
  dependsOnTempId?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  lastAttempt?: string;
  error?: string;
}

export interface SyncMetadata {
  lastMedicationsSync: string | null;
  lastInteractionsSync: string | null;
  lastUserDataSync: string | null;
  medicationsCount: number;
  interactionsCount: number;
  patientsCount: number;
  consultationsCount: number;
}

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
}

export interface SyncResult {
  success: boolean;
  recordsUpdated: number;
  serverTimestamp: string;
  isFullSync: boolean;
  error?: string;
}
