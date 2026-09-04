import api from './api';
import { Platform } from 'react-native';

// ─── Doctor Logo ──────────────────────────────────────────

export async function uploadDoctorLogo(uri: string, type: string, name: string): Promise<{ doctor_logo: string }> {
  const formData = new FormData();
  formData.append('file', {
    uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
    type: type || 'image/png',
    name: name || 'logo.png',
  } as any);

  const response = await api.post<{ doctor_logo: string }>('/user/upload-doctor-logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });
  return response.data;
}

export async function deleteDoctorLogo(): Promise<void> {
  await api.delete('/user/doctor-logo');
}

// ─── Achievements ─────────────────────────────────────────

export interface AchievementDef {
  title: string;
  description: string;
  icon: string;
  category: string;
  tier: string;
}

export interface UserAchievement {
  badge_code: string;
  achieved_at: string;
}

export async function getAllAchievementDefs(): Promise<Record<string, AchievementDef>> {
  const response = await api.get<Record<string, AchievementDef>>('/user/achievements/all');
  return response.data;
}

export async function getUserAchievements(): Promise<UserAchievement[]> {
  const response = await api.get<UserAchievement[]>('/user/achievements');
  return response.data;
}

// ─── Statistics ───────────────────────────────────────────

export interface UserStats {
  consultations_created: number;
  quizzes_completed: number;
  copilot_conversations: number;
  total_score: number;
}

export interface ComprehensiveStats {
  overview: {
    total_consultations: number;
    total_materials: number;
    total_quizzes: number;
    arena_score: number;
  };
  consultations: {
    by_month: { month: string; count: number }[];
    by_specialty: Record<string, number>;
  };
  academic: {
    quizzes_completed: number;
    correct_rate: number;
    season_rank: number;
    season_percentile: number;
  };
}

export async function getUserStats(): Promise<UserStats> {
  const response = await api.get<UserStats>('/user/stats');
  return response.data;
}

export async function getComprehensiveStats(): Promise<ComprehensiveStats> {
  const response = await api.get<ComprehensiveStats>('/user/statistics/comprehensive');
  return response.data;
}
