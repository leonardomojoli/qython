// Data for exam panels organized by specialty
// Ported from web/src/data/examPanels.js

import type { ExamItem, ExamPanel } from '../types/ambulatory';

export const EXAM_PANELS: Record<string, ExamPanel> = {
  laboratorial: {
    label: 'Laboratorial',
    exams: [
      { name: 'Hemograma Completo', code: 'HEMO' },
      { name: 'Glicemia de Jejum', code: 'GLIC' },
      { name: 'Hemoglobina Glicada (HbA1c)', code: 'HBA1C' },
      { name: 'Perfil Lipídico', code: 'LIPID' },
      { name: 'Colesterol Total', code: 'COLT' },
      { name: 'HDL', code: 'HDL' },
      { name: 'LDL', code: 'LDL' },
      { name: 'Triglicerídeos', code: 'TRIG' },
      { name: 'Creatinina', code: 'CREAT' },
      { name: 'Ureia', code: 'UREIA' },
      { name: 'TGO (AST)', code: 'TGO' },
      { name: 'TGP (ALT)', code: 'TGP' },
      { name: 'Ácido Úrico', code: 'ACURI' },
      { name: 'Urina Tipo 1', code: 'EAS' },
      { name: 'TSH', code: 'TSH' },
      { name: 'T4 Livre', code: 'T4L' },
      { name: 'Vitamina D', code: 'VITD' },
      { name: 'Vitamina B12', code: 'VITB12' },
      { name: 'Ferritina', code: 'FERR' },
      { name: 'Ferro Sérico', code: 'FERROS' },
      { name: 'PCR (Proteína C Reativa)', code: 'PCR' },
      { name: 'VHS', code: 'VHS' },
    ],
  },
  cardiology: {
    label: 'Cardiologia',
    exams: [
      { name: 'Eletrocardiograma (ECG)', code: 'ECG' },
      { name: 'Ecocardiograma', code: 'ECO' },
      { name: 'Holter 24h', code: 'HOLTER' },
      { name: 'MAPA', code: 'MAPA' },
      { name: 'Teste Ergométrico', code: 'ERGO' },
      { name: 'Cintilografia Miocárdica', code: 'CINTI' },
      { name: 'Angiotomografia Coronária', code: 'ANGIOTC' },
    ],
  },
  imaging: {
    label: 'Imagem',
    exams: [
      { name: 'Raio-X de Tórax', code: 'RXTX' },
      { name: 'Raio-X de Coluna', code: 'RXCOL' },
      { name: 'Ultrassom Abdominal', code: 'USABD' },
      { name: 'Ultrassom de Tireoide', code: 'USTIR' },
      { name: 'Ultrassom de Mamas', code: 'USMAM' },
      { name: 'Ultrassom Pélvico', code: 'USPEL' },
      { name: 'Tomografia de Crânio', code: 'TCCRAN' },
      { name: 'Tomografia de Tórax', code: 'TCTX' },
      { name: 'Tomografia de Abdome', code: 'TCABD' },
      { name: 'Ressonância Magnética de Crânio', code: 'RMCRAN' },
      { name: 'Ressonância Magnética de Coluna', code: 'RMCOL' },
      { name: 'Mamografia', code: 'MAMO' },
      { name: 'Densitometria Óssea', code: 'DENSO' },
    ],
  },
  endoscopy: {
    label: 'Endoscopia',
    exams: [
      { name: 'Endoscopia Digestiva Alta', code: 'EDA' },
      { name: 'Colonoscopia', code: 'COLO' },
      { name: 'Retossigmoidoscopia', code: 'RETO' },
    ],
  },
  neurology: {
    label: 'Neurologia',
    exams: [
      { name: 'Eletroencefalograma (EEG)', code: 'EEG' },
      { name: 'Eletromiografia (EMG)', code: 'EMG' },
      { name: 'Polissonografia', code: 'POLISS' },
    ],
  },
  pulmonology: {
    label: 'Pneumologia',
    exams: [
      { name: 'Espirometria', code: 'ESPIRO' },
      { name: 'Oximetria Noturna', code: 'OXIM' },
      { name: 'Broncoscopia', code: 'BRONCO' },
    ],
  },
  ophthalmology: {
    label: 'Oftalmologia',
    exams: [
      { name: 'Fundoscopia', code: 'FUNDO' },
      { name: 'Tonometria', code: 'TONO' },
      { name: 'Campimetria', code: 'CAMPO' },
      { name: 'OCT (Tomografia de Coerência Óptica)', code: 'OCT' },
    ],
  },
};
