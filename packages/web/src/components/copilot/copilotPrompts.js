// Pílulas do copiloto (Qython 1 preview): abridores de prompt curados que pré-preenchem o
// input do chat. O `opener` NÃO é um spec pronto — é um abridor que faz o copiloto perguntar o
// resto (data da prova, caso clínico, etc.), virando um mini-fluxo guiado. As categorias
// substituem a necessidade de abas dedicadas (PS, centro cirúrgico, acadêmico...).
//
// v1: constante no front. v2 (futuro): servido por GET /api/copilot/suggested-prompts para
// curar sem deploy + A/B + sinal de flywheel (quais pílulas pegam).

export const COPILOT_PROMPTS = [
  {
    id: 'study-schedule',
    category: 'academico',
    icon: '📅',
    labelKey: 'pillStudySchedule',
    label: 'Montar cronograma de estudos',
    opener:
      'Quero montar um cronograma de estudos para a prova de residência. Me pergunte o que precisar — data da prova, horas disponíveis por dia e as matérias em que estou mais fraco — e monte um plano realista com revisão espaçada.',
  },
  {
    id: 'pcr',
    category: 'pronto_socorro',
    icon: '🫀',
    labelKey: 'pillPcr',
    label: 'Conduta na PCR',
    opener:
      'Me conduza passo a passo no atendimento de uma parada cardiorrespiratória (ACLS): ritmos chocáveis e não chocáveis, drogas, doses e o ciclo de RCP. Pergunte o cenário se precisar.',
  },
  {
    id: 'sepsis',
    category: 'pronto_socorro',
    icon: '🦠',
    labelKey: 'pillSepsis',
    label: 'Manejo da sepse no PS',
    opener:
      'Me ajude com o manejo inicial da sepse e do choque séptico no pronto-socorro: identificação, pacote da primeira hora, antibiótico empírico e ressuscitação volêmica. Pergunte o caso se precisar.',
  },
  {
    id: 'preop',
    category: 'cirurgico',
    icon: '🩺',
    labelKey: 'pillPreop',
    label: 'Checklist pré-operatório',
    opener:
      'Monte comigo a avaliação pré-operatória do paciente. Pergunte idade, comorbidades e o porte da cirurgia para estratificar o risco cardiovascular e definir a propedêutica.',
  },
  {
    id: 'ecg',
    category: 'clinica',
    icon: '📈',
    labelKey: 'pillEcg',
    label: 'Interpretar um ECG',
    opener:
      'Vou te descrever (ou anexar) um ECG. Me guie numa leitura sistemática — ritmo, frequência, eixo, intervalos e alterações — e me diga as hipóteses diagnósticas.',
  },
  {
    id: 'differential',
    category: 'clinica',
    icon: '🩻',
    labelKey: 'pillDdx',
    label: 'Diagnóstico diferencial',
    opener:
      'Vou te dar um quadro clínico e quero construir o diagnóstico diferencial. Pergunte os dados que faltarem e me ajude a priorizar as hipóteses por probabilidade e gravidade.',
  },
  {
    id: 'drug-dose',
    category: 'clinica',
    icon: '💊',
    labelKey: 'pillDrugDose',
    label: 'Dose e ajuste de fármaco',
    opener:
      'Preciso da dose de um fármaco com ajuste para o paciente (função renal/hepática, peso, idade). Me diga qual é a droga e o contexto e me ajude com a posologia.',
  },
  {
    id: 'library',
    category: 'biblioteca',
    icon: '📚',
    labelKey: 'pillLibrary',
    label: 'Me testar pela minha biblioteca',
    opener:
      'Quero estudar o conteúdo da minha biblioteca. Me faça perguntas sobre os materiais que subi, uma de cada vez, para testar e fixar meu conhecimento.',
  },
  {
    id: 'discussao',
    category: 'clinica',
    icon: '🧠',
    labelKey: 'pillDiscussion',
    label: 'Discussão clínica de caso',
    opener:
      'Quero discutir um caso clínico com você como uma conversa socrática: me faça perguntas, questione meu raciocínio e vamos construir o diagnóstico e a conduta juntos, passo a passo. Vou te apresentar o caso.',
  },
  {
    id: 'drug-interaction',
    category: 'clinica',
    icon: '⚠️',
    labelKey: 'pillDrugInteraction',
    label: 'Interação medicamentosa',
    opener:
      'Quero checar interações medicamentosas. Vou te listar os fármacos do paciente — me diga as interações relevantes, o mecanismo, a gravidade e a conduta (ajuste, monitorização ou substituição).',
  },
  {
    id: 'lab-results',
    category: 'clinica',
    icon: '🧪',
    labelKey: 'pillLabResults',
    label: 'Interpretar exames laboratoriais',
    opener:
      'Vou te passar resultados de exames laboratoriais. Me ajude a interpretá-los de forma sistemática, correlacionar com o quadro clínico e sugerir hipóteses e a próxima conduta. Pergunte o contexto se precisar.',
  },
  {
    id: 'clinical-score',
    category: 'clinica',
    icon: '🧮',
    labelKey: 'pillClinicalScore',
    label: 'Calcular escore clínico',
    opener:
      'Quero calcular e interpretar um escore clínico (ex.: CHA2DS2-VASc, Wells, CURB-65, qSOFA, Glasgow). Me diga qual escore e me pergunte os dados que faltarem para chegar no resultado e na conduta.',
  },
  {
    id: 'empiric-abx',
    category: 'pronto_socorro',
    icon: '💉',
    labelKey: 'pillEmpiricAbx',
    label: 'Antibiótico empírico',
    opener:
      'Me ajude a escolher o antibiótico empírico para uma infecção. Pergunte o foco infeccioso, a gravidade, o perfil do paciente e os fatores de risco para resistência, e sugira esquema, dose e tempo.',
  },
  {
    id: 'case-study',
    category: 'academico',
    icon: '🎯',
    labelKey: 'pillCaseStudy',
    label: 'Caso clínico para treinar',
    opener:
      'Crie um caso clínico para eu treinar raciocínio diagnóstico. Me apresente o caso por partes, me faça as perguntas de conduta uma de cada vez e dê feedback do meu raciocínio ao final. Pergunte a área/tema se precisar.',
  },
  {
    id: 'anamnesis',
    category: 'clinica',
    icon: '📋',
    labelKey: 'pillAnamnesis',
    label: 'Anamnese dirigida',
    opener:
      'Me ajude a conduzir uma anamnese dirigida para uma queixa. Me diga a queixa principal e eu te guio nas perguntas certas — sintomas associados, red flags e hipóteses — para fechar a história. Pergunte o que faltar.',
  },
];

// Amostra aleatória de N pílulas (o que "rotaciona" é o conteúdo, não a posição).
export function samplePrompts(n = 6) {
  return [...COPILOT_PROMPTS].sort(() => Math.random() - 0.5).slice(0, n);
}
