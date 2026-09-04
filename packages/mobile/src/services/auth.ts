import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@qython/shared';
import api from './api';

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(AUTH_TOKEN_KEY);
}

export async function setAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
}

export async function clearAuthTokens(): Promise<void> {
  await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: {
    id: number;
    email: string;
    full_name: string;
    plan: string;
  };
}

export async function loginWithEmail(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/auth/login', {
    email,
    password,
  });
  await setAuthToken(response.data.access_token);
  return response.data;
}

export async function loginWithGoogle(): Promise<LoginResponse> {
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    const auth = require('@react-native-firebase/auth').default;

    // 1. Google Sign-In popup
    await GoogleSignin.hasPlayServices();
    const signInResult = await GoogleSignin.signIn();

    // 2. Get Google credential and sign in with Firebase
    const idToken = signInResult.data?.idToken;
    if (!idToken) {
      throw new Error('No ID token returned from Google Sign-In');
    }

    const googleCredential = auth.GoogleAuthProvider.credential(idToken);
    await auth().signInWithCredential(googleCredential);

    // 3. Get Firebase ID token
    const firebaseToken = await auth().currentUser?.getIdToken(true);
    if (!firebaseToken) {
      throw new Error('Failed to get Firebase ID token');
    }

    // 4. Send to backend (form-urlencoded, like web)
    const response = await api.post<LoginResponse>(
      '/auth/google',
      `token=${encodeURIComponent(firebaseToken)}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    // 5. Save JWT
    await setAuthToken(response.data.access_token);
    return response.data;
  } catch (error: any) {
    // Clean up Firebase auth state on failure
    try {
      const auth = require('@react-native-firebase/auth').default;
      await auth().signOut();
    } catch {
      // ignore
    }
    throw error;
  }
}

export async function registerUser(data: {
  email: string;
  full_name: string;
  password: string;
  country: string;
  occupation: string;
  captcha_token: string;
  phone_number: string;
  phone_verification_token: string;
  specialty?: string;
  latreo_session_id?: string;
  language?: string;
}): Promise<LoginResponse> {
  // /auth/register/step1 is a multipart Form endpoint — send FormData, not JSON.
  const form = new FormData();
  form.append('captcha_token', data.captcha_token);
  form.append('email', data.email);
  form.append('password', data.password);
  form.append('full_name', data.full_name);
  form.append('occupation', data.occupation);
  form.append('country', data.country);
  form.append('language', data.language || 'pt');
  form.append('phone_number', data.phone_number);
  form.append('phone_verification_token', data.phone_verification_token);
  if (data.specialty) form.append('specialty', data.specialty);
  if (data.latreo_session_id) form.append('latreo_session_id', data.latreo_session_id);

  const response = await api.post<LoginResponse>('/auth/register/step1', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  await setAuthToken(response.data.access_token);
  return response.data;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post('/auth/forgot-password', { email });
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // Ignore logout errors
  }
  try {
    const auth = require('@react-native-firebase/auth').default;
    await auth().signOut();
  } catch {
    // Firebase may not be configured
  }
  await clearAuthTokens();
}

export async function checkSessionValidity(): Promise<boolean> {
  try {
    const response = await api.get('/user/info');
    return response.status === 200;
  } catch {
    return false;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) {
    return false;
  }
  return checkSessionValidity();
}

export async function updateProfile(data: {
  full_name?: string;
  specialty?: string;
  treatment?: string;
  country?: string;
}): Promise<void> {
  await api.put('/user/update', data);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await api.post('/user/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export async function updateTrainingDataPreference(
  optOut: boolean,
): Promise<void> {
  await api.put('/user/training-data-preference', { opt_out: optOut });
}
