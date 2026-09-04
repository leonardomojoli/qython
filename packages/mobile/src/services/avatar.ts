import api from './api';
import { Platform } from 'react-native';

export interface AvatarLimits {
  used: number;
  max: number;
  plan: string;
}

export interface GenerateAvatarResponse {
  message: string;
  temp_avatar_url: string;
  filename: string;
  is_free: boolean;
}

export async function generateAvatar(prompt: string): Promise<GenerateAvatarResponse> {
  const response = await api.post<GenerateAvatarResponse>(
    '/user/generate-avatar-temp',
    { prompt },
    { timeout: 60000 },
  );
  return response.data;
}

export async function saveAvatar(filename: string): Promise<{ profile_picture: string }> {
  const response = await api.post<{ message: string; profile_picture: string }>(
    '/user/save-avatar',
    { filename },
  );
  return response.data;
}

export async function uploadProfilePicture(uri: string, type: string, name: string): Promise<void> {
  const formData = new FormData();
  formData.append('file', {
    uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
    type: type || 'image/jpeg',
    name: name || 'profile.jpg',
  } as any);

  await api.post('/user/upload-profile-picture', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });
}

export async function getAvatarHistory(): Promise<string[]> {
  const response = await api.get<string[]>('/user/avatar-history');
  return response.data;
}

export async function getAvatarLimits(): Promise<AvatarLimits> {
  const response = await api.get<AvatarLimits>('/user/avatar-history/limits');
  return response.data;
}

export async function getAvatarPresets(): Promise<string[]> {
  const response = await api.get<string[]>('/user/avatar-presets');
  return response.data;
}

export async function deleteAvatarFromHistory(filename: string): Promise<void> {
  await api.post('/user/avatar-history/delete', { filename });
}
