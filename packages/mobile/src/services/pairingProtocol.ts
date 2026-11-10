// O protocolo do pareamento sem nada de armazenamento nem de rede: ler o QR code, normalizar o que o
// médico digita e formatar a impressão digital. Em arquivo à parte para ser testado sem o app.
import { hostPortOf, normalizeServerUrl } from '../config/serverUrl';

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

export interface PairingTarget {
  /** Endereços do computador na rede local, na ordem em que o celular os tenta. */
  addresses: string[];
  /** SHA-256 do certificado (hex minúsculo) ou null quando o servidor tem certificado de autoridade pública. */
  fingerprint: string | null;
  code: string;
}

export interface PairingRecord {
  deviceId: number;
  address: string;
  addresses: string[];
  fingerprint: string | null;
  pairedAt: string;
  userEmail: string | null;
}

export type PairingErrorCode = 'unreachable' | 'rejected' | 'invalid' | 'revoked' | 'insecure';

export class PairingError extends Error {
  code: PairingErrorCode;
  constructor(code: PairingErrorCode, message: string) {
    super(message);
    this.name = 'PairingError';
    this.code = code;
  }
}

/** Código como o médico digita ("abcd-efgh" vira "ABCDEFGH"). */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

/** Lê o texto do QR code. Devolve null se não for um QR code do Qython (ou se vier malformado). */
export function parsePairingQr(text: string): PairingTarget | null {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || data.t !== 'qython-pair' || data.v !== 1 || !Array.isArray(data.a)) {
    return null;
  }
  const addresses = data.a
    .filter((a: unknown): a is string => typeof a === 'string' && /^https:\/\//i.test(a.trim()))
    .map((a: string) => normalizeServerUrl(a))
    .filter((a: string) => !!hostPortOf(a))
    .slice(0, 8);
  const fingerprint = data.f === null || data.f === undefined ? null : String(data.f).toLowerCase();
  const code = typeof data.c === 'string' ? normalizeCode(data.c) : '';
  if (addresses.length === 0 || !isValidCode(code)) {
    return null;
  }
  if (fingerprint !== null && !FINGERPRINT_PATTERN.test(fingerprint)) {
    return null;
  }
  return { addresses, fingerprint, code };
}

/** O que o médico digitou como endereço do computador, sempre em https ("192.168.0.10:8443"). */
export function normalizePairingAddress(input: string): string {
  const typed = input.trim();
  if (/^http:\/\//i.test(typed)) {
    throw new PairingError('insecure', 'O pareamento só funciona por https. Use o endereço que o computador mostra.');
  }
  const url = normalizeServerUrl(/^https:\/\//i.test(typed) ? typed : `https://${typed}`);
  if (!hostPortOf(url)) {
    throw new PairingError('invalid', 'Endereço inválido. Exemplo: https://192.168.0.10:8443');
  }
  return url;
}

/** "AB12 CD34 EF56 7890 1A2B": o trecho que o médico compara com o computador no pareamento sem QR code. */
export function formatFingerprint(fingerprint: string): string {
  return (fingerprint.slice(0, 20).toUpperCase().match(/.{1,4}/g) ?? []).join(' ');
}

