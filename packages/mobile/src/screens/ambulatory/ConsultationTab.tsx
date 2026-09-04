import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  getDraftConsultation,
  getSummary,
  createConsultation,
  submitFeedback,
  extractPatientUpdates,
  applyPatientUpdates,
  getAnamnesisTemplates,
} from '../../services/ambulatory';
import type { ProposedChange, AnamnesisTemplate } from '../../services/ambulatory';
import { getTemplate } from '@qython/shared/src/ambulatory/consultationTemplates';
import SpecialtyPicker from '../../components/ambulatory/SpecialtyPicker';
import PatientPickerModal from '../../components/ambulatory/PatientPickerModal';
import ConsultationTimer from '../../components/ambulatory/ConsultationTimer';
import VoiceRecorderButton from '../../components/ambulatory/VoiceRecorderButton';
import QuickInsertBar from '../../components/ambulatory/QuickInsertBar';
import SubtemplateSheet from '../../components/ambulatory/SubtemplateSheet';
import FeedbackButtons from '../../components/ambulatory/FeedbackButtons';
import PatientUpdateSheet from '../../components/ambulatory/PatientUpdateSheet';
import { useConsultationTimer } from '../../hooks/useConsultationTimer';
import { useNetwork } from '../../contexts/NetworkContext';
import { createConsultationOfflineAware } from '../../services/offlineMutations';
import OfflineFeatureGate from '../../components/common/OfflineFeatureGate';
import type { Patient, ConsultationType } from '../../types/ambulatory';

const AUTOSAVE_DELAY = 5000;

