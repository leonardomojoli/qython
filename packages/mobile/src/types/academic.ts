// Types and constants for the Academic module

export interface Library {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  document_count: number;
  processing_count?: number;
  created_at: string;
  updated_at: string;
}

export interface LibraryDocument {
  id: number;
  library_id: number;
  original_filename: string;
  storage_path: string | null;
  thumbnail_filename: string | null;
  status: DocumentStatus;
  created_at: string;
}

export type DocumentStatus = 'pending' | 'processing' | 'processed' | 'error';

export interface ArenaExam {
  exam_code: string;
  title_key: string;
  description_key: string;
  country: string;
  flag: string;
  language: string;
}

export interface QuizQuestion {
  pergunta: string;
  alternativas: string[];
  resposta_correta?: number;
  explicacao?: string;
  dificuldade?: 'facil' | 'medio' | 'dificil';
  topico?: string;
  bloco?: string;
}

export interface XpBreakdown {
  quiz_base: number;
  difficulty_bonus: number;
  accuracy_bonus: number;
  streak_bonus: number;
  speed_bonus: number;
  challenge_bonus: number;
  total: number;
}

export interface AnswerDetail {
  question_text: string;
  alternatives: string[];
  user_answer: number | null;
  correct_answer: number;
  is_correct: boolean;
  difficulty: 'facil' | 'medio' | 'dificil';
  topic?: string;
  explanation?: string;
}

export interface QuizResult {
  score: number;
  total: number;
  correct: number;
  time_elapsed?: number;
  xp_earned?: number;
  xp_breakdown?: XpBreakdown;
  correct_count?: number;
  incorrect_count?: number;
  unanswered_count?: number;
  total_questions?: number;
  accuracy_pct?: number;
  answers_detail?: AnswerDetail[];
  streak?: {
    current: number;
    longest: number;
    is_new_record: boolean;
  };
  league?: {
    tier: string;
    icon: string;
    display: string;
    season_xp: number;
    next_tier?: string;
    next_tier_icon?: string;
    next_tier_min_xp?: number;
    xp_to_next?: number;
  };
  ranking_update?: {
    rank_position: number;
    percentile: number;
    total_xp: number;
  };
}

export interface RankingEntry {
  rank: number;
  name: string;
  xp: number;
  quizzes_completed?: number;
  isRealUser?: boolean;
  league_tier?: string;
  league_icon?: string;
}

export type LeagueTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'champion';

export interface XpProfile {
  total_xp: number;
  season_xp: number;
  current_streak: number;
  longest_streak: number;
  league_tier: LeagueTier;
  next_tier?: LeagueTier;
  next_tier_min_xp?: number;
  xp_to_next?: number;
}

export interface Season {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  days_remaining?: number;
  days_until_start?: number;
}

export interface ChatMessage {
  sender: 'user' | 'bot';
  content: string;
}

export interface JobStatus {
  id: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error_message?: string;
  result_content?: {
    questionario_objetivo?: QuizQuestion[];
  };
  exam?: string;
}

export interface LibraryMaterial {
  id: number;
  material_type: string;
  title?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  created_at: string;
  result?: any;
}

export const MATERIAL_TYPE_CONFIG: Record<string, { icon: string; labelKey: string; descriptionKey: string }> = {
  transcription: { icon: '📝', labelKey: 'transcription', descriptionKey: 'transcriptionDescription' },
  summary: { icon: '📋', labelKey: 'summary', descriptionKey: 'summaryDescription' },
  detailed_text: { icon: '📖', labelKey: 'completeDocumentLesson', descriptionKey: 'completeDocumentLessonDescription' },
  flashcards: { icon: '🗂️', labelKey: 'flashcards', descriptionKey: 'flashcardsDescription' },
  mind_map: { icon: '🧠', labelKey: 'mindMap', descriptionKey: 'mindMapDescription' },
  questionnaire_objective: { icon: '✅', labelKey: 'objectiveQuestionnaire', descriptionKey: 'objectiveQuestionnaireDescription' },
  questionnaire_subjective: { icon: '✍️', labelKey: 'subjectiveQuestionnaire', descriptionKey: 'subjectiveQuestionnaireDescription' },
  comparative_table: { icon: '📊', labelKey: 'comparativeTable', descriptionKey: 'comparativeTableDescription' },
  clinical_case: { icon: '🩺', labelKey: 'clinicalCase', descriptionKey: 'clinicalCaseDescription' },
  critical_appraisal: { icon: '🔬', labelKey: 'criticalAppraisal', descriptionKey: 'criticalAppraisalDescription' },
  podcast: { icon: '🎙️', labelKey: 'podcast', descriptionKey: 'podcastDescription' },
  slideshow_only: { icon: '📊', labelKey: 'slideshow', descriptionKey: 'slideshowDescription' },
  video_lesson: { icon: '🎬', labelKey: 'videoLesson', descriptionKey: 'videoLessonDescription' },
  quiz: { icon: '❓', labelKey: 'quiz', descriptionKey: 'quizDescription' },
};

