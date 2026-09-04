import api from './api';

// Conectores de nuvem do usuário (Biblioteca Drive-first, v1: Google Drive).
// Espelha packages/web/src/api.js. O OAuth em si roda numa WebView (DriveConnectModal);
// aqui ficam só o status, a URL de consentimento e o disconnect.

export interface CloudConnection {
  provider: string;
  account_email: string | null;
  status: 'active' | 'revoked';
  connected_at?: string | null;
}

export interface ConnectorsStatus {
  connections: CloudConnection[];
  available: string[];
}

export async function getConnectorsStatus(): Promise<ConnectorsStatus> {
  const response = await api.get<ConnectorsStatus>('/connectors/status');
  return response.data;
}

export async function getConnectDriveUrl(): Promise<string> {
  const response = await api.post<{ auth_url: string }>('/connectors/google/connect');
  return response.data.auth_url;
}

export async function disconnectDrive(): Promise<void> {
  await api.delete('/connectors/google/disconnect');
}
