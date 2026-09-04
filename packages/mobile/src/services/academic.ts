import api from './api';
import type {
  Library,
  LibraryDocument,
  ArenaExam,
  JobStatus,
  QuizQuestion,
  QuizResult,
  RankingEntry,
  Season,
  ChatMessage,
  XpProfile,
} from '../types/academic';

// ─── Libraries ───────────────────────────────────────────────

export async function getLibraries(): Promise<Library[]> {
  const response = await api.get<Library[]>('/academic/libraries');
  return response.data;
}

export async function createLibrary(params: {
  name: string;
  description?: string;
  icon?: string;
}): Promise<Library> {
  const response = await api.post<Library>('/academic/libraries', params);
  return response.data;
}

export async function deleteLibrary(id: number): Promise<void> {
  await api.delete(`/academic/libraries/${id}`);
}

export async function updateLibrary(
  id: number,
  params: { name: string; description: string; icon?: string },
): Promise<Library> {
  const response = await api.patch<Library>(`/academic/libraries/${id}`, params);
  return response.data;
}

export async function getLibraryDocuments(
  libraryId: number,
): Promise<LibraryDocument[]> {
  const response = await api.get<LibraryDocument[]>(
    `/academic/libraries/${libraryId}/documents`,
  );
  return response.data;
}

export async function uploadDocument(
  libraryId: number,
  file: { uri: string; name: string; type: string },
  onProgress?: (progress: number) => void,
): Promise<LibraryDocument> {
  const formData = new FormData();
  formData.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);

  const response = await api.post<LibraryDocument>(
    `/academic/libraries/${libraryId}/documents`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const pct = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total,
          );
          onProgress(pct);
        }
      },
    },
  );
  return response.data;
}

export async function deleteDocument(
  libraryId: number,
  docId: number,
): Promise<void> {
  await api.delete(`/academic/libraries/${libraryId}/documents/${docId}`);
}

export async function retryDocumentProcessing(
  libraryId: number,
  docId: number,
): Promise<LibraryDocument> {
  const response = await api.post<LibraryDocument>(
    `/academic/libraries/${libraryId}/documents/${docId}/retry`,
  );
  return response.data;
}

// ─── Library RAG Chat ────────────────────────────────────────

export async function sendLibraryChat(
  libraryId: number,
  message: string,
  history: ChatMessage[],
): Promise<{ response: string }> {
  const response = await api.post<{ response: string }>(
    `/academic/libraries/${libraryId}/chat`,
    { message, history },
    { timeout: 900000 },
  );
  return response.data;
}

// ─── Arena ───────────────────────────────────────────────────

export async function getAvailableExams(): Promise<ArenaExam[]> {
  const response = await api.get<ArenaExam[]>('/academic/arena/exams');
  return response.data;
}

export async function getEnrolledExams(): Promise<{ enrolled_codes: string[] }> {
  const response = await api.get<{ enrolled_codes: string[] }>(
    '/academic/arena/enrolled-exams',
  );
  return response.data;
}

export async function enrollInExam(examCode: string): Promise<void> {
  await api.post('/academic/arena/enroll', { exam_code: examCode });
}

export async function unenrollFromExam(examCode: string): Promise<void> {
  await api.post('/academic/arena/unenroll', { exam_code: examCode });
}

export async function getCurrentSeason(): Promise<{ season: Season | null }> {
  const response = await api.get<{ season: Season | null }>(
    '/academic/arena/current-season',
  );
  return response.data;
}

export async function getExamRanking(
  examCode: string,
): Promise<{ ranking_data: RankingEntry[] }> {
  const response = await api.get<{ ranking_data: RankingEntry[] }>(
    `/academic/arena/ranking/${examCode}`,
  );
  return response.data;
}

export async function startQuiz(
  specialty: string,
  mode: string,
  language: string = 'pt-BR',
): Promise<JobStatus> {
  const response = await api.post<JobStatus>('/academic/arena/start_quiz', {
    specialty,
    mode,
    language,
  });
  return response.data;
}

export async function getSimuladoJobStatus(jobId: number): Promise<JobStatus> {
  const response = await api.get<JobStatus>(
    `/academic/arena/simulado_job/${jobId}`,
  );
  return response.data;
}

export async function clearSimuladoJob(jobId: number): Promise<void> {
  await api.delete(`/academic/arena/simulado_job/${jobId}`);
}

