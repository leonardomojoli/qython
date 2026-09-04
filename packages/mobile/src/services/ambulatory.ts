import api from './api';
import { Platform, Share, Alert } from 'react-native';
import type {
  Patient,
  Consultation,
  AmbulatoryPrescription,
  MedicalDocument,
  ExamOrder,
  Orientation,
  DraftResponse,
  SummaryResponse,
  CreateConsultationPayload,
  CreatePatientPayload,
  CreatePrescriptionPayload,
  CreateDocumentPayload,
  CreateExamOrderPayload,
  CreateOrientationPayload,
  GenerateOrientationPayload,
  GenerateOrientationResponse,
  FeedbackPayload,
} from '../types/ambulatory';

// ─── Consultations ──────────────────────────────────────────

export async function getDraftConsultation(
  specialty: string,
  rawNotes: string,
  isFirstConsultation: boolean,
  patientId?: number | null,
): Promise<DraftResponse> {
  const response = await api.post<DraftResponse>(
    '/consultations/draft',
    {
      specialty,
      rawNotes,
      is_first_consultation: isFirstConsultation,
      patientId: patientId ?? undefined,
    },
    { timeout: 120000 },
  );
  return response.data;
}

export async function getSummary(
  improvedNotes: string,
): Promise<SummaryResponse> {
  const response = await api.post<SummaryResponse>(
    '/consultations/summary',
    { improvedNotes },
    { timeout: 120000 },
  );
  return response.data;
}

export async function createConsultation(
  data: CreateConsultationPayload,
): Promise<Consultation> {
  const response = await api.post<Consultation>('/consultations', data);
  return response.data;
}

// ─── Anamnesis Templates (customizações por especialidade + tipo) ──
// Templates padrão vêm de @qython/shared (ANAMNESE_DATA/getTemplate). Estes são as
// customizações que o usuário salva no backend (sincronizam web↔mobile).
export interface AnamnesisTemplate {
  specialty: string;
  consultation_type: 'first' | 'return';
  content: string;
}

export async function getAnamnesisTemplates(): Promise<AnamnesisTemplate[]> {
  const response = await api.get<AnamnesisTemplate[]>('/settings/anamnesis-templates', {
    timeout: 30000,
  });
  return response.data;
}

export async function saveAnamnesisTemplate(
  specialty: string,
  consultationType: 'first' | 'return',
  content: string,
): Promise<void> {
  await api.post('/settings/anamnesis-templates', {
    specialty,
    consultation_type: consultationType,
    content,
  });
}

export async function deleteAnamnesisTemplate(
  specialty: string,
  consultationType: 'first' | 'return',
): Promise<void> {
  await api.delete(
    `/settings/anamnesis-templates/${encodeURIComponent(specialty)}/${consultationType}`,
  );
}

export async function getAllConsultations(): Promise<Consultation[]> {
  const response = await api.get<Consultation[]>('/consultations');
  return response.data;
}

export async function getConsultationById(
  id: number,
): Promise<Consultation> {
  const response = await api.get<Consultation>(`/consultations/${id}`);
  return response.data;
}

export async function deleteConsultations(
  ids: number[],
): Promise<void> {
  await api.delete('/consultations', { data: { ids } });
}

// ─── Patients ───────────────────────────────────────────────

export async function getPatients(
  search?: string,
): Promise<Patient[]> {
  const response = await api.get<Patient[]>('/patients', {
    params: search ? { search } : undefined,
  });
  return response.data;
}

export async function getPatient(id: number): Promise<Patient> {
  const response = await api.get<Patient>(`/patients/${id}`);
  return response.data;
}

export async function createPatient(
  data: CreatePatientPayload,
): Promise<Patient> {
  const response = await api.post<Patient>('/patients', data);
  return response.data;
}

export async function updatePatient(
  id: number,
  data: CreatePatientPayload,
): Promise<Patient> {
  const response = await api.put<Patient>(`/patients/${id}`, data);
  return response.data;
}

export async function deletePatient(id: number): Promise<void> {
  await api.delete(`/patients/${id}`);
}

// ─── Patient Info Extraction ────────────────────────────────

export interface ProposedChange {
  category: string;
  action: string;
  value: string;
  old_value?: string | null;
  reasoning: string;
}

export interface ExtractUpdatesResponse {
  has_changes: boolean;
  changes: ProposedChange[];
}

export async function extractPatientUpdates(
  patientId: number,
  data: { consultationId: number; notes: string; summary?: string },
): Promise<ExtractUpdatesResponse> {
  const response = await api.post<ExtractUpdatesResponse>(
    `/patients/${patientId}/extract-updates`,
    data,
    { timeout: 30000 },
  );
  return response.data;
}

