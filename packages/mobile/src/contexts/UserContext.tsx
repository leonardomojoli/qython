import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../services/api';

interface UserInfo {
  id: number;
  email: string;
  full_name: string;
  username: string | null;
  plan: string;
  country: string;
  avatar_url: string | null;
  dracma_balance: number;
  specialty: string | null;
  treatment: string | null;
  crm: string | null;
  university: string | null;
  training_data_enabled: boolean;
  // Verificação (verdade do Latreo) × acesso (política do Qython) — ver utils/access.ts.
  occupation?: string;
  verification_status?: string | null;
  verification_tier?: string | null;
  access_granted?: boolean;
  onboarding_completed?: boolean;
  is_admin?: boolean;
  status?: string;
}

interface UserContextType {
  user: UserInfo | null;
  loading: boolean;
  setUser: (user: UserInfo | null) => void;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  setUser: () => {},
  refreshUser: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const response = await api.get('/user/info');
      setUser(response.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  return (
    <UserContext.Provider value={{ user, loading, setUser, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
