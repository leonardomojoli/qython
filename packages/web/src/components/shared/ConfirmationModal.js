import React from 'react';
import ReactDOM from 'react-dom';
import styles from './ConfirmationModal.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTrash,
  faExclamationTriangle,
  faInfoCircle,
  faCheckCircle,
  faQuestion
} from '@fortawesome/free-solid-svg-icons';

/**
 * ConfirmationModal - Premium confirmation dialog
 * 
 * @param {boolean} isOpen - Controls visibility
 * @param {function} onClose - Called when cancel/close
 * @param {function} onConfirm - Called when confirmed
 * @param {string} title - Modal title
 * @param {string} message - Modal message/description
 * @param {string} confirmButtonText - Text for confirm button
 * @param {string} cancelButtonText - Text for cancel button
 * @param {string} variant - 'danger' | 'warning' | 'info' | 'success' (default: 'danger')
 * @param {string} icon - 'trash' | 'warning' | 'info' | 'success' | 'question' (auto-selected based on variant)
 */
const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmButtonText,
  cancelButtonText,
  variant = 'danger',
  icon,
}) => {
  const { t } = useTranslation();

  if (!isOpen) {
    return null;
  }

  // Auto-select icon based on variant if not provided
  const getIcon = () => {
    if (icon) {
      const iconMap = {
        trash: faTrash,
        warning: faExclamationTriangle,
        info: faInfoCircle,
        success: faCheckCircle,
        question: faQuestion,
      };
      return iconMap[icon] || faExclamationTriangle;
    }
    // Default icons per variant
    const variantIcons = {
      danger: faTrash,
      warning: faExclamationTriangle,
      info: faInfoCircle,
      success: faCheckCircle,
    };
    return variantIcons[variant] || faExclamationTriangle;
  };

  const getIconClass = () => {
    const classMap = {
      danger: styles.iconDanger,
      warning: styles.iconWarning,
      info: styles.iconInfo,
      success: styles.iconSuccess,
    };
    return classMap[variant] || styles.iconDanger;
  };

  const getButtonClass = () => {
    return variant === 'danger' ? styles.danger : styles.primary;
  };

  return ReactDOM.createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Icon */}
        <div className={`${styles.iconContainer} ${getIconClass()}`}>
          <FontAwesomeIcon icon={getIcon()} />
        </div>

        {/* Title */}
        <h3>{title}</h3>

        {/* Message */}
        <p>{message}</p>

        {/* Buttons */}
        <div className={styles.buttonGroup}>
          <button
            onClick={onClose}
            className={`${styles.button} ${styles.cancelButton}`}
          >
            {cancelButtonText || t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={`${styles.button} ${styles.confirmButton} ${getButtonClass()}`}
          >
            {confirmButtonText || t('confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-portal')
  );
};

export default ConfirmationModal;