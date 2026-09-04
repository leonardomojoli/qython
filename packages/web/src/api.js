// src/api.js

import axios from 'axios';

import { API_URL, API_STATIC_URL } from './config';

export { API_STATIC_URL };

// Custom event for session expiration - allows global handling across the app
export const SESSION_EXPIRED_EVENT = 'qython:session_expired';

// Dispatch session expired event - called when 401 is detected
const dispatchSessionExpired = () => {
  // Prevent multiple dispatches in quick succession
  const lastDispatch = window._lastSessionExpiredDispatch || 0;
  const now = Date.now();
  if (now - lastDispatch < 2000) return; // Debounce 2 seconds
  window._lastSessionExpiredDispatch = now;

  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
};

export const api = axios.create({
  baseURL: API_URL,
});


api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized globally - session expired
    if (error.response?.status === 401) {
      // Don't dispatch for login/register endpoints (expected 401 for wrong credentials)
      const url = error.config?.url || '';
      const isAuthEndpoint = url.includes('/login') || url.includes('/register');

      if (!isAuthEndpoint) {
        dispatchSessionExpired();
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Check if the current token is still valid by pinging the server
 * Returns true if valid, false if expired/invalid
 */
export const checkTokenValidity = async () => {
  const token = localStorage.getItem('authToken');
  if (!token) return false;

  try {
    await api.get('/user/info', { timeout: 10000 });
    return true;
  } catch (error) {
    if (error.response?.status === 401) {
      return false;
    }
    // Network error or server down - assume token might still be valid
    // to avoid logging out users during temporary connectivity issues
    return true;
  }
};

// Error type constants for better handling in UI components
export const ERROR_TYPES = {
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN',
};

// User-friendly error messages by status code
const getErrorMessage = (status, context, detail) => {
  // Return backend detail if provided and isn't a generic error
  if (detail && typeof detail === 'string' && !detail.toLowerCase().includes('internal server error')) {
    return detail;
  }

  switch (status) {
    case 400:
      return `Dados inválidos. Verifique as informações e tente novamente.`;
    case 402:
      return `Saldo de dracmas insuficiente para esta operação.`;
    case 403:
      return `Você não tem permissão para realizar esta ação.`;
    case 413:
      return `Limite de armazenamento excedido. Remova arquivos ou faça upgrade do plano.`;
    case 404:
      return `O recurso solicitado não foi encontrado.`;
    case 408:
    case 504:
      return `A operação demorou muito para responder. Tente novamente.`;
    case 429:
      return `Muitas requisições. Aguarde alguns segundos e tente novamente.`;
    case 500:
    case 502:
    case 503:
      return `O servidor encontrou um problema temporário. Tente novamente em alguns instantes.`;
    default:
      return `Ocorreu um erro ao ${context}. Tente novamente.`;
  }
};

const handleError = (error, context = 'operação') => {
  const errorDetails = {
    message: error.message,
    status: error.response?.status,
    timestamp: new Date().toISOString(),
  };
  if (import.meta.env.DEV) {
    errorDetails.responseData = error.response?.data;
    errorDetails.request = error.request ? 'Nenhuma resposta recebida' : undefined;
  }
  console.error(`Erro na requisição para ${context}:`, errorDetails);

  if (error.response) {
    if (error.response.status === 401) {
      // Session expired - will be handled globally by interceptor
      // Throw a special error that UI can detect and handle gracefully
      const err = new Error('SESSION_EXPIRED');
      err.type = ERROR_TYPES.SESSION_EXPIRED;
      throw err;
    }
    // O detail pode ser string (legado) ou objeto {code, message} (erros acionáveis, ex.
    // biblioteca vazia). Extrai a mensagem p/ exibição e preserva o code p/ o chamador
    // localizar/tratar caso a caso (err.code).
    const rawDetail = error.response.data?.detail ?? error.response.data?.error ?? null;
    let detailMessage = null;
    let detailCode = null;
    if (rawDetail && typeof rawDetail === 'object') {
      detailCode = rawDetail.code || null;
      detailMessage = rawDetail.message || null;
    } else if (typeof rawDetail === 'string') {
      detailMessage = rawDetail;
    }
    const userFriendlyMessage = getErrorMessage(error.response.status, context, detailMessage);
    const err = new Error(userFriendlyMessage);
    err.type = ERROR_TYPES.SERVER_ERROR;
    err.status = error.response.status;
    if (detailCode) err.code = detailCode;
    throw err;
  } else if (error.request) {
    const err = new Error('Não foi possível conectar ao servidor. Verifique sua conexão com a internet.');
    err.type = ERROR_TYPES.NETWORK_ERROR;
    throw err;
  } else if (error.code === 'ECONNABORTED') {
    const err = new Error('A operação demorou muito para responder. Tente novamente.');
    err.type = ERROR_TYPES.TIMEOUT;
    throw err;
  } else {
    const err = new Error(`Ocorreu um erro ao ${context}. Tente novamente.`);
    err.type = ERROR_TYPES.UNKNOWN;
    throw err;
  }
};

export const getDraftConsultation = async (data) => {
  try {
    const response = await api.post('/consultations/draft', data, {
      timeout: 900000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'gerar rascunho');
  }
};

export const deleteChatSession = async (sessionId) => {
  try {
    const response = await api.delete(`/copilot/sessions/${sessionId}`, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'excluir sessão de chat');
  }
};

export const getUserPreferences = async () => {
  try {
    const response = await api.get('/settings/preferences', {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar preferências do usuário');
  }
};

export const updateUserPreferences = async (preferencesData) => {
  try {
    const response = await api.put('/settings/preferences', preferencesData, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'atualizar preferências do usuário');
  }
};

export const getAnamnesisTemplates = async () => {
  try {
    const response = await api.get('/settings/anamnesis-templates', {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'carregar templates de anamnese');
  }
};

export const getSummary = async (improvedText, options = {}) => {
  try {
    const payload = {
      improvedText,
      // DPO/Regeneration fields
      isRegeneration: options.isRegeneration || false,
      previousResponse: options.previousResponse || null
    };
    const response = await api.post('/consultations/summary', payload, {
      timeout: 900000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'gerar resumo');
  }
};

export const generateAvatar = async (prompt, isTemporary = false) => {
  const endpoint = isTemporary ? '/user/generate-avatar-temp' : '/user/generate-avatar';
  try {
    const response = await api.post(endpoint, { prompt }, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'gerar avatar');
  }
};

export const getUserInfo = async () => {
  try {
    const response = await api.get('/user/info', {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar dados do usuário');
  }
};

export const uploadDoctorLogo = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/user/upload-doctor-logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// Pílulas de sugestão do copiloto (v2) — curadas no backend (curar sem deploy do front).
// Lança em falha de propósito: o chamador cai na lista embutida (fallback offline).
export const getSuggestedPrompts = async () => {
  const response = await api.get('/copilot/suggested-prompts', { timeout: 15000 });
  return response.data;
};

// Sinal de uso p/ o flywheel (qual pílula foi escolhida). Fire-and-forget: nunca bloqueia o chat.
export const recordPromptClick = (slug) =>
  api.post(`/copilot/suggested-prompts/${encodeURIComponent(slug)}/click`).catch(() => {});

export const deleteDoctorLogo = async () => {
  const response = await api.delete('/user/doctor-logo');
  return response.data;
};

export const updateTrainingDataPreference = async (optOut) => {
  const response = await api.put('/user/training-data-preference', { opt_out: optOut });
  return response.data;
};

// ============================================================
// LGPD endpoints (Direitos do Titular — Art. 18)
// ============================================================

export const listMyConsents = async (includeRevoked = false) => {
  const response = await api.get('/user/me/consents', {
    params: { include_revoked: includeRevoked },
  });
  return response.data;
};

export const grantConsent = async (type, scopeMetadata = null) => {
  const response = await api.post('/user/me/consents', {
    type,
    scope_metadata: scopeMetadata,
  });
  return response.data;
};

export const revokeConsent = async (type) => {
  const response = await api.delete(`/user/me/consents/${type}`);
  return response.data;
};

export const getActiveConsentDocuments = async (locale = 'pt-BR') => {
  const response = await api.get('/user/me/consents/active-documents', {
    params: { locale },
  });
  return response.data;
};

export const exportMyData = async () => {
  // Returns a Blob (zip file). Caller is responsible for triggering download.
  const response = await api.get('/user/me/data-export', {
    responseType: 'blob',
  });
  return response.data;
};

export const deleteMyAccount = async () => {
  const response = await api.delete('/user/me');
  return response.data;
};

export const getMyAuditLog = async (limit = 200) => {
  const response = await api.get('/user/me/audit-log', { params: { limit } });
  return response.data;
};

export const createConsultation = async (data) => {
  try {
    const response = await api.post('/consultations', data, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'criar consulta');
  }
};

export const getAllConsultations = async (config = {}) => {
  try {
    const response = await api.get('/consultations', {
      ...config,
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar consultas');
  }
};

export const getConsultationById = async (id) => {
  try {
    const response = await api.get(`/consultations/${id}`, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar consulta por ID');
  }
};

export const getChatSessions = async () => {
  try {
    const response = await api.get('/copilot/sessions');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar histórico de conversas');
  }
};

export const getChatMessages = async (sessionId) => {
  try {
    const response = await api.get(`/copilot/sessions/${sessionId}`);
    return response.data;
  } catch (error) {
    handleError(error, 'carregar mensagens da conversa');
  }
};

export const sendChatMessage = async (message, includeClinicalReasoning = false, filesList = null, signal = null, sessionId = null, libraryId = null, isRegeneration = false, consultationContext = null, language = null, patientId = null, ephemeralHistory = null) => {
  try {
    // Always use FormData since backend expects Form fields
    const formData = new FormData();
    formData.append('message', message);
    formData.append('include_reasoning', String(includeClinicalReasoning));
    formData.append('is_regeneration', String(isRegeneration));

    // Send current UI language for immediate response in correct language
    const currentLang = language || localStorage.getItem('i18nextLng') || 'pt';
    formData.append('language', currentLang);

    if (filesList && filesList.length > 0) {
      filesList.forEach(fileItem => {
        formData.append('files', fileItem.file);
      });
    }

    if (sessionId) {
      formData.append('session_id', sessionId);
    }
    if (libraryId) {
      formData.append('library_id', libraryId);
    }
    if (consultationContext) {
      formData.append('consultation_context', JSON.stringify(consultationContext));
    }
    if (patientId) {
      formData.append('patient_id', patientId);
    }
    if (ephemeralHistory && ephemeralHistory.length > 0) {
      formData.append('ephemeral_history', JSON.stringify(ephemeralHistory));
    }

    const response = await api.post('/copilot', formData, {
      timeout: 900000,
      signal: signal,
    });
    return response.data;
  } catch (error) {
    if (axios.isCancel(error)) {
      import.meta.env.DEV && console.log('Requisição para /copilot cancelada.');
      throw new Error('Canceled');
    }
    // Preserve original error for special handling (e.g., plan_upgrade_required, session_limit)
    // These errors have structured detail objects that Chat.js needs to access
    if (error.response?.status === 403 || error.response?.status === 429) {
      throw error;
    }
    handleError(error, 'enviar mensagem de chat');
  }
};

export const uploadFile = async (file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/academic/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'fazer upload de arquivo acadêmico');
  }
};

export const processFile = async (data) => {
  try {
    const response = await api.post('/academic/process', data, {
      timeout: 900000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'processar arquivo acadêmico');
  }
};

export const updateUserProfile = async (profileData) => {
  try {
    const response = await api.put('/user/update', profileData, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'atualizar perfil');
  }
};

export const deleteConsultations = async (ids) => {
  try {
    const response = await api.delete('/consultations', {
      data: { ids },
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'excluir consultas');
  }
};

export const submitFeedback = async (feedbackData) => {
  try {
    const response = await api.post('/feedback', feedbackData, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'enviar feedback');
  }
};

export const createLibrary = async ({ name, description, icon }) => {
  try {
    const response = await api.post('/academic/libraries', { name, description, icon });
    return response.data;
  } catch (error) {
    handleError(error, 'criar biblioteca');
  }
};

export const updateLibrary = async (libraryId, { name, description, icon }) => {
  try {
    const response = await api.patch(`/academic/libraries/${libraryId}`, { name, description, icon });
    return response.data;
  } catch (error) {
    handleError(error, 'atualizar biblioteca');
  }
};

export const getLibraries = async () => {
  try {
    const response = await api.get('/academic/libraries');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar bibliotecas');
  }
};

export const deleteLibrary = async (libraryId) => {
  try {
    const response = await api.delete(`/academic/libraries/${libraryId}`);
    return response.data;
  } catch (error) {
    handleError(error, 'excluir biblioteca');
  }
};

export const uploadDocumentToLibrary = async (libraryId, file, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const response = await api.post(`/academic/libraries/${libraryId}/documents`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 300000,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return response.data;
  } catch (error) {
    handleError(error, 'fazer upload de documento');
  }
};

export const getLibraryDocuments = async (libraryId) => {
  try {
    const response = await api.get(`/academic/libraries/${libraryId}/documents`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar documentos da biblioteca');
  }
};

// --- Conectores de nuvem do usuário (Biblioteca Drive-first) ---

export const getConnectorsStatus = async () => {
  const response = await api.get('/connectors/status');
  return response.data; // { connections: [{provider, account_email, status, connected_at}], available: [...] }
};

export const getConnectDriveUrl = async () => {
  const response = await api.post('/connectors/google/connect');
  return response.data.auth_url;
};

export const disconnectDrive = async () => {
  try {
    const response = await api.delete('/connectors/google/disconnect');
    return response.data;
  } catch (error) {
    handleError(error, 'desconectar o Google Drive');
  }
};

export const getPickerToken = async () => {
  const response = await api.get('/connectors/google/picker-token');
  return response.data; // { access_token, expires_in, app_id, api_key }
};

export const importDocumentsFromDrive = async (libraryId, fileIds) => {
  try {
    const response = await api.post(`/academic/libraries/${libraryId}/documents/from-drive`, { file_ids: fileIds });
    return response.data; // { imported, document_ids }
  } catch (error) {
    handleError(error, 'importar do Google Drive');
  }
};
export const deleteDocument = async (libraryId, documentId) => {
  try {
    const response = await api.delete(`/academic/libraries/${libraryId}/documents/${documentId}`);
    return response.data; // Geralmente retorna 204 No Content, então a resposta pode ser vazia
  } catch (error) {
    handleError(error, 'excluir documento');
  }
};

export const retryDocumentProcessing = async (libraryId, documentId) => {
  try {
    const response = await api.post(`/academic/libraries/${libraryId}/documents/${documentId}/retry`);
    return response.data;
  } catch (error) {
    handleError(error, 'reprocessar documento');
  }
};


export const startQuiz = async (specialty, mode, language = 'pt-BR') => {
  try {
    // Esta função agora inicia um JOB e retorna o objeto do job
    const response = await api.post('/academic/arena/start_quiz', { specialty, mode, language });
    return response.data;
  } catch (error) {
    handleError(error, 'iniciar simulado');
  }
};

export const submitQuiz = async (quizData) => {
  try {
    const response = await api.post('/academic/arena/submit_quiz', quizData);
    return response.data;
  } catch (error) {
    handleError(error, 'submeter quiz');
  }
};

export const getRankings = async (specialty = 'Geral', period = 'all_time') => {
  try {
    const response = await api.get(`/academic/arena/rankings?specialty=${specialty}&period=${period}`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar rankings');
  }
};

export const getUserAchievements = async () => {
  try {
    const response = await api.get('/user/achievements');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar conquistas');
  }
};

export const sendLibraryChatMessage = async (libraryId, message, history) => {
  try {
    const payload = { message, history };
    const response = await api.post(`/academic/libraries/${libraryId}/chat`, payload, {
      timeout: 900000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'enviar mensagem para biblioteca');
  }
};

export const getActivePodcastJob = async () => {
  try {
    const response = await api.get('/academic/podcast_job/active');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar tarefa de podcast ativa');
  }
};

export const getPodcastJobStatus = async (jobId) => {
  try {
    const response = await api.get(`/academic/podcast_job/${jobId}`);
    return response.data;
  } catch (error) {
    handleError(error, 'verificar status da tarefa de podcast');
  }
};

export const clearPodcastJob = async (jobId) => {
  try {
    await api.delete(`/academic/podcast_job/${jobId}`);
  } catch (error) {
    handleError(error, 'limpar tarefa de podcast');
  }
};

export const getMaterialJobStatus = async (materialId) => {
  try {
    const response = await api.get(`/academic/material/${materialId}/status`);
    return response.data;
  } catch (error) {
    handleError(error, 'verificar status da geração de material');
  }
};

// Entrega de prova (Meus Concursos): persiste a última tentativa no material
export const saveMaterialAttempt = async (materialId, attempt) => {
  try {
    const response = await api.post(`/academic/material/${materialId}/attempt`, attempt);
    return response.data;
  } catch (error) {
    handleError(error, 'salvar a entrega da prova');
  }
};

// === Arena — Provas Customizadas (Concursos) ===
export const listCustomCards = async () => {
  try {
    const response = await api.get('/academic/arena/cards');
    return response.data;
  } catch (error) {
    handleError(error, 'listar concursos');
  }
};

export const createCustomCard = async (cardData) => {
  try {
    const response = await api.post('/academic/arena/cards', cardData);
    return response.data;
  } catch (error) {
    handleError(error, 'criar concurso');
  }
};

export const getCustomCard = async (cardId) => {
  try {
    const response = await api.get(`/academic/arena/cards/${cardId}`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar concurso');
  }
};

export const updateCustomCard = async (cardId, cardData) => {
  try {
    const response = await api.patch(`/academic/arena/cards/${cardId}`, cardData);
    return response.data;
  } catch (error) {
    handleError(error, 'atualizar concurso');
  }
};

export const deleteCustomCard = async (cardId, deleteLibraries = false) => {
  try {
    const response = await api.delete(`/academic/arena/cards/${cardId}`, { params: { delete_libraries: deleteLibraries } });
    return response.data;
  } catch (error) {
    handleError(error, 'excluir concurso');
  }
};

export const generateCardDraft = async (cardId, options = {}) => {
  try {
    const response = await api.post(`/academic/arena/cards/${cardId}/generate`, options, { timeout: 900000 });
    return response.data;
  } catch (error) {
    handleError(error, 'gerar prova do concurso');
  }
};

export const getCardDrafts = async (cardId) => {
  try {
    const response = await api.get(`/academic/arena/cards/${cardId}/drafts`);
    return response.data;
  } catch (error) {
    handleError(error, 'listar provas geradas');
  }
};

export const researchCardExam = async (cardId) => {
  try {
    const response = await api.post(`/academic/arena/cards/${cardId}/research`, {}, { timeout: 900000 });
    return response.data;
  } catch (error) {
    handleError(error, 'pesquisar a prova');
  }
};

export const updateCardDossier = async (cardId, data) => {
  try {
    const response = await api.put(`/academic/arena/cards/${cardId}/dossier`, data);
    return response.data;
  } catch (error) {
    handleError(error, 'salvar dossiê');
  }
};

// Added new functions to handle video lesson jobs.
export const getActiveVideoLessonJob = async () => {
  try {
    const response = await api.get('/academic/video_lesson_job/active');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar tarefa de videoaula ativa');
  }
};

export const getVideoLessonJobStatus = async (jobId) => {
  try {
    const response = await api.get(`/academic/video_lesson_job/${jobId}`);
    return response.data;
  } catch (error) {
    handleError(error, 'verificar status da tarefa de videoaula');
  }
};

export const clearVideoLessonJob = async (jobId) => {
  try {
    await api.delete(`/academic/video_lesson_job/${jobId}`);
  } catch (error) {
    handleError(error, 'limpar tarefa de videoaula');
  }
};

export const getActiveSimuladoJob = async () => {
  try {
    const response = await api.get('/academic/arena/simulado_job/active');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar tarefa de simulado ativa');
  }
};

export const getSimuladoJobStatus = async (jobId) => {
  try {
    const response = await api.get(`/academic/arena/simulado_job/${jobId}`);
    return response.data;
  } catch (error) {
    handleError(error, 'verificar status da tarefa de simulado');
  }
};

export const clearSimuladoJob = async (jobId) => {
  try {
    await api.delete(`/academic/arena/simulado_job/${jobId}`);
  } catch (error) {
    handleError(error, 'limpar tarefa de simulado');
  }
};

export const getAvailableExams = async () => {
  try {
    const response = await api.get('/academic/arena/exams');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar exames disponíveis');
  }
};

export const getEnrolledExams = async () => {
  try {
    const response = await api.get('/academic/arena/enrolled-exams');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar exames inscritos');
  }
};

export const enrollInExam = async (examCode) => {
  try {
    const response = await api.post('/academic/arena/enroll', { exam_code: examCode });
    return response.data;
  } catch (error) {
    handleError(error, 'inscrever-se em exame');
  }
};

export const unenrollFromExam = async (examCode) => {
  try {
    const response = await api.post('/academic/arena/unenroll', { exam_code: examCode });
    return response.data;
  } catch (error) {
    handleError(error, 'cancelar inscrição de exame');
  }
};

export const getExamRanking = async (examCode) => {
  try {
    const response = await api.get(`/academic/arena/ranking/${examCode}`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar ranking do exame');
  }
};

export const getCurrentSeason = async () => {
  try {
    const response = await api.get('/academic/arena/current-season');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar temporada atual');
  }
};

export const getMySeasonStats = async (examCode) => {
  try {
    const response = await api.get(`/academic/arena/my-season-stats/${examCode}`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar estatísticas da temporada');
  }
};

export const generateShareCard = async (cardData) => {
  try {
    const response = await api.post('/academic/arena/generate-share-card', cardData);
    return response.data;
  } catch (error) {
    handleError(error, 'gerar card de compartilhamento');
  }
};

// Challenge API functions
export const createChallenge = async (challengeData) => {
  try {
    const response = await api.post('/academic/arena/challenges', challengeData);
    return response.data;
  } catch (error) {
    handleError(error, 'criar desafio');
  }
};

export const getMyChallenges = async () => {
  try {
    const response = await api.get('/academic/arena/challenges');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar desafios');
  }
};

export const respondToChallenge = async (challengeId, accept) => {
  try {
    const response = await api.post(`/academic/arena/challenges/${challengeId}/respond`, { accept });
    return response.data;
  } catch (error) {
    handleError(error, 'responder desafio');
  }
};

export const submitChallengeScore = async (challengeId, score) => {
  try {
    const response = await api.post(`/academic/arena/challenges/${challengeId}/submit-score`, { score });
    return response.data;
  } catch (error) {
    handleError(error, 'submeter pontuação do desafio');
  }
};

export const getMyXpProfile = async () => {
  try {
    const response = await api.get('/academic/arena/my-xp-profile');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar perfil de XP');
  }
};

export const findRandomOpponent = async (examCode) => {
  try {
    const response = await api.post('/academic/arena/matchmaking', { exam_code: examCode });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar oponente');
  }
};

export const getUserStats = async () => {
  try {
    const response = await api.get('/user/stats');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar estatísticas do usuário');
  }
};

export const getComprehensiveStatistics = async () => {
  try {
    const response = await api.get('/user/statistics/comprehensive');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar estatísticas consolidadas');
  }
};

export const changePassword = async (passwordData) => {
  try {
    const response = await api.post('/user/change-password', passwordData);
    return response.data;
  } catch (error) {
    handleError(error, 'alterar senha');
  }
};

// =============================================================================
// AMBULATÓRIO - PATIENTS API
// =============================================================================

export const getPatients = async (search = null) => {
  try {
    const params = search ? { search } : {};
    const response = await api.get('/patients', { params });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar pacientes');
  }
};

export const getPatient = async (patientId) => {
  try {
    const response = await api.get(`/patients/${patientId}`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar paciente');
  }
};

export const createPatient = async (patientData) => {
  try {
    const response = await api.post('/patients', patientData);
    return response.data;
  } catch (error) {
    handleError(error, 'criar paciente');
  }
};

export const updatePatient = async (patientId, patientData) => {
  try {
    const response = await api.put(`/patients/${patientId}`, patientData);
    return response.data;
  } catch (error) {
    handleError(error, 'atualizar paciente');
  }
};

export const deletePatient = async (patientId) => {
  try {
    await api.delete(`/patients/${patientId}`);
    return true;
  } catch (error) {
    handleError(error, 'excluir paciente');
  }
};

export const previewHistoryImport = async (rawHistory) => {
  try {
    const response = await api.post('/patients/preview-history-import', {
      rawHistory
    }, {
      timeout: 120000, // 2 minutes timeout for AI processing
    });
    return response.data;
  } catch (error) {
    handleError(error, 'processar importação de histórico');
  }
};

export const getPatientHistory = async (patientId) => {
  try {
    const response = await api.get(`/patients/${patientId}/history`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar histórico do paciente');
  }
};

export const parsePatientHistory = async (patientId, rawHistory) => {
  try {
    const response = await api.post(`/patients/${patientId}/parse-history`, {
      rawHistory
    }, {
      timeout: 120000, // 2 minutes timeout for AI processing
    });
    return response.data;
  } catch (error) {
    handleError(error, 'processar histórico do paciente');
  }
};

export const savePatientHistory = async (patientId, { parsedHistory, rawHistory }) => {
  try {
    const response = await api.put(`/patients/${patientId}/history`, {
      parsedHistory,
      rawHistory
    }, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'salvar histórico do paciente');
  }
};

export const updateHistoryEntry = async (patientId, entryIndex, entryData) => {
  try {
    const response = await api.patch(`/patients/${patientId}/history/${entryIndex}`, entryData, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'atualizar entrada do histórico');
  }
};

// --- Patient Info Extraction API ---

export const extractPatientUpdates = async (patientId, data) => {
  try {
    const response = await api.post(`/patients/${patientId}/extract-updates`, data, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'extrair atualizações do paciente');
  }
};

export const applyPatientUpdates = async (patientId, data) => {
  try {
    const response = await api.post(`/patients/${patientId}/apply-updates`, data);
    return response.data;
  } catch (error) {
    handleError(error, 'aplicar atualizações do paciente');
  }
};

// --- Prescriptions API ---

export const getPrescriptions = async (patientId = null) => {
  try {
    const params = patientId ? { patient_id: patientId } : {};
    const response = await api.get('/prescriptions', { params });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar prescrições');
  }
};

export const getPrescription = async (prescriptionId) => {
  try {
    const response = await api.get(`/prescriptions/${prescriptionId}`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar detalhes da prescrição');
  }
};

export const createPrescription = async (prescriptionData) => {
  try {
    const response = await api.post('/prescriptions', prescriptionData);
    return response.data;
  } catch (error) {
    handleError(error, 'criar prescrição');
    throw error;
  }
};

export const deletePrescription = async (prescriptionId) => {
  try {
    await api.delete(`/prescriptions/${prescriptionId}`);
    return true;
  } catch (error) {
    handleError(error, 'excluir prescrição');
  }
};

export const getPrescriptionPdf = async (prescriptionId) => {
  try {
    const response = await api.get(`/prescriptions/${prescriptionId}/pdf`, {
      responseType: 'blob', // Important for PDF download
    });
    return response.data;
  } catch (error) {
    handleError(error, 'gerar PDF da prescrição');
    throw error;
  }
};

// --- Medical Documents API ---

export const getDocuments = async (patientId = null, documentType = null) => {
  try {
    const params = {};
    if (patientId) params.patient_id = patientId;
    if (documentType) params.document_type = documentType;
    const response = await api.get('/documents', { params });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar documentos');
  }
};

export const getDocument = async (documentId) => {
  try {
    const response = await api.get(`/documents/${documentId}`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar documento');
  }
};

export const createDocument = async (documentData) => {
  try {
    const response = await api.post('/documents', documentData);
    return response.data;
  } catch (error) {
    handleError(error, 'criar documento');
    throw error;
  }
};

export const deleteMedicalDocument = async (documentId) => {
  try {
    await api.delete(`/documents/${documentId}`);
    return true;
  } catch (error) {
    handleError(error, 'excluir documento');
  }
};

export const getDocumentPdf = async (documentId) => {
  try {
    const response = await api.get(`/documents/${documentId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  } catch (error) {
    handleError(error, 'gerar PDF do documento');
    throw error;
  }
};

// --- Exam Orders API ---

export const getExamOrders = async (patientId = null) => {
  try {
    const params = patientId ? { patient_id: patientId } : {};
    const response = await api.get('/exams', { params });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar pedidos de exames');
  }
};

export const getExamOrder = async (orderId) => {
  try {
    const response = await api.get(`/exams/${orderId}`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar pedido de exames');
  }
};

export const createExamOrder = async (orderData) => {
  try {
    const response = await api.post('/exams', orderData);
    return response.data;
  } catch (error) {
    handleError(error, 'criar pedido de exames');
    throw error;
  }
};

export const deleteExamOrder = async (orderId) => {
  try {
    await api.delete(`/exams/${orderId}`);
    return true;
  } catch (error) {
    handleError(error, 'excluir pedido de exames');
  }
};

export const getExamOrderPdf = async (orderId) => {
  try {
    const response = await api.get(`/exams/${orderId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  } catch (error) {
    handleError(error, 'gerar PDF do pedido');
    throw error;
  }
};

// =============================================================================
// PATIENT ORIENTATIONS API
// =============================================================================

export const createOrientation = async (orientationData) => {
  try {
    const response = await api.post('/orientations', orientationData);
    return response.data;
  } catch (error) {
    handleError(error, 'salvar orientação');
    throw error;
  }
};

export const generateOrientation = async (generateData) => {
  try {
    const response = await api.post('/orientations/generate', generateData, {
      timeout: 120000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'gerar orientação com IA');
    throw error;
  }
};

export const getOrientationPdf = async (orientationId) => {
  try {
    const response = await api.get(`/orientations/${orientationId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  } catch (error) {
    handleError(error, 'gerar PDF da orientação');
    throw error;
  }
};

export const deleteOrientation = async (orientationId) => {
  try {
    await api.delete(`/orientations/${orientationId}`);
    return true;
  } catch (error) {
    handleError(error, 'excluir orientação');
  }
};

// =============================================================================
// PHARMACY MODULE API
// =============================================================================

// --- Medications ---

export const searchMedications = async (params = {}) => {
  try {
    const response = await api.get('/medications', { params, timeout: 30000 });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar medicamentos');
  }
};

export const getFarmaciaPopularMedications = async (params = {}) => {
  try {
    const response = await api.get('/medications/farmacia-popular', { params, timeout: 30000 });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar medicamentos Farmácia Popular');
  }
};

export const getMedication = async (medicationId) => {
  try {
    const response = await api.get(`/medications/${medicationId}`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar medicamento');
  }
};

export const checkDrugInteractions = async (activePrinciples) => {
  try {
    const response = await api.post('/medications/check-interactions', {
      active_principles: activePrinciples,
    }, { timeout: 30000 });
    return response.data;
  } catch (error) {
    handleError(error, 'verificar interações medicamentosas');
  }
};

// --- Pharmacies ---

export const getPharmacies = async (params = {}) => {
  try {
    const response = await api.get('/pharmacy', { params, timeout: 30000 });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar farmácias');
  }
};

export const getPharmacy = async (pharmacyId) => {
  try {
    const response = await api.get(`/pharmacy/${pharmacyId}`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar farmácia');
  }
};

export const getPharmacyMedications = async (pharmacyId, params = {}) => {
  try {
    const response = await api.get(`/pharmacy/${pharmacyId}/medications`, { params, timeout: 30000 });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar catálogo da farmácia');
  }
};

// --- Prescription Sharing ---

export const createPrescriptionShareLink = async (prescriptionId) => {
  try {
    const response = await api.post(`/prescriptions/${prescriptionId}/share`);
    return response.data;
  } catch (error) {
    handleError(error, 'gerar link de compartilhamento');
  }
};

export const revokePrescriptionShareLinks = async (prescriptionId) => {
  try {
    await api.delete(`/prescriptions/${prescriptionId}/share`);
    return true;
  } catch (error) {
    handleError(error, 'revogar links de compartilhamento');
  }
};

export const sendPrescriptionToPharmacy = async (prescriptionId, pharmacyId) => {
  try {
    const response = await api.post(`/prescriptions/${prescriptionId}/send-to-pharmacy`, {
      pharmacy_id: pharmacyId,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'enviar receita para farmácia');
  }
};

export const getPrescriptionPharmacySends = async (prescriptionId) => {
  try {
    const response = await api.get(`/prescriptions/${prescriptionId}/pharmacy-sends`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar envios para farmácias');
  }
};

// --- Public (no auth) ---

export const getPublicPrescription = async (token, params = {}) => {
  try {
    const response = await axios.get(`${API_URL.replace('/api', '')}/api/public/prescription/${token}`, {
      params,
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    // For public endpoint, throw the raw error so component can handle 404/410
    throw error;
  }
};

export const getNearbyPharmaciesPublic = async (lat, lng, radiusKm = 10) => {
  try {
    const response = await axios.get(`${API_URL.replace('/api', '')}/api/public/pharmacies/nearby`, {
      params: { lat, lng, radius_km: radiusKm },
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar farmácias próximas');
  }
};

// --- Pharmacy Admin API ---

export const getPharmacyChains = async () => {
  try {
    const response = await api.get('/pharmacy/chains');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar redes de farmácia');
    throw error;
  }
};

export const createPharmacyChain = async (chainData) => {
  try {
    const response = await api.post('/pharmacy/chains', chainData);
    return response.data;
  } catch (error) {
    handleError(error, 'criar rede de farmácia');
    throw error;
  }
};

export const updatePharmacyChain = async (chainId, chainData) => {
  try {
    const response = await api.put(`/pharmacy/chains/${chainId}`, chainData);
    return response.data;
  } catch (error) {
    handleError(error, 'atualizar rede de farmácia');
    throw error;
  }
};

export const createPharmacy = async (pharmacyData) => {
  try {
    const response = await api.post('/pharmacy', pharmacyData);
    return response.data;
  } catch (error) {
    handleError(error, 'criar farmácia');
    throw error;
  }
};

export const updatePharmacy = async (pharmacyId, pharmacyData) => {
  try {
    const response = await api.put(`/pharmacy/${pharmacyId}`, pharmacyData);
    return response.data;
  } catch (error) {
    handleError(error, 'atualizar farmácia');
    throw error;
  }
};

export const deletePharmacy = async (pharmacyId) => {
  try {
    await api.delete(`/pharmacy/${pharmacyId}`);
    return true;
  } catch (error) {
    handleError(error, 'desativar farmácia');
    throw error;
  }
};

export const updatePharmacyInventory = async (pharmacyId, items) => {
  try {
    const response = await api.post(`/pharmacy/${pharmacyId}/medications`, items);
    return response.data;
  } catch (error) {
    handleError(error, 'atualizar inventário');
    throw error;
  }
};

export const getPharmacyWaitlist = async (statusFilter = null) => {
  try {
    const params = statusFilter ? { status: statusFilter } : {};
    const response = await api.get('/pharmacy/waitlist', { params });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar lista de espera');
    throw error;
  }
};

export const updatePharmacyWaitlistEntry = async (entryId, data) => {
  try {
    const response = await api.put(`/pharmacy/waitlist/${entryId}`, data);
    return response.data;
  } catch (error) {
    handleError(error, 'atualizar entrada da lista de espera');
    throw error;
  }
};

export const getChainMetrics = async (chainId) => {
  try {
    const response = await api.get(`/pharmacy/chains/${chainId}/metrics`);
    return response.data;
  } catch (error) {
    handleError(error, 'buscar métricas da rede');
    throw error;
  }
};

// --- Pharmacy Waitlist ---

export const submitPharmacyWaitlist = async (waitlistData) => {
  try {
    const response = await axios.post(`${API_URL.replace('/api', '')}/api/pharmacy/waitlist`, waitlistData, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'enviar formulário de interesse');
  }
};

// =============================================================================
// PROFILE UPDATE REQUESTS
// =============================================================================

export const createProfileUpdateRequest = async (requestData) => {
  try {
    const response = await api.post('/profile-updates/', requestData);
    return response.data;
  } catch (error) {
    handleError(error, 'criar solicitação de atualização');
    throw error;
  }
};

export const uploadProfileUpdateDocument = async (requestId, file, onProgress = null) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/profile-updates/${requestId}/upload-document`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress ? (e) => onProgress(Math.round((e.loaded * 100) / e.total)) : undefined,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'enviar documento');
    throw error;
  }
};

export const getMyProfileUpdateRequests = async () => {
  try {
    const response = await api.get('/profile-updates/my-requests');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar solicitações');
    throw error;
  }
};

export const cancelProfileUpdateRequest = async (requestId) => {
  try {
    await api.delete(`/profile-updates/${requestId}`);
    return true;
  } catch (error) {
    handleError(error, 'cancelar solicitação');
    throw error;
  }
};

// Admin endpoints
export const getPendingProfileUpdateRequests = async () => {
  try {
    const response = await api.get('/profile-updates/admin/pending');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar solicitações pendentes');
    throw error;
  }
};

export const getStorageInfo = async () => {
  try {
    const response = await api.get('/user/storage');
    return response.data;
  } catch (error) {
    handleError(error, 'buscar informações de armazenamento');
    throw error;
  }
};

export const getAllProfileUpdateRequests = async (statusFilter = null) => {
  try {
    const params = statusFilter ? { status_filter: statusFilter } : {};
    const response = await api.get('/profile-updates/admin/all', { params });
    return response.data;
  } catch (error) {
    handleError(error, 'buscar solicitações');
    throw error;
  }
};

export const reviewProfileUpdateRequest = async (requestId, action, adminNotes = null) => {
  try {
    const response = await api.post(`/profile-updates/admin/${requestId}/review`, {
      action,
      admin_notes: adminNotes,
    });
    return response.data;
  } catch (error) {
    handleError(error, 'processar solicitação');
    throw error;
  }
};