export const ARENA_ALLOWED_PLANS = ['resident', 'staff', 'specialist'];

// Mapa nome-de-ícone-FontAwesome → emoji. O web renderiza o glyph FA nativo; o mobile usa o
// emoji equivalente. O valor `icon` gravado é o mesmo nos dois (nome FA ou emoji cru) → paridade
// de dados. Cobre todos os nomes em FA_ICON_OPTIONS para o card nunca cair no fallback.
export const LIBRARY_ICONS: Record<string, string> = {
  'heart-pulse': '❤️',
  'brain': '🧠',
  'lungs': '🫁',
  'bone': '🦴',
  'virus': '🦠',
  'pills': '💊',
  'stethoscope': '🩺',
  'user-doctor': '👨‍⚕️',
  'notes-medical': '📋',
  'file-prescription': '📝',
  'x-ray': '🩻',
  'microscope': '🔬',
  'syringe': '💉',
  'dna': '🧬',
  'baby': '👶',
  'person-breastfeeding': '🤱',
  'eye': '👁️',
  'tooth': '🦷',
  'ear-listen': '👂',
  'person-running': '🏃',
  'star-of-life': '✳️',
  'file-medical': '🗂️',
  'crutch': '🩼',
  'book-medical': '📖',
  'shield-heart': '🛡️',
  'book': '📚',
};

// Ordem curada dos ícones para o picker (espelha FA_ICON_OPTIONS do web). O valor gravado é o
// nome FA — o web mostra o glyph nítido, o mobile mostra o emoji equivalente de LIBRARY_ICONS.
export const FA_ICON_OPTIONS: string[] = [
  'book-medical', 'shield-heart', 'stethoscope', 'heart-pulse', 'brain', 'lungs', 'bone', 'virus', 'pills',
  'user-doctor', 'notes-medical', 'file-prescription', 'x-ray', 'microscope', 'syringe', 'dna',
  'baby', 'person-breastfeeding', 'eye', 'tooth', 'ear-listen', 'person-running', 'star-of-life',
  'file-medical', 'crutch', 'book',
];

// Emojis (gravados como o próprio emoji). Espelha EMOJI_OPTIONS do web — médica E geral
// (concursos cobrem todas as áreas). Inclui todo emoji que o backend pode auto-escolher.
export const EMOJI_OPTIONS: string[] = [
  // Estudo / educação
  '📚', '📖', '📝', '✏️', '🎓', '🏫', '📋', '🔖', '🗂️',
  // Saúde / medicina / anatomia
  '🩺', '🫀', '🧠', '🫁', '🦴', '🦠', '💊', '💉', '🧬', '🔬', '🩻', '🩸', '🌡️', '🩹', '🩼',
  '🧴', '🧫', '🚑', '🏥', '⚕️', '❤️', '👶', '🤰', '👁️', '🦷', '👂', '🏃', '🥗',
  // Ciência
  '🧪', '⚗️', '⚛️', '🔭', '🧲', '🌍',
  // Tecnologia
  '💻', '🖥️', '📱', '⌨️', '🔌', '🔋', '🛰️', '🤖', '🌐',
  // Matemática / dados
  '🧮', '🔢', '📊', '📈',
  // Humanas / direito / geografia
  '⚖️', '🏛️', '📜', '🗺️', '🧭',
  // Línguas / artes
  '🔤', '🗣️', '🎨', '🎭', '📰',
  // Economia
  '💰', '🏦',
  // Engenharia / ferramentas
  '🛠️', '🔧', '⚙️', '🏗️',
  // Natureza / agro
  '🌱', '🌿', '🐾', '🐶',
  // Gerais
  '💡', '🎯', '🏆',
];

// True se `value` é um nome de ícone FA conhecido (senão tratamos como emoji/texto livre).
export function isFaIconName(value?: string | null): boolean {
  return !!value && Object.prototype.hasOwnProperty.call(LIBRARY_ICONS, value);
}

// Emoji a renderizar p/ um valor `icon`: FA→emoji equivalente, emoji→ele mesmo, vazio→livro.
export function resolveLibraryIcon(value?: string | null): string {
  if (!value) return LIBRARY_ICONS.book;
  if (isFaIconName(value)) return LIBRARY_ICONS[value];
  return value;
}

// Remove alfanuméricos/espaços do input de emoji custom — impede que o ícone vire rótulo de
// texto. Mantém emoji, símbolos, ZWJ e seletores de variação. Espelha sanitizeIconEmoji do web.
export function sanitizeEmoji(value: string): string {
  return (value || '').replace(/[A-Za-z0-9\s]/g, '');
}

export const DOCUMENT_STATUS_CONFIG: Record<DocumentStatus, { labelKey: string; color: string }> = {
  pending: { labelKey: 'statusPending', color: '#f1c40f' },
  processing: { labelKey: 'statusProcessing', color: '#3498db' },
  processed: { labelKey: 'processed', color: '#27ae60' },
  error: { labelKey: 'statusError', color: '#e74c3c' },
};