export async function applyPatientUpdates(
  patientId: number,
  data: { consultationId: number; accepted_changes: any[]; rejected_changes: any[] },
): Promise<Patient> {
  const response = await api.post<Patient>(
    `/patients/${patientId}/apply-updates`,
    data,
  );
  return response.data;
}

export async function getPatientHistory(
  id: number,
): Promise<PatientHistoryEntry[]> {
  const response = await api.get<PatientHistoryEntry[]>(
    `/patients/${id}/history`,
  );
  return response.data;
}

type PatientHistoryEntry = {
  date: string;
  chief_complaint: string;
  notes: string;
  diagnosis: string;
  plan: string;
  provider?: string;
};

// ─── Prescriptions ──────────────────────────────────────────

export async function createPrescription(
  data: CreatePrescriptionPayload,
): Promise<AmbulatoryPrescription> {
  const response = await api.post<AmbulatoryPrescription>(
    '/prescriptions',
    data,
  );
  return response.data;
}

export async function getPrescriptions(
  patientId?: number,
): Promise<AmbulatoryPrescription[]> {
  const response = await api.get<AmbulatoryPrescription[]>('/prescriptions', {
    params: patientId ? { patient_id: patientId } : undefined,
  });
  return response.data;
}

export async function deletePrescription(id: number): Promise<void> {
  await api.delete(`/prescriptions/${id}`);
}

// ─── Documents (Atestados) ─────────────────────────────────

export async function createDocument(
  data: CreateDocumentPayload,
): Promise<MedicalDocument> {
  const response = await api.post<MedicalDocument>('/documents', data);
  return response.data;
}

export async function getDocuments(
  patientId?: number,
  type?: string,
): Promise<MedicalDocument[]> {
  const response = await api.get<MedicalDocument[]>('/documents', {
    params: {
      ...(patientId ? { patient_id: patientId } : {}),
      ...(type ? { document_type: type } : {}),
    },
  });
  return response.data;
}

export async function deleteDocument(id: number): Promise<void> {
  await api.delete(`/documents/${id}`);
}

// ─── Exam Orders ───────────────────────────────────────────

export async function createExamOrder(
  data: CreateExamOrderPayload,
): Promise<ExamOrder> {
  const response = await api.post<ExamOrder>('/exams', data);
  return response.data;
}

export async function getExamOrders(
  patientId?: number,
): Promise<ExamOrder[]> {
  const response = await api.get<ExamOrder[]>('/exams', {
    params: patientId ? { patient_id: patientId } : undefined,
  });
  return response.data;
}

export async function deleteExamOrder(id: number): Promise<void> {
  await api.delete(`/exams/${id}`);
}

// ─── Orientations ──────────────────────────────────────────

export async function generateOrientation(
  data: GenerateOrientationPayload,
): Promise<GenerateOrientationResponse> {
  const response = await api.post<GenerateOrientationResponse>(
    '/orientations/generate',
    data,
    { timeout: 120000 },
  );
  return response.data;
}

export async function createOrientation(
  data: CreateOrientationPayload,
): Promise<Orientation> {
  const response = await api.post<Orientation>('/orientations', data);
  return response.data;
}

// ─── Feedback ──────────────────────────────────────────────

export async function submitFeedback(
  data: FeedbackPayload,
): Promise<void> {
  await api.post('/feedback', data);
}

// ─── PDF Download & Share ──────────────────────────────────

export async function downloadAndSharePdf(
  endpoint: string,
  filename: string,
): Promise<void> {
  try {
    const ReactNativeBlobUtil = (await import('react-native-blob-util')).default;
    const { getAuthToken } = await import('./auth');
    const authToken = await getAuthToken();

    const baseUrl = api.defaults.baseURL || '';
    const url = `${baseUrl}${endpoint}`;

    const res = await ReactNativeBlobUtil.config({
      fileCache: true,
      appendExt: 'pdf',
    }).fetch('GET', url, {
      Authorization: `Bearer ${authToken}`,
    });

    const filePath = res.path();

    const RNShare = (await import('react-native-share')).default;
    await RNShare.open({
      url: Platform.OS === 'android' ? `file://${filePath}` : filePath,
      type: 'application/pdf',
      filename,
    });
  } catch (error: any) {
    if (error?.message !== 'User did not share') {
      Alert.alert('', 'Erro ao baixar/compartilhar PDF');
    }
  }
}

// ─── Balance ───────────────────────────────────────────────

export async function getUserBalance(): Promise<{ balance: number }> {
  const response = await api.get<{ balance: number }>('/billing/balance');
  return response.data;
}
