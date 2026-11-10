import axios from 'axios';
import { getAuthToken, clearAuthTokens } from './tokenStore';
import { getApiBaseUrl, onServerUrlChange } from '../config/env';
import { getPairing, PairingError, renewAccess, unpair } from './pairing';
import { emitSessionExpired, setPendingReset } from './sessionEvents';

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const isPairingUrl = (url?: string) => !!url && url.includes('/pairing/');

// Request interceptor: inject Bearer token
api.interceptors.request.use(
  async (config) => {
    let token = await getAuthToken();
    // Celular pareado sem acesso guardado (renovação pendente): pede um novo antes de seguir.
    if (!token && getPairing() && !isPairingUrl(config.url)) {
      token = await renewAccess().catch(() => null);
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: 401 = acesso vencido ou recusado.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const original = error.config;
      // Celular pareado: o acesso dura ~1 h; renova com o segredo do aparelho e repete a chamada uma vez.
      if (original && !original._retried && getPairing() && !isPairingUrl(original.url)) {
        original._retried = true;
        try {
          const token = await renewAccess();
          original.headers.Authorization = `Bearer ${token}`;
          return await api.request(original);
        } catch (renewError: any) {
          if (!(renewError instanceof PairingError)) {
            // Sem rede para renovar: o 401 original não diz que a sessão acabou.
            return Promise.reject(renewError?.response ? error : renewError);
          }
          emitSessionExpired(); // aparelho removido no computador (o pareamento já foi desfeito)
          return Promise.reject(error);
        }
      }
      await clearAuthTokens();
      emitSessionExpired();
    }
    return Promise.reject(error);
  },
);

// The server is picked at runtime, on the login screen. Follow it, and drop the
// session: a token issued by one server must never be sent to another.
onServerUrlChange((_url, change) => {
  api.defaults.baseURL = getApiBaseUrl();
  if (change.keepSession) {
    return;
  }
  setPendingReset(
    (async () => {
      await clearAuthTokens();
      // Um pareamento é de UM computador: o segredo dele não vale em outro endereço.
      if (getPairing()) {
        await unpair();
      }
    })(),
  );
});

export default api;