export async function submitQuiz(quizData: {
  specialty: string;
  mode: string;
  answers: Record<number, number>;
  questions: QuizQuestion[];
  time_elapsed_seconds?: number;
  challenge_id?: number;
}): Promise<QuizResult> {
  const response = await api.post<QuizResult>(
    '/academic/arena/submit_quiz',
    quizData,
  );
  return response.data;
}

export async function getMyXpProfile(): Promise<XpProfile> {
  const response = await api.get<XpProfile>('/academic/arena/my-xp-profile');
  return response.data;
}

export async function findRandomOpponent(
  examCode: string,
): Promise<{ challenge_id: number; opponent_username: string }> {
  const response = await api.post<{ challenge_id: number; opponent_username: string }>(
    '/academic/arena/matchmaking',
    { exam_code: examCode },
  );
  return response.data;
}

// ─── Material Generation ────────────────────────────────────

export type MaterialType =
  | 'transcription'
  | 'summary'
  | 'detailed_text'
  | 'flashcards'
  | 'mind_map'
  | 'questionnaire_objective'
  | 'questionnaire_subjective'
  | 'comparative_table'
  | 'clinical_case'
  | 'critical_appraisal'
  | 'podcast'
  | 'slideshow_only'
  | 'video_lesson'
  | 'quiz';

export async function generateMaterial(
  libraryId: number,
  materialType: MaterialType,
): Promise<{ job_id: number }> {
  // Usa o MESMO endpoint do web (/academic/process). Materiais de estudo retornam uma
  // AcademicMaterial cujo `id` serve de job_id p/ o polling em /material/{id}/status.
  // (A rota antiga /academic/material/generate nunca existiu no backend → dava 404.)
  const response = await api.post<{ id: number }>('/academic/process', {
    source_type: 'library_id',
    source_value: libraryId,
    material_type: materialType,
  });
  return { job_id: response.data.id };
}

export async function getMaterialJobStatus(jobId: number): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: any;
  error?: string;
}> {
  // O backend retorna AcademicMaterialResponse {status, content, ...}; na falha o motivo
  // vem em content.error. Normaliza p/ o shape que o modal consome.
  const response = await api.get<{ status: string; content?: any }>(`/academic/material/${jobId}/status`);
  const data = response.data;
  return {
    status: data.status as 'pending' | 'processing' | 'completed' | 'error',
    result: data.content,
    error: data.content?.error,
  };
}

export async function getLibraryMaterials(libraryId: number): Promise<any[]> {
  const response = await api.get(`/academic/libraries/${libraryId}/materials`);
  return response.data;
}

// ─── Provas Customizadas (Concursos) — gerador pessoal ───────────

export interface AcademicMaterialLite {
  id: number;
  material_type: string;
  card_id?: number | null;
  content: any;
  status: 'pending' | 'processing' | 'completed' | 'error';
  created_at?: string;
}

// Status tipado de um material (o getMaterialJobStatus tem tipo solto p/ outro fluxo).
export async function getMaterialStatus(materialId: number): Promise<AcademicMaterialLite> {
  const response = await api.get<AcademicMaterialLite>(`/academic/material/${materialId}/status`);
  return response.data;
}

// Entrega de prova (Meus Concursos): persiste a última tentativa no material
export async function saveMaterialAttempt(
  materialId: number,
  attempt: {
    answers: Record<number, string>;
    correct: number;
    incorrect: number;
    unanswered: number;
    total: number;
    elapsed_seconds: number;
    auto_delivered: boolean;
  },
): Promise<void> {
  await api.post(`/academic/material/${materialId}/attempt`, attempt);
}

export interface CustomCardSourceOut {
  library_id: number | null;
  name?: string | null;
}

export interface CustomCardDossier {
  synthesis?: string;
  sources?: Array<{ uri: string; title?: string }>;
  confirmed?: boolean;
  grounded?: boolean;
  researched_at?: string;
  [k: string]: any;
}

export interface CustomCard {
  id: number;
  name: string;
  description?: string | null;
  language: string;
  config: {
    num_questions?: number;
    question_type?: string;
    time_limit_minutes?: number | null;
    [k: string]: any;
  };
  dossier?: CustomCardDossier | null;
  status: string;
  created_at?: string;
  updated_at?: string;
  sources: CustomCardSourceOut[];
  drafts_count?: number | null;
}

export interface CustomCardPayload {
  name: string;
  description?: string | null;
  config?: Record<string, any>;
  source_library_ids?: number[];
  // Subconjunto auto-criado a partir de arquivos anexados (p/ limpeza opcional no delete).
  attached_library_ids?: number[];
  // Biblioteca de "provas anteriores" (referência de FORMATO, não conteúdo).
  past_exams_library_id?: number | null;
}

