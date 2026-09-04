import api from './api';
import type { BalanceBreakdown, StorageInfo } from '../types/billing';

export async function getBalanceBreakdown(): Promise<BalanceBreakdown> {
  const response = await api.get<BalanceBreakdown>('/billing/balance/breakdown');
  return response.data;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const response = await api.get<StorageInfo>('/user/storage');
  return response.data;
}

export async function checkWaitlist(
  email: string,
): Promise<{ is_on_waitlist: boolean }> {
  const response = await api.get<{ is_on_waitlist: boolean }>(
    `/user/payment-waitlist/check/${encodeURIComponent(email)}`,
  );
  return response.data;
}

export async function joinWaitlist(
  email: string,
): Promise<{ success: boolean }> {
  const response = await api.post<{ success: boolean }>(
    '/user/payment-waitlist',
    { email },
  );
  return response.data;
}
