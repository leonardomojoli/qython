// frontend/src/components/library/LibraryDetail.js
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getLibraryDocuments, uploadDocumentToLibrary, deleteDocument, retryDocumentProcessing, updateLibrary, importDocumentsFromDrive, getPickerToken, api } from '../../api';
import LibraryIconPicker from './LibraryIconPicker';
import { LibraryIcon } from './libraryIcons';
import { useNotification } from '../../contexts/NotificationContext';
import { useConnectorStatus } from '../../hooks/useConnectorStatus';
import { loadPickerApi } from '../connectors/googlePickerLoader';
import styles from './LibraryDetail.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faPlus,
  faLaptop,
  faTrash,
  faSpinner,
  faCheckCircle,
  faExclamationTriangle,
  faClock,
  faComments,
  faSearch,
  faChevronDown,
  faCloudUploadAlt,
  faFilePdf,
  faFileWord,
  faFileExcel,
  faFilePowerpoint,
  faFileImage,
  faFile,
  faFolderOpen,
  faPen,
  faCheck,
  faTimes,
  faRedo
} from '@fortawesome/free-solid-svg-icons';
import { faGoogleDrive } from '@fortawesome/free-brands-svg-icons';
import ConfirmationModal from '../shared/ConfirmationModal';
import InlineLoading from '../shared/InlineLoading';
import DocumentViewerModal from '../shared/DocumentViewerModal';

// Helper: Get file extension
const getFileExtension = (filename) => {
  return filename?.split('.').pop()?.toLowerCase() || '';
};

// Helper: Get icon and class based on file extension
const getFileIcon = (extension) => {
  const iconMap = {
    pdf: { icon: faFilePdf, className: 'pdf' },
    doc: { icon: faFileWord, className: 'doc' },
    docx: { icon: faFileWord, className: 'doc' },
    xls: { icon: faFileExcel, className: 'xls' },
    xlsx: { icon: faFileExcel, className: 'xls' },
    ppt: { icon: faFilePowerpoint, className: 'ppt' },
    pptx: { icon: faFilePowerpoint, className: 'ppt' },
    png: { icon: faFileImage, className: 'img' },
    jpg: { icon: faFileImage, className: 'img' },
    jpeg: { icon: faFileImage, className: 'img' },
    gif: { icon: faFileImage, className: 'img' },
    webp: { icon: faFileImage, className: 'img' },
  };
  return iconMap[extension] || { icon: faFile, className: 'default' };
};

// Thumbnail protegida por JWT: a rota /academic/thumbnails exige login, então uma <img> simples
// dá 401 (a tag não manda o token). Busca via `api` (Authorization injetado pelo interceptor)
// como blob e exibe via object URL — mantém a auth no header, sem token na URL nem rota pública,
// sem mudar o backend. Enquanto carrega ou se falha, mostra o ícone do tipo de arquivo.
const DocumentThumbnail = ({ filename, icon, iconClass, extension, alt }) => {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!filename) {
      setSrc(null);
      return undefined;
    }
    let objectUrl = null;
    let cancelled = false;
    api
      .get(`/academic/thumbnails/${filename}`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setSrc(objectUrl);
      })
      .catch(() => {
        /* sem thumbnail acessível → mantém o placeholder */
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filename]);

  return (
    <div className={styles.cardThumbnail}>
      {src && <img src={src} alt={alt} loading="lazy" onError={() => setSrc(null)} />}
      {!src && (
        <div className={styles.thumbnailPlaceholder} style={{ display: 'flex' }}>
          <FontAwesomeIcon icon={icon} className={`${styles.placeholderIcon} ${styles[iconClass]}`} />
          <span className={styles.placeholderExt}>{extension.toUpperCase()}</span>
        </div>
      )}
    </div>
  );
};

const LibraryDetail = ({ library, onBack, onStartChat, onLibraryUpdated, initialEditing = false }) => {
  const { t, i18n } = useTranslation();
  const { addNotification } = useNotification();

  // Document state
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [docToDelete, setDocToDelete] = useState(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(initialEditing);
  const [editName, setEditName] = useState(library.name);
  const [editDescription, setEditDescription] = useState(library.description || '');
  const [editIcon, setEditIcon] = useState(library.icon || '');
  const [isSaving, setIsSaving] = useState(false);

  // Re-sincroniza o buffer de edição ao trocar de biblioteca (a instância pode ser reaproveitada).
  useEffect(() => {
    setEditName(library.name);
    setEditDescription(library.description || '');
    setEditIcon(library.icon || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.id]);

  // Upload state
  const [uploadQueue, setUploadQueue] = useState([]); // { file, progress, status }
  const fileInputRef = useRef(null);
  const isUploadingRef = useRef(false);

  // Menu "Adicionar" (Do computador / Do Google Drive) + estado do Picker
  const addMenuRef = useRef(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [drivePickerLoading, setDrivePickerLoading] = useState(false);
  const { isConnected: isCloudConnected } = useConnectorStatus();

  // Viewer state
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);

  // Search & Sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date'); // 'date', 'name', 'status'

  // Drag & Drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    try {
      const data = await getLibraryDocuments(library.id);
      setDocuments(data);
    } catch (error) {
      addNotification(t('errorLoadingDocuments'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [library.id, addNotification, t]);

  // Importa arquivos escolhidos no Google Drive (Picker) → backend baixa e processa.
  const handleImportFromDrive = useCallback(async (fileIds) => {
    try {
      const res = await importDocumentsFromDrive(library.id, fileIds);
      if (res?.imported) {
        addNotification(
          t('cloudImportStarted', { count: res.imported, defaultValue: `Importando ${res.imported} arquivo(s) do Drive…` }),
          'success'
        );
        fetchDocuments();
      }
    } catch (error) {
      addNotification(t('cloudImportError', 'Não foi possível importar do Google Drive.'), 'error');
    }
  }, [library.id, addNotification, t, fetchDocuments]);

  // Abre o Google Picker (scope drive.file: acesso concedido só aos arquivos escolhidos).
  const handleOpenDrivePicker = useCallback(async () => {
    setAddMenuOpen(false);
    setDrivePickerLoading(true);
    try {
      const { access_token, api_key, app_id } = await getPickerToken();
      await loadPickerApi();
      const picker = window.google.picker;
      const view = new picker.DocsView(picker.ViewId.DOCS)
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);
      const builder = new picker.PickerBuilder()
        .enableFeature(picker.Feature.MULTISELECT_ENABLED)
        .setDeveloperKey(api_key)
        .setAppId(app_id)
        .setOAuthToken(access_token)
        .addView(view)
        .setLocale((i18n.language || 'pt').split('-')[0])
        .setCallback((data) => {
          const action = data[picker.Response.ACTION];
          if (action === picker.Action.PICKED) {
            const ids = (data[picker.Response.DOCUMENTS] || [])
              .map((d) => d[picker.Document.ID])
              .filter(Boolean);
            if (ids.length) handleImportFromDrive(ids);
          }
          if (action === picker.Action.PICKED || action === picker.Action.CANCEL) {
            setDrivePickerLoading(false);
          }
        });
      builder.build().setVisible(true);
    } catch (e) {
      setDrivePickerLoading(false);
      const code = e?.response?.data?.detail?.code;
      if (code === 'CLOUD_NOT_CONNECTED' || code === 'CLOUD_REAUTH_REQUIRED') {
        addNotification(t('cloudReconnectNeeded', 'Conecte seu Google Drive primeiro.'), 'error');
      } else {
        addNotification(t('cloudPickerError', 'Não foi possível abrir o Google Drive.'), 'error');
      }
    }
  }, [i18n, t, addNotification, handleImportFromDrive]);

  // Fecha o menu "Adicionar" ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!addMenuOpen) return undefined;
    const onDocClick = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setAddMenuOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [addMenuOpen]);

  // Smart polling - only when there are pending/processing docs
  useEffect(() => {
    if (isViewerOpen) return;

    fetchDocuments();

    const hasPendingDocs = documents.some(d =>
      d.status === 'processing' || d.status === 'pending'
    );

    if (hasPendingDocs) {
      const interval = setInterval(fetchDocuments, 15000);
      return () => clearInterval(interval);
    }
  }, [fetchDocuments, isViewerOpen, documents.length]); // Use documents.length to avoid infinite loop

  // Filter and sort documents
  const filteredAndSortedDocs = useMemo(() => {
    let result = [...documents];

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(doc =>
        doc.original_filename.toLowerCase().includes(term)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.original_filename.localeCompare(b.original_filename);
        case 'status':
          const statusOrder = { 'processed': 0, 'processing': 1, 'pending': 2, 'error': 3 };
          return (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4);
        case 'date':
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });

    return result;
  }, [documents, searchTerm, sortBy]);

  // Process upload queue
  const processUploadQueue = useCallback(async () => {
    if (isUploadingRef.current) return;

    const pendingFiles = uploadQueue.filter(item => item.status === 'pending');
    if (pendingFiles.length === 0) return;

    isUploadingRef.current = true;

    for (const item of pendingFiles) {
      // Update status to uploading
      setUploadQueue(prev => prev.map(u =>
        u.file.name === item.file.name ? { ...u, status: 'uploading' } : u
      ));

      try {
        await uploadDocumentToLibrary(library.id, item.file, (progress) => {
          setUploadQueue(prev => prev.map(u =>
            u.file.name === item.file.name ? { ...u, progress } : u
          ));
        });

        // Remove from queue on success
        setUploadQueue(prev => prev.filter(u => u.file.name !== item.file.name));
        addNotification(t('uploadStartedSuccess'), 'success');

        // Refresh documents
        setIsLoading(true);
        await fetchDocuments();
      } catch (error) {
        // Mark as error and auto-remove after 4 seconds
        setUploadQueue(prev => prev.map(u =>
          u.file.name === item.file.name ? { ...u, status: 'error' } : u
        ));
        addNotification(error.message || t('errorUploadingDocument'), 'error');
        setTimeout(() => {
          setUploadQueue(prev => prev.filter(u => u.file.name !== item.file.name));
        }, 4000);
      }
    }

    isUploadingRef.current = false;
  }, [uploadQueue, library.id, addNotification, t, fetchDocuments]);

  // Trigger upload processing when queue changes
  useEffect(() => {
    processUploadQueue();
  }, [processUploadQueue]);

  // Handle file selection (single or multiple)
  const handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const newQueueItems = files.map(file => ({
      file,
      progress: 0,
      status: 'pending'
    }));

    setUploadQueue(prev => [...prev, ...newQueueItems]);

    // Clear input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Drag & Drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const newQueueItems = files.map(file => ({
      file,
      progress: 0,
      status: 'pending'
    }));

    setUploadQueue(prev => [...prev, ...newQueueItems]);
  };

  // Retry handler
  const handleRetryClick = async (e, doc) => {
    e.stopPropagation();
    try {
      await retryDocumentProcessing(library.id, doc.id);
      addNotification(t('documentRetryStarted'), 'success');
      fetchDocuments();
    } catch (error) {
      addNotification(error.message || t('errorRetryingDocument'), 'error');
    }
  };

  // Delete handlers
  const handleDeleteClick = (e, doc) => {
    e.stopPropagation();
    setDocToDelete(doc);
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;
    try {
      await deleteDocument(library.id, docToDelete.id);
      addNotification(t('documentDeletedSuccess'), 'success');
      setDocToDelete(null);
      fetchDocuments();
    } catch (error) {
      addNotification(error.message || t('errorDeletingDocument'), 'error');
      setDocToDelete(null);
    }
  };

  // View document
  const handleViewDocument = (doc) => {
    // Detecta PDF pelo nome de exibição (storage_path é NULL em docs Drive-only).
    const isPdf = (doc.original_filename || '').toLowerCase().endsWith('.pdf');
    if (doc.status === 'processed' && isPdf) {
      setSelectedDoc(doc);
      setIsViewerOpen(true);
    } else if (doc.status === 'error') {
      addNotification(t('documentProcessingFailed'), 'error');
    } else if (doc.status !== 'processed') {
      addNotification(t('documentNotProcessedYet'), 'info');
    } else {
      addNotification(t('previewOnlyForPdf'), 'info');
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'processed':
        return <FontAwesomeIcon icon={faCheckCircle} className={styles.statusProcessed} />;
      case 'processing':
        return <FontAwesomeIcon icon={faSpinner} spin className={styles.statusProcessing} />;
      case 'pending':
        return <FontAwesomeIcon icon={faClock} className={styles.statusPending} />;
      case 'error':
        return <FontAwesomeIcon icon={faExclamationTriangle} className={styles.statusError} />;
      default:
        return null;
    }
  };

  // Render upload queue cards
  const renderUploadingCards = () => {
    return uploadQueue.map((item, index) => (
      <div key={`upload-${index}`} className={styles.uploadingCard}>
        <FontAwesomeIcon icon={faSpinner} spin className={styles.uploadingIcon} />
        <span className={styles.uploadingName}>{item.file.name}</span>
        <div className={styles.progressBarWrapper}>
          <div
            className={styles.progressBar}
            style={{ width: `${item.progress}%` }}
          />
        </div>
        <span className={styles.progressText}>
          {item.status === 'error' ? t('error') : `${item.progress}%`}
        </span>
      </div>
    ));
  };

  // Render content
  const renderContent = () => {
    if (isLoading && documents.length === 0) {
      return (
        <div className={styles.statusContainer}>
          <InlineLoading text={t('loadingDocuments')} />
        </div>
      );
    }

    if (documents.length === 0 && uploadQueue.length === 0) {
      return (
        <div className={styles.emptyState}>
          <FontAwesomeIcon icon={faFolderOpen} className={styles.emptyIcon} />
          <h4 className={styles.emptyTitle}>{t('noDocumentsInLibrary')}</h4>
          <p className={styles.emptyDescription}>{t('dragAndDropHint')}</p>
        </div>
      );
    }

    return (
      <div className={styles.documentGrid}>
        {/* Uploading cards first */}
        {renderUploadingCards()}

        {/* Document cards */}
        {filteredAndSortedDocs.map(doc => {
          const extension = getFileExtension(doc.original_filename);
          const { icon, className } = getFileIcon(extension);

          return (
            <div
              key={doc.id}
              className={styles.documentCard}
              onClick={() => handleViewDocument(doc)}
              role="button"
              tabIndex={0}
              aria-label={`${doc.original_filename} - ${t(doc.status)}`}
              onKeyDown={(e) => e.key === 'Enter' && handleViewDocument(doc)}
            >
              <DocumentThumbnail
                filename={doc.thumbnail_filename}
                icon={icon}
                iconClass={className}
                extension={extension}
                alt={doc.original_filename.replace(/\.[^/.]+$/, "")}
              />
              <div className={styles.cardOverlay}>
                <div className={styles.cardStatus} title={t(doc.status)}>
                  {getStatusIcon(doc.status)}
                  <span>{t(doc.status)}</span>
                </div>
                <div className={styles.cardActions}>
                  {doc.status === 'error' && (
                    <button
                      onClick={(e) => handleRetryClick(e, doc)}
                      className={styles.cardRetryButton}
                      title={t('retryProcessing')}
                      aria-label={t('retryProcessing')}
                    >
                      <FontAwesomeIcon icon={faRedo} />
                    </button>
                  )}
                  <button
                    onClick={(e) => handleDeleteClick(e, doc)}
                    className={styles.cardDeleteButton}
                    title={t('deleteDocument')}
                    aria-label={t('deleteDocument')}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardTitle}>
                  {doc.original_filename.replace(/\.[^/.]+$/, "")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const handleEditSave = async () => {
    if (!editName.trim()) {
      addNotification(t('libraryNameCannotBeEmpty'), 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateLibrary(library.id, { name: editName.trim(), description: editDescription.trim(), icon: editIcon });
      if (updated && onLibraryUpdated) {
        onLibraryUpdated(updated);
      }
      addNotification(t('libraryUpdatedSuccess'), 'success');
      setIsEditing(false);
    } catch (error) {
      addNotification(error.message || t('errorUpdatingLibrary'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditCancel = () => {
    setEditName(library.name);
    setEditDescription(library.description || '');
    setEditIcon(library.icon || '');
    setIsEditing(false);
  };

  const isUploading = uploadQueue.some(item => item.status === 'uploading');
  const hasProcessedDocuments = documents.some(doc => doc.status === 'processed');

  return (
    <div
      className={styles.detailContainer}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className={styles.dropOverlay}>
          <div className={styles.dropContent}>
            <FontAwesomeIcon icon={faCloudUploadAlt} className={styles.dropIcon} />
            <p className={styles.dropText}>{t('dropFilesHere')}</p>
            <p className={styles.dropHint}>{t('dragAndDropHint')}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <button onClick={onBack} className={styles.backButton}>
          <FontAwesomeIcon icon={faArrowLeft} /> {t('back')}
        </button>
        {isEditing ? (
          <div className={styles.editTitleGroup}>
            <input
              type="text"
              className={styles.editTitleInput}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={isSaving}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleEditSave()}
            />
            <input
              type="text"
              className={styles.editDescriptionInput}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder={t('libraryDescriptionPlaceholder')}
              disabled={isSaving}
              onKeyDown={(e) => e.key === 'Enter' && handleEditSave()}
            />
            <div style={{ margin: '4px 0 8px' }}>
              <LibraryIconPicker value={editIcon} onChange={setEditIcon} />
            </div>
            <div className={styles.editActions}>
              <button onClick={handleEditSave} className={styles.editSaveBtn} disabled={isSaving}>
                <FontAwesomeIcon icon={isSaving ? faSpinner : faCheck} spin={isSaving} />
              </button>
              <button onClick={handleEditCancel} className={styles.editCancelBtn} disabled={isSaving}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.titleGroup} onClick={() => setIsEditing(true)} role="button" tabIndex={0} title={t('editLibrary')}>
            <LibraryIcon value={library.icon} className={styles.titleIcon} />
            <h3 className={styles.title}>{library.name}</h3>
            {library.description && <p className={styles.description}>{library.description}</p>}
            <FontAwesomeIcon icon={faPen} className={styles.editIcon} />
          </div>
        )}
        <div className={styles.headerActions}>
          <div className={styles.addMenuWrapper} ref={addMenuRef}>
            <button
              onClick={() => setAddMenuOpen((o) => !o)}
              className={`${styles.actionButton} ${styles.uploadButton}`}
              disabled={isUploading}
              title={isUploading ? t('uploading') : t('addDocument')}
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
            >
              <FontAwesomeIcon icon={isUploading ? faSpinner : faPlus} spin={isUploading} />
            </button>
            {addMenuOpen && (
              <div className={styles.addMenu} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={styles.addMenuItem}
                  onClick={() => { setAddMenuOpen(false); fileInputRef.current?.click(); }}
                >
                  <FontAwesomeIcon icon={faLaptop} className={styles.addMenuIcon} />
                  <span className={styles.addMenuText}>
                    <span className={styles.addMenuLabel}>{t('addFromComputer', 'Do computador')}</span>
                    <span className={styles.addMenuHint}>{t('addFromComputerHint', 'PDF, DOCX, áudio, vídeo…')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.addMenuItem}
                  onClick={handleOpenDrivePicker}
                  disabled={drivePickerLoading}
                >
                  <FontAwesomeIcon icon={drivePickerLoading ? faSpinner : faGoogleDrive} spin={drivePickerLoading} className={styles.addMenuIcon} />
                  <span className={styles.addMenuText}>
                    <span className={styles.addMenuLabel}>{t('addFromDrive', 'Do Google Drive')}</span>
                    <span className={styles.addMenuHint}>
                      {isCloudConnected
                        ? t('addFromDriveHint', 'Escolher arquivos já no seu Drive')
                        : t('addFromDriveConnectHint', 'Conecte seu Drive primeiro')}
                    </span>
                  </span>
                </button>
              </div>
            )}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
            multiple
            accept=".pdf,.docx,.pptx,.txt,.md,.csv,.html,.mp3,.wav,.m4a,.mp4,.avi,.mov"
          />
          <button
            onClick={() => onStartChat(library)}
            className={`${styles.actionButton} ${styles.chatButton}`}
            disabled={!hasProcessedDocuments}
          >
            <FontAwesomeIcon icon={faComments} />
            <span>{t('chatWithLibraryBtn')}</span>
          </button>
        </div>
      </div>

      {/* Toolbar - Search & Sort */}
      {(documents.length > 0 || uploadQueue.length > 0) && (
        <div className={styles.toolbar}>
          <div className={styles.searchWrapper}>
            <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('searchDocuments')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className={styles.sortWrapper}>
            <select
              className={styles.sortSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label={t('sortBy')}
            >
              <option value="date">{t('sortByDate')}</option>
              <option value="name">{t('sortByName')}</option>
              <option value="status">{t('sortByStatus')}</option>
            </select>
            <FontAwesomeIcon icon={faChevronDown} className={styles.sortIcon} />
          </div>
          <span className={styles.docCount}>
            {filteredAndSortedDocs.length} {filteredAndSortedDocs.length === 1 ? t('documentSingular') : t('documentPlural')}
          </span>
        </div>
      )}

      {/* Content */}
      <div className={styles.dropZone}>
        {renderContent()}
      </div>

      {/* Modals */}
      <ConfirmationModal
        isOpen={!!docToDelete}
        onClose={() => setDocToDelete(null)}
        onConfirm={confirmDelete}
        title={t('deleteDocumentConfirmationTitle')}
        message={t('deleteDocumentConfirmationMessage', { name: docToDelete?.original_filename })}
        confirmButtonText={t('delete')}
        cancelButtonText={t('cancel')}
      />

      <DocumentViewerModal
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        doc={selectedDoc}
      />
    </div>
  );
};

export default LibraryDetail;
