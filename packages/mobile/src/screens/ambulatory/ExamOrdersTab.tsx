import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { createExamOrder, downloadAndSharePdf } from '../../services/ambulatory';
import { EXAM_PANELS } from '../../data/examPanels';
import ExamPanelSection from '../../components/ambulatory/ExamPanelSection';
import PatientPickerModal from '../../components/ambulatory/PatientPickerModal';
import GradientButton from '../../components/shared/GradientButton';
import type { Patient, Urgency } from '../../types/ambulatory';

interface SelectedExam {
  name: string;
  code: string;
  category: string;
}

export default function ExamOrdersTab() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedExams, setSelectedExams] = useState<Map<string, SelectedExam>>(new Map());
  const [customExamName, setCustomExamName] = useState('');
  const [clinicalIndication, setClinicalIndication] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('routine');
  const [patientPickerVisible, setPatientPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedCodes = useMemo(() => {
    return new Set(selectedExams.keys());
  }, [selectedExams]);

  const handleToggleExam = (exam: { name: string; code: string; category?: string }) => {
    setSelectedExams((prev) => {
      const next = new Map(prev);
      if (next.has(exam.code)) {
        next.delete(exam.code);
      } else {
        next.set(exam.code, {
          name: exam.name,
          code: exam.code,
          category: exam.category || '',
        });
      }
      return next;
    });
  };

  const handleRemoveExam = (code: string) => {
    setSelectedExams((prev) => {
      const next = new Map(prev);
      next.delete(code);
      return next;
    });
  };

  const handleAddCustomExam = () => {
    if (!customExamName.trim()) return;
    const code = `CUSTOM_${Date.now()}`;
    setSelectedExams((prev) => {
      const next = new Map(prev);
      next.set(code, {
        name: customExamName.trim(),
        code,
        category: 'custom',
      });
      return next;
    });
    setCustomExamName('');
  };

  const resetForm = () => {
    setSelectedPatient(null);
    setSelectedExams(new Map());
    setCustomExamName('');
    setClinicalIndication('');
    setUrgency('routine');
  };

  const handleGenerate = async () => {
    if (!selectedPatient) {
      Alert.alert('', t('selectPatientRequired', 'Selecione um paciente'));
      return;
    }
    if (selectedExams.size === 0) {
      Alert.alert('', t('selectAtLeastOneExam', 'Selecione pelo menos um exame'));
      return;
    }

    setSaving(true);
    try {
      const exams = Array.from(selectedExams.values()).map((e) => ({
        name: e.name,
        code: e.code,
        category: e.category || undefined,
      }));
      const result = await createExamOrder({
        patient_id: selectedPatient.id,
        exams,
        clinical_indication: clinicalIndication || undefined,
        urgency,
      });
      const filename = `pedido_exames_${result.id}.pdf`;
      await downloadAndSharePdf(`/exams/${result.id}/pdf`, filename);
      Alert.alert('', t('examOrderCreatedSuccess', 'Pedido de exames gerado com sucesso!'));
      resetForm();
    } catch {
      Alert.alert('', t('errorCreatingExamOrder', 'Erro ao gerar pedido de exames'));
    } finally {
      setSaving(false);
    }
  };

  const URGENCY_OPTIONS: { value: Urgency; labelKey: string; fallback: string }[] = [
    { value: 'routine', labelKey: 'routine', fallback: 'Rotina' },
    { value: 'urgent', labelKey: 'urgent', fallback: 'Urgente' },
    { value: 'emergency', labelKey: 'emergency', fallback: 'Emergencia' },
  ];

  const selectedExamsList = Array.from(selectedExams.values());

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {/* Patient (required) */}
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {t('patient', 'Paciente')} *
        </Text>
        {selectedPatient ? (
          <View style={[styles.patientChip, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            <Text style={[styles.patientChipText, { color: theme.text }]} numberOfLines={1}>
              {selectedPatient.full_name}
            </Text>
            <TouchableOpacity onPress={() => setSelectedPatient(null)}>
              <Text style={[styles.removePatient, { color: theme.textMuted }]}>X</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.selector, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
            onPress={() => setPatientPickerVisible(true)}>
            <Text style={[styles.selectorText, { color: theme.textMuted }]}>
              {t('selectPatient', 'Selecionar Paciente')}...
            </Text>
          </TouchableOpacity>
        )}

        {/* Exam Panels */}
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {t('exams', 'Exames')}
        </Text>
        {Object.entries(EXAM_PANELS).map(([key, panel]) => (
          <ExamPanelSection
            key={key}
            label={panel.label}
            exams={panel.exams}
            selectedCodes={selectedCodes}
            onToggle={handleToggleExam}
          />
        ))}

        {/* Selected exams chips */}
        {selectedExamsList.length > 0 && (
          <>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('selectedExams', 'Exames Selecionados')} ({selectedExamsList.length})
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScrollView}
              contentContainerStyle={styles.chipsContent}>
              {selectedExamsList.map((exam) => (
                <View
                  key={exam.code}
                  style={[styles.chip, { backgroundColor: `${theme.primary}20`, borderColor: theme.primary }]}>
                  <Text style={[styles.chipText, { color: theme.primary }]} numberOfLines={1}>
                    {exam.name}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemoveExam(exam.code)}>
                    <Text style={[styles.chipRemove, { color: theme.primary }]}>X</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* Custom exam */}
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {t('customExam', 'Exame Personalizado')}
        </Text>
        <View style={styles.customExamRow}>
          <TextInput
            style={[
              styles.customExamInput,
              { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
            ]}
            value={customExamName}
            onChangeText={setCustomExamName}
            placeholder={t('customExamPlaceholder', 'Nome do exame...')}
            placeholderTextColor={theme.textMuted}
          />
          <TouchableOpacity
            style={[styles.addButton, { borderColor: theme.primary }]}
            onPress={handleAddCustomExam}>
            <Text style={[styles.addButtonText, { color: theme.primary }]}>
              + {t('add', 'Adicionar')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Clinical indication */}
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {t('clinicalIndication', 'Indicacao Clinica')}
        </Text>
        <TextInput
          style={[
            styles.textArea,
            { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
          ]}
          value={clinicalIndication}
          onChangeText={setClinicalIndication}
          placeholder={t('clinicalIndicationPlaceholder', 'Descricao da indicacao clinica...')}
          placeholderTextColor={theme.textMuted}
          multiline
          textAlignVertical="top"
        />

        {/* Urgency */}
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {t('urgency', 'Urgencia')}
        </Text>
        <View style={styles.typeRow}>
          {URGENCY_OPTIONS.map((opt) => {
            const selected = urgency === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.typeButton,
                  {
                    borderColor: selected ? theme.primary : theme.surfaceBorder,
                    backgroundColor: selected ? `${theme.primary}20` : theme.surface,
                  },
                ]}
                onPress={() => setUrgency(opt.value)}>
                <Text
                  style={[
                    styles.typeButtonText,
                    { color: selected ? theme.primary : theme.text },
                  ]}
                  numberOfLines={1}>
                  {t(opt.labelKey, opt.fallback)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Generate Button */}
        <View style={styles.ctaWrapper}>
          <GradientButton
            label={t('generateOrder', 'Gerar Pedido')}
            onPress={handleGenerate}
            loading={saving}
          />
        </View>
      </ScrollView>

      <PatientPickerModal
        visible={patientPickerVisible}
        onClose={() => setPatientPickerVisible(false)}
        onSelect={(patient) => {
          setSelectedPatient(patient);
          setPatientPickerVisible(false);
        }}
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
    ...typography.caption,
    fontWeight: '600',
  },
  chipsScrollView: {
    maxHeight: 48,
  },
  chipsContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipText: {
    ...typography.caption,
    fontWeight: '600',
    marginRight: spacing.xs,
  },
  chipRemove: {
    ...typography.caption,
    fontWeight: '700',
  },
  customExamRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  customExamInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
  },
  addButton: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  addButtonText: {
    ...typography.buttonSmall,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    minHeight: 80,
  },
  ctaWrapper: {
    marginTop: spacing.lg,
  },
});
