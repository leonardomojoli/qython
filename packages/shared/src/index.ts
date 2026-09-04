/**
 * @qython/shared - Shared code between web and mobile
 *
 * This package contains constants, types, and utilities
 * shared across Qython platforms.
 */

// API Configuration
export const API_VERSION = 'v1';

// App metadata
export const APP_NAME = 'Qython';
export const APP_DESCRIPTION = 'Clinical Intelligence Platform';

// Shared types
export interface User {
  id: number;
  email: string;
  full_name: string;
  plan: 'free' | 'resident' | 'staff' | 'specialist';
  country: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Plantão (Emergency On-Call) types
export type {
  EmergencyDrugCategory,
  EmergencyDrugBase,
  ProtocolSubstep,
  ProtocolStepBase,
  EmergencyProtocolBase,
  DrugCategoryInfo,
} from './plantao';

// Notification types
export {
  NotificationType,
  type NotificationPayload,
  type NotificationPreferences,
  type NotificationsResponse,
  type UnreadCountResponse,
} from './notifications';

// Auth token keys
export const AUTH_TOKEN_KEY = 'qython_auth_token';
export const REFRESH_TOKEN_KEY = 'qython_refresh_token';

// Ambulatório (especialidades, subtemplates, anamnese): fonte única em JS puro sob
// ./ambulatory/* (consumido por deep-path tanto pelo web/Rollup quanto pelo mobile/Metro,
// pois o build do Vite não transpila TS de pacote linkado). Tipos via .d.ts ao lado.
