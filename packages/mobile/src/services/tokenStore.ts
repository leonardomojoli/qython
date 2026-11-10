// O acesso da conta (JWT). No Android fica no cofre do Keystore; antes ficava em texto no
// AsyncStorage, então um token antigo é movido para o cofre na primeira leitura. Sem o módulo nativo
// (iOS, testes) continua no AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@qython/shared';
import { hasNativeSecurity, secureGet, secureRemove, secureSet } from './nativeSecurity';

export async function getAuthToken(): Promise<string | null> {
  if (!hasNativeSecurity()) {
    return AsyncStorage.getItem(AUTH_TOKEN_KEY);
  }
  const token = await secureGet(AUTH_TOKEN_KEY);
  if (token) {
    return token;
  }
  const legacy = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  if (legacy) {
    await secureSet(AUTH_TOKEN_KEY, legacy);
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  }
  return legacy;
}

export async function setAuthToken(token: string): Promise<void> {
  if (!hasNativeSecurity()) {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    return;
  }
  await secureSet(AUTH_TOKEN_KEY, token);
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function clearAuthTokens(): Promise<void> {
  if (hasNativeSecurity()) {
    await secureRemove(AUTH_TOKEN_KEY);
  }
  await AsyncStorage.removeMany([AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}
