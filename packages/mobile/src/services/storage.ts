import { createMMKV, type MMKV } from 'react-native-mmkv';
import { hasNativeSecurity, secureGetOrCreate, secureSet, secureGet } from './nativeSecurity';

const MMKV_ID = 'qython-offline';

// A chave de antes: fixa no código, então qualquer um com o APK abria o cache (pacientes, consultas, fila
// offline). Só serve para ABRIR dados antigos na migração; (o MMKV usa os 16 primeiros bytes).
const LEGACY_KEY = 'qython-offline-v1';

const KEY_SECRET = 'qython_mmkv_key';
const MIGRATED_SECRET = 'qython_mmkv_migrated';

let instance: MMKV | null = null;

/**
 * Abre o cache offline. No Android a chave é aleatória (AES-256), nasce no Android Keystore e nunca está
 * no código; os dados cifrados com a chave antiga são recifrados na primeira abertura. Chamado UMA vez,
 * antes de o app carregar (index.js), porque o cofre responde de forma assíncrona.
 */
export async function initStorage(): Promise<void> {
  if (instance) {
    return;
  }
  if (!hasNativeSecurity()) {
    instance = createMMKV({ id: MMKV_ID, encryptionKey: LEGACY_KEY });
    return;
  }
  try {
    const { value: key } = await secureGetOrCreate(KEY_SECRET, 24);
    if (!(await secureGet(MIGRATED_SECRET))) {
      // Primeira vez com a chave nova: o que já existia (se existia) está sob a chave antiga.
      const legacy = createMMKV({ id: MMKV_ID, encryptionKey: LEGACY_KEY });
      legacy.encrypt(key, 'AES-256');
      await secureSet(MIGRATED_SECRET, '1');
    }
    instance = createMMKV({ id: MMKV_ID, encryptionKey: key, encryptionType: 'AES-256' });
  } catch (error) {
    // Keystore indisponível ou corrompido (acontece depois de restaurar o aparelho). Travar o app para sempre
    // seria pior: abre com a chave antiga, que ao menos mantém o cache e o login funcionando.
    console.warn('Cofre do Android indisponível; cache offline sem a chave própria do aparelho:', error);
    instance = createMMKV({ id: MMKV_ID, encryptionKey: LEGACY_KEY });
  }
}

function open(): MMKV {
  if (instance) {
    return instance;
  }
  if (!hasNativeSecurity()) {
    // iOS e testes: sem cofre, abre direto (como sempre foi).
    const created = createMMKV({ id: MMKV_ID, encryptionKey: LEGACY_KEY });
    instance = created;
    return created;
  }
  throw new Error('O armazenamento ainda não foi aberto (initStorage).');
}

// As chamadas são resolvidas no uso, então importar `storage` antes do initStorage é inofensivo; só USAR antes falha.
export const storage = {
  getString: (key: string) => open().getString(key),
  set: (key: string, value: string | number | boolean) => open().set(key, value),
  remove: (key: string) => open().remove(key),
  getAllKeys: () => open().getAllKeys(),
};

export const STORAGE_KEYS = {
  // Sync data
  MEDICATIONS: 'sync:medications',
  INTERACTIONS: 'sync:interactions',
  PATIENTS: 'sync:patients',
  CONSULTATIONS: 'sync:consultations',

  // Sync metadata
  SYNC_METADATA: 'sync:metadata',

  // Offline queue
  OFFLINE_QUEUE: 'offline:queue',
  QUEUE_PROCESSING_LOCK: 'offline:queue_lock',

  // Settings
  SERVER_URL: 'settings:server_url',
  PAIRING: 'settings:pairing',
  AUTO_SYNC_ENABLED: 'settings:auto_sync',
  SYNC_FREQUENCY_MINUTES: 'settings:sync_frequency',
} as const;

export function setObject<T>(key: string, value: T): void {
  storage.set(key, JSON.stringify(value));
}

export function getObject<T>(key: string): T | null {
  const raw = storage.getString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function removeKey(key: string): void {
  storage.remove(key);
}

export function getCacheSize(): number {
  const keys = storage.getAllKeys();
  let totalSize = 0;
  for (const key of keys) {
    const val = storage.getString(key);
    if (val) totalSize += val.length * 2; // UTF-16 rough estimate
  }
  return totalSize;
}

export function clearAllSyncData(): void {
  const syncKeys = Object.values(STORAGE_KEYS).filter(k => k.startsWith('sync:'));
  for (const key of syncKeys) {
    storage.remove(key);
  }
}
