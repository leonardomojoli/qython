import api from './api';
import { useNetwork } from '../contexts/NetworkContext';
import { setObject, getObject, STORAGE_KEYS } from './storage';
import { enqueue } from './offlineQueue';
import type { Patient, Consultation, CreatePatientPayload, CreateConsultationPayload } from '../types/ambulatory';

// Extended types for local records
export interface LocalPatient extends Patient {
  _isLocal?: boolean;
}

export interface LocalConsultation extends Consultation {
  _isLocal?: boolean;
}

function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createPatientOfflineAware(
  data: CreatePatientPayload,
  isOnline: boolean,
): Promise<LocalPatient> {
  if (isOnline) {
    try {
      const response = await api.post<Patient>('/patients', data);
      const patient = response.data;
      // Update cache
      const cached = getObject<LocalPatient[]>(STORAGE_KEYS.PATIENTS) || [];
      cached.unshift(patient);
      setObject(STORAGE_KEYS.PATIENTS, cached);
      return patient;
    } catch {
      // Fall through to offline mode
    }
  }

  // Offline: create local record
  const tempId = generateTempId();
  const localPatient: LocalPatient = {
    id: tempId as any,
    full_name: data.full_name,
    birth_date: data.birth_date || null,
    gender: data.gender || null,
    phone: data.phone || null,
    email: data.email || null,
    country: data.country || null,
    document_id: data.document_id || null,
    address: data.address || null,
    allergies: data.allergies || [],
    chronic_conditions: data.chronic_conditions || [],
    current_medications: data.current_medications || [],
    clinical_history: data.clinical_history || null,
    clinical_history_parsed: null,
    notes: data.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _isLocal: true,
  };

  // Save to cache
  const cached = getObject<LocalPatient[]>(STORAGE_KEYS.PATIENTS) || [];
  cached.unshift(localPatient);
  setObject(STORAGE_KEYS.PATIENTS, cached);

  // Enqueue for later sync
  enqueue({
    type: 'CREATE_PATIENT',
    endpoint: '/patients',
    method: 'POST',
    payload: data as unknown as Record<string, unknown>,
    tempId,
  });

  return localPatient;
}

export async function updatePatientOfflineAware(
  id: number | string,
  data: CreatePatientPayload,
  isOnline: boolean,
): Promise<LocalPatient> {
  if (isOnline && typeof id === 'number') {
    try {
      const response = await api.put<Patient>(`/patients/${id}`, data);
      const patient = response.data;
      // Update cache
      const cached = getObject<LocalPatient[]>(STORAGE_KEYS.PATIENTS) || [];
      const idx = cached.findIndex((p) => p.id === id);
      if (idx >= 0) cached[idx] = patient;
      setObject(STORAGE_KEYS.PATIENTS, cached);
      return patient;
    } catch {
      // Fall through to offline
    }
  }

  // Offline: update local cache
  const cached = getObject<LocalPatient[]>(STORAGE_KEYS.PATIENTS) || [];
  const idx = cached.findIndex((p) => String(p.id) === String(id));
  if (idx >= 0) {
    cached[idx] = { ...cached[idx], ...data, updated_at: new Date().toISOString(), _isLocal: true };
    setObject(STORAGE_KEYS.PATIENTS, cached);
  }

  if (typeof id === 'number') {
    enqueue({
      type: 'UPDATE_PATIENT',
      endpoint: `/patients/${id}`,
      method: 'PUT',
      payload: data as unknown as Record<string, unknown>,
    });
  }

  return cached[idx] || ({ ...data, id, _isLocal: true } as LocalPatient);
}

export async function createConsultationOfflineAware(
  data: CreateConsultationPayload,
  isOnline: boolean,
): Promise<LocalConsultation> {
  if (isOnline) {
    try {
      const response = await api.post<Consultation>('/consultations', data);
      const consultation = response.data;
      // Update cache
      const cached = getObject<LocalConsultation[]>(STORAGE_KEYS.CONSULTATIONS) || [];
      cached.unshift(consultation);
      setObject(STORAGE_KEYS.CONSULTATIONS, cached);
      return consultation;
    } catch {
      // Fall through to offline
    }
  }

  // Offline: create local record
  const tempId = generateTempId();
  const patientId = data.patient_id;
  const localConsultation: LocalConsultation = {
    id: tempId as any,
    user_id: 0,
    patient_id: typeof patientId === 'number' ? patientId : null,
    patient_name: null,
    specialty: data.specialty,
    is_first_consultation: data.is_first_consultation,
    raw_notes: data.rawNotes,
    improved_notes: data.improvedNotes || null,
    summary: data.summary || null,
    duration_minutes: data.duration_minutes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _isLocal: true,
  };

  // Save to cache
  const cached = getObject<LocalConsultation[]>(STORAGE_KEYS.CONSULTATIONS) || [];
  cached.unshift(localConsultation);
  setObject(STORAGE_KEYS.CONSULTATIONS, cached);

  // Enqueue
  const queuePayload: Record<string, unknown> = {
    specialty: data.specialty,
    is_first_consultation: data.is_first_consultation,
    rawNotes: data.rawNotes,
    improvedNotes: data.improvedNotes,
    summary: data.summary,
    patient_id: data.patient_id,
    duration_minutes: data.duration_minutes,
  };

  enqueue({
    type: 'CREATE_CONSULTATION',
    endpoint: '/consultations',
    method: 'POST',
    payload: queuePayload,
    tempId,
    dependsOnTempId: typeof patientId === 'string' && patientId.startsWith('temp_')
      ? patientId
      : undefined,
  });

  return localConsultation;
}
