// Types for the Billing module

export interface DracmaBatch {
  id: number;
  amount: number;
  source: DracmaSource;
  acquired_at: string;
  expires_at: string;
  days_until_expiration: number;
}

export type DracmaSource =
  | 'subscription'
  | 'internal_plan'
  | 'student_bonus'
  | 'purchase'
  | 'promo'
  | 'admin'
  | 'migration'
  | 'registration';

export interface BalanceBreakdown {
  total: number;
  expiring_soon: number;
  expiring_soon_days: number;
  by_source: Record<string, number>;
  next_expiration: string | null;
  next_expiration_amount: number;
  batches: DracmaBatch[];
}

export interface StorageInfo {
  storage_used_bytes: number;
  storage_quota_bytes: number;
  storage_percent: number;
  libraries_used: number;
  libraries_max: number | null;
  docs_per_library_max: number | null;
}

export type PlanTier = 'intern' | 'resident' | 'staff' | 'specialist' | 'enterprise';

export interface PlanDefinition {
  key: PlanTier;
  dracmas: string;
  basePriceUSD: number | null;
  features: { name: string; included: boolean }[];
}

export interface DracmaPackage {
  id: string;
  amount: string;
  priceUSD: number;
  popular: boolean;
  iconColor: string;
}
