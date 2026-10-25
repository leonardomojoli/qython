import axios from 'axios';
import { getAuthToken, clearAuthTokens } from './auth';
import { getApiBaseUrl, onServerUrlChange } from '../config/env';

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: inject Bearer token
api.interceptors.request.use(
  async (config) => {
    const token = await getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: handle 401 (session expired)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await clearAuthTokens();
      // Navigation to login will be handled by auth state listener
    }
    return Promise.reject(error);
  },
);

// The server is picked at runtime, on the login screen. Follow it, and drop the
// session: a token issued by one server must never be sent to another.
onServerUrlChange(() => {
  api.defaults.baseURL = getApiBaseUrl();
  clearAuthTokens().catch(() => {});
});

export default api;
