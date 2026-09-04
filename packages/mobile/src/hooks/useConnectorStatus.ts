import { useState, useEffect, useCallback } from 'react';
import { getConnectorsStatus, CloudConnection } from '../services/connectors';

// Estado do conector de nuvem do usuário (v1: Google Drive). Espelha o hook web.
// `refetch` é chamado quando o usuário volta do browser de consentimento (AppState).
export function useConnectorStatus() {
  const [connection, setConnection] = useState<CloudConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getConnectorsStatus();
      const gdrive = (data.connections || []).find((c) => c.provider === 'gdrive') || null;
      setConnection(gdrive);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    connection,
    isConnected: connection?.status === 'active',
    isRevoked: connection?.status === 'revoked',
    accountEmail: connection?.account_email || null,
    loading,
    error,
    refetch,
  };
}
