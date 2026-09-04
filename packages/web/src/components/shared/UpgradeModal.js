// frontend/src/components/shared/UpgradeModal.js

import React from 'react';
import ReactDOM from 'react-dom';
import styles from './UpgradeModal.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCrown,
  faStar,
  faCheck,
  faTimes,
  faRocket,
  faBrain,
  faPalette
} from '@fortawesome/free-solid-svg-icons';

/**
 * UpgradeModal - Premium upgrade invitation modal
 *
 * @param {boolean} isOpen - Controls visibility
 * @param {function} onClose - Called when cancel/close
 * @param {function} onUpgrade - Called when user clicks upgrade
 * @param {string} feature - The feature that triggered the upgrade (e.g., 'image_analysis')
 * @param {string} message - Custom message to display
 */
const UpgradeModal = ({
  isOpen,
  onClose,
  onUpgrade,
  feature = 'premium',
  message,
}) => {
  const { t } = useTranslation();

  if (!isOpen) {
    return null;
  }

  // Feature-specific configurations
  const featureConfig = {
    premium: {
      icon: faCrown,
      badge: t('premiumFeature', 'Recurso Premium'),
      title: t('upgradeToPremium', 'Faca Upgrade para Premium'),
      benefits: [
        t('unlimitedConsultations', 'Consultas ilimitadas'),
        t('advancedAI', 'IA avancada com raciocinio clinico'),
        t('prioritySupport', 'Suporte prioritario'),
      ]
    },
    clinical_reasoning: {
      icon: faBrain,
      badge: t('clinicalReasoning', 'Raciocinio Clinico'),
      title: t('unlockClinicalReasoning', 'Desbloqueie o Raciocinio Clinico'),
      benefits: [
        t('deepAnalysis', 'Analise aprofundada de casos'),
        t('stepByStepReasoning', 'Raciocinio passo a passo'),
        t('evidenceBased', 'Recomendacoes baseadas em evidencias'),
      ]
    },
    premium_content: {
      icon: faRocket,
      badge: t('premiumContent', 'Conteudo Premium'),
      title: t('unlockPremiumContent', 'Desbloqueie Conteudos Premium'),
      benefits: [
        t('aiMindMaps', 'Mapas Mentais com geracao de imagem por IA'),
        t('aiPodcasts', 'Podcasts educacionais com vozes sintetizadas'),
        t('aiVideoLessons', 'Videoaulas automaticas com narracao'),
      ]
    },
    avatar_history: {
      icon: faPalette,
      badge: t('avatarStorage', 'Galeria de Avatares'),
      title: t('expandAvatarGallery', 'Expanda sua Galeria de Avatares'),
      benefits: [
        t('moreAvatarSlots', 'Ate 50 avatares salvos no historico'),
        t('unlimitedGeneration', 'Mais opcoes de personalizacao'),
        t('priorityGeneration', 'Acesso a recursos clinicos avancados'),
      ]
    }
  };

  const config = featureConfig[feature] || featureConfig.premium;

  return ReactDOM.createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faTimes} />
        </button>

        {/* Icon */}
        <div className={styles.iconContainer}>
          <FontAwesomeIcon icon={config.icon} />
        </div>

        {/* Feature Badge */}
        <div className={styles.featureBadge}>
          <FontAwesomeIcon icon={faStar} />
          {config.badge}
        </div>

        {/* Title */}
        <h3 className={styles.title}>{config.title}</h3>

        {/* Message */}
        <p className={styles.message}>
          {message || t('upgradeModalDefaultMessage', 'Faca upgrade do seu plano para acessar recursos avancados e potencializar seu atendimento.')}
        </p>

        {/* Benefits */}
        <div className={styles.benefits}>
          {config.benefits.map((benefit, index) => (
            <div key={index} className={styles.benefitItem}>
              <FontAwesomeIcon icon={faCheck} />
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div className={styles.buttonGroup}>
          <button
            onClick={onUpgrade}
            className={`${styles.button} ${styles.upgradeButton}`}
          >
            <FontAwesomeIcon icon={faRocket} style={{ marginRight: '8px' }} />
            {t('viewPlans', 'Ver Planos')}
          </button>
          <button
            onClick={onClose}
            className={`${styles.button} ${styles.cancelButton}`}
          >
            {t('later', 'Depois')}
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-portal')
  );
};

export default UpgradeModal;
