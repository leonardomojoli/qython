import api from './api';
import { setObject, getObject, STORAGE_KEYS } from './storage';
import { enqueue, enqueueOrReplace, isTempId, mergeIntoQueuedCreate } from './offlineQueue';
import type { Patient, Consultation, CreatePatientPayload, CreateConsultationPayload } from '../types/ambulatory';

// Extended types for local records
export interface LocalPatient extends Patient {
  _isLocal?: boolean;
}

export interface LocalConsultation extends Consultation {
  _isLocal?: boolean;
}

let tempCounter = 0;

// Único mesmo para dois registros criados no mesmo milissegundo (o contador) e entre execuções do app (o
// instante e o sufixo aleatório).
function generateTempId(): string {
  tempCounter += 1;
  return `temp_${Date.now().toString(36)}_${tempCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Só vale guardar para enviar depois quando o servidor não foi alcançado (sem resposta) ou está
 * indisponível (502/503/504). Se ele respondeu e recusou (dados inválidos, sem permissão), guardar só
 * esconderia o erro: o registro apareceria como salvo e a fila falharia depois, sem o usuário ver.
 */
function shouldQueue(err: any): boolean {
  const status = err?.response?.status;
  return !err?.response || status === 502 || status === 503 || status === 504;
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
    } catch (err) {
      if (!shouldQueue(err)) throw err;
      // Servidor fora de alcance: guarda no aparelho e envia depois.
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
    } catch (err) {
      if (!shouldQueue(err)) throw err;
      // Servidor fora de alcance: vale só no aparelho por enquanto.
    }
  }

  // Offline: update local cache
  const cached = getObject<LocalPatient[]>(STORAGE_KEYS.PATIENTS) || [];
  const idx = cached.findIndex((p) => String(p.id) === String(id));
  if (idx >= 0) {
    cached[idx] = { ...cached[idx], ...data, updated_at: new Date().toISOString(), _isLocal: true };
    setObject(STORAGE_KEYS.PATIENTS, cached);
  }

  if (isTempId(id)) {
    // Paciente criado offline que ainda não foi enviado: a edição entra no próprio cadastro que está na fila.
    mergeIntoQueuedCreate(id, data as unknown as Record<string, unknown>);
  } else if (typeof id === 'number') {
    // Várias edições seguidas do mesmo paciente viram uma só (vale a última).
    enqueueOrReplace({
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
    } catch (err) {
      if (!shouldQueue(err)) throw err;
      // Servidor fora de alcance: guarda no aparelho e envia depois.
    }
  }

  // Offline: create local record
  const tempId = generateTempId();
  const patientId = data.patient_id;
  const cachedPatients = getObject<LocalPatient[]>(STORAGE_KEYS.PATIENTS) || [];
  const patientRecord = patientId != null ? cachedPatients.find((p) => String(p.id) === String(patientId)) : undefined;
  const localConsultation: LocalConsultation = {
    id: tempId as any,
    user_id: 0,
    // Paciente criado offline: guarda o id provisório; vira o real quando o cadastro for enviado.
    patient_id: patientId != null ? (patientId as any) : null,
    patient_name: patientRecord?.full_name ?? null,
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
    dependsOnTempId: isTempId(patientId) ? patientId : undefined,
  });

  return localConsultation;
}
