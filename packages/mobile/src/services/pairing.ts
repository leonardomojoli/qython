// Pareamento do celular com o Qython do computador (contrato em docs/PAREAMENTO.md).
//
// O médico escaneia o QR code da tela do computador (ou digita endereço e código); o celular passa a
// confiar SÓ no certificado com a impressão digital do QR code e troca o código de uso único pelo
// segredo do aparelho, que fica no cofre do Keystore. O acesso (JWT de ~1 h) é renovado com esse
// segredo, sem digitar senha, e deixa de valer na hora quando o aparelho é removido no computador.
import axios from 'axios';
import { Platform } from 'react-native';
import { getObject, removeKey, setObject, STORAGE_KEYS } from './storage';
import { checkServerHealth, getServerUrl, hostPortOf, setServerUrl } from '../config/env';
import {
  PairingError,
  normalizePairingAddress,
  type PairingRecord,
  type PairingTarget,
} from './pairingProtocol';
import { probeFingerprint, removePin, secureGet, secureRemove, secureSet, setPin } from './nativeSecurity';
import { clearAuthTokens, setAuthToken } from './tokenStore';
import { waitForPendingReset } from './sessionEvents';

// O protocolo puro (QR code, código, impressão digital) está em pairingProtocol.ts.
export * from './pairingProtocol';

const DEVICE_SECRET = 'qython_device_secret';

export function getPairing(): PairingRecord | null {
  return getObject<PairingRecord>(STORAGE_KEYS.PAIRING);
}

export function isPaired(): boolean {
  return getPairing() !== null;
}

function deviceName(): string {
  const constants = Platform.constants as { Brand?: string; Model?: string } | undefined;
  const name = [constants?.Brand, constants?.Model].filter(Boolean).join(' ').trim();
  return name || 'Celular';
}

/**
 * Lê o certificado que o servidor digitado apresenta, para o médico conferir a impressão digital com a
 * tela do computador antes de confiar (pareamento sem QR code).
 */
export async function inspectManualAddress(
  addressInput: string,
): Promise<{ address: string; fingerprint: string }> {
  const address = normalizePairingAddress(addressInput);
  const target = hostPortOf(address)!;
  try {
    return { address, fingerprint: await probeFingerprint(target.host, target.port) };
  } catch (error: any) {
    throw new PairingError(
      'unreachable',
      'O computador não respondeu. Confira o endereço, o Wi-Fi e se "Permitir o celular nesta rede" está ligado.',
    );
  }
}

function errorMessage(error: any, fallback: string): string {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

/**
 * Troca o código pelo acesso do aparelho. Antes de qualquer requisição, passa a exigir o certificado
 * da impressão digital para todos os endereços do computador.
 */
export async function pairWithTarget(target: PairingTarget): Promise<PairingRecord> {
  const hosts = target.addresses.map(hostPortOf);
  if (target.fingerprint) {
    for (const host of hosts) {
      if (host) {
        await setPin(host.key, target.fingerprint);
      }
    }
  }

  let chosen: string | null = null;
  for (const address of target.addresses) {
    if ((await checkServerHealth(address, 4000)) === 'ok') {
      chosen = address;
      break;
    }
  }
  if (!chosen) {
    throw new PairingError(
      'unreachable',
      'Não encontrei o computador na rede. Confira se o celular está no mesmo Wi-Fi e se "Permitir o celular nesta rede" está ligado.',
    );
  }

  let data: any;
  try {
    const client = axios.create({ baseURL: `${chosen}/api`, timeout: 15000 });
    ({ data } = await client.post('/pairing/claim', {
      code: target.code,
      device_name: deviceName(),
      platform: Platform.OS,
    }));
  } catch (error: any) {
    if (error?.response) {
      throw new PairingError('rejected', errorMessage(error, 'O código não foi aceito. Gere outro no computador.'));
    }
    throw new PairingError('unreachable', 'O computador parou de responder. Tente de novo.');
  }

  // Mudar o endereço zera a sessão (ela é de outro servidor); espera isso acabar antes de gravar a nova.
  setServerUrl(chosen);
  await waitForPendingReset();
  await secureSet(DEVICE_SECRET, data.device_token);
  await setAuthToken(data.access_token);
  const record: PairingRecord = {
    deviceId: data.device_id,
    address: chosen,
    addresses: target.addresses,
    fingerprint: target.fingerprint,
    pairedAt: new Date().toISOString(),
    userEmail: data.user?.email ?? null,
  };
  setObject(STORAGE_KEYS.PAIRING, record);
  return record;
}

/** Esquece o computador pareado neste aparelho (o computador continua listando o aparelho até ele ser removido lá). */
export async function unpair(): Promise<void> {
  const record = getPairing();
  removeKey(STORAGE_KEYS.PAIRING);
  await secureRemove(DEVICE_SECRET);
  await clearAuthTokens();
  if (record) {
    for (const address of record.addresses) {
      const host = hostPortOf(address);
      if (host) {
        await removePin(host.key);
      }
    }
  }
}

let renewing: Promise<string> | null = null;

async function renewNow(): Promise<string> {
  const record = getPairing();
  const secret = await secureGet(DEVICE_SECRET);
  if (!record || !secret) {
    throw new PairingError('revoked', 'Este celular não está mais pareado com o computador.');
  }
  try {
    const client = axios.create({ baseURL: `${getServerUrl()}/api`, timeout: 15000 });
    const { data } = await client.post('/pairing/token', { device_token: secret });
    await setAuthToken(data.access_token);
    return data.access_token as string;
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 401 || status === 403 || status === 404) {
      // O aparelho foi removido no computador (ou a conta foi bloqueada): o pareamento acabou.
      await unpair();
      throw new PairingError('revoked', errorMessage(error, 'Este celular foi removido do computador. Pareie de novo.'));
    }
    throw error;
  }
}

/** Pede um acesso novo com o segredo do aparelho. Chamadas simultâneas dividem a mesma requisição. */
export function renewAccess(): Promise<string> {
  if (!renewing) {
    renewing = renewNow().finally(() => {
      renewing = null;
    });
  }
  return renewing;
}
