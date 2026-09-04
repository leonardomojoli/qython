import api from './api';
import i18n from '../i18n';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  reasoning?: string;
  feedback?: 'like' | 'dislike' | null;
  files?: string[];
  created_at: string;
}

export interface ChatSource {
  title: string;
  url?: string;
  uri?: string; // o backend manda `uri` (não `url`)
  type?: string;
  source_type?: string;
  pmid?: string;
}

export interface ChatSession {
  id: number;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatResponse {
  session_id: number;
  message: ChatMessage;
  session_title?: string;
}

// ── Pílulas de sugestão (v2): curadas no backend (curar sem deploy) + sinal de uso ──
export interface SuggestedPrompt {
  slug: string;
  category?: string | null;
  icon?: string | null;
  label_key?: string | null;
  label: string;
  opener: string;
}

export async function getSuggestedPrompts(): Promise<SuggestedPrompt[]> {
  const res = await api.get<SuggestedPrompt[]>('/copilot/suggested-prompts', { timeout: 15000 });
  return res.data;
}

export function recordPromptClick(slug: string): void {
  // fire-and-forget: sinal de flywheel; nunca bloqueia o chat
  api.post(`/copilot/suggested-prompts/${encodeURIComponent(slug)}/click`).catch(() => {});
}

export interface ConsultationContext {
  type: 'saved_consultation';
  id: number;
  specialty: string;
  patientName?: string | null;
  content: string;
  preview?: string;
  date?: string;
}

export interface SendMessageParams {
  message: string;
  sessionId?: number;
  files?: { uri: string; type: string; name: string }[];
  includeReasoning?: boolean;
  libraryId?: number;
  patientContext?: string;
  consultationContext?: ConsultationContext;
  language?: string;
}

export async function sendMessage(params: SendMessageParams): Promise<ChatResponse> {
  const formData = new FormData();
  formData.append('message', params.message);
  formData.append('include_reasoning', String(params.includeReasoning || false));
  formData.append('language', params.language || i18n.language);

  if (params.sessionId) {
    formData.append('session_id', String(params.sessionId));
  }
  if (params.libraryId) {
    formData.append('library_id', String(params.libraryId));
  }
  if (params.patientContext) {
    formData.append('patient_context', params.patientContext);
  }
  if (params.consultationContext) {
    formData.append('consultation_context', JSON.stringify(params.consultationContext));
  }
  if (params.files) {
    params.files.forEach((file) => {
      formData.append('files', {
        uri: file.uri,
        type: file.type,
        name: file.name,
      } as any);
    });
  }

  const response = await api.post<ChatResponse>('/copilot', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 900000,
  });
  return response.data;
}

export async function getSessions(): Promise<ChatSession[]> {
  const response = await api.get<ChatSession[]>('/copilot/sessions');
  return response.data;
}

export async function getSessionMessages(sessionId: number): Promise<ChatMessage[]> {
  const response = await api.get<ChatMessage[]>(`/copilot/sessions/${sessionId}`);
  return response.data;
}

export async function deleteSession(sessionId: number): Promise<void> {
  await api.delete(`/copilot/sessions/${sessionId}`);
}

export async function updateSessionTitle(
  sessionId: number,
  title: string,
): Promise<ChatSession> {
  const response = await api.put<ChatSession>(`/copilot/sessions/${sessionId}`, { title });
  return response.data;
}

export async function submitFeedback(params: {
  messageId: number;
  feedback: 'like' | 'dislike';
  sessionId: number;
}): Promise<void> {
  await api.post('/copilot/feedback', {
    message_id: params.messageId,
    feedback: params.feedback,
    session_id: params.sessionId,
  });
}
