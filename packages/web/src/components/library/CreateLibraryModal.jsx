// frontend/src/components/library/CreateLibraryModal.js
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { createLibrary } from '../../api';
import LibraryIconPicker from './LibraryIconPicker';
import { useNotification } from '../../contexts/NotificationContext';
import styles from './CreateLibraryModal.module.css';

const CreateLibraryModal = ({ isOpen, onClose, onLibraryCreated }) => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      addNotification(t('libraryNameCannotBeEmpty'), 'warning');
      return;
    }
    setIsCreating(true);
    try {
      await createLibrary({ name, description, icon });
      addNotification(t('libraryCreatedSuccess'), 'success');
      onLibraryCreated();
      handleClose();
    } catch (error) {
      addNotification(error.message || t('errorCreatingLibrary'), 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setIcon('');
    onClose();
  };

  return ReactDOM.createPortal(
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{t('createNewLibrary')}</h3>
          <button onClick={handleClose} className={styles.closeButton}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="libraryName">{t('libraryName')}</label>
            <input
              id="libraryName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('newLibraryNamePlaceholder')}
              required
              disabled={isCreating}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="libraryDescription">{t('descriptionOptional')}</label>
            <textarea
              id="libraryDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('libraryDescriptionPlaceholder')}
              disabled={isCreating}
              rows="3"
            />
          </div>
          <div className={styles.formGroup}>
            <label>{t('libraryIconLabel', 'Ícone')}</label>
            <LibraryIconPicker value={icon} onChange={setIcon} />
          </div>
          <div className={styles.modalFooter}>
            <button type="button" onClick={handleClose} className={`${styles.button} ${styles.cancelButton}`} disabled={isCreating}>
              {t('cancel')}
            </button>
            <button type="submit" className={`${styles.button} ${styles.confirmButton}`} disabled={isCreating}>
              {isCreating ? t('creating') : t('create')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.getElementById('modal-portal')
  );
};

export default CreateLibraryModal;