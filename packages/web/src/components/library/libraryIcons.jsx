// Ícones/emoji da biblioteca — compartilhado entre o picker e a renderização.
// O campo `icon` (String(50)) guarda OU um nome de ícone Font Awesome ('heart-pulse')
// OU um emoji ('🫀'). O backend aplica uma heurística local quando o usuário não escolhe.
import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBook, faHeartPulse, faBrain, faLungs, faBone, faVirus, faPills, faStethoscope,
  faUserDoctor, faNotesMedical, faXRay, faMicroscope, faSyringe, faDna, faBaby,
  faPersonBreastfeeding, faCrutch, faEye, faTooth, faEarListen, faPersonRunning,
  faBookMedical, faStarOfLife, faFileMedical, faFilePrescription, faShieldHeart,
} from '@fortawesome/free-solid-svg-icons';

export const iconMap = {
  'heart-pulse': faHeartPulse,
  'brain': faBrain,
  'lungs': faLungs,
  'bone': faBone,
  'virus': faVirus,
  'pills': faPills,
  'stethoscope': faStethoscope,
  'user-doctor': faUserDoctor,
  'notes-medical': faNotesMedical,
  'x-ray': faXRay,
  'microscope': faMicroscope,
  'syringe': faSyringe,
  'dna': faDna,
  'baby': faBaby,
  'person-breastfeeding': faPersonBreastfeeding,
  'crutch': faCrutch,
  'eye': faEye,
  'tooth': faTooth,
  'ear-listen': faEarListen,
  'person-running': faPersonRunning,
  'book-medical': faBookMedical,
  'star-of-life': faStarOfLife,
  'file-medical': faFileMedical,
  'file-prescription': faFilePrescription,
  'shield-heart': faShieldHeart,
  'book': faBook,
};

// Ordem curada dos ícones FA para o picker.
export const FA_ICON_OPTIONS = [
  'book-medical', 'shield-heart', 'stethoscope', 'heart-pulse', 'brain', 'lungs', 'bone', 'virus', 'pills',
  'user-doctor', 'notes-medical', 'file-prescription', 'x-ray', 'microscope', 'syringe', 'dna',
  'baby', 'person-breastfeeding', 'eye', 'tooth', 'ear-listen', 'person-running', 'star-of-life',
  'file-medical', 'crutch', 'book',
];

// Emojis para biblioteca — médica E geral (concursos cobrem todas as áreas). Organizados por
// tema; a grade do picker rola. Todo emoji que `suggest_icon_for_topic` (backend) pode devolver
// está aqui, p/ o picker marcá-lo como selecionado.
export const EMOJI_OPTIONS = [
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

// True se o valor é um nome de ícone FA conhecido (senão tratamos como emoji/texto).
export const isFaIcon = (value) => !!value && Object.prototype.hasOwnProperty.call(iconMap, value);

// Remove alfanuméricos/espaços do input de emoji custom — impede que o ícone vire rótulo de texto.
export const sanitizeIconEmoji = (value) => (value || '').replace(/[A-Za-z0-9\s]/g, '');

// Renderiza o ícone da biblioteca: FA se for nome conhecido, senão o emoji como texto.
// Recebe a mesma `className` do ícone (que define font-size) — emojis e FA ficam do mesmo tamanho.
export const LibraryIcon = ({ value, className }) => {
  if (isFaIcon(value)) {
    return <FontAwesomeIcon icon={iconMap[value]} className={className} />;
  }
  if (value) {
    return (
      <span className={className} role="img" aria-label="ícone da biblioteca">
        {value}
      </span>
    );
  }
  return <FontAwesomeIcon icon={iconMap.book} className={className} />;
};
