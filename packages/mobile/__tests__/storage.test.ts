// Cache offline cifrado com chave do Keystore (storage.ts): migração da chave antiga, reabertura e
// o comportamento sem cofre (iOS e testes). O MMKV e o módulo nativo são de mentira.
const mockCalls: string[] = [];
const mockSecure = new Map<string, string>();
let mockNative = true;
let mockCreateKey = 0;

jest.mock('react-native-mmkv', () => ({
  createMMKV: (config: { id: string; encryptionKey?: string; encryptionType?: string }) => {
    mockCalls.push(`open:${config.encryptionKey}:${config.encryptionType ?? 'AES-128'}`);
    const data = new Map<string, string>();
    return {
      getString: (k: string) => data.get(k),
      set: (k: string, v: string) => void data.set(k, String(v)),
      remove: (k: string) => void data.delete(k),
      getAllKeys: () => [...data.keys()],
      encrypt: (key: string, type?: string) => void mockCalls.push(`encrypt:${key}:${type}`),
    };
  },
}));
jest.mock('../src/services/nativeSecurity', () => ({
  hasNativeSecurity: () => mockNative,
  secureGet: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  secureSet: jest.fn(async (k: string, v: string) => void mockSecure.set(k, v)),
  secureGetOrCreate: jest.fn(async (k: string, bytes: number) => {
    const existing = mockSecure.get(k);
    if (existing) return { value: existing, created: false };
    mockCreateKey += 1;
    const value = 'K'.repeat(bytes + 8) + mockCreateKey; // 24 bytes viram 32 caracteres; o valor exato não importa aqui
    mockSecure.set(k, value);
    return { value, created: true };
  }),
}));

function freshStorage() {
  let mod: typeof import('../src/services/storage');
  jest.isolateModules(() => {
    mod = require('../src/services/storage');
  });
  return mod!;
}

beforeEach(() => {
  mockCalls.length = 0;
  mockSecure.clear();
  mockNative = true;
  mockCreateKey = 0;
});

describe('com cofre do Android', () => {
  it('primeira abertura: recifra o que estava sob a chave antiga e abre com a nova (AES-256)', async () => {
    const { initStorage, storage } = freshStorage();
    await initStorage();

    const key = mockSecure.get('qython_mmkv_key')!;
    expect(key).toBeTruthy();
    expect(mockCalls).toEqual([
      'open:qython-offline-v1:AES-128', // a instância antiga, só para migrar
      `encrypt:${key}:AES-256`,
      `open:${key}:AES-256`,
    ]);
    expect(mockSecure.get('qython_mmkv_migrated')).toBe('1');

    storage.set('a', 'b');
    expect(storage.getString('a')).toBe('b');
    expect(storage.getAllKeys()).toEqual(['a']);
    storage.remove('a');
    expect(storage.getString('a')).toBeUndefined();
  });

  it('abre de novo já migrado: não mexe na chave antiga', async () => {
    await freshStorage().initStorage();
    mockCalls.length = 0;

    await freshStorage().initStorage();
    const key = mockSecure.get('qython_mmkv_key')!;
    expect(mockCalls).toEqual([`open:${key}:AES-256`]);
  });

  it('a chave nova não é a antiga nem o texto fixo do código', async () => {
    await freshStorage().initStorage();
    const key = mockSecure.get('qython_mmkv_key')!;
    expect(key).not.toContain('qython-offline');
    expect(key.length).toBeGreaterThanOrEqual(32);
  });

  it('usar o armazenamento antes de abrir falha alto (em vez de abrir com a chave errada)', () => {
    const { storage } = freshStorage();
    expect(() => storage.getString('x')).toThrow(/initStorage/);
    expect(mockCalls).toEqual([]);
  });

  it('cofre quebrado: o app abre mesmo assim, com a chave antiga (e avisa)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const nativeSecurity = require('../src/services/nativeSecurity');
    nativeSecurity.secureGetOrCreate.mockRejectedValueOnce(new Error('KeyStoreException'));
    const { initStorage, storage } = freshStorage();
    await initStorage();
    storage.set('a', 'b');
    expect(storage.getString('a')).toBe('b');
    expect(mockCalls).toEqual(['open:qython-offline-v1:AES-128']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('initStorage duas vezes não abre duas vezes', async () => {
    const mod = freshStorage();
    await mod.initStorage();
    const opened = mockCalls.length;
    await mod.initStorage();
    expect(mockCalls.length).toBe(opened);
  });
});

describe('sem cofre (iOS, testes)', () => {
  it('abre direto, como sempre foi, sem precisar do initStorage', () => {
    mockNative = false;
    const { storage } = freshStorage();
    storage.set('k', 'v');
    expect(storage.getString('k')).toBe('v');
    expect(mockCalls).toEqual(['open:qython-offline-v1:AES-128']);
  });
});
