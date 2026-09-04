import type { TourStep } from '../components/common/QythonTour';

/**
 * Tour step configurations for each module.
 * targetRef is null for modal-only steps (no highlight).
 * The component using these must provide refs for highlighted elements.
 */

export const COPILOT_TOUR_STEPS: Omit<TourStep, 'targetRef'>[] = [
  {
    id: 'copilot_welcome',
    titleKey: 'tour.copilot.welcomeTitle',
    titleDefault: 'Copiloto Clinico',
    descKey: 'tour.copilot.welcomeDesc',
    descDefault: 'Seu assistente de IA medica. Pergunte sobre diagnosticos, condutas, protocolos e mais.',
    position: 'center',
  },
  {
    id: 'copilot_input',
    titleKey: 'tour.copilot.inputTitle',
    titleDefault: 'Enviar Mensagem',
    descKey: 'tour.copilot.inputDesc',
    descDefault: 'Digite sua pergunta clinica aqui. Voce pode anexar imagens e documentos.',
    position: 'top',
  },
  {
    id: 'copilot_library',
    titleKey: 'tour.copilot.libraryTitle',
    titleDefault: 'Biblioteca RAG',
    descKey: 'tour.copilot.libraryDesc',
    descDefault: 'Selecione uma biblioteca para respostas baseadas nos seus materiais.',
    position: 'bottom',
  },
  {
    id: 'copilot_sessions',
    titleKey: 'tour.copilot.sessionsTitle',
    titleDefault: 'Sessoes',
    descKey: 'tour.copilot.sessionsDesc',
    descDefault: 'Acesse conversas anteriores. Pressione e segure para renomear ou excluir.',
    position: 'bottom',
  },
];

export const CONSULTATION_TOUR_STEPS: Omit<TourStep, 'targetRef'>[] = [
  {
    id: 'consultation_welcome',
    titleKey: 'tour.consultation.welcomeTitle',
    titleDefault: 'Consultas',
    descKey: 'tour.consultation.welcomeDesc',
    descDefault: 'Documente consultas com assistencia de IA. Selecione a especialidade para comecar.',
    position: 'center',
  },
  {
    id: 'consultation_notes',
    titleKey: 'tour.consultation.notesTitle',
    titleDefault: 'Notas Clinicas',
    descKey: 'tour.consultation.notesDesc',
    descDefault: 'Escreva ou dite suas anotacoes. Use o microfone para transcricao por voz.',
    position: 'top',
  },
  {
    id: 'consultation_improve',
    titleKey: 'tour.consultation.improveTitle',
    titleDefault: 'Aprimorar com IA',
    descKey: 'tour.consultation.improveDesc',
    descDefault: 'A IA reestrutura suas notas em formato clinico profissional. Use desfazer/refazer para controlar.',
    position: 'top',
  },
];

export const ACADEMIC_TOUR_STEPS: Omit<TourStep, 'targetRef'>[] = [
  {
    id: 'academic_welcome',
    titleKey: 'tour.academic.welcomeTitle',
    titleDefault: 'Centro Academico',
    descKey: 'tour.academic.welcomeDesc',
    descDefault: 'Crie bibliotecas, gere materiais de estudo, e compete na Arena.',
    position: 'center',
  },
  {
    id: 'academic_libraries',
    titleKey: 'tour.academic.librariesTitle',
    titleDefault: 'Bibliotecas',
    descKey: 'tour.academic.librariesDesc',
    descDefault: 'Faca upload de PDFs e gere flashcards, resumos, mapas mentais e mais.',
    position: 'bottom',
  },
  {
    id: 'academic_arena',
    titleKey: 'tour.academic.arenaTitle',
    titleDefault: 'Arena',
    descKey: 'tour.academic.arenaDesc',
    descDefault: 'Compete em rankings nacionais e desafie colegas em duelos.',
    position: 'bottom',
  },
];

export const PHARMACY_TOUR_STEPS: Omit<TourStep, 'targetRef'>[] = [
  {
    id: 'pharmacy_welcome',
    titleKey: 'tour.pharmacy.welcomeTitle',
    titleDefault: 'Farmacia',
    descKey: 'tour.pharmacy.welcomeDesc',
    descDefault: 'Pesquise medicamentos, crie receitas e envie para farmacias.',
    position: 'center',
  },
  {
    id: 'pharmacy_search',
    titleKey: 'tour.pharmacy.searchTitle',
    titleDefault: 'Busca Inteligente',
    descKey: 'tour.pharmacy.searchDesc',
    descDefault: 'Pesquise por nome comercial, principio ativo ou classe terapeutica.',
    position: 'bottom',
  },
];

export const PROFILE_TOUR_STEPS: Omit<TourStep, 'targetRef'>[] = [
  {
    id: 'profile_welcome',
    titleKey: 'tour.profile.welcomeTitle',
    titleDefault: 'Seu Perfil',
    descKey: 'tour.profile.welcomeDesc',
    descDefault: 'Gerencie seus dados, acompanhe estatisticas e conquistas.',
    position: 'center',
  },
  {
    id: 'profile_avatar',
    titleKey: 'tour.profile.avatarTitle',
    titleDefault: 'Avatar',
    descKey: 'tour.profile.avatarDesc',
    descDefault: 'Toque no avatar para gerar uma foto de perfil unica com IA.',
    position: 'bottom',
  },
  {
    id: 'profile_stats',
    titleKey: 'tour.profile.statsTitle',
    titleDefault: 'Estatisticas',
    descKey: 'tour.profile.statsDesc',
    descDefault: 'Acompanhe seu progresso em consultas, quizzes e conquistas.',
    position: 'bottom',
  },
];
