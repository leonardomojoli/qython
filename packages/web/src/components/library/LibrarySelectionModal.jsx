// frontend/src/components/LibrarySelectionModal.js
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getLibraries } from '../../api';
import styles from './LibrarySelectionModal.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBook, faSpinner } from '@fortawesome/free-solid-svg-icons';

const LibrarySelectionModal = ({ isOpen, onClose, onSelectLibrary }) => {
  const { t } = useTranslation();
  const [libraries, setLibraries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLibraries = useCallback(async () => {
    if (!isOpen) return;
    setIsLoading(true);
    try {
      const data = await getLibraries();
      setLibraries(data);
    } catch (error) {
      console.error("Error fetching libraries for modal:", error);
      // Notificação de erro pode ser adicionada aqui se necessário
    } finally {
      setIsLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    fetchLibraries();
  }, [fetchLibraries]);

  if (!isOpen) return null;

  const handleSelect = (library) => {
    onSelectLibrary(library);
    onClose();
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>&times;</button>
        <h3>{t('selectLibrary')}</h3>
        <div className={styles.libraryList}>
          {isLoading ? (
            <div className={styles.loadingContainer}>
              <FontAwesomeIcon icon={faSpinner} spin />
              <p>{t('loadingLibraries')}</p>
            </div>
          ) : libraries.length > 0 ? (
            libraries.map((lib) => (
              <div key={lib.id} className={styles.libraryItem} onClick={() => handleSelect(lib)}>
                <FontAwesomeIcon icon={faBook} className={styles.libraryIcon} />
                <span>{lib.name}</span>
              </div>
            ))
          ) : (
            <p className={styles.noLibrariesMessage}>{t('noLibrariesFound')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LibrarySelectionModal;