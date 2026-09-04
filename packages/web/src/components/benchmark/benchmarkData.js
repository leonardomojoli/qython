// Static benchmark study definition.
// Numbers are intentionally absent — results land here only after the real
// evaluation runs and the methodology paper is finalized (TCC publication).

export const STUDY_STATUS = {
  phase: 'data-collection',
  startedAt: '2026-06-01',
  expectedPublication: '2026-09-30',
  casesEvaluated: 0,
  casesTarget: 2400,
};

// Snapshot atualizado em 2026-05-26 (releases até o I/O 2026 + DeepSeek V4).
// Quando Gemini 3.5 Pro (Jun/2026) e novos releases saírem, atualizar aqui antes da publicação.
export const MODELS = [
  { id: 'qython-1', label: 'Qython 1', tagline: 'Modelo proprietário Qython', vendor: 'Qython', featured: true },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', tagline: 'Anthropic flagship', vendor: 'Anthropic' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tagline: 'Anthropic balanced', vendor: 'Anthropic' },
  { id: 'gpt-5-5', label: 'GPT-5.5', tagline: 'OpenAI flagship (mar/2026)', vendor: 'OpenAI' },
  { id: 'gemini-3-5-flash', label: 'Gemini 3.5 Flash', tagline: 'Google rápido (I/O 2026)', vendor: 'Google' },
  { id: 'llama-4-maverick', label: 'Llama 4 Maverick', tagline: 'Meta open-weight multimodal', vendor: 'Meta' },
  { id: 'deepseek-v4', label: 'DeepSeek V4', tagline: 'Long-context (abr/2026)', vendor: 'DeepSeek' },
];

export const CATEGORIES = [
  { id: 'radiologia', label: 'Radiologia', shortLabel: 'Radio', icon: 'imaging', description: 'Interpretação de RX, TC, RM e laudos estruturados.', multimodal: true },
  { id: 'emergencia', label: 'Emergência', shortLabel: 'PS', icon: 'urgent', description: 'Triagem, ACLS/ATLS, decisões time-sensitive em pronto-socorro.' },
  { id: 'cardiologia', label: 'Cardiologia', shortLabel: 'Cardio', icon: 'heart', description: 'ECG, dor torácica, IAM, arritmias, insuficiência cardíaca.' },
  { id: 'clinica-medica', label: 'Clínica Médica', shortLabel: 'CM', icon: 'stethoscope', description: 'Anamnese, diagnóstico diferencial em adulto e manejo de comorbidades.' },
  { id: 'gineco-obstetricia', label: 'Ginecologia e Obstetrícia', shortLabel: 'G&O', icon: 'gyno', description: 'Pré-natal, intercorrências obstétricas, ginecologia ambulatorial.' },
  { id: 'mfc', label: 'Medicina de Família', shortLabel: 'MFC', icon: 'community', description: 'Atenção primária, prevenção, manejo longitudinal e abordagem familiar.' },
  { id: 'cirurgia', label: 'Cirurgia Geral', shortLabel: 'Cir', icon: 'surgery', description: 'Abdome agudo, indicações cirúrgicas, pós-operatório.' },
  { id: 'pediatria', label: 'Pediatria', shortLabel: 'Ped', icon: 'pediatric', description: 'Puericultura, intercorrências pediátricas, esquema vacinal.' },
];

export const METRICS = [
  { id: 'accuracy', label: 'Acurácia diagnóstica', unit: '%', higherIsBetter: true, description: '% de respostas alinhadas com o gabarito ou consenso de especialistas.' },
  { id: 'reasoning', label: 'Qualidade do raciocínio clínico', unit: '/5', higherIsBetter: true, description: 'Rubrica 0-5 sobre estrutura da hipótese, diferenciais considerados e conduta.' },
  { id: 'safety', label: 'Taxa de erro grave', unit: '%', higherIsBetter: false, description: '% de respostas com risco clínico significativo (medicação errada, miss de red flag).' },
  { id: 'calibration', label: 'Calibração (Brier score)', unit: '', higherIsBetter: false, description: 'Concordância entre confiança expressa e acerto real (0 = perfeito, 1 = pior).' },
  { id: 'latency', label: 'Latência mediana', unit: 's', higherIsBetter: false, description: 'Tempo entre pergunta e resposta completa.' },
  { id: 'cost', label: 'Custo médio por consulta', unit: 'USD', higherIsBetter: false, description: 'Custo total de tokens (entrada + saída) por caso clínico.' },
];

export const DATASETS = [
  {
    id: 'medqa',
    label: 'MedQA (USMLE)',
    description: 'Cerca de 12 mil questões estilo USMLE (Steps 1, 2, 3), padrão ouro em literatura de IA médica.',
    coverage: 'EN',
    license: 'Aberto (uso acadêmico)',
    url: 'https://github.com/jind11/MedQA',
  },
  {
    id: 'revalida-br',
    label: 'Revalida + Residência BR',
    description: 'Questões públicas do Revalida e provas de residência brasileiras (USP, UNIFESP, ENARE).',
    coverage: 'PT-BR',
    license: 'Domínio público (provas oficiais)',
  },
  {
    id: 'nejm-healer',
    label: 'NEJM Healer-style casos',
    description: 'Casos clínicos abertos curados por especialistas, avaliados por rubrica multidimensional.',
    coverage: 'EN + PT-BR (tradução curada)',
    license: 'Curadoria própria com consentimento',
  },
  {
    id: 'rsna-mimic',
    label: 'RSNA / MIMIC-CXR',
    description: 'Imagens radiológicas reais com laudo ground-truth para avaliação multimodal.',
    coverage: 'EN',
    license: 'RSNA + PhysioNet (credenciamento)',
    url: 'https://physionet.org/content/mimic-cxr/',
  },
];

export const TIMELINE = [
  { phase: 'Protocolo + comitê de ética', period: 'Maio 2026', status: 'done' },
  { phase: 'Curadoria de casos + datasets', period: 'Junho 2026', status: 'in-progress' },
  { phase: 'Coleta de respostas dos modelos', period: 'Julho-Agosto 2026', status: 'pending' },
  { phase: 'Avaliação por especialistas (rubrica)', period: 'Agosto-Setembro 2026', status: 'pending' },
  { phase: 'Análise estatística + publicação', period: 'Setembro 2026', status: 'pending' },
];
