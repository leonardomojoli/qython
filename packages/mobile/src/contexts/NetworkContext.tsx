import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

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
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(!!state.isConnected);
      setIsInternetReachable(state.isInternetReachable ?? !!state.isConnected);
    });
    return () => unsubscribe();
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
