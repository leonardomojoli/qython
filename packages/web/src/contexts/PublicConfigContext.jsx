// Configuração pública da instalação (GET /api/public/config): a edição e quais
// travas do cadastro valem aqui (captcha, SMS, e-mail, Lastreo). Lida ao abrir o app,
// antes de qualquer login; `refresh` relê depois do cadastro do dono, quando
// `setup_required` deixa de valer.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { API_URL } from '../config';

// Sem resposta do backend, assume a instalação local sem travas, que é o padrão.
// Se alguma trava estiver ligada, o backend recusa o cadastro e diz o que faltou.
const FALLBACK = {
  edition: 'local',
  billing_enabled: false,
  setup_required: false,
  registration: {
    enabled: true,
    invite_required: false,
    captcha: false,
    captcha_site_key: null,
    phone_verification: false,
    email_verification: false,
    professional_verification: false,
  },
  google_login: false,
  password_reset_by_email: false,
};

const PublicConfigContext = createContext({ config: null, refresh: () => Promise.resolve() });

export const PublicConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/public/config`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setConfig(await response.json());
    } catch (error) {
      console.warn('[PublicConfig] usando o padrão local:', error);
      setConfig(prev => prev || FALLBACK);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <PublicConfigContext.Provider value={{ config, refresh }}>
      {children}
    </PublicConfigContext.Provider>
  );
};

// `config` é null enquanto a primeira leitura não volta.
export const usePublicConfig = () => useContext(PublicConfigContext);
