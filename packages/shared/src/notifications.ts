/**
 * Notification types and interfaces shared between web and mobile
 */

// All notification types supported by the system
export enum NotificationType {
  MATERIAL_READY = 'material_ready',
  MATERIAL_FAILED = 'material_failed',
  DRACMA_EXPIRING = 'dracma_expiring',
  KYC_VERIFIED = 'kyc_verified',
  KYC_REJECTED = 'kyc_rejected',
  WAITLIST_ACTIVATED = 'waitlist_activated',
  ARENA_SEASON_STARTED = 'arena_season_started',
  ARENA_SEASON_ENDED = 'arena_season_ended',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
}

export interface NotificationPayload {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  is_read: boolean;
  created_at: string; // ISO 8601
}

export interface NotificationPreferences {
  push_enabled: boolean;
  email_enabled: boolean;
  // Per-type overrides (type -> enabled)
  type_overrides?: Partial<Record<NotificationType, boolean>>;
}

export interface NotificationsResponse {
  notifications: NotificationPayload[];
  unread_count: number;
}

export interface UnreadCountResponse {
  unread_count: number;
}

// WebSocket message types
export interface WSNewNotificationMessage {
  type: 'new_notification';
  notification: NotificationPayload;
}

export interface WSUnreadCountMessage {
  type: 'unread_count';
  unread_count: number;
}

export type WSMessage = WSNewNotificationMessage | WSUnreadCountMessage;
