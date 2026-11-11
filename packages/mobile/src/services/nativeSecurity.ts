// Ponte com o módulo nativo QythonSecurity (Android): confiança TLS fixada pela impressão digital,
// cofre do Keystore e leitor de QR code. Fora do Android (iOS, testes) cai em alternativas que não
// pedem nada nativo: sem fixação de certificado, segredos no AsyncStorage e sem leitor de QR code.
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface QythonSecurityNative {
  setPin(hostPort: string, fingerprint: string): Promise<void>;
  removePin(hostPort: string): Promise<void>;
  clearPins(): Promise<void>;
  probeFingerprint(host: string, port: number): Promise<string>;
  secureSet(name: string, value: string): Promise<void>;
  secureGet(name: string): Promise<string | null>;
  secureGetOrCreate(name: string, bytes: number): Promise<{ value: string; created: boolean }>;
  secureRemove(name: string): Promise<void>;
  scanQrCode(): Promise<string | null>;
}

// Lido a cada uso (não no carregamento do módulo): os testes trocam o módulo nativo por um de mentira.
function native(): QythonSecurityNative | undefined {
  return Platform.OS === 'android' ? (NativeModules.QythonSecurity as QythonSecurityNative | undefined) : undefined;
}

/** O Android do app tem a fixação de certificado e o leitor de QR code. */
export function hasNativeSecurity(): boolean {
  return !!native();
}

export async function setPin(hostPort: string, fingerprint: string): Promise<void> {
  await native()?.setPin(hostPort, fingerprint);
}

export async function removePin(hostPort: string): Promise<void> {
  await native()?.removePin(hostPort);
}

export async function clearPins(): Promise<void> {
  await native()?.clearPins();
}

/** Impressão digital do certificado que o servidor apresenta, lida sem confiar nele. */
export async function probeFingerprint(host: string, port: number): Promise<string> {
  const module = native();
  if (!module) {
    throw new Error('Este aparelho não consegue conferir o certificado do computador.');
  }
  return module.probeFingerprint(host, port);
}

const FALLBACK_PREFIX = 'secure:';

export async function secureSet(name: string, value: string): Promise<void> {
  const module = native();
  if (module) {
    await module.secureSet(name, value);
  } else {
    await AsyncStorage.setItem(FALLBACK_PREFIX + name, value);
  }
}

export async function secureGet(name: string): Promise<string | null> {
  const module = native();
  return module ? module.secureGet(name) : AsyncStorage.getItem(FALLBACK_PREFIX + name);
}

/** O segredo com este nome, criado aleatório no cofre se ainda não existe. Só no Android (com o módulo nativo). */
export async function secureGetOrCreate(
  name: string,
  bytes: number,
): Promise<{ value: string; created: boolean }> {
  const module = native();
  if (!module) {
    throw new Error('Sem cofre do sistema neste aparelho.');
  }
  return module.secureGetOrCreate(name, bytes);
}

export async function secureRemove(name: string): Promise<void> {
  const module = native();
  if (module) {
    await module.secureRemove(name);
  } else {
    await AsyncStorage.removeItem(FALLBACK_PREFIX + name);
  }
}

/** Abre o leitor de QR code e devolve o texto lido; recusa se cancelado ou sem leitor. */
export async function scanQrCode(): Promise<string | null> {
  const module = native();
  if (!module) {
    throw Object.assign(new Error('Este aparelho não tem leitor de QR code.'), { code: 'E_SCAN' });
  }
  return module.scanQrCode();
}
