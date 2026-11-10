// Interceptores do cliente HTTP: renovação do acesso do celular pareado e fim da sessão.
let mockToken: string | null = 'jwt-velho';
const mockRenew = jest.fn();
const mockUnpair = jest.fn(async () => {});
let mockPaired: object | null = { deviceId: 1 };

jest.mock('../src/services/tokenStore', () => ({
  getAuthToken: jest.fn(async () => mockToken),
  setAuthToken: jest.fn(async (t: string) => {
    mockToken = t;
  }),
  clearAuthTokens: jest.fn(async () => {
    mockToken = null;
  }),
}));
jest.mock('../src/services/pairing', () => {
  class PairingError extends Error {
    code = 'revoked';
  }
  return {
    PairingError,
    getPairing: () => mockPaired,
    renewAccess: (...args: unknown[]) => mockRenew(...args),
    unpair: (...args: unknown[]) => mockUnpair(...args),
  };
});
jest.mock('../src/services/storage', () => {
  const kv = new Map<string, string>();
  return {
    STORAGE_KEYS: { SERVER_URL: 'settings:server_url' },
    storage: {
      getString: (k: string) => kv.get(k),
      set: (k: string, v: string) => void kv.set(k, v),
      remove: (k: string) => void kv.delete(k),
    },
  };
});

import api from '../src/services/api';
import { PairingError } from '../src/services/pairing';
import { clearAuthTokens } from '../src/services/tokenStore';
import { onSessionExpired, waitForPendingReset } from '../src/services/sessionEvents';
import { setServerUrl } from '../src/config/env';

/** Servidor de mentira: 200 só com o acesso novo, 401 com qualquer outro. */
function fakeServer(valid: string) {
  const seen: Array<string | undefined> = [];
  api.defaults.adapter = async config => {
    const auth = (config.headers as any).Authorization as string | undefined;
    seen.push(auth);
    const ok = auth === `Bearer ${valid}`;
    const response = { data: { ok }, status: ok ? 200 : 401, statusText: '', headers: {}, config };
    if (!ok) {
      throw Object.assign(new Error('401'), { config, response, isAxiosError: true });
    }
    return response;
  };
  return seen;
}

let expired = 0;
let unsubscribe: () => void;
beforeEach(() => {
  mockToken = 'jwt-velho';
  mockPaired = { deviceId: 1 };
  mockRenew.mockReset();
  mockUnpair.mockClear();
  (clearAuthTokens as jest.Mock).mockClear();
  expired = 0;
  unsubscribe = onSessionExpired(() => {
    expired += 1;
  });
});
afterEach(() => unsubscribe());

describe('celular pareado', () => {
  it('renova o acesso vencido e repete a chamada com o acesso novo', async () => {
    const seen = fakeServer('jwt-novo');
    mockRenew.mockImplementation(async () => {
      mockToken = 'jwt-novo';
      return 'jwt-novo';
    });

    const res = await api.get('/user/info');
    expect(res.data).toEqual({ ok: true });
    expect(mockRenew).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['Bearer jwt-velho', 'Bearer jwt-novo']);
    expect(expired).toBe(0);
  });

  it('aparelho removido no computador: encerra a sessão', async () => {
    fakeServer('qualquer-outro');
    mockRenew.mockRejectedValue(new PairingError('revogado'));

    await expect(api.get('/user/info')).rejects.toBeTruthy();
    expect(expired).toBe(1);
  });

  it('sem rede para renovar: o 401 não encerra a sessão', async () => {
    fakeServer('qualquer-outro');
    mockRenew.mockRejectedValue(new Error('Network Error'));

    await expect(api.get('/user/info')).rejects.toThrow('Network Error');
    expect(expired).toBe(0);
    expect(clearAuthTokens).not.toHaveBeenCalled();
  });

  it('sem acesso guardado, renova antes da chamada', async () => {
    mockToken = null;
    const seen = fakeServer('jwt-novo');
    mockRenew.mockImplementation(async () => {
      mockToken = 'jwt-novo';
      return 'jwt-novo';
    });

    await api.get('/patients');
    expect(seen).toEqual(['Bearer jwt-novo']);
    expect(mockRenew).toHaveBeenCalledTimes(1);
  });

  it('não tenta renovar de novo se a chamada repetida também der 401', async () => {
    fakeServer('nunca');
    mockRenew.mockResolvedValue('jwt-novo');

    await expect(api.get('/user/info')).rejects.toBeTruthy();
    expect(mockRenew).toHaveBeenCalledTimes(1);
    expect(expired).toBe(1);
  });
});

describe('login por senha (sem pareamento)', () => {
  it('401 limpa o acesso e encerra a sessão', async () => {
    mockPaired = null;
    fakeServer('outro');

    await expect(api.get('/user/info')).rejects.toBeTruthy();
    expect(mockRenew).not.toHaveBeenCalled();
    expect(clearAuthTokens).toHaveBeenCalled();
    expect(expired).toBe(1);
  });
});

describe('troca de servidor', () => {
  it('zera a sessão e desfaz o pareamento (o segredo é de UM computador)', async () => {
    setServerUrl('https://10.9.9.9:8443');
    await waitForPendingReset();
    expect(clearAuthTokens).toHaveBeenCalled();
    expect(mockUnpair).toHaveBeenCalled();
  });

  it('com keepSession (mesmo pareamento, outro IP) a sessão continua', async () => {
    setServerUrl('https://10.9.9.10:8443', { keepSession: true });
    await waitForPendingReset();
    expect(clearAuthTokens).not.toHaveBeenCalled();
    expect(mockUnpair).not.toHaveBeenCalled();
  });
});
