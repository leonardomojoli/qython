// frontend/src/components/consultation/ConsultationForm.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '../../contexts/UserContext';
import {
  getDraftConsultation,
  getSummary,
  createConsultation,
  getAnamnesisTemplates,
  submitFeedback,
  updatePatient,
  extractPatientUpdates,
  applyPatientUpdates,
} from '../../api';
import { ANAMNESE_DATA, getTemplate } from '../../data/consultationTemplates';
import { useNotification } from '../../contexts/NotificationContext';
import styles from './ConsultationManager.module.css';
import QythonTipTapEditor from './QythonTipTapEditor';
import PatientPickerModal from './PatientPickerModal';
import PatientHistoryPanel from './PatientHistoryPanel';
import SpecialtyDropdown from './SpecialtyDropdown';
import localStorageService from '../../utils/localStorageService';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faThumbsUp,
  faThumbsDown,
  faCopy,
  faShareNodes,
  faArrowRotateRight,
  faCheck,
  faFileLines,
  faFilePdf,
  faFileCode,
  faUserPlus,
  faTimes,
  faHistory,
  faStethoscope,
  faInfoCircle,
  faAllergies,
  faPills,
  faHeartPulse,
  faPhone,
  faIdCard,
  faCalendarDays,
  faVenusMars,
  faPen,
  faSave,
  faPlus,
  faTrash,
  faEnvelope,
  faMapMarkerAlt,
  faRotateLeft
} from '@fortawesome/free-solid-svg-icons';
import { handleShareAsTxt, handleShareAsPdf, convertMarkdownToPlainText, handleShareAsMarkdown } from '../shared/ShareComponent';
import FeedbackModal from '../shared/FeedbackModal';
import PatientUpdateModal from './PatientUpdateModal';
import VoiceRecorder from './VoiceRecorder';
import QuickInsertBar from './QuickInsertBar';
import ConsultationTimer from './ConsultationTimer';
import { useConsultationTimer } from '../../hooks/useConsultationTimer';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning';

import { API_URL as API_BASE_URL } from '../../config';
import { hasPlatformAccess } from '../../utils/access';

