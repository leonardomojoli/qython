import { useState, useEffect, useCallback } from 'react';
import { getConnectorsStatus } from '../api';

// Estado do conector de nuvem do usuário (v1: Google Drive). Fonte única para o gate da
// Biblioteca e para a seção Conectores do Perfil. `refetch` é chamado após conectar/desconectar.
export function useConnectorStatus() {
  const [connection, setConnection] = useState(null); // conexão gdrive (ou null)
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getConnectorsStatus();
      const gdrive = (data.connections || []).find((c) => c.provider === 'gdrive') || null;
      setConnection(gdrive);
      setAvailable(data.available || []);
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
    available,
    isConnected: connection?.status === 'active',
    isRevoked: connection?.status === 'revoked',
    accountEmail: connection?.account_email || null,
    loading,
    error,
    refetch,
  };
}