export default function ConsultationTab() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const { isInternetReachable } = useNetwork();
  const isOffline = !isInternetReachable;

  const [specialty, setSpecialty] = useState('');
  const [consultationType, setConsultationType] = useState<ConsultationType>('first');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [rawNotes, setRawNotes] = useState('');
  const [improvedNotes, setImprovedNotes] = useState('');
  const [summary, setSummary] = useState('');
  const [userAnamnesisTemplates, setUserAnamnesisTemplates] = useState<AnamnesisTemplate[]>([]);
  const lastLoadedTemplateRef = useRef('');

  // Undo/Redo state
  const [originalRawNotes, setOriginalRawNotes] = useState('');
  const [isImproved, setIsImproved] = useState(false);

  // DPO tracking
  const [originalImprovedNotes, setOriginalImprovedNotes] = useState('');
  const [originalSummary, setOriginalSummary] = useState('');
  const [regenerationCountImproved, setRegenerationCountImproved] = useState(0);
  const [regenerationCountSummary, setRegenerationCountSummary] = useState(0);

  const [specialtyPickerVisible, setSpecialtyPickerVisible] = useState(false);
  const [patientPickerVisible, setPatientPickerVisible] = useState(false);
  const [subtemplateSheetVisible, setSubtemplateSheetVisible] = useState(false);

  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);

  // Patient update from consultation
  const [patientUpdateChanges, setPatientUpdateChanges] = useState<ProposedChange[]>([]);
  const [showPatientUpdates, setShowPatientUpdates] = useState(false);
  const [patientUpdateContext, setPatientUpdateContext] = useState<{patientId: number; consultationId: number} | null>(null);
  const [extractingPatientUpdates, setExtractingPatientUpdates] = useState(false);
  const pendingSaveCleanupRef = React.useRef<(() => void) | null>(null);

  // Consultation timer
  const timer = useConsultationTimer({
    autoStart: false,
    inactivityTimeout: 5 * 60 * 1000,
  });

  // Refs for autosave
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rawNotesRef = useRef(rawNotes);
  rawNotesRef.current = rawNotes;

  // Voice language mapping
  const getVoiceLang = () => {
    const lang = i18n.language || 'pt';
    if (lang.startsWith('pt')) return 'pt-BR';
    if (lang.startsWith('es')) return 'es-ES';
    return 'en-US';
  };

  // ─── Autosave ────────────────────────────────────────────
  const autosaveKey = specialty && consultationType
    ? `ambulatory_autosave_${specialty}_${consultationType}`
    : '';

  // Restore autosave on specialty/type change
  useEffect(() => {
    if (!autosaveKey) return;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(autosaveKey);
        if (saved && !rawNotes) {
          setRawNotes(saved);
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosaveKey]);

  // Debounced autosave on rawNotes change
  useEffect(() => {
    if (!autosaveKey || !rawNotes.trim()) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      AsyncStorage.setItem(autosaveKey, rawNotesRef.current).catch(() => {});
    }, AUTOSAVE_DELAY);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [rawNotes, autosaveKey]);

  // Start timer when specialty selected
  useEffect(() => {
    if (specialty && !timer.isRunning && !timer.isPaused) {
      timer.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialty]);

  // Busca as customizações de anamnese do usuário (criadas no web sincronizam aqui).
  useEffect(() => {
    getAnamnesisTemplates()
      .then((d) => {
        if (Array.isArray(d)) setUserAnamnesisTemplates(d);
      })
      .catch(() => {});
  }, []);

  // Auto-carrega o template de anamnese (custom > padrão do shared) ao escolher
  // especialidade / tipo / paciente. Guard: só substitui se as notas estiverem vazias ou
  // ainda iguais ao último template carregado — nunca sobrescreve o que o médico digitou
  // (o campo no mobile não tem undo). Espelha o ConsultationForm do web.
  useEffect(() => {
    if (!specialty) return;
    const custom = userAnamnesisTemplates.find(
      (tm) => tm.specialty === specialty && tm.consultation_type === consultationType,
    );
    const tpl = custom
      ? custom.content
      : getTemplate(specialty, consultationType === 'first', !!selectedPatient) || '';
    const cur = rawNotesRef.current;
    if (cur === '' || cur === lastLoadedTemplateRef.current) {
      lastLoadedTemplateRef.current = tpl;
      setRawNotes(tpl);
      setImprovedNotes('');
      setSummary('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialty, consultationType, userAnamnesisTemplates, selectedPatient]);

  // Track activity on text changes
  const handleRawNotesChange = useCallback(
    (text: string) => {
      setRawNotes(text);
      timer.trackActivity();
    },
    [timer],
  );

  // ─── Quick Insert ────────────────────────────────────────
  const handleInsert = useCallback((text: string) => {
    setRawNotes((prev) => (prev ? prev + '\n\n' + text : text));
    timer.trackActivity();
  }, [timer]);

  // ─── Voice ───────────────────────────────────────────────
  const handleVoiceTranscription = useCallback(
    (text: string) => {
      setRawNotes((prev) => (prev ? prev + ' ' + text : text));
      timer.trackActivity();
    },
    [timer],
  );

  // ─── Camera (mobile-exclusive) ───────────────────────────
  const handleCamera = useCallback(async () => {
    try {
      const { launchCamera, launchImageLibrary } = await import('react-native-image-picker');
      Alert.alert(
        t('addPhoto', 'Adicionar Foto'),
        '',
        [
          {
            text: t('camera', 'Camera'),
            onPress: () => {
              launchCamera({ mediaType: 'photo', quality: 0.8 }, (response) => {
                if (response.assets?.[0]?.uri) {
                  const uri = response.assets[0].uri;
                  setRawNotes((prev) => prev + `\n\n[Foto anexada: ${uri}]`);
                }
              });
            },
          },
          {
            text: t('gallery', 'Galeria'),
            onPress: () => {
              launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, (response) => {
                if (response.assets?.[0]?.uri) {
                  const uri = response.assets[0].uri;
                  setRawNotes((prev) => prev + `\n\n[Foto anexada: ${uri}]`);
                }
              });
            },
          },
          { text: t('cancel', 'Cancelar'), style: 'cancel' },
        ],
      );
    } catch {
      Alert.alert('', t('cameraNotAvailable', 'Camera nao disponivel'));
    }
  }, [t]);

  // ─── AI: Improve ─────────────────────────────────────────
  const handleImprove = async (sourceText?: string) => {
    if (!specialty) {
      Alert.alert('', t('selectSpecialtyFirst', 'Selecione uma especialidade'));
      return;
    }
    const textToImprove = sourceText || rawNotes;
    if (!textToImprove.trim()) {
      Alert.alert('', t('enterNotesFirst', 'Digite as notas clinicas'));
      return;
    }
    setLoadingDraft(true);
    try {
      const result = await getDraftConsultation(
        specialty,
        textToImprove,
        consultationType === 'first',
        selectedPatient?.id,
      );
      // Store original raw notes on first improvement
      if (!originalRawNotes) {
        setOriginalRawNotes(rawNotes);
      }
      setImprovedNotes(result.improved_notes);
      setIsImproved(true);

      // DPO tracking
      if (!originalImprovedNotes) {
        setOriginalImprovedNotes(result.improved_notes);
      } else {
        setRegenerationCountImproved((c) => c + 1);
      }
    } catch {
      Alert.alert('', t('errorImprovingNotes', 'Erro ao aprimorar notas'));
    } finally {
      setLoadingDraft(false);
    }
  };

  // ─── Undo/Redo ──────────────────────────────────────────
  const handleUndoImprovement = () => {
    if (!isImproved || !originalRawNotes) return;
    setRawNotes(originalRawNotes);
    setImprovedNotes('');
    setSummary('');
    setIsImproved(false);
    setOriginalImprovedNotes('');
    setOriginalSummary('');
  };

  const handleRedoImprovement = () => {
    if (!originalRawNotes) return;
    Alert.alert(
      t('redoImprovement', 'Refazer Aprimoramento'),
      '',
      [
        {
          text: t('redoWithEdits', 'Com edições atuais'),
          onPress: () => handleImprove(rawNotes),
        },
        {
          text: t('redoFromOriginal', 'Do texto original'),
          onPress: () => handleImprove(originalRawNotes),
        },
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
      ],
    );
  };

  // ─── AI: Summary ─────────────────────────────────────────
  const handleSummary = async () => {
    if (!improvedNotes.trim()) {
      Alert.alert('', t('improveFirst', 'Apriore as notas primeiro'));
      return;
    }
    setLoadingSummary(true);
    try {
      const result = await getSummary(improvedNotes);
      setSummary(result.summary);

      // DPO tracking
      if (!originalSummary) {
        setOriginalSummary(result.summary);
      } else {
        setRegenerationCountSummary((c) => c + 1);
      }
    } catch {
      Alert.alert('', t('errorGeneratingSummary', 'Erro ao gerar resumo'));
    } finally {
      setLoadingSummary(false);
    }
  };

  // ─── Save ────────────────────────────────────────────────
  const handleSave = async () => {
    if (!specialty || !rawNotes.trim()) {
      Alert.alert('', t('fillRequiredFields', 'Preencha os campos obrigatorios'));
      return;
    }

    const save = async () => {
      setLoadingSave(true);
      try {
        const response = await createConsultationOfflineAware({
          specialty,
          is_first_consultation: consultationType === 'first',
          rawNotes,
          improvedNotes: improvedNotes || rawNotes,
          summary: summary || '',
          patient_id: selectedPatient?.id ?? null,
          duration_minutes: timer.durationMinutes || undefined,
          // DPO fields
          originalImprovedNotes: originalImprovedNotes || undefined,
          originalSummary: originalSummary || undefined,
          regenerationCountImproved: regenerationCountImproved || undefined,
          regenerationCountSummary: regenerationCountSummary || undefined,
        } as any, !!isInternetReachable);

        // Prepare cleanup function to run after patient update modal interaction
        const cleanupAfterSave = () => {
          Alert.alert('', t('consultationSavedSuccess', 'Consulta salva com sucesso!'));
          if (autosaveKey) {
            AsyncStorage.removeItem(autosaveKey).catch(() => {});
          }
          setRawNotes('');
          setImprovedNotes('');
          setSummary('');
          setSelectedPatient(null);
          setSpecialty('');
          setOriginalRawNotes('');
          setIsImproved(false);
          setOriginalImprovedNotes('');
          setOriginalSummary('');
          setRegenerationCountImproved(0);
          setRegenerationCountSummary(0);
          timer.reset();
          pendingSaveCleanupRef.current = null;
        };

        // Extract patient updates — await result before clearing form
        if (selectedPatient?.id && typeof selectedPatient.id === 'number') {
          const consultationId = typeof response?.id === 'number' ? response.id : 0;
          const ctx = {
            patientId: selectedPatient.id,
            consultationId,
          };
          setPatientUpdateContext(ctx);
          setExtractingPatientUpdates(true);

          try {
            const result = await extractPatientUpdates(ctx.patientId, {
              consultationId: ctx.consultationId,
              notes: improvedNotes || rawNotes,
              summary: summary || undefined,
            });
            if (result?.has_changes && result.changes?.length > 0) {
              pendingSaveCleanupRef.current = cleanupAfterSave;
              setPatientUpdateChanges(result.changes);
              setShowPatientUpdates(true);
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
      } catch {
        Alert.alert('', t('errorSavingConsultation', 'Erro ao salvar consulta'));
      } finally {
        setLoadingSave(false);
      }
    };

    if (!improvedNotes) {
      Alert.alert(
        t('saveWithoutImproving', 'Salvar sem aprimorar?'),
        t(
          'saveWithoutImprovingDesc',
          'As notas nao foram aprimoradas pela IA. Deseja salvar mesmo assim?',
        ),
        [
          { text: t('cancel', 'Cancelar'), style: 'cancel' },
          { text: t('save', 'Salvar'), onPress: save },
        ],
      );
    } else {
      await save();
    }
  };

  // ─── Patient Update Handler ───────────────────────────────
  const finishPatientUpdateModal = () => {
    setShowPatientUpdates(false);
    setPatientUpdateChanges([]);
    setPatientUpdateContext(null);
    if (pendingSaveCleanupRef.current) {
      pendingSaveCleanupRef.current();
    }
  };

  const handleApplyPatientUpdates = async (accepted: ProposedChange[], rejected: ProposedChange[]) => {
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
      Alert.alert('', t('patientInfoUpdated', 'Cadastro do paciente atualizado!'));
    } catch {
      // Silent fail - patient update is optional
    }
    finishPatientUpdateModal();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {/* Timer */}
        {specialty !== '' && (
          <ConsultationTimer
            formattedTime={timer.formattedTime}
            isRunning={timer.isRunning}
            isPaused={timer.isPaused}
            statusColor={timer.statusColor}
            onPause={timer.pause}
            onResume={timer.resume}
          />
        )}

        {/* Specialty */}
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {t('specialty', 'Especialidade')} *
        </Text>
        <TouchableOpacity
          style={[
            styles.selector,
            { borderColor: theme.surfaceBorder, backgroundColor: theme.surface },
          ]}
          onPress={() => setSpecialtyPickerVisible(true)}>
          <Text
            style={[
              styles.selectorText,
              { color: specialty ? theme.text : theme.textMuted },
            ]}>
            {specialty || t('selectSpecialty', 'Selecionar especialidade...')}
          </Text>
        </TouchableOpacity>

        {/* Consultation Type */}
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {t('consultationType', 'Tipo de Consulta')}
        </Text>
        <View style={styles.typeRow}>
          {(['first', 'return'] as ConsultationType[]).map((type) => {
            const selected = consultationType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeButton,
                  {
                    borderColor: selected ? theme.primary : theme.surfaceBorder,
                    backgroundColor: selected ? `${theme.primary}20` : theme.surface,
                  },
                ]}
                onPress={() => setConsultationType(type)}>
                <Text
                  style={[
                    styles.typeButtonText,
                    { color: selected ? theme.primary : theme.text },
                  ]}>
                  {type === 'first'
                    ? t('firstConsultation', 'Primeira')
                    : t('returnConsultation', 'Retorno')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Patient (optional) */}
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {t('patient', 'Paciente')} ({t('optional', 'opcional')})
        </Text>
        {selectedPatient ? (
          <View
            style={[
              styles.patientChip,
              { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
            ]}>
            <Text
              style={[styles.patientChipText, { color: theme.text }]}
              numberOfLines={1}>
              {selectedPatient.full_name}
            </Text>
            <TouchableOpacity onPress={() => setSelectedPatient(null)}>
              <Text style={[styles.removePatient, { color: theme.textMuted }]}>
                X
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.selector,
              { borderColor: theme.surfaceBorder, backgroundColor: theme.surface },
            ]}
            onPress={() => setPatientPickerVisible(true)}>
            <Text style={[styles.selectorText, { color: theme.textMuted }]}>
              {t('selectPatient', 'Selecionar Paciente')}...
            </Text>
          </TouchableOpacity>
        )}

        {/* Raw Notes */}
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {t('rawNotes', 'Notas Clinicas')} *
        </Text>
        <View style={styles.notesInputRow}>
          <TextInput
            style={[
              styles.textArea,
              styles.textAreaFlex,
              {
                color: theme.text,
                backgroundColor: theme.surface,
                borderColor: theme.surfaceBorder,
              },
            ]}
            value={rawNotes}
            onChangeText={handleRawNotesChange}
            placeholder={t('rawNotesPlaceholder', 'Escreva as notas da consulta...')}
            placeholderTextColor={theme.textMuted}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.sideButtons}>
            <VoiceRecorderButton
              onTranscription={handleVoiceTranscription}
              language={getVoiceLang()}
              disabled={loadingDraft}
            />
            <TouchableOpacity
              style={[styles.sideButton, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}
              onPress={handleCamera}
              activeOpacity={0.7}>
              <Text style={styles.sideButtonIcon}>{'\u{1F4F7}'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Insert Bar */}
        <QuickInsertBar
          onInsert={handleInsert}
          specialty={specialty || 'general'}
          disabled={loadingDraft}
          onOpenProtocols={() => setSubtemplateSheetVisible(true)}
        />

        {/* Improve + Undo/Redo Buttons */}
        <OfflineFeatureGate>
          <View style={styles.aiButtonRow}>
            {isImproved && originalRawNotes ? (
              <>
                <TouchableOpacity
                  style={[styles.undoRedoBtn, { borderColor: theme.surfaceBorder }]}
                  onPress={handleUndoImprovement}
                  activeOpacity={0.7}>
                  <Text style={[styles.undoRedoIcon, { color: theme.text }]}>{'\u21A9'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.undoRedoBtn, { borderColor: theme.surfaceBorder }]}
                  onPress={handleRedoImprovement}
                  disabled={loadingDraft}
                  activeOpacity={0.7}>
                  <Text style={[styles.undoRedoIcon, { color: theme.text }]}>{'\u21BB'}</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity
              style={[styles.aiButton, styles.aiButtonFlex, { backgroundColor: theme.primary }]}
              onPress={() => handleImprove()}
              disabled={loadingDraft}
              activeOpacity={0.8}>
              {loadingDraft ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.aiButtonText}>
                  {isImproved
                    ? t('regenerateImprovement', 'Regenerar')
                    : t('improveConsultation', 'Aprimorar com IA')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </OfflineFeatureGate>

        {/* Improved Notes */}
        {improvedNotes !== '' && (
          <>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('improvedNotes', 'Notas Aprimoradas')}
            </Text>
            <TextInput
              style={[
                styles.textArea,
                {
                  color: theme.text,
                  backgroundColor: theme.surface,
                  borderColor: theme.surfaceBorder,
                },
              ]}
              value={improvedNotes}
              onChangeText={setImprovedNotes}
              multiline
              textAlignVertical="top"
            />
            <FeedbackButtons contentType="improved_notes" />

            {/* Summary Button */}
            <OfflineFeatureGate>
              <TouchableOpacity
                style={[styles.aiButton, { backgroundColor: '#03dac6' }]}
                onPress={handleSummary}
                disabled={loadingSummary}
                activeOpacity={0.8}>
                {loadingSummary ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.aiButtonText}>
                    {t('generateSummary', 'Gerar Resumo')}
                  </Text>
                )}
              </TouchableOpacity>
            </OfflineFeatureGate>
          </>
        )}

        {/* Summary */}
        {summary !== '' && (
          <>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('summary', 'Resumo')}
            </Text>
            <TextInput
              style={[
                styles.textArea,
                styles.textAreaSmall,
                {
                  color: theme.text,
                  backgroundColor: theme.surface,
                  borderColor: theme.surfaceBorder,
                },
              ]}
              value={summary}
              onChangeText={setSummary}
              multiline
              textAlignVertical="top"
            />
            <FeedbackButtons contentType="summary" />
          </>
        )}

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: theme.primary }]}
          onPress={handleSave}
          disabled={loadingSave || extractingPatientUpdates}
          activeOpacity={0.8}>
          {loadingSave ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : extractingPatientUpdates ? (
            <>
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.saveButtonText}>
                {t('analyzingPatientUpdates', 'Analisando cadastro...')}
              </Text>
            </>
          ) : (
            <Text style={styles.saveButtonText}>
              {t('saveConsultation', 'Salvar Consulta')}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <SpecialtyPicker
        visible={specialtyPickerVisible}
        onClose={() => setSpecialtyPickerVisible(false)}
        onSelect={setSpecialty}
      />

      <PatientPickerModal
        visible={patientPickerVisible}
        onClose={() => setPatientPickerVisible(false)}
        onSelect={(patient) => {
          setSelectedPatient(patient);
          setPatientPickerVisible(false);
        }}
      />

      <SubtemplateSheet
        visible={subtemplateSheetVisible}
        onClose={() => setSubtemplateSheetVisible(false)}
        onSelect={handleInsert}
        specialty={specialty}
      />

      <PatientUpdateSheet
        visible={showPatientUpdates}
        changes={patientUpdateChanges}
        onApply={handleApplyPatientUpdates}
        onSkip={finishPatientUpdateModal}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxl + spacing.xl,
  },
  label: {
    ...typography.label,
    marginTop: spacing.base,
    marginBottom: spacing.xs,
  },
  selector: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  selectorText: {
    ...typography.body,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  typeButtonText: {
    ...typography.buttonSmall,
  },
  patientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  patientChipText: {
    ...typography.body,
    flex: 1,
  },
  removePatient: {
    ...typography.body,
    fontWeight: '600',
    paddingLeft: spacing.md,
  },
  notesInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    minHeight: 200,
  },
  textAreaFlex: {
    flex: 1,
  },
  textAreaSmall: {
    minHeight: 120,
  },
  sideButtons: {
    gap: spacing.sm,
    justifyContent: 'flex-start',
  },
  sideButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideButtonIcon: {
    fontSize: 20,
  },
  aiButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  aiButtonFlex: {
    flex: 1,
  },
  undoRedoBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoRedoIcon: {
    fontSize: 20,
  },
  aiButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  aiButtonText: {
    ...typography.button,
    color: '#fff',
  },
  saveButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.base,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  saveButtonText: {
    ...typography.button,
    color: '#fff',
  },
});