function ConsultationForm({ consultation, onSave }) {
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const { addNotification } = useNotification();
  // "Tem acesso às features" — verificado no Latreo OU acesso concedido pelo Qython.
  const isVerified = hasPlatformAccess(user);
  const [specialty, setSpecialty] = useState('');
  const [isFirstConsultation, setIsFirstConsultation] = useState(true);
  const [rawNotes, setRawNotes] = useState('');
  const [improvedNotes, setImprovedNotes] = useState('');
  const [summary, setSummary] = useState('');
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [userAnamnesisTemplates, setUserAnamnesisTemplates] = useState([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templateLoadReason, setTemplateLoadReason] = useState('initial');

  // Patient picker state
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isPatientPickerOpen, setIsPatientPickerOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isPatientDetailsOpen, setIsPatientDetailsOpen] = useState(false);

  // Patient edit state
  const [isEditingPatient, setIsEditingPatient] = useState(false);
  const [patientEditForm, setPatientEditForm] = useState({});
  const [isSavingPatient, setIsSavingPatient] = useState(false);
  const [newAllergyInput, setNewAllergyInput] = useState('');
  const [newConditionInput, setNewConditionInput] = useState('');
  const [newMedicationInput, setNewMedicationInput] = useState('');

  // Patient update extraction state
  const [patientUpdateChanges, setPatientUpdateChanges] = useState(null);
  const [patientUpdateContext, setPatientUpdateContext] = useState(null);
  const [showPatientUpdateModal, setShowPatientUpdateModal] = useState(false);
  const [extractingPatientUpdates, setExtractingPatientUpdates] = useState(false);
  const pendingSaveCleanupRef = React.useRef(null);

  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState({ type: '', content: '', contentType: '' });
  const [shareMenu, setShareMenu] = useState({ open: false, target: null });
  const [actionSuccess, setActionSuccess] = useState({ target: null, type: null });
  const shareMenuRef = useRef(null);

  const { autosaveEnabled } = useUser();

  // === Single-Editor Improvement Flow ===
  // Stores the doctor's original raw text before improvement (for undo)
  const [originalRawNotes, setOriginalRawNotes] = useState('');
  // Whether the editor currently shows improved content
  const [isImproved, setIsImproved] = useState(false);
  // Redo dropdown state
  const [isRedoDropdownOpen, setIsRedoDropdownOpen] = useState(false);
  const [confirmSaveWithoutEnhance, setConfirmSaveWithoutEnhance] = useState(false);
  const redoDropdownRef = useRef(null);

  // === DPO/Training Data Tracking ===
  // Track original AI-generated content for DPO pair creation on save
  const [originalImprovedNotes, setOriginalImprovedNotes] = useState('');
  const [originalSummary, setOriginalSummary] = useState('');
  // Track regeneration counts
  const [regenerationCountImproved, setRegenerationCountImproved] = useState(0);
  const [regenerationCountSummary, setRegenerationCountSummary] = useState(0);
  // Track editing time for engagement metrics
  const [firstEditTimestamp, setFirstEditTimestamp] = useState(null);
  const [editStartTimestamp, setEditStartTimestamp] = useState(null);

  // Consultation timer - auto-starts when specialty is selected
  const timer = useConsultationTimer({
    autoStart: false,
    inactivityTimeout: 5 * 60 * 1000, // 5 minutes
  });

  // Unsaved changes warning - only warn if there are generated notes/summary not yet saved
  // We consider "unsaved" when user has improved notes or summary (generated content)
  // but hasn't saved the consultation yet to the server
  const hasUnsavedChanges = (improvedNotes.trim() !== '' || summary.trim() !== '');

  // When autosave is enabled, skip the browser's beforeunload warning (the annoying popup)
  // because content is automatically saved to localStorage and will be restored
  // We still show our custom modal for internal navigation
  const navigationBlocker = useUnsavedChangesWarning(
    hasUnsavedChanges,
    t('unsavedChangesWarning', 'Você tem alterações não salvas. Deseja sair sem salvar?'),
    autosaveEnabled // Skip beforeunload when autosave is on
  );

  useEffect(() => {
    const fetchUserTemplates = async () => {
      if (user && user.id) {
        setIsLoadingTemplates(true);
        try {
          const data = await getAnamnesisTemplates();
          if (Array.isArray(data)) {
            setUserAnamnesisTemplates(data);
          } else {
            setUserAnamnesisTemplates([]);
            addNotification(t('errorLoadingUserTemplates') + (data?.error ? `: ${data.error}` : ': Invalid format'), 'error');
          }
        } catch (error) {
          setUserAnamnesisTemplates([]);
        } finally {
          setIsLoadingTemplates(false);
        }
      } else {
        setUserAnamnesisTemplates([]);
      }
    };
    fetchUserTemplates();
  }, [user, addNotification, t]);

  const updateRawNotesBasedOnTemplate = useCallback(() => {
    if (specialty) {
      const consultationTypeKey = isFirstConsultation ? 'first' : 'return';
      let templateToUse = null;

      if (userAnamnesisTemplates && userAnamnesisTemplates.length > 0) {
        const foundTemplate = userAnamnesisTemplates.find(
          (template) =>
            template.specialty === specialty &&
            template.consultation_type === consultationTypeKey
        );
        if (foundTemplate) {
          templateToUse = foundTemplate.content;
        }
      }

      if (templateToUse !== null) {
        setRawNotes(templateToUse);
      } else {
        // Use getTemplate helper - removes "## Identificação" when patient is selected
        const baseText = getTemplate(specialty, isFirstConsultation, !!selectedPatient);
        setRawNotes(baseText || '');
      }
    } else {
      setRawNotes('');
    }
    setImprovedNotes('');
    setSummary('');
  }, [specialty, isFirstConsultation, userAnamnesisTemplates, selectedPatient]);

  useEffect(() => {
    if (!isLoadingTemplates && (templateLoadReason === 'specialtyChange' || templateLoadReason === 'typeChange')) {
      updateRawNotesBasedOnTemplate();
      setTemplateLoadReason('none');
    } else if (!isLoadingTemplates && templateLoadReason === 'initial' && !rawNotes) {
      updateRawNotesBasedOnTemplate();
      setTemplateLoadReason('none');
    }
  }, [specialty, isFirstConsultation, isLoadingTemplates, userAnamnesisTemplates, templateLoadReason, rawNotes, updateRawNotesBasedOnTemplate]);

  const openFeedbackModal = (type, content, contentType) => {
    setCurrentFeedback({ type, content, contentType });
    setIsFeedbackModalOpen(true);
  };

  const handleLike = async (content, contentType) => {
    try {
      await submitFeedback({
        feedback_type: 'like',
        content_type: contentType,
        original_content: content,
        feedback_text: '',
        contact_permission: false
      });
      addNotification(t('feedbackSentSuccess'), 'success');
    } catch (err) {
      addNotification(t('feedbackSentError'), 'error');
    }
  };

  const handleFeedbackSubmit = async (comment, contactPermission) => {
    try {
      await submitFeedback({
        feedback_type: 'dislike',
        content_type: currentFeedback.contentType,
        original_content: currentFeedback.content,
        feedback_text: comment,
        contact_permission: contactPermission,
      });
      addNotification(t('feedbackSentSuccess'), 'success');
    } catch (error) {
      addNotification(t('feedbackSentError'), 'error');
    } finally {
      setIsFeedbackModalOpen(false);
    }
  };

  const handleCopy = (markdownText, target) => {
    if (!markdownText) return;
    const plainText = convertMarkdownToPlainText(markdownText);
    navigator.clipboard.writeText(plainText)
      .then(() => {
        setActionSuccess({ target, type: 'copy' });
        setTimeout(() => setActionSuccess({ target: null, type: null }), 2000);
      })
      .catch(err => {
        addNotification(t('errorCopying'), 'error');
      });
  };

  const handleShareClick = (e, target) => {
    e.stopPropagation();
    setShareMenu(prev => ({
      open: prev.target === target ? !prev.open : true,
      target: target,
    }));
  };

  const handleShareAction = async (shareFn, target) => {
    setShareMenu({ open: false, target: null });
    const success = await shareFn();
    if (success) {
      setActionSuccess({ target, type: 'share' });
      setTimeout(() => setActionSuccess({ target: null, type: null }), 2000);
    }
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (shareMenu.open && shareMenuRef.current && !shareMenuRef.current.contains(event.target) && !event.target.closest(`[data-share-button]`)) {
        setShareMenu({ open: false, target: null });
      }
    }
    if (shareMenu.open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [shareMenu]);

  const checkBalanceAndProceed = async (action, costEndpoint, loadingSetter, actionCost = null) => {
    try {
      loadingSetter(true);
      if (user && user.is_admin) {
        await action();
        return;
      }
      const authToken = localStorage.getItem('authToken');
      const authHeaders = {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
      };
      let cost = actionCost;
      if (cost === null && costEndpoint) {
        const costResponse = await fetch(`${API_BASE_URL}${costEndpoint}`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders,
          body: JSON.stringify({ rawNotes, improvedNotes, specialty: specialty || "" })
        });
        if (!costResponse.ok) {
          const errorData = await costResponse.json();
          throw new Error(errorData.error || `Erro ao obter custo: ${costResponse.status}`);
        }
        const costData = await costResponse.json();
        cost = costData.cost;
      }
      const balanceResponse = await fetch(`${API_BASE_URL}/billing/balance`, {
        credentials: 'include',
        headers: authHeaders,
      });
      if (!balanceResponse.ok) {
        const errorData = await balanceResponse.json();
        throw new Error(errorData.error || `Erro ao obter saldo: ${balanceResponse.status}`);
      }
      const balanceData = await balanceResponse.json();
      const balance = balanceData.balance;
      if (cost === null || balance === 'infinito' || parseFloat(balance) >= parseFloat(cost)) {
        await action();
      } else {
        addNotification(t('insufficientBalance', { cost, balance }), 'error');
      }
    } catch (error) {
      addNotification(`${t('error')}: ${error.message}`, 'error');
    } finally {
      loadingSetter(false);
    }
  };

  // Core draft generation - accepts explicit text to avoid setState race conditions
  const handleDraftWithText = useCallback(async (textToSend, currentEditsForContext = null) => {
    if (!textToSend || !textToSend.trim()) {
      addNotification(t('fillNotesToImprove'), 'warning');
      return;
    }

    const isRegeneration = isImproved;
    const previousResponse = isRegeneration ? improvedNotes : null;

    // Clear summary on new improvement
    setSummary('');
    setOriginalSummary('');

    await checkBalanceAndProceed(
      async () => {
        try {
          const payload = {
            specialty: specialty || "",
            is_first_consultation: isFirstConsultation,
            rawNotes: textToSend,
            ...(selectedPatient?.id && { patientId: selectedPatient.id }),
            isRegeneration,
            previousResponse,
            // If redoing with edits, include them as context
            ...(currentEditsForContext && { userEdits: currentEditsForContext })
          };
          const response = await getDraftConsultation(payload);
          const draftContent = typeof response === 'string' ? response : response?.draftNotes;
          if (typeof draftContent !== 'string') {
            throw new Error(t('invalidDraftResponse'));
          }

          // On first improvement, save the original raw text
          if (!isImproved) {
            setOriginalRawNotes(rawNotes);
          }

          // Store original AI response for DPO pair creation on save
          setOriginalImprovedNotes(draftContent);
          setImprovedNotes(draftContent);
          // Replace content in the same editor
          setRawNotes(draftContent);
          setIsImproved(true);

          if (isRegeneration) {
            setRegenerationCountImproved(prev => prev + 1);
          }

          setFirstEditTimestamp(null);
          setEditStartTimestamp(Date.now());

          addNotification(t('draftSuccess'), 'success');
        } catch (error) {
          addNotification(`${t('errorGeneratingDraft')}: ${error.message}`, 'error');
        }
      },
      '/consultations/draft/cost',
      setLoadingDraft
    );
  }, [rawNotes, specialty, isFirstConsultation, improvedNotes, isImproved, selectedPatient, addNotification, t]);

  const handleDraft = useCallback(async () => {
    // When in improved mode, send the original raw notes for re-improvement
    const textToSend = isImproved ? originalRawNotes : rawNotes;
    await handleDraftWithText(textToSend);
  }, [isImproved, originalRawNotes, rawNotes, handleDraftWithText]);

  const handleSummary = useCallback(async () => {
    if (!improvedNotes) {
      addNotification(t('generateImprovedNotesBeforeSummary'), 'warning');
      return;
    }

    // Track if this is a regeneration (there was already a summary)
    const isRegeneration = summary.trim() !== '';
    const previousResponse = isRegeneration ? summary : null;

    await checkBalanceAndProceed(
      async () => {
        try {
          const response = await getSummary(improvedNotes, {
            isRegeneration,
            previousResponse
          });

          // Store original AI response for DPO pair creation on save
          setOriginalSummary(response.summary);
          setSummary(response.summary);

          // Track regeneration count
          if (isRegeneration) {
            setRegenerationCountSummary(prev => prev + 1);
          }

          addNotification(t('summarySuccess'), 'success');
        } catch (error) {
          addNotification(`${t('errorGeneratingSummary')}: ${error.message}`, 'error');
        }
      },
      '/consultations/summary/cost',
      setLoadingSummary
    );
  }, [improvedNotes, summary, addNotification, t]);

  // === Undo/Redo Improvement Handlers ===
  const handleUndoImprovement = useCallback(() => {
    if (!isImproved || !originalRawNotes) return;
    setRawNotes(originalRawNotes);
    setImprovedNotes('');
    setIsImproved(false);
    setSummary('');
    setOriginalSummary('');
    setOriginalImprovedNotes('');
    setFirstEditTimestamp(null);
    setEditStartTimestamp(null);
    setIsRedoDropdownOpen(false);
    addNotification(t('improvementUndone'), 'info');
  }, [isImproved, originalRawNotes, addNotification, t]);

  const handleRedoWithEdits = useCallback(async () => {
    setIsRedoDropdownOpen(false);
    // Send the current editor content (which may have user edits) as context
    // but use original raw notes as the base for improvement
    await handleDraftWithText(originalRawNotes, rawNotes);
  }, [originalRawNotes, rawNotes, handleDraftWithText]);

  const handleRedoFromOriginal = useCallback(async () => {
    setIsRedoDropdownOpen(false);
    await handleDraftWithText(originalRawNotes);
  }, [originalRawNotes, handleDraftWithText]);

  // Close redo dropdown on outside click
  useEffect(() => {
    if (!isRedoDropdownOpen) return;
    const handleClickOutside = (event) => {
      if (redoDropdownRef.current && !redoDropdownRef.current.contains(event.target)) {
        setIsRedoDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRedoDropdownOpen]);

  // Reset save confirmation when notes get enhanced
  useEffect(() => {
    if (improvedNotes) {
      setConfirmSaveWithoutEnhance(false);
    }
  }, [improvedNotes]);

  const handleSave = async () => {
    if (!specialty || !rawNotes) {
      addNotification(t('specialtyAndRawNotesRequired'), 'warning');
      return;
    }
    if (!improvedNotes) {
      if (!confirmSaveWithoutEnhance) {
        addNotification(t('improvedNotesRecommended'), 'warning');
        setConfirmSaveWithoutEnhance(true);
        return;
      }
      setConfirmSaveWithoutEnhance(false);
    }

    // Calculate engagement metrics
    const now = Date.now();
    const timeToFirstEditMs = firstEditTimestamp && editStartTimestamp
      ? firstEditTimestamp - editStartTimestamp
      : null;
    const totalEditTimeMs = editStartTimestamp ? now - editStartTimestamp : null;

    // Get duration from timer before stopping
    const durationMinutes = timer.isRunning ? timer.durationMinutes : null;

    await checkBalanceAndProceed(
      async () => {
        try {
          // Map fields correctly: rawNotes = doctor's original, improvedNotes = AI-improved (possibly edited)
          const saveRawNotes = isImproved ? originalRawNotes : rawNotes;
          const saveImprovedNotes = isImproved ? rawNotes : '';

          const payload = {
            specialty,
            is_first_consultation: isFirstConsultation,
            rawNotes: saveRawNotes,
            improvedNotes: saveImprovedNotes,
            summary,
            patient_id: selectedPatient?.id || null,
            // DPO: Original AI-generated content for preference pair creation
            originalImprovedNotes: originalImprovedNotes || null,
            originalSummary: originalSummary || null,
            // Engagement metrics for training data quality
            regenerationCountImproved,
            regenerationCountSummary,
            timeToFirstEditMs,
            totalEditTimeMs,
            // Consultation duration in minutes
            durationMinutes
          };
          const response = await createConsultation(payload);

          // Prepare cleanup function to run after patient update modal interaction (or immediately if no updates)
          const cleanupAfterSave = () => {
            addNotification(t('consultationSavedSuccess'), 'success');
            if (specialty && (isFirstConsultation !== null)) {
              const consultationTypeKey = isFirstConsultation ? 'first' : 'return';
              localStorageService.removeItem(`qythonAutosave_consultation_${specialty}_${consultationTypeKey}`);
              localStorageService.removeItem(`qythonAutosave_consultation_improved_${specialty}_${consultationTypeKey}`);
              localStorageService.removeItem(`qythonAutosave_consultation_summary_${specialty}_${consultationTypeKey}`);
            }
            setSpecialty('');
            setIsFirstConsultation(true);
            setRawNotes('');
            setImprovedNotes('');
            setSummary('');
            setSelectedPatient(null);
            setTemplateLoadReason('initial');
            setOriginalRawNotes('');
            setIsImproved(false);
            setIsRedoDropdownOpen(false);
            setOriginalImprovedNotes('');
            setOriginalSummary('');
            setRegenerationCountImproved(0);
            setRegenerationCountSummary(0);
            setFirstEditTimestamp(null);
            setEditStartTimestamp(null);
            timer.reset();
            pendingSaveCleanupRef.current = null;
          };

          // Extract patient updates — await result before clearing form
          if (selectedPatient?.id && response?.id) {
            const ctx = {
              patientId: selectedPatient.id,
              consultationId: response.id,
              notes: saveImprovedNotes || saveRawNotes,
              summary: summary || '',
            };
            setPatientUpdateContext(ctx);
            setExtractingPatientUpdates(true);

            try {
              const result = await extractPatientUpdates(ctx.patientId, {
                consultationId: ctx.consultationId,
                notes: ctx.notes,
                summary: ctx.summary,
              });
              if (result?.has_changes && result.changes?.length > 0) {
                // Store cleanup for after modal interaction
                pendingSaveCleanupRef.current = cleanupAfterSave;
                setPatientUpdateChanges(result.changes);
                setShowPatientUpdateModal(true);
                setExtractingPatientUpdates(false);
                return; // Don't cleanup yet — wait for modal
              }
            } catch {
              // Extraction failed — proceed with normal cleanup
            }
            setExtractingPatientUpdates(false);
          }

          // No patient updates or no patient — cleanup immediately
          cleanupAfterSave();
        } catch (error) {
          addNotification(`${t('errorSavingConsultation')}: ${error.message}`, 'error');
        }
      },
      '/consultations/save/cost',
      setLoadingSave,
      null
    );
  };

  const finishPatientUpdateModal = () => {
    setShowPatientUpdateModal(false);
    setPatientUpdateChanges(null);
    setPatientUpdateContext(null);
    if (pendingSaveCleanupRef.current) {
      pendingSaveCleanupRef.current();
    }
  };

  const handleApplyPatientUpdates = async (accepted, rejected) => {
    if (!patientUpdateContext || accepted.length === 0) {
      finishPatientUpdateModal();
      return;
    }
    try {
      await applyPatientUpdates(patientUpdateContext.patientId, {
        consultationId: patientUpdateContext.consultationId,
        accepted_changes: accepted,
        rejected_changes: rejected,
      });
      addNotification(t('patientInfoUpdated', 'Cadastro do paciente atualizado!'), 'success');
    } catch {
      // Silent fail — patient update is optional enhancement
    }
    finishPatientUpdateModal();
  };

  const handleRawNotesChange = (content) => {
    setRawNotes(content);
    if (isImproved) {
      // In improved mode, editing the editor updates improvedNotes
      setImprovedNotes(content);
      // Track first edit timestamp for DPO engagement metrics
      if (!firstEditTimestamp && originalImprovedNotes && content !== originalImprovedNotes) {
        setFirstEditTimestamp(Date.now());
      }
    } else {
      // In raw mode, editing clears AI content as before
      setImprovedNotes('');
      setSummary('');
    }
  };

  const handleSummaryChange = (content) => {
    setSummary(content);
  };

  const handleRawNotesRestore = useCallback(() => {
    // When restoring raw notes, also restore improved notes and summary if they exist
    const consultationType = isFirstConsultation ? 'first' : 'return';
    const rawKey = `qythonAutosave_consultation_${specialty}_${consultationType}`;
    const improvedKey = `qythonAutosave_consultation_improved_${specialty}_${consultationType}`;
    const summaryKey = `qythonAutosave_consultation_summary_${specialty}_${consultationType}`;

    const savedRaw = localStorageService.getItem(rawKey);
    const savedImproved = localStorageService.getItem(improvedKey);
    const savedSummary = localStorageService.getItem(summaryKey);

    if (savedImproved && savedImproved.trim()) {
      // Had improved notes - restore in improved mode
      setOriginalRawNotes(savedRaw || '');
      setRawNotes(savedImproved); // Show improved in the main editor
      setImprovedNotes(savedImproved);
      setIsImproved(true);
      console.log(`[Autosave] Restored improved notes in single-editor mode from ${improvedKey}`);
    } else {
      setImprovedNotes('');
      setIsImproved(false);
    }

    if (savedSummary && savedSummary.trim()) {
      setSummary(savedSummary);
      console.log(`[Autosave] Restored summary from ${summaryKey}`);
    } else {
      setSummary('');
    }

    addNotification(t('consultationRestored', 'Consulta restaurada com sucesso'), 'success');
  }, [addNotification, t, specialty, isFirstConsultation]);

  const editorKeyBase = `${specialty}-${isFirstConsultation ? 'first' : 'return'}`;
  const rawNotesPlaceholder = specialty ? t('anamnesisPlaceholder') : t('anamnesisPlaceholderNoSpecialty');

  const handlePatientSelect = (patient) => {
    setSelectedPatient(patient);
    setIsPatientPickerOpen(false);
  };

  const handleClearPatient = () => {
    setSelectedPatient(null);
  };

  // Patient editing functions
  const startEditingPatient = () => {
    setPatientEditForm({
      full_name: selectedPatient.full_name || '',
      birth_date: selectedPatient.birth_date ? selectedPatient.birth_date.split('T')[0] : '',
      gender: selectedPatient.gender || '',
      phone: selectedPatient.phone || '',
      email: selectedPatient.email || '',
      document_id: selectedPatient.document_id || '',
      address: selectedPatient.address || '',
      allergies: [...(selectedPatient.allergies || [])],
      chronic_conditions: [...(selectedPatient.chronic_conditions || [])],
      current_medications: [...(selectedPatient.current_medications || [])],
      notes: selectedPatient.notes || '',
    });
    setIsEditingPatient(true);
  };

  const cancelEditingPatient = () => {
    setIsEditingPatient(false);
    setPatientEditForm({});
    setNewAllergyInput('');
    setNewConditionInput('');
    setNewMedicationInput('');
  };

  const handlePatientFormChange = (field, value) => {
    setPatientEditForm(prev => ({ ...prev, [field]: value }));
  };

  const addItemToList = (field, inputValue, setInputValue) => {
    if (!inputValue.trim()) return;
    setPatientEditForm(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), inputValue.trim()]
    }));
    setInputValue('');
  };

  const removeItemFromList = (field, index) => {
    setPatientEditForm(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  };

  const handleSavePatient = async () => {
    if (!selectedPatient?.id) return;

    setIsSavingPatient(true);
    try {
      const updatedPatient = await updatePatient(selectedPatient.id, patientEditForm);
      setSelectedPatient(updatedPatient);
      setIsEditingPatient(false);
      setPatientEditForm({});
      addNotification(t('patientSavedSuccess'), 'success');
    } catch (error) {
      console.error('Error saving patient:', error);
      const errorMsg = error?.response?.data?.detail || error?.message || t('errorSavingPatient');
      addNotification(errorMsg, 'error');
    } finally {
      setIsSavingPatient(false);
    }
  };

  return (
    <div className={styles.formSectionCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>
          <FontAwesomeIcon
            icon={faStethoscope}
            style={{
              marginRight: '12px',
              color: 'var(--accent-color)',
              filter: 'drop-shadow(0 0 8px rgba(var(--accent-color-rgb), 0.5))'
            }}
          />
          {t('newConsultation')}
        </h3>
        <ConsultationTimer
          formattedTime={timer.formattedTime}
          isRunning={timer.isRunning}
          isPaused={timer.isPaused}
          statusColor={timer.statusColor}
          onPause={timer.pause}
          onResume={timer.resume}
        />
      </div>

      {/* Patient Selector - Before Specialty */}
      <label htmlFor="patient-select-btn" className={styles.formLabel}>{t('patient')}</label>
      <div className={styles.patientSelectorRow}>
        {selectedPatient ? (
          <div className={styles.selectedPatientCard}>
            <div className={styles.patientInfo}>
              <span className={styles.patientName}>{selectedPatient.full_name}</span>
              {selectedPatient.birth_date && (
                <span className={styles.patientMeta}>
                  {new Date(selectedPatient.birth_date).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className={styles.patientCardActions}>
              <button
                type="button"
                className={styles.patientInfoBtn}
                onClick={() => setIsPatientDetailsOpen(true)}
                title={t('viewPatientDetails')}
              >
                <FontAwesomeIcon icon={faInfoCircle} />
              </button>
              <button
                type="button"
                className={styles.historyBtn}
                onClick={() => setIsHistoryModalOpen(true)}
                title={t('history')}
              >
                <FontAwesomeIcon icon={faHistory} />
                <span>{t('history')}</span>
              </button>
              <button
                type="button"
                id="patient-select-btn"
                className={styles.clearPatientBtn}
                onClick={handleClearPatient}
                title={t('clearPatient')}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            id="patient-select-btn"
            className={styles.selectPatientBtn}
            onClick={() => setIsPatientPickerOpen(true)}
          >
            <FontAwesomeIcon icon={faUserPlus} />
            <span>{t('selectOrCreatePatient')}</span>
          </button>
        )}
      </div>

      <label htmlFor="specialty" className={styles.formLabel}>{t('specialty')}</label>
      <SpecialtyDropdown
        id="specialty"
        dataTour="specialty-select"
        value={specialty}
        onChange={(newSpecialty) => {
          if (newSpecialty !== specialty) {
            setSpecialty(newSpecialty);
            setTemplateLoadReason('specialtyChange');
            // Start timer when specialty is selected
            if (newSpecialty && !timer.isRunning) {
              timer.start();
            }
          } else if (!newSpecialty) {
            setSpecialty('');
            setTemplateLoadReason('specialtyChange');
          }
        }}
      />

      <label htmlFor="consultation-type-first" className={styles.formLabel}>{t('consultationType')}</label>
      <div className={styles.formRadioGroup}>
        <label className={styles.formRadioLabel}>
          <input type="radio" id="consultation-type-first" name="consultationType" value="first" checked={isFirstConsultation === true} onChange={() => {
            if (isFirstConsultation !== true) {
              setIsFirstConsultation(true);
              setTemplateLoadReason('typeChange');
            }
          }} className={styles.formRadioInput} />
          <span className={styles.formRadioCustom}></span>
          {t('firstConsultation')}
        </label>
        <label className={styles.formRadioLabel}>
          <input type="radio" name="consultationType" value="return" checked={isFirstConsultation === false} onChange={() => {
            if (isFirstConsultation !== false) {
              setIsFirstConsultation(false);
              setTemplateLoadReason('typeChange');
            }
          }} className={styles.formRadioInput} />
          <span className={styles.formRadioCustom}></span>
          {t('returnConsultation')}
        </label>
      </div>

      {/* === SINGLE PRIMARY EDITOR === */}
      <div className={styles.formLabelRow}>
        <label className={styles.formLabel}>
          {isImproved ? t('anamnesisImproved') : t('anamnesisNotesOriginal')}
        </label>
        {!isImproved && (
          <VoiceRecorder
            onTranscription={(text) => setRawNotes(prev => prev + ' ' + text)}
            language={i18n.language || 'pt-BR'}
            disabled={loadingDraft}
          />
        )}
      </div>
      {!isImproved && (
        <QuickInsertBar
          onInsert={(text) => setRawNotes(prev => prev + '\n\n' + text)}
          specialty={specialty}
          disabled={loadingDraft}
        />
      )}
      <div data-tour="editor-area">
        <QythonTipTapEditor
          key={`main-${editorKeyBase}-${isImproved ? 'improved' : 'raw'}`}
          value={rawNotes}
          onChange={handleRawNotesChange}
          placeholder={rawNotesPlaceholder}
          height={isImproved ? 400 : 300}
          specialty={specialty || "general"}
          consultationType={isFirstConsultation ? 'first' : 'return'}
          autosavePrefix={isImproved ? "consultation_improved" : "consultation"}
          enableAutosaveRestore={!isImproved && autosaveEnabled}
          onRestore={handleRawNotesRestore}
        />
      </div>

      {/* ACTION BAR - contextual based on improvement state */}
      <div className={styles.contentActions}>
        <button onClick={() => handleCopy(rawNotes, 'main')} title={t('copy')}>
          {actionSuccess.target === 'main' && actionSuccess.type === 'copy' ? <FontAwesomeIcon icon={faCheck} className={styles.successIcon} /> : <FontAwesomeIcon icon={faCopy} />}
        </button>

        {isImproved && (
          <>
            <button onClick={() => handleLike(improvedNotes, 'improved_notes')} title={t('like')}>
              <FontAwesomeIcon icon={faThumbsUp} />
            </button>
            <button onClick={() => openFeedbackModal('dislike', improvedNotes, 'improved_notes')} title={t('dislike')}>
              <FontAwesomeIcon icon={faThumbsDown} />
            </button>
            <button onClick={handleUndoImprovement} title={t('undoImprovement')}>
              <FontAwesomeIcon icon={faRotateLeft} />
            </button>
            <div className={styles.redoDropdownContainer} ref={redoDropdownRef}>
              <button onClick={() => setIsRedoDropdownOpen(!isRedoDropdownOpen)} title={t('redoImprovement')}>
                <FontAwesomeIcon icon={faArrowRotateRight} />
              </button>
              {isRedoDropdownOpen && (
                <div className={styles.redoDropdown}>
                  <button onClick={handleRedoWithEdits} className={styles.redoOption}>
                    {t('redoWithEdits')}
                  </button>
                  <button onClick={handleRedoFromOriginal} className={styles.redoOption}>
                    {t('redoFromOriginal')}
                  </button>
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button onClick={(e) => handleShareClick(e, 'improved')} title={t('share')} data-share-button>
                {actionSuccess.target === 'improved' && actionSuccess.type === 'share' ? <FontAwesomeIcon icon={faCheck} className={styles.successIcon} /> : <FontAwesomeIcon icon={faShareNodes} />}
              </button>
              <div ref={shareMenuRef} className={`${styles.shareMenu} ${shareMenu.open && shareMenu.target === 'improved' ? styles.shareMenuOpen : ''}`}>
                <button
                  className={styles.shareMenuItem}
                  onClick={() => handleShareAction(() => handleShareAsTxt(improvedNotes, t('improvedConsultation'), t, addNotification), 'improved')}
                  title={t('shareAsTxtTooltip')}
                >
                  <FontAwesomeIcon icon={faFileLines} /> {t('shareAsTxtLabel')}
                </button>
                <button
                  className={styles.shareMenuItem}
                  onClick={() => handleShareAction(() => handleShareAsPdf(improvedNotes, addNotification, i18n), 'improved')}
                  title={t('shareAsPdfTooltip')}
                >
                  <FontAwesomeIcon icon={faFilePdf} /> {t('shareAsPdfLabel')}
                </button>
                <button
                  className={styles.shareMenuItem}
                  onClick={() => handleShareAction(() => handleShareAsMarkdown(improvedNotes, t('improvedConsultation'), t, addNotification), 'improved')}
                  title={t('shareAsMdTooltip')}
                >
                  <FontAwesomeIcon icon={faFileCode} /> {t('shareAsMdLabel')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* PRIMARY ACTION BUTTON - changes based on state */}
      <div className={styles.formActionsContainer}>
        {!isImproved ? (
          <button
            onClick={handleDraft}
            className={styles.formStyledButtonPrimary}
            disabled={!isVerified || loadingDraft || !rawNotes.trim()}
            title={!isVerified ? "Aguarde a verificação da conta" : ""}
            data-tour="improve-button"
          >
            {loadingDraft ? t('improving') : t('improveConsultation')}
          </button>
        ) : (
          <button
            onClick={handleSummary}
            className={styles.formStyledButtonPrimary}
            disabled={!isVerified || loadingSummary || !improvedNotes.trim() || !!summary}
            title={!isVerified ? "Aguarde a verificação da conta" : ""}
          >
            {loadingSummary ? t('generatingSummary') : t('generateCaseSummary')}
          </button>
        )}
      </div>

      {/* === SUMMARY EDITOR - appears when generated === */}
      {summary && (
        <>
          <label className={styles.formLabel}>{t('caseSummary')}</label>
          <QythonTipTapEditor
            key={`summary-${editorKeyBase}`}
            value={summary}
            onChange={handleSummaryChange}
            placeholder={t('caseSummaryPlaceholder')}
            height={200}
            specialty={specialty || "general"}
            consultationType={isFirstConsultation ? 'first' : 'return'}
            autosavePrefix="consultation_summary"
            enableAutosaveRestore={false}
          />
          <div className={styles.contentActions}>
            <button onClick={() => handleLike(summary, 'summary')} title={t('like')}><FontAwesomeIcon icon={faThumbsUp} /></button>
            <button onClick={() => openFeedbackModal('dislike', summary, 'summary')} title={t('dislike')}><FontAwesomeIcon icon={faThumbsDown} /></button>
            <button onClick={() => handleCopy(summary, 'summary')} title={t('copy')}>
              {actionSuccess.target === 'summary' && actionSuccess.type === 'copy' ? <FontAwesomeIcon icon={faCheck} className={styles.successIcon} /> : <FontAwesomeIcon icon={faCopy} />}
            </button>
            <button onClick={handleSummary} title={t('redoResponse')}><FontAwesomeIcon icon={faArrowRotateRight} /></button>
            <div style={{ position: 'relative' }}>
              <button onClick={(e) => handleShareClick(e, 'summary')} title={t('share')} data-share-button>
                {actionSuccess.target === 'summary' && actionSuccess.type === 'share' ? <FontAwesomeIcon icon={faCheck} className={styles.successIcon} /> : <FontAwesomeIcon icon={faShareNodes} />}
              </button>
              <div ref={shareMenuRef} className={`${styles.shareMenu} ${shareMenu.open && shareMenu.target === 'summary' ? styles.shareMenuOpen : ''}`}>
                <button className={styles.shareMenuItem} onClick={() => handleShareAction(() => handleShareAsTxt(summary, t('caseSummary'), t, addNotification), 'summary')}>
                  <FontAwesomeIcon icon={faFileLines} /> {t('shareAsTxt')}
                </button>
                <button className={styles.shareMenuItem} onClick={() => handleShareAction(() => handleShareAsPdf(summary, addNotification, i18n), 'summary')}>
                  <FontAwesomeIcon icon={faFilePdf} /> {t('shareAsPdf')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* SAVE BUTTON */}
      <div className={styles.formActionsContainer}>
        <button
          onClick={handleSave}
          className={`${styles.formStyledButtonSave} ${confirmSaveWithoutEnhance ? styles.confirmSaveWarning : ''}`}
          disabled={loadingSave || extractingPatientUpdates || !rawNotes.trim() || !specialty}
        >
          {loadingSave ? t('saving') : extractingPatientUpdates ? t('analyzingPatientUpdates', 'Analisando cadastro...') : confirmSaveWithoutEnhance ? t('confirmSaveWithoutEnhance') : t('saveConsultation')}
        </button>
      </div>
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        onSubmit={handleFeedbackSubmit}
      />

      {/* Patient Picker Modal */}
      <PatientPickerModal
        isOpen={isPatientPickerOpen}
        onClose={() => setIsPatientPickerOpen(false)}
        onSelect={handlePatientSelect}
      />

      {/* Patient History Modal */}
      <PatientHistoryPanel
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        patient={selectedPatient}
        onHistoryUpdated={() => {
          // Optionally refresh patient data when history is updated
        }}
      />

      {/* Patient Details Modal */}
      {isPatientDetailsOpen && selectedPatient && (
        <div className={styles.patientDetailsOverlay} onClick={() => { if (!isEditingPatient) setIsPatientDetailsOpen(false); }}>
          <div className={`${styles.patientDetailsModal} ${isEditingPatient ? styles.patientDetailsModalEditing : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.patientDetailsHeader}>
              <h3>{isEditingPatient ? t('editPatient') : selectedPatient.full_name}</h3>
              <div className={styles.patientDetailsHeaderActions}>
                {!isEditingPatient && (
                  <button
                    type="button"
                    className={styles.patientDetailsEditBtn}
                    onClick={startEditingPatient}
                    title={t('editPatient')}
                  >
                    <FontAwesomeIcon icon={faPen} />
                  </button>
                )}
                <button
                  type="button"
                  className={styles.patientDetailsCloseBtn}
                  onClick={() => { cancelEditingPatient(); setIsPatientDetailsOpen(false); }}
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            </div>
            <div className={styles.patientDetailsContent}>
              {isEditingPatient ? (
                /* Edit Mode */
                <div className={styles.patientEditForm}>
                  {/* Basic Info Section */}
                  <div className={styles.patientEditSection}>
                    <h4 className={styles.patientEditSectionTitle}>{t('basicInfo')}</h4>

                    <div className={styles.patientEditField}>
                      <label>{t('fullName')}</label>
                      <input
                        type="text"
                        value={patientEditForm.full_name || ''}
                        onChange={(e) => handlePatientFormChange('full_name', e.target.value)}
                        className={styles.patientEditInput}
                      />
                    </div>

                    <div className={styles.patientEditRow}>
                      <div className={styles.patientEditField}>
                        <label>{t('birthDate')}</label>
                        <input
                          type="date"
                          value={patientEditForm.birth_date || ''}
                          onChange={(e) => handlePatientFormChange('birth_date', e.target.value)}
                          className={styles.patientEditInput}
                        />
                      </div>

                      <div className={styles.patientEditField}>
                        <label>{t('sex')}</label>
                        <select
                          value={patientEditForm.gender || ''}
                          onChange={(e) => handlePatientFormChange('gender', e.target.value)}
                          className={styles.patientEditInput}
                        >
                          <option value="">{t('select')}</option>
                          <option value="male">{t('male')}</option>
                          <option value="female">{t('female')}</option>
                          <option value="other">{t('other')}</option>
                        </select>
                      </div>
                    </div>

                    <div className={styles.patientEditRow}>
                      <div className={styles.patientEditField}>
                        <label>{t('phone')}</label>
                        <div className={styles.patientEditInputWithIcon}>
                          <FontAwesomeIcon icon={faPhone} className={styles.patientEditInputIcon} />
                          <input
                            type="tel"
                            value={patientEditForm.phone || ''}
                            onChange={(e) => handlePatientFormChange('phone', e.target.value)}
                            className={styles.patientEditInput}
                          />
                        </div>
                      </div>

                      <div className={styles.patientEditField}>
                        <label>{t('email')}</label>
                        <div className={styles.patientEditInputWithIcon}>
                          <FontAwesomeIcon icon={faEnvelope} className={styles.patientEditInputIcon} />
                          <input
                            type="email"
                            value={patientEditForm.email || ''}
                            onChange={(e) => handlePatientFormChange('email', e.target.value)}
                            className={styles.patientEditInput}
                          />
                        </div>
                      </div>
                    </div>

                    <div className={styles.patientEditField}>
                      <label>{t('documentId')}</label>
                      <div className={styles.patientEditInputWithIcon}>
                        <FontAwesomeIcon icon={faIdCard} className={styles.patientEditInputIcon} />
                        <input
                          type="text"
                          value={patientEditForm.document_id || ''}
                          onChange={(e) => handlePatientFormChange('document_id', e.target.value)}
                          className={styles.patientEditInput}
                          placeholder={t('documentIdPlaceholder')}
                        />
                      </div>
                    </div>

                    <div className={styles.patientEditField}>
                      <label>{t('address')}</label>
                      <div className={styles.patientEditInputWithIcon}>
                        <FontAwesomeIcon icon={faMapMarkerAlt} className={styles.patientEditInputIcon} />
                        <input
                          type="text"
                          value={patientEditForm.address || ''}
                          onChange={(e) => handlePatientFormChange('address', e.target.value)}
                          className={styles.patientEditInput}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Clinical Info Section */}
                  <div className={styles.patientEditSection}>
                    <h4 className={styles.patientEditSectionTitle}>{t('clinicalInfo')}</h4>

                    {/* Allergies */}
                    <div className={styles.patientEditField}>
                      <label>
                        <FontAwesomeIcon icon={faAllergies} className={styles.patientClinicalIconDanger} style={{ marginRight: '8px' }} />
                        {t('allergies')}
                      </label>
                      {patientEditForm.allergies?.length > 0 && (
                        <div className={styles.patientEditTagsContainer}>
                          {patientEditForm.allergies.map((allergy, idx) => (
                            <span key={idx} className={styles.tagDangerEditable}>
                              {allergy}
                              <button type="button" onClick={() => removeItemFromList('allergies', idx)} className={styles.tagRemoveBtn}>
                                <FontAwesomeIcon icon={faTimes} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className={styles.patientEditAddItem}>
                        <input
                          type="text"
                          value={newAllergyInput}
                          onChange={(e) => setNewAllergyInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItemToList('allergies', newAllergyInput, setNewAllergyInput))}
                          placeholder={t('addAllergy')}
                          className={styles.patientEditInput}
                        />
                        <button
                          type="button"
                          onClick={() => addItemToList('allergies', newAllergyInput, setNewAllergyInput)}
                          className={styles.patientEditAddBtn}
                        >
                          <FontAwesomeIcon icon={faPlus} />
                        </button>
                      </div>
                    </div>

                    {/* Chronic Conditions */}
                    <div className={styles.patientEditField}>
                      <label>
                        <FontAwesomeIcon icon={faHeartPulse} className={styles.patientClinicalIconWarning} style={{ marginRight: '8px' }} />
                        {t('chronicConditions')}
                      </label>
                      {patientEditForm.chronic_conditions?.length > 0 && (
                        <div className={styles.patientEditTagsContainer}>
                          {patientEditForm.chronic_conditions.map((condition, idx) => (
                            <span key={idx} className={styles.tagWarningEditable}>
                              {condition}
                              <button type="button" onClick={() => removeItemFromList('chronic_conditions', idx)} className={styles.tagRemoveBtn}>
                                <FontAwesomeIcon icon={faTimes} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className={styles.patientEditAddItem}>
                        <input
                          type="text"
                          value={newConditionInput}
                          onChange={(e) => setNewConditionInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItemToList('chronic_conditions', newConditionInput, setNewConditionInput))}
                          placeholder={t('addCondition')}
                          className={styles.patientEditInput}
                        />
                        <button
                          type="button"
                          onClick={() => addItemToList('chronic_conditions', newConditionInput, setNewConditionInput)}
                          className={styles.patientEditAddBtn}
                        >
                          <FontAwesomeIcon icon={faPlus} />
                        </button>
                      </div>
                    </div>

                    {/* Current Medications */}
                    <div className={styles.patientEditField}>
                      <label>
                        <FontAwesomeIcon icon={faPills} className={styles.patientClinicalIconInfo} style={{ marginRight: '8px' }} />
                        {t('currentMedications')}
                      </label>
                      {patientEditForm.current_medications?.length > 0 && (
                        <div className={styles.patientEditTagsContainer}>
                          {patientEditForm.current_medications.map((med, idx) => (
                            <span key={idx} className={styles.tagInfoEditable}>
                              {med}
                              <button type="button" onClick={() => removeItemFromList('current_medications', idx)} className={styles.tagRemoveBtn}>
                                <FontAwesomeIcon icon={faTimes} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className={styles.patientEditAddItem}>
                        <input
                          type="text"
                          value={newMedicationInput}
                          onChange={(e) => setNewMedicationInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItemToList('current_medications', newMedicationInput, setNewMedicationInput))}
                          placeholder={t('addMedicationPlaceholder')}
                          className={styles.patientEditInput}
                        />
                        <button
                          type="button"
                          onClick={() => addItemToList('current_medications', newMedicationInput, setNewMedicationInput)}
                          className={styles.patientEditAddBtn}
                        >
                          <FontAwesomeIcon icon={faPlus} />
                        </button>
                      </div>
                    </div>

                    {/* Notes */}
                    <div className={styles.patientEditField}>
                      <label>{t('notes')}</label>
                      <textarea
                        value={patientEditForm.notes || ''}
                        onChange={(e) => handlePatientFormChange('notes', e.target.value)}
                        className={styles.patientEditTextarea}
                        rows={3}
                        placeholder={t('patientNotesPlaceholder')}
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className={styles.patientEditActions}>
                    <button
                      type="button"
                      onClick={cancelEditingPatient}
                      className={styles.patientEditCancelBtn}
                      disabled={isSavingPatient}
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePatient}
                      className={styles.patientEditSaveBtn}
                      disabled={isSavingPatient}
                    >
                      {isSavingPatient ? (
                        <span className={styles.savingSpinner}></span>
                      ) : (
                        <>
                          <FontAwesomeIcon icon={faSave} />
                          {t('saveChanges')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <>
                  {/* Basic Info */}
                  <div className={styles.patientDetailsSection}>
                    <div className={styles.patientDetailItem}>
                      <FontAwesomeIcon icon={faCalendarDays} className={styles.patientDetailIcon} />
                      <div>
                        <span className={styles.patientDetailLabel}>{t('birthDate')}</span>
                        <span className={styles.patientDetailValue}>
                          {selectedPatient.birth_date
                            ? new Date(selectedPatient.birth_date).toLocaleDateString()
                            : t('notInformed')}
                        </span>
                      </div>
                    </div>
                    {(selectedPatient.gender || selectedPatient.sex) && (
                      <div className={styles.patientDetailItem}>
                        <FontAwesomeIcon icon={faVenusMars} className={styles.patientDetailIcon} />
                        <div>
                          <span className={styles.patientDetailLabel}>{t('sex')}</span>
                          <span className={styles.patientDetailValue}>
                            {(() => {
                              const gender = selectedPatient.gender || selectedPatient.sex;
                              if (gender === 'male' || gender === 'M') return t('male');
                              if (gender === 'female' || gender === 'F') return t('female');
                              return gender;
                            })()}
                          </span>
                        </div>
                      </div>
                    )}
                    {(selectedPatient.document_id || selectedPatient.cpf) && (
                      <div className={styles.patientDetailItem}>
                        <FontAwesomeIcon icon={faIdCard} className={styles.patientDetailIcon} />
                        <div>
                          <span className={styles.patientDetailLabel}>{t('documentId')}</span>
                          <span className={styles.patientDetailValue}>{selectedPatient.document_id || selectedPatient.cpf}</span>
                        </div>
                      </div>
                    )}
                    {selectedPatient.phone && (
                      <div className={styles.patientDetailItem}>
                        <FontAwesomeIcon icon={faPhone} className={styles.patientDetailIcon} />
                        <div>
                          <span className={styles.patientDetailLabel}>{t('phone')}</span>
                          <span className={styles.patientDetailValue}>{selectedPatient.phone}</span>
                        </div>
                      </div>
                    )}
                    {selectedPatient.email && (
                      <div className={styles.patientDetailItem}>
                        <FontAwesomeIcon icon={faEnvelope} className={styles.patientDetailIcon} />
                        <div>
                          <span className={styles.patientDetailLabel}>{t('email')}</span>
                          <span className={styles.patientDetailValue}>{selectedPatient.email}</span>
                        </div>
                      </div>
                    )}
                    {selectedPatient.address && (
                      <div className={styles.patientDetailItem}>
                        <FontAwesomeIcon icon={faMapMarkerAlt} className={styles.patientDetailIcon} />
                        <div>
                          <span className={styles.patientDetailLabel}>{t('address')}</span>
                          <span className={styles.patientDetailValue}>{selectedPatient.address}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Clinical Info */}
                  <div className={styles.patientDetailsClinical}>
                    {selectedPatient.allergies?.length > 0 && (
                      <div className={styles.patientClinicalItem}>
                        <div className={styles.patientClinicalHeader}>
                          <FontAwesomeIcon icon={faAllergies} className={styles.patientClinicalIconDanger} />
                          <span>{t('allergies')}</span>
                        </div>
                        <div className={styles.patientClinicalTags}>
                          {selectedPatient.allergies.map((allergy, idx) => (
                            <span key={idx} className={styles.tagDanger}>{allergy}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedPatient.chronic_conditions?.length > 0 && (
                      <div className={styles.patientClinicalItem}>
                        <div className={styles.patientClinicalHeader}>
                          <FontAwesomeIcon icon={faHeartPulse} className={styles.patientClinicalIconWarning} />
                          <span>{t('chronicConditions')}</span>
                        </div>
                        <div className={styles.patientClinicalTags}>
                          {selectedPatient.chronic_conditions.map((condition, idx) => (
                            <span key={idx} className={styles.tagWarning}>{condition}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedPatient.current_medications?.length > 0 && (
                      <div className={styles.patientClinicalItem}>
                        <div className={styles.patientClinicalHeader}>
                          <FontAwesomeIcon icon={faPills} className={styles.patientClinicalIconInfo} />
                          <span>{t('currentMedications')}</span>
                        </div>
                        <div className={styles.patientClinicalTags}>
                          {selectedPatient.current_medications.map((med, idx) => (
                            <span key={idx} className={styles.tagInfo}>{med}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedPatient.notes && (
                      <div className={styles.patientClinicalItem}>
                        <div className={styles.patientClinicalHeader}>
                          <span>{t('notes')}</span>
                        </div>
                        <p className={styles.patientNotes}>{selectedPatient.notes}</p>
                      </div>
                    )}

                    {!selectedPatient.allergies?.length &&
                     !selectedPatient.chronic_conditions?.length &&
                     !selectedPatient.current_medications?.length &&
                     !selectedPatient.notes && (
                      <div className={styles.patientNoClinicalData}>
                        <p>{t('noClinicalDataRegistered')}</p>
                        <button
                          type="button"
                          onClick={startEditingPatient}
                          className={styles.patientAddInfoBtn}
                        >
                          <FontAwesomeIcon icon={faPlus} />
                          {t('addClinicalInfo')}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Warning Modal */}
      {navigationBlocker.state === 'blocked' && (
        <div className={styles.unsavedChangesOverlay}>
          <div className={styles.unsavedChangesModal}>
            <h3>{t('unsavedChangesTitle', 'Alterações não salvas')}</h3>
            <p>{t('unsavedChangesMessage', 'Você tem notas aprimoradas ou resumo que ainda não foram salvos. Se sair agora, essas alterações serão perdidas.')}</p>
            <p className={styles.unsavedChangesNote}>
              {t('unsavedChangesAutoSaveNote', 'Nota: Se o auto-save estiver ativado, suas alterações foram salvas temporariamente e estarão disponíveis quando você voltar.')}
            </p>
            <div className={styles.unsavedChangesActions}>
              <button
                onClick={() => navigationBlocker.proceed()}
                className={styles.unsavedChangesLeaveBtn}
              >
                {t('leaveWithoutSaving', 'Sair sem salvar')}
              </button>
              <button
                onClick={() => navigationBlocker.reset()}
                className={styles.unsavedChangesStayBtn}
              >
                {t('stayAndSave', 'Ficar e salvar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPatientUpdateModal && patientUpdateChanges && (
        <PatientUpdateModal
          changes={patientUpdateChanges}
          onApply={handleApplyPatientUpdates}
          onSkip={finishPatientUpdateModal}
        />
      )}
    </div>
  );
}

export default ConsultationForm;