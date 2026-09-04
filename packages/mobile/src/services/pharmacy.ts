import api from './api';
import type {
  Medication,
  InteractionCheckResult,
  Prescription,
  PharmacySend,
} from '../types/pharmacy';

export interface SearchMedicationsParams {
  search?: string;
  limit?: number;
  offset?: number;
  has_gov_program?: boolean;
  therapeutic_class?: string;
  controlled_type?: string;
  country?: string;
  item_type?: 'medication' | 'supply';
  lang?: string;
}

export async function searchMedications(
  params: SearchMedicationsParams,
): Promise<Medication[]> {
  const response = await api.get<Medication[]>('/medications', {
    params,
    timeout: 30000,
  });
  return response.data;
}

export async function getMedication(id: number): Promise<Medication> {
  const response = await api.get<Medication>(`/medications/${id}`);
  return response.data;
}

export async function checkDrugInteractions(
  activePrinciples: string[],
): Promise<InteractionCheckResult> {
  const response = await api.post<InteractionCheckResult>(
    '/medications/check-interactions',
    { active_principles: activePrinciples },
    { timeout: 30000 },
  );
  return response.data;
}

export async function getPrescriptions(): Promise<Prescription[]> {
  const response = await api.get<Prescription[]>('/prescriptions');
  return response.data;
}

export async function createPrescriptionShareLink(
  prescriptionId: number,
): Promise<{ share_url: string }> {
  const response = await api.post<{ share_url: string }>(
    `/prescriptions/${prescriptionId}/share`,
  );
  return response.data;
}

export async function getPrescriptionPharmacySends(
  prescriptionId: number,
): Promise<PharmacySend[]> {
  const response = await api.get<PharmacySend[]>(
    `/prescriptions/${prescriptionId}/pharmacy-sends`,
  );
  return response.data;
}

export async function submitMedicationFeedback(params: {
  feedbackType: 'like' | 'dislike';
  contentId: string;
  originalContent: string;
  feedbackText?: string;
  contactPermission?: boolean;
}): Promise<void> {
  await api.post('/feedback', {
    feedback_type: params.feedbackType,
    content_type: 'medication_detail',
    content_id: params.contentId,
    original_content: params.originalContent,
    feedback_text: params.feedbackText || '',
    contact_permission: params.contactPermission || false,
  });
}