export async function listCustomCards(): Promise<CustomCard[]> {
  const response = await api.get<CustomCard[]>('/academic/arena/cards');
  return response.data;
}

export async function createCustomCard(payload: CustomCardPayload): Promise<CustomCard> {
  const response = await api.post<CustomCard>('/academic/arena/cards', payload);
  return response.data;
}

export async function updateCustomCard(
  cardId: number,
  payload: Partial<CustomCardPayload> & { status?: string },
): Promise<CustomCard> {
  const response = await api.patch<CustomCard>(`/academic/arena/cards/${cardId}`, payload);
  return response.data;
}

export async function deleteCustomCard(cardId: number, deleteLibraries = false): Promise<void> {
  await api.delete(`/academic/arena/cards/${cardId}`, { params: { delete_libraries: deleteLibraries } });
}

export async function generateCardDraft(
  cardId: number,
  options?: { question_type?: string; num_questions?: number },
): Promise<AcademicMaterialLite> {
  const response = await api.post<AcademicMaterialLite>(
    `/academic/arena/cards/${cardId}/generate`,
    options || {},
    { timeout: 900000 },
  );
  return response.data;
}

export async function getCardDrafts(cardId: number): Promise<AcademicMaterialLite[]> {
  const response = await api.get<AcademicMaterialLite[]>(`/academic/arena/cards/${cardId}/drafts`);
  return response.data;
}

export async function researchCardExam(cardId: number): Promise<CustomCard> {
  const response = await api.post<CustomCard>(
    `/academic/arena/cards/${cardId}/research`,
    {},
    { timeout: 900000 },
  );
  return response.data;
}

export async function updateCardDossier(
  cardId: number,
  data: { synthesis?: string; confirmed?: boolean; sources?: Array<{ uri: string; title?: string }> },
): Promise<CustomCard> {
  const response = await api.put<CustomCard>(`/academic/arena/cards/${cardId}/dossier`, data);
  return response.data;
}

// ─── Challenges ──────────────────────────────────────────────

export interface ArenaChallenge {
  id: number;
  challenger_id: number;
  challenger_username: string;
  opponent_id: number;
  opponent_username: string;
  exam_code: string;
  exam_name?: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'expired';
  challenger_score: number | null;
  opponent_score: number | null;
  challenger_xp: number | null;
  opponent_xp: number | null;
  winner_id: number | null;
  is_winner?: boolean;
  created_at: string;
  expires_at: string;
}

export async function createChallenge(
  opponentUsername: string,
  examCode: string,
  examName?: string,
): Promise<ArenaChallenge> {
  const response = await api.post<ArenaChallenge>('/academic/arena/challenges', {
    opponent_username: opponentUsername,
    exam_code: examCode,
    exam_name: examName,
  });
  return response.data;
}

export async function getChallenges(): Promise<{
  sent: ArenaChallenge[];
  received: ArenaChallenge[];
}> {
  const response = await api.get<{ sent: ArenaChallenge[]; received: ArenaChallenge[] }>(
    '/academic/arena/challenges',
  );
  return response.data;
}

export async function respondToChallenge(
  challengeId: number,
  accept: boolean,
): Promise<ArenaChallenge> {
  const response = await api.post<ArenaChallenge>(
    `/academic/arena/challenges/${challengeId}/respond`,
    { accept },
  );
  return response.data;
}

export async function submitChallengeScore(
  challengeId: number,
  score: number,
): Promise<ArenaChallenge> {
  const response = await api.post<ArenaChallenge>(
    `/academic/arena/challenges/${challengeId}/submit-score`,
    { score },
  );
  return response.data;
}

// ─── Feedback ────────────────────────────────────────────────

export async function submitChatFeedback(params: {
  feedbackType: 'like' | 'dislike';
  contentId: string;
  originalContent: string;
  userPrompt?: string;
  conversationContext?: ChatMessage[];
  feedbackText?: string;
  contactPermission?: boolean;
}): Promise<void> {
  await api.post('/feedback', {
    feedback_type: params.feedbackType,
    content_type: 'library_rag_chat',
    content_id: params.contentId,
    original_content: params.originalContent,
    user_prompt: params.userPrompt || '',
    conversation_context: params.conversationContext || [],
    feedback_text: params.feedbackText || '',
    contact_permission: params.contactPermission || false,
  });
}
