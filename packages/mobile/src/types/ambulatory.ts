// Types and constants for the Ambulatory module

export type ConsultationType = 'first' | 'return';
export type PrescriptionType = 'simple' | 'controlled_c1' | 'controlled_b1';
export type Gender = 'male' | 'female' | 'other';

export interface Patient {
  id: number;
  full_name: string;
  birth_date: string | null;
  gender: Gender | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  document_id: string | null;
  address: string | null;
  allergies: string[];
  chronic_conditions: string[];
  current_medications: string[];
  clinical_history: string | null;
  clinical_history_parsed: PatientHistoryEntry[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientHistoryEntry {
  date: string;
  chief_complaint: string;
  notes: string;
  diagnosis: string;
  plan: string;
  provider?: string;
}

export interface Consultation {
  id: number;
  user_id: number;
  patient_id: number | null;
  patient_name: string | null;
  specialty: string;
  is_first_consultation: boolean;
  raw_notes: string;
  improved_notes: string | null;
  summary: string | null;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface PrescriptionItem {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
}

export interface AmbulatoryPrescription {
  id: number;
  doctor_id: number;
  patient_id: number;
  patient_name: string | null;
  prescription_type: PrescriptionType;
  items: PrescriptionItem[];
  notes: string | null;
  created_at: string;
}

export interface DraftResponse {
  improved_notes: string;
}

export interface SummaryResponse {
  summary: string;
}

export interface CreateConsultationPayload {
  specialty: string;
  is_first_consultation: boolean;
  rawNotes: string;
  improvedNotes: string;
  summary: string;
  patient_id?: number | string | null;
  duration_minutes?: number | null;
}

export interface CreatePatientPayload {
  full_name: string;
  birth_date?: string | null;
  gender?: Gender | null;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
  document_id?: string | null;
  address?: string | null;
  allergies?: string[];
  chronic_conditions?: string[];
  current_medications?: string[];
  clinical_history?: string | null;
  notes?: string | null;
}

export interface CreatePrescriptionPayload {
  patient_id: number;
  prescription_type: PrescriptionType;
  items: PrescriptionItem[];
  notes?: string;
}

// ─── Phase 4.5: Documents, Exams, Orientations ─────────────

export type DocumentType = 'sick_leave' | 'attendance' | 'fitness' | 'report' | 'referral';
export type Urgency = 'routine' | 'urgent' | 'emergency';

export interface MedicalDocument {
  id: number;
  patient_id: number;
  patient_name?: string | null;
  document_type: DocumentType;
  content: Record<string, string>;
  created_at: string;
}

export interface ExamItem {
  name: string;
  code: string;
  category?: string;
}

export interface ExamOrder {
  id: number;
  patient_id: number;
  patient_name?: string | null;
  exams: ExamItem[];
  clinical_indication?: string | null;
  urgency: Urgency;
  created_at: string;
}

export interface Orientation {
  id: number;
  patient_id?: number | null;
  title: string;
  content: string;
  generation_type: 'template' | 'ai_generated';
  template_key?: string | null;
  specialty?: string | null;
  created_at: string;
}

export interface ExamPanel {
  label: string;
  exams: ExamItem[];
}

export interface Subtemplate {
  id: string;
  category: string;
  labelKey: string;
  specialties: string[];
  content: string;
}

export interface SubtemplateCategory {
  labelKey: string;
}

export interface OrientationTemplate {
  key: string;
  icon: string;
  specialty: string;
}

export interface CreateDocumentPayload {
  patient_id: number;
  document_type: DocumentType;
  content: Record<string, string>;
}

export interface CreateExamOrderPayload {
  patient_id: number;
  exams: ExamItem[];
  clinical_indication?: string;
  urgency: Urgency;
}

export interface CreateOrientationPayload {
  patient_id?: number | null;
  generation_type: 'template' | 'ai_generated';
  template_key?: string | null;
  title: string;
  content: string;
  specialty?: string | null;
}

export interface GenerateOrientationPayload {
  patient_id?: number | null;
  prompt: string;
  specialty?: string | null;
  language_code?: string;
}

export interface GenerateOrientationResponse {
  id: number;
  title: string;
  content: string;
  training_data_id?: number;
}

export interface FeedbackPayload {
  feedback_type: 'like' | 'dislike';
  content_type: 'improved_notes' | 'summary' | 'patient_orientation';
  content_id?: number;
  training_data_id?: number;
  comment?: string;
}

// ─── Constants ──────────────────────────────────────────────

// Especialidades: fonte única em @qython/shared (re-export p/ não quebrar imports existentes).
export { SPECIALTIES } from '@qython/shared/src/ambulatory/specialties';

export const PRESCRIPTION_TYPES: { value: PrescriptionType; labelKey: string }[] = [
  { value: 'simple', labelKey: 'simplePrescription' },
  { value: 'controlled_c1', labelKey: 'controlledC1' },
  { value: 'controlled_b1', labelKey: 'controlledB1' },
];

export const GENDER_OPTIONS: { value: Gender; labelKey: string }[] = [
  { value: 'male', labelKey: 'male' },
  { value: 'female', labelKey: 'female' },
  { value: 'other', labelKey: 'other' },
];
