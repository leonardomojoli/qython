// frontend/src/components/shared/FeedbackModal.js

import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FaThumbsDown } from 'react-icons/fa';
import styles from './FeedbackModal.module.css';

const FeedbackModal = ({ isOpen, onClose, onSubmit }) => {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    // Comment is now optional - submit even if empty
    onSubmit(comment.trim(), false);
    setComment('');
  };

  const handleClose = () => {
    setComment('');
    onClose();
  };

  return ReactDOM.createPortal(
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Icon Container */}
        <div className={`${styles.iconContainer} ${styles.iconFeedback}`}>
          <FaThumbsDown />
        </div>

        {/* Title */}
        <h3>{t('feedbackDislikeTitle', 'O que podemos melhorar?')}</h3>

        {/* Subtitle */}
        <p className={styles.subtitle}>
          {t('feedbackDislikeSubtitle', 'Seu feedback nos ajuda a aprimorar o Qython')}
        </p>

        <form onSubmit={handleSubmit}>
          {/* Textarea with optional label */}
          <div className={styles.inputWrapper}>
            <textarea
              className={styles.textarea}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('feedbackDislikePlaceholder', 'Conte-nos o que não funcionou bem...')}
              rows={4}
            />
            <span className={styles.optionalLabel}>
              {t('feedbackOptional', 'opcional')}
            </span>
          </div>

          {/* Button Group */}
          <div className={styles.buttonGroup}>
            <button
              type="button"
              onClick={handleClose}
              className={`${styles.button} ${styles.cancelButton}`}
            >
              {t('cancel', 'Cancelar')}
            </button>
            <button
              type="submit"
              className={`${styles.button} ${styles.submitButton}`}
            >
              {t('sendFeedback', 'Enviar Feedback')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.getElementById('modal-portal')
  );
};

export default FeedbackModal;
