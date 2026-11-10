// O pareamento por dentro: pinos TLS, escolha do endereço, troca do código, renovação e revogação.
// O módulo nativo, o armazenamento e a rede são de mentira; o que se testa é a lógica do app.
const mockPost = jest.fn();
const mockSecure = new Map<string, string>();
const mockPins = new Map<string, string>();
let mockToken: string | null = null;

jest.mock('axios', () => ({ __esModule: true, default: { create: jest.fn(() => ({ post: mockPost })) } }));
jest.mock('../src/services/nativeSecurity', () => ({
  setPin: jest.fn(async (k: string, f: string) => void mockPins.set(k, f)),
  removePin: jest.fn(async (k: string) => void mockPins.delete(k)),
  probeFingerprint: jest.fn(async () => 'cd'.repeat(32)),
  secureSet: jest.fn(async (k: string, v: string) => void mockSecure.set(k, v)),
  secureGet: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  secureRemove: jest.fn(async (k: string) => void mockSecure.delete(k)),
  hasNativeSecurity: () => true,
  scanQrCode: jest.fn(),
}));
jest.mock('../src/services/tokenStore', () => ({
  getAuthToken: jest.fn(async () => mockToken),
  setAuthToken: jest.fn(async (t: string) => {
    mockToken = t;
  }),
  clearAuthTokens: jest.fn(async () => {
    mockToken = null;
  }),
}));
jest.mock('../src/services/storage', () => {
  const kv = new Map<string, string>();
  return {
    __kv: kv,
    STORAGE_KEYS: { SERVER_URL: 'settings:server_url', PAIRING: 'settings:pairing' },
    storage: {
      getString: (k: string) => kv.get(k),
      set: (k: string, v: string) => void kv.set(k, v),
      remove: (k: string) => void kv.delete(k),
    },
    getObject: (k: string) => (kv.has(k) ? JSON.parse(kv.get(k)!) : null),
    setObject: (k: string, v: unknown) => void kv.set(k, JSON.stringify(v)),
    removeKey: (k: string) => void kv.delete(k),
  };
});

import {
  PairingError,
  getPairing,
  isPaired,
  pairWithTarget,
  renewAccess,
  unpair,
} from '../src/services/pairing';
import { getServerUrl } from '../src/config/env';
import { waitForPendingReset } from '../src/services/sessionEvents';

const FP = 'ab'.repeat(32);
const target = {
  addresses: ['https://10.0.0.5:8443', 'https://192.168.0.10:8443'],
  fingerprint: FP,
  code: 'ABCDEFGH',
};
const claimed = {
  device_id: 7,
  device_token: 'segredo-do-aparelho',
  access_token: 'jwt-1',
  user: { email: 'dona@clinica.com.br' },
};

/** O /api/health responde ok só nos endereços listados. */
function healthyOn(...hosts: string[]) {
  (global as any).fetch = jest.fn(async (url: string) => {
    const up = hosts.some(h => url.startsWith(h));
    if (!up) {
      throw new Error('sem rota');
    }
    return { ok: true, json: async () => ({ status: 'ok' }) };
  });
}

beforeEach(() => {
  mockPost.mockReset();
  mockSecure.clear();
  mockPins.clear();
  (jest.requireMock('../src/services/storage') as { __kv: Map<string, string> }).__kv.clear();
  mockToken = null;
});

describe('pairWithTarget', () => {
  it('fixa o certificado em todos os endereços, escolhe o que responde e guarda o pareamento', async () => {
    healthyOn('https://192.168.0.10:8443'); // o primeiro endereço não responde
    mockPost.mockResolvedValue({ data: claimed });

    const record = await pairWithTarget(target);
    await waitForPendingReset();

    expect([...mockPins.keys()].sort()).toEqual(['10.0.0.5:8443', '192.168.0.10:8443']);
    expect([...mockPins.values()].every(f => f === FP)).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/pairing/claim', {
      code: 'ABCDEFGH',
      device_name: expect.any(String),
      platform: expect.any(String),
    });
    expect(record).toMatchObject({ deviceId: 7, address: 'https://192.168.0.10:8443', fingerprint: FP });
    expect(getServerUrl()).toBe('https://192.168.0.10:8443');
    expect(mockSecure.get('qython_device_secret')).toBe('segredo-do-aparelho');
    expect(mockToken).toBe('jwt-1');
    expect(isPaired()).toBe(true);
  });

  it('não guarda nada quando o computador recusa o código', async () => {
    healthyOn('https://10.0.0.5:8443');
    mockPost.mockRejectedValue({ response: { status: 400, data: { detail: 'Código inválido ou expirado.' } } });

    await expect(pairWithTarget(target)).rejects.toMatchObject({ code: 'rejected', message: 'Código inválido ou expirado.' });
    expect(mockSecure.size).toBe(0);
    expect(mockToken).toBeNull();
    expect(isPaired()).toBe(false);
  });

  it('avisa quando nenhum endereço responde, sem tentar o código', async () => {
    healthyOn(); // nada responde
    await expect(pairWithTarget(target)).rejects.toMatchObject({ code: 'unreachable' });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('sem impressão digital (certificado de autoridade pública) não fixa nada', async () => {
    healthyOn('https://10.0.0.5:8443');
    mockPost.mockResolvedValue({ data: claimed });
    await pairWithTarget({ ...target, fingerprint: null });
    expect(mockPins.size).toBe(0);
  });
});

describe('renewAccess', () => {
  async function paired() {
    healthyOn('https://10.0.0.5:8443');
    mockPost.mockResolvedValueOnce({ data: claimed });
    await pairWithTarget(target);
    await waitForPendingReset();
    mockPost.mockReset();
    mockToken = null;
  }

  it('troca o segredo do aparelho por um acesso novo', async () => {
    await paired();
    mockPost.mockResolvedValue({ data: { access_token: 'jwt-2' } });
    await expect(renewAccess()).resolves.toBe('jwt-2');
    expect(mockPost).toHaveBeenCalledWith('/pairing/token', { device_token: 'segredo-do-aparelho' });
    expect(mockToken).toBe('jwt-2');
  });

  it('chamadas simultâneas dividem a mesma requisição', async () => {
    await paired();
    mockPost.mockResolvedValue({ data: { access_token: 'jwt-3' } });
    const [a, b, c] = await Promise.all([renewAccess(), renewAccess(), renewAccess()]);
    expect([a, b, c]).toEqual(['jwt-3', 'jwt-3', 'jwt-3']);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('aparelho removido no computador (401): desfaz o pareamento', async () => {
    await paired();
    mockPost.mockRejectedValue({ response: { status: 401, data: { detail: 'Aparelho removido.' } } });
    await expect(renewAccess()).rejects.toBeInstanceOf(PairingError);
    expect(isPaired()).toBe(false);
    expect(mockSecure.has('qython_device_secret')).toBe(false);
    expect(mockPins.size).toBe(0);
  });

  it('sem rede para renovar, mantém o pareamento', async () => {
    await paired();
    mockPost.mockRejectedValue(new Error('Network Error'));
    await expect(renewAccess()).rejects.toThrow('Network Error');
    expect(isPaired()).toBe(true);
    expect(mockSecure.get('qython_device_secret')).toBe('segredo-do-aparelho');
  });

  it('sem pareamento, recusa', async () => {
    await expect(renewAccess()).rejects.toMatchObject({ code: 'revoked' });
  });
});

describe('unpair', () => {
  it('esquece o computador: segredo, acesso, pareamento e as impressões digitais fixadas', async () => {
    healthyOn('https://10.0.0.5:8443');
    mockPost.mockResolvedValue({ data: claimed });
    await pairWithTarget(target);
    await waitForPendingReset();

    await unpair();
    expect(getPairing()).toBeNull();
    expect(mockSecure.size).toBe(0);
    expect(mockToken).toBeNull();
    expect(mockPins.size).toBe(0);
  });
});
