// frontend/src/components/library/LibraryManager.js

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getLibraries, deleteLibrary } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import styles from './LibraryManager.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// 1. Importe todos os ícones que o backend pode sugerir, além dos que já usamos.
import { faPlus, faTrash, faPen, faSearch } from '@fortawesome/free-solid-svg-icons';
import { LibraryIcon } from './libraryIcons';
import ConfirmationModal from '../shared/ConfirmationModal';
import InlineLoading from '../shared/InlineLoading';
import LibraryDetail from './LibraryDetail';
import LibraryChat from './LibraryChat';
import CreateLibraryModal from './CreateLibraryModal';
import CloudConnectBanner from '../connectors/CloudConnectBanner';

// iconMap / getIconByName / LibraryIcon foram extraídos para ./libraryIcons
// (compartilhado com o picker e com suporte a emoji).

// Componente principal
const LibraryManager = () => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const [libraries, setLibraries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [libraryToDelete, setLibraryToDelete] = useState(null);
  const [viewingLibrary, setViewingLibrary] = useState(null);
  const [startEditing, setStartEditing] = useState(false);
  const [chattingInLibrary, setChattingInLibrary] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Novo estado para controlar o modal de criação
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchLibraries = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getLibraries();
      setLibraries(data);
    } catch (error) {
      addNotification(t('errorLoadingLibraries'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, t]);

  useEffect(() => {
    if (!viewingLibrary && !chattingInLibrary) {
        fetchLibraries();
    }
  }, [fetchLibraries, viewingLibrary, chattingInLibrary]);

  const handleDeleteClick = (library) => {
    setLibraryToDelete(library);
  };

  const confirmDelete = async () => {
    if (!libraryToDelete) return;
    try {
      await deleteLibrary(libraryToDelete.id);
      addNotification(t('libraryDeletedSuccess'), 'success');
      setLibraryToDelete(null);
      fetchLibraries();
    } catch (error) {
      addNotification(error.message || t('errorDeletingLibrary'), 'error');
      setLibraryToDelete(null);
    }
  };

  // Renderização condicional permanece a mesma...
  if (chattingInLibrary) {
    return (
      <LibraryChat
        library={chattingInLibrary}
        onBack={() => setChattingInLibrary(null)}
      />
    );
  }

  if (viewingLibrary) {
    return (
      <LibraryDetail
        library={viewingLibrary}
        initialEditing={startEditing}
        onBack={() => { setViewingLibrary(null); setStartEditing(false); }}
        onStartChat={(lib) => {
            setViewingLibrary(null);
            setStartEditing(false);
            setChattingInLibrary(lib);
        }}
        onLibraryUpdated={(updated) => {
            setViewingLibrary(updated);
            setLibraries(prev => prev.map(lib => lib.id === updated.id ? updated : lib));
        }}
      />
    );
  }

  // Filtra a lista de bibliotecas pela busca (nome + descrição).
  const _term = searchTerm.trim().toLowerCase();
  const filteredLibraries = _term
    ? libraries.filter((l) =>
        (l.name || '').toLowerCase().includes(_term) ||
        (l.description || '').toLowerCase().includes(_term))
    : libraries;

  // Visão padrão (grade de bibliotecas)
  return (
    <div className={styles.managerContainer}>
      <CloudConnectBanner />
      {/* O formulário foi substituído por este container e botão */}
      <div className={styles.formContainer}>
        <button
          className={styles.addLibraryButton}
          onClick={() => setIsCreateModalOpen(true)}
          title={t('createNewLibrary')}
        >
          <FontAwesomeIcon icon={faPlus} />
        </button>
        {libraries.length > 0 && (
          <div className={styles.searchWrapper}>
            <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('searchLibraries')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <InlineLoading text={t('loadingLibraries')} />
      ) : (
        <div className={styles.libraryGrid}>
          {libraries.length === 0 ? (
            <p className={styles.noLibrariesMessage}>{t('noLibrariesFound')}</p>
          ) : filteredLibraries.length === 0 ? (
            <p className={styles.noLibrariesMessage}>{t('noLibrariesMatch')}</p>
          ) : (
            filteredLibraries.map((lib) => (
              <div key={lib.id} className={styles.libraryCard} onClick={() => setViewingLibrary(lib)}>
                <LibraryIcon value={lib.icon} className={styles.libraryIcon} />
                <span className={styles.libraryName}>{lib.name}</span>

                {lib.description && (
                  <p className={styles.libraryDescription}>{lib.description}</p>
                )}

                <div className={styles.cardActions}>
                  <button
                    className={styles.editButton}
                    onClick={(e) => { e.stopPropagation(); setStartEditing(true); setViewingLibrary(lib); }}
                    title={t('editLibrary')}
                  >
                    <FontAwesomeIcon icon={faPen} />
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={(e) => { e.stopPropagation(); handleDeleteClick(lib); }}
                    title={t('deleteLibrary')}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Renderiza os modais no final */}
      <CreateLibraryModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onLibraryCreated={fetchLibraries}
      />

      <ConfirmationModal
        isOpen={!!libraryToDelete}
        onClose={() => setLibraryToDelete(null)}
        onConfirm={confirmDelete}
        title={t('deleteLibraryConfirmationTitle')}
        message={t('deleteLibraryConfirmationMessage', { name: libraryToDelete?.name })}
        confirmButtonText={t('delete')}
        cancelButtonText={t('cancel')}
      />
    </div>
  );
};

export default LibraryManager;