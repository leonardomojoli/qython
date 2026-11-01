// frontend/src/components/consultation/PatientHistoryPanel.js
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHistory,
  faChevronRight,
  faCloudUploadAlt,
  faSpinner,
  faCalendarAlt,
  faStethoscope,
  faNotesMedical,
  faCheck,
  faExclamationTriangle,
  faTimes,
  faThumbsUp,
  faThumbsDown,
  faFileImport,
  faListUl,
  faPen,
  faSave,
  faTrash,
  faUndo
} from '@fortawesome/free-solid-svg-icons';
import { getPatientHistory, parsePatientHistory, savePatientHistory, updateHistoryEntry, submitFeedback } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import FeedbackModal from '../shared/FeedbackModal';
import styles from './PatientHistoryPanel.module.css';

function PatientHistoryPanel({ isOpen, onClose, patient, onHistoryUpdated }) {
  const { t, i18n } = useTranslation();
  const { addNotification } = useNotification();

  // Tab state
  const [activeTab, setActiveTab] = useState('history');

  // Data states
  const [rawHistory, setRawHistory] = useState('');
  const [parsedHistory, setParsedHistory] = useState(null);
  const [parsedHistoryDraft, setParsedHistoryDraft] = useState(null);
  const [historyTrainingDataId, setHistoryTrainingDataId] = useState(null);

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit states
  const [editingEntryIndex, setEditingEntryIndex] = useState(null);
  const [editForm, setEditForm] = useState({
    date: '',
    chief_complaint: '',
    notes: '',
    diagnosis: '',
    plan: '',
    provider: ''
  });

  // UI states
  const [error, setError] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState({ type: '', content: '', id: null });

  // Fetch patient history when modal opens
  useEffect(() => {
    const fetchHistory = async () => {
      if (!isOpen || !patient?.id) {
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const data = await getPatientHistory(patient.id);
        setRawHistory(data?.rawHistory || '');
        setParsedHistory(data?.parsedHistory || null);
        setHistoryTrainingDataId(null);  // histórico carregado não tem id de parse fresco
      } catch (err) {
        console.error('Error fetching patient history:', err);
        setError(t('errorLoadingHistory'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [isOpen, patient?.id, t]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setActiveTab('history');
      setParsedHistoryDraft(null);
      setEditingEntryIndex(null);
      setHasUnsavedChanges(false);
    }
  }, [isOpen]);

  // Handle close with unsaved changes warning
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      if (window.confirm(t('unsavedChangesWarning'))) {
        onClose();
      }
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose, t]);

  // Parse history with AI
  const handleParseHistory = async () => {
    if (!patient?.id || !rawHistory.trim() || rawHistory.trim().length < 20) {
      setError(t('historyTooShort'));
      return;
    }

    setIsParsing(true);
    setError(null);
    try {
      const data = await parsePatientHistory(patient.id, rawHistory);
      // Store as draft, don't save to DB yet
      setParsedHistoryDraft(data?.parsedHistory || []);
      setHistoryTrainingDataId(data?.trainingDataId || null);
      setHasUnsavedChanges(true);
    } catch (err) {
      console.error('Error parsing history:', err);
      setError(t('errorParsingHistory'));
      addNotification(t('errorParsingHistory'), 'error');
    } finally {
      setIsParsing(false);
    }
  };

  // Save organized history
  const handleSaveOrganization = async () => {
    if (!patient?.id || !parsedHistoryDraft) return;

    setIsSaving(true);
    setError(null);
    try {
      const data = await savePatientHistory(patient.id, {
        parsedHistory: parsedHistoryDraft,
        rawHistory: rawHistory
      });
      setParsedHistory(data?.parsedHistory || parsedHistoryDraft);
      setParsedHistoryDraft(null);
      setHasUnsavedChanges(false);
      addNotification(t('historySavedSuccess'), 'success');
      if (onHistoryUpdated) {
        onHistoryUpdated(data);
      }
      // Switch to history tab to see saved results
      setActiveTab('history');
    } catch (err) {
      console.error('Error saving history:', err);
      setError(t('errorSavingHistory'));
      addNotification(t('errorSavingHistory'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Save raw history without organizing
  const handleSaveRawHistory = async () => {
    if (!patient?.id || !rawHistory.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      const data = await savePatientHistory(patient.id, {
        parsedHistory: parsedHistory || [],
        rawHistory: rawHistory
      });
      setParsedHistory(data?.parsedHistory || parsedHistory);
      addNotification(t('historySavedSuccess'), 'success');
      if (onHistoryUpdated) {
        onHistoryUpdated(data);
      }
    } catch (err) {
      console.error('Error saving raw history:', err);
      setError(t('errorSavingHistory'));
      addNotification(t('errorSavingHistory'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Discard draft
  const handleDiscardDraft = () => {
    if (window.confirm(t('confirmDiscardChanges'))) {
      setParsedHistoryDraft(null);
      setHasUnsavedChanges(false);
      setRawHistory('');
    }
  };

  // Start editing an entry
  const handleStartEdit = (index, entry) => {
    setEditingEntryIndex(index);
    setEditForm({
      date: entry.date || '',
      chief_complaint: entry.chief_complaint || '',
      notes: entry.notes || '',
      diagnosis: entry.diagnosis || '',
      plan: entry.plan || '',
      provider: entry.provider || ''
    });
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingEntryIndex(null);
    setEditForm({
      date: '',
      chief_complaint: '',
      notes: '',
      diagnosis: '',
      plan: '',
      provider: ''
    });
  };

  // Save edited entry
  const handleSaveEntry = async () => {
    if (editingEntryIndex === null || !patient?.id) return;

    setIsSaving(true);
    try {
      // If editing a draft, update locally
      if (parsedHistoryDraft) {
        const updatedDraft = [...parsedHistoryDraft];
        updatedDraft[editingEntryIndex] = {
          ...updatedDraft[editingEntryIndex],
          ...editForm
        };
        setParsedHistoryDraft(updatedDraft);
        setHasUnsavedChanges(true);
      } else {
        // Otherwise, save to backend
        const data = await updateHistoryEntry(patient.id, editingEntryIndex, editForm);
        setParsedHistory(data?.parsedHistory);
        addNotification(t('entrySavedSuccess'), 'success');
        if (onHistoryUpdated) {
          onHistoryUpdated(data);
        }
      }
      handleCancelEdit();
    } catch (err) {
      console.error('Error saving entry:', err);
      addNotification(t('errorSavingEntry'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Update edit form field
  const handleEditFormChange = (field, value) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return t('noDateAvailable');
    try {
      let date = new Date(dateStr);

      // If ISO parse failed, try DD/MM/YYYY format (common in BR clinical records)
      if (isNaN(date.getTime())) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts.map(Number);
          date = new Date(year, month - 1, day);
        }
        if (isNaN(date.getTime())) return dateStr;
      }

      const locale = i18n.language === 'en' ? 'en-US' : i18n.language === 'es' ? 'es-ES' : 'pt-BR';
      return date.toLocaleDateString(locale);
    } catch {
      return dateStr;
    }
  };

  // --- Feedback Handlers ---
  const handleLike = async () => {
    try {
      await submitFeedback({
        feedback_type: 'like',
        content_type: 'clinical_history_parsing',
        content_id: `patient_${patient?.id}_history`,
        training_data_id: historyTrainingDataId,
        original_content: JSON.stringify(parsedHistoryDraft || parsedHistory),
        user_prompt: rawHistory,
        conversation_context: null,
        feedback_text: '',
        contact_permission: false,
      });
      addNotification(t('feedbackSentSuccess'), 'success');
    } catch (error) {
      console.error("Failed to submit like feedback:", error);
      addNotification(t('feedbackSentError'), 'error');
    }
  };

  const handleDislike = () => {
    setCurrentFeedback({
      type: 'dislike',
      content: JSON.stringify(parsedHistoryDraft || parsedHistory),
      id: `patient_${patient?.id}_history`,
      training_data_id: historyTrainingDataId,
      user_prompt: rawHistory,
    });
    setIsFeedbackModalOpen(true);
  };

  const handleFeedbackSubmit = async (comment, contactPermission) => {
    try {
      await submitFeedback({
        feedback_type: currentFeedback.type,
        content_type: 'clinical_history_parsing',
        content_id: currentFeedback.id,
        training_data_id: currentFeedback.training_data_id,
        original_content: currentFeedback.content,
        user_prompt: currentFeedback.user_prompt,
        conversation_context: null,
        feedback_text: comment,
        contact_permission: contactPermission,
      });
      addNotification(t('feedbackSentSuccess'), 'success');
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      addNotification(t('feedbackSentError'), 'error');
    } finally {
      setIsFeedbackModalOpen(false);
    }
  };

  if (!isOpen) return null;

  // Determine which history to display
  const displayHistory = parsedHistoryDraft || parsedHistory;
  const isShowingDraft = !!parsedHistoryDraft;

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerTitle}>
            <FontAwesomeIcon icon={faHistory} className={styles.headerIcon} />
            <h3>{t('history')}</h3>
            {patient && <span className={styles.patientName}>- {patient.full_name}</span>}
          </div>
          <button className={styles.closeButton} onClick={handleClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabsContainer}>
          <button
            className={`${styles.tab} ${activeTab === 'history' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <FontAwesomeIcon icon={faListUl} />
            {t('historyTab')}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'import' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('import')}
          >
            <FontAwesomeIcon icon={faFileImport} />
            {t('importTab')}
            {hasUnsavedChanges && <span className={styles.unsavedBadge}>!</span>}
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <FontAwesomeIcon icon={faSpinner} spin />
              <span>{t('loading')}...</span>
            </div>
          ) : (
            <>
              {/* History Tab */}
              {activeTab === 'history' && (
                <div className={styles.historyTabContent}>
                  {displayHistory && displayHistory.length > 0 ? (
                    <div className={styles.historyList}>
                      {isShowingDraft && (
                        <div className={styles.draftBanner}>
                          <FontAwesomeIcon icon={faExclamationTriangle} />
                          <span>{t('draftNotSaved')}</span>
                        </div>
                      )}
                      {displayHistory.map((entry, index) => (
                        <HistoryEntry
                          key={index}
                          entry={entry}
                          index={index}
                          formatDate={formatDate}
                          t={t}
                          isEditing={editingEntryIndex === index}
                          editForm={editForm}
                          onStartEdit={() => handleStartEdit(index, entry)}
                          onCancelEdit={handleCancelEdit}
                          onSaveEntry={handleSaveEntry}
                          onEditFormChange={handleEditFormChange}
                          isSaving={isSaving}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      <FontAwesomeIcon icon={faNotesMedical} />
                      <p>{t('noHistoryYet')}</p>
                      <span className={styles.emptyHint}>{t('importToStart')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Import Tab */}
              {activeTab === 'import' && (
                <div className={styles.importTabContent}>
                  {/* Raw history input */}
                  <div className={styles.importSection}>
                    <label htmlFor="raw-history-input">{t('pasteHistoryLabel')}</label>
                    <textarea
                      id="raw-history-input"
                      className={styles.historyTextarea}
                      value={rawHistory}
                      onChange={(e) => setRawHistory(e.target.value)}
                      placeholder={t('pasteHistoryPlaceholder')}
                      rows={8}
                      disabled={isParsing}
                    />
                    <div className={styles.importActions}>
                      <button
                        className={styles.parseButton}
                        onClick={handleParseHistory}
                        disabled={isParsing || isSaving || !rawHistory.trim()}
                      >
                        {isParsing ? (
                          <>
                            <FontAwesomeIcon icon={faSpinner} spin />
                            {t('organizing')}...
                          </>
                        ) : (
                          <>
                            <FontAwesomeIcon icon={faCloudUploadAlt} />
                            {t('organizeWithAI')}
                          </>
                        )}
                      </button>
                      <button
                        className={styles.saveRawButton}
                        onClick={handleSaveRawHistory}
                        disabled={isParsing || isSaving || !rawHistory.trim()}
                      >
                        {isSaving ? (
                          <>
                            <FontAwesomeIcon icon={faSpinner} spin />
                            {t('saving')}...
                          </>
                        ) : (
                          <>
                            <FontAwesomeIcon icon={faSave} />
                            {t('saveWithoutOrganizing')}
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className={styles.errorMessage}>
                      <FontAwesomeIcon icon={faExclamationTriangle} />
                      {error}
                    </div>
                  )}

                  {/* Parsed history preview (draft) */}
                  {parsedHistoryDraft && parsedHistoryDraft.length > 0 && (
                    <div className={styles.draftSection}>
                      <div className={styles.historyListHeader}>
                        <h4 className={styles.historyListTitle}>
                          <FontAwesomeIcon icon={faCheck} className={styles.successIcon} />
                          {t('organizedConsultations')} ({parsedHistoryDraft.length})
                        </h4>
                        <div className={styles.feedbackActions}>
                          <button onClick={handleLike} title={t('like')} className={styles.feedbackBtn}>
                            <FontAwesomeIcon icon={faThumbsUp} />
                          </button>
                          <button onClick={handleDislike} title={t('dislike')} className={styles.feedbackBtn}>
                            <FontAwesomeIcon icon={faThumbsDown} />
                          </button>
                        </div>
                      </div>

                      <div className={styles.draftPreview}>
                        {parsedHistoryDraft.map((entry, index) => (
                          <HistoryEntry
                            key={index}
                            entry={entry}
                            index={index}
                            formatDate={formatDate}
                            t={t}
                            isEditing={editingEntryIndex === index}
                            editForm={editForm}
                            onStartEdit={() => handleStartEdit(index, entry)}
                            onCancelEdit={handleCancelEdit}
                            onSaveEntry={handleSaveEntry}
                            onEditFormChange={handleEditFormChange}
                            isSaving={isSaving}
                            isDraft={true}
                          />
                        ))}
                      </div>

                      {/* Save/Discard buttons */}
                      <div className={styles.draftActions}>
                        <button
                          className={styles.discardButton}
                          onClick={handleDiscardDraft}
                          disabled={isSaving}
                        >
                          <FontAwesomeIcon icon={faUndo} />
                          {t('discardChanges')}
                        </button>
                        <button
                          className={styles.saveButton}
                          onClick={handleSaveOrganization}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <>
                              <FontAwesomeIcon icon={faSpinner} spin />
                              {t('saving')}...
                            </>
                          ) : (
                            <>
                              <FontAwesomeIcon icon={faSave} />
                              {t('saveOrganization')}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {parsedHistoryDraft && parsedHistoryDraft.length === 0 && (
                    <div className={styles.emptyState}>
                      <FontAwesomeIcon icon={faNotesMedical} />
                      <p>{t('noHistoryParsed')}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        onSubmit={handleFeedbackSubmit}
      />
    </div>
  );
}

function HistoryEntry({
  entry,
  index,
  formatDate,
  t,
  isEditing,
  editForm,
  onStartEdit,
  onCancelEdit,
  onSaveEntry,
  onEditFormChange,
  isSaving,
  isDraft = false
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Check if entry is from Qython
  const isQythonEntry = entry.source === 'qython';

  if (isEditing) {
    return (
      <div className={`${styles.historyEntry} ${styles.editing}`}>
        <div className={styles.editForm}>
          <div className={styles.editRow}>
            <div className={styles.editField}>
              <label>{t('historyEntryDate')}</label>
              <input
                type="date"
                value={editForm.date}
                onChange={(e) => onEditFormChange('date', e.target.value)}
              />
            </div>
            <div className={styles.editField}>
              <label>{t('provider')}</label>
              <input
                type="text"
                value={editForm.provider}
                onChange={(e) => onEditFormChange('provider', e.target.value)}
                placeholder={t('provider')}
              />
            </div>
          </div>
          <div className={styles.editField}>
            <label>{t('chiefComplaint')}</label>
            <input
              type="text"
              value={editForm.chief_complaint}
              onChange={(e) => onEditFormChange('chief_complaint', e.target.value)}
              placeholder={t('chiefComplaint')}
            />
          </div>
          <div className={styles.editField}>
            <label>{t('diagnosis')}</label>
            <input
              type="text"
              value={editForm.diagnosis}
              onChange={(e) => onEditFormChange('diagnosis', e.target.value)}
              placeholder={t('diagnosis')}
            />
          </div>
          <div className={styles.editField}>
            <label>{t('clinicalNotes')}</label>
            <textarea
              value={editForm.notes}
              onChange={(e) => onEditFormChange('notes', e.target.value)}
              placeholder={t('clinicalNotes')}
              rows={4}
            />
          </div>
          <div className={styles.editField}>
            <label>{t('plan')}</label>
            <textarea
              value={editForm.plan}
              onChange={(e) => onEditFormChange('plan', e.target.value)}
              placeholder={t('plan')}
              rows={2}
            />
          </div>
          <div className={styles.editActions}>
            <button
              className={styles.cancelEditBtn}
              onClick={onCancelEdit}
              disabled={isSaving}
            >
              <FontAwesomeIcon icon={faTimes} />
              {t('cancelEdit')}
            </button>
            <button
              className={styles.saveEditBtn}
              onClick={onSaveEntry}
              disabled={isSaving}
            >
              {isSaving ? (
                <FontAwesomeIcon icon={faSpinner} spin />
              ) : (
                <FontAwesomeIcon icon={faSave} />
              )}
              {t('saveEntry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.historyEntry} ${isOpen ? styles.open : ''} ${isDraft ? styles.draftEntry : ''}`}>
      <button className={styles.entryHeader} onClick={() => setIsOpen(!isOpen)}>
        <div className={styles.entryDate}>
          <FontAwesomeIcon icon={faCalendarAlt} />
          {formatDate(entry.date)}
        </div>
        <div className={styles.entryComplaint}>
          {entry.chief_complaint || t('noChiefComplaint')}
          {isQythonEntry && (
            <span className={styles.qythonBadge}>Qython</span>
          )}
        </div>
        <div className={styles.entryActions}>
          <button
            className={styles.editEntryBtn}
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
            title={t('editEntry')}
          >
            <FontAwesomeIcon icon={faPen} />
          </button>
          <FontAwesomeIcon
            icon={faChevronRight}
            className={`${styles.expandIcon} ${isOpen ? styles.rotated : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className={styles.entryBody}>
          {entry.notes && (
            <div className={styles.entryField}>
              <label>{t('clinicalNotes')}:</label>
              <p>{entry.notes}</p>
            </div>
          )}
          {entry.diagnosis && (
            <div className={styles.entryField}>
              <label><FontAwesomeIcon icon={faStethoscope} /> {t('diagnosis')}:</label>
              <p>{entry.diagnosis}</p>
            </div>
          )}
          {entry.plan && (
            <div className={styles.entryField}>
              <label>{t('plan')}:</label>
              <p>{entry.plan}</p>
            </div>
          )}
          {entry.provider && (
            <div className={styles.entryField}>
              <label>{t('provider')}:</label>
              <p>{entry.provider}</p>
            </div>
          )}
          {entry.specialty && (
            <div className={styles.entryField}>
              <label>{t('specialty')}:</label>
              <p>{entry.specialty}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PatientHistoryPanel;
