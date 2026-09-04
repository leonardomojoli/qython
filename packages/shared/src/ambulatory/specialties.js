// @qython/shared - Especialidades médicas do ambulatório (FONTE ÚNICA web + mobile).
//
// JS puro de propósito: consumido por deep-path (`@qython/shared/src/ambulatory/specialties`)
// pelo web (Rollup) e pelo mobile (Metro) sem build step. Tipos no specialties.d.ts ao lado.
// Os nomes (PT canônico) também funcionam como chaves i18n — o app traduz `t(specialty)`.
// Mantida em ordem alfabética. Ao adicionar especialidade, adicione também os templates
// de anamnese (consultationTemplates) e subtemplates correspondentes + i18n do nome.

export const SPECIALTIES = [
  'Anestesiologia',
  'Cardiologia',
  'Cardiologia Pediátrica',
  'Cirurgia do Aparelho Digestivo',
  'Cirurgia Geral',
  'Cirurgia Plástica',
  'Cirurgia Vascular',
  'Clínica Médica',
  'Coloproctologia',
  'Dermatologia',
  'Endocrinologia e Metabologia',
  'Endoscopia',
  'Gastroenterologia',
  'Geriatria',
  'Ginecologia e Obstetrícia',
  'Hematologia e Hemoterapia',
  'Infectologia',
  'Mastologia',
  'Medicina da Família e Comunidade',
  'Medicina de Emergência',
  'Medicina Intensiva',
  'Nefrologia',
  'Neurocirurgia',
  'Neurologia',
  'Oftalmologia',
  'Oncologia Clínica',
  'Ortopedia e Traumatologia',
  'Otorrinolaringologia',
  'Pediatria',
  'Pneumologia',
  'Psiquiatria',
  'Reumatologia',
  'Urologia',
];
