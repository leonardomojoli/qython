import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { getServerUrl, onServerUrlChange } from '../config/env';

// "Online" aqui é "o servidor do médico responde", não "há internet": o Qython do computador pode estar
// numa rede só de Wi-Fi sem saída para a internet, e o Android marcaria essa rede como sem internet.
// Por isso o teste é uma chamada ao /api/health do servidor configurado, e não a verificação nativa.
function configureReachability(): void {
  const server = getServerUrl();
  if (!server) {
    return;
  }
  NetInfo.configure({
    reachabilityUrl: `${server}/api/health`,
    reachabilityMethod: 'GET',
    reachabilityTest: async (response) => response.status === 200,
    reachabilityShortTimeout: 5 * 1000,
    reachabilityLongTimeout: 30 * 1000,
    reachabilityRequestTimeout: 8 * 1000,
    useNativeReachability: false,
  });
}

interface NetworkContextType {
  isConnected: boolean;
  isInternetReachable: boolean;
  forceCheck: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  isInternetReachable: true,
  forceCheck: async () => {},
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);

  useEffect(() => {
    configureReachability();
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(!!state.isConnected);
      setIsInternetReachable(state.isInternetReachable ?? !!state.isConnected);
    });
    // Trocou de servidor (login digitado, pareamento): o teste passa a olhar o novo endereço.
    const unsubscribeServer = onServerUrlChange(() => {
      configureReachability();
      NetInfo.refresh().catch(() => {});
    });
    return () => {
      unsubscribe();
      unsubscribeServer();
    };
  }, []);

  const forceCheck = useCallback(async () => {
    const state = await NetInfo.fetch();
    setIsConnected(!!state.isConnected);
    setIsInternetReachable(state.isInternetReachable ?? !!state.isConnected);
  }, []);

  return (
    <NetworkContext.Provider value={{ isConnected, isInternetReachable, forceCheck }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextType {
  return useContext(NetworkContext);
}
