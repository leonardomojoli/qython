import React, { useState } from 'react';
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
import { createDocument, downloadAndSharePdf } from '../../services/ambulatory';
import PatientPickerModal from '../../components/ambulatory/PatientPickerModal';
import GradientButton from '../../components/shared/GradientButton';
import type { Patient, DocumentType } from '../../types/ambulatory';

type DocumentSubType = 'sick_leave' | 'attendance' | 'fitness';

export default function DocumentsTab() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const [documentType, setDocumentType] = useState<DocumentSubType>('sick_leave');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientPickerVisible, setPatientPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sick leave fields
  const [cid, setCid] = useState('');
  const [days, setDays] = useState('');
  const [startDate, setStartDate] = useState('');
  const [description, setDescription] = useState('');

  // Attendance fields
  const [attendanceDate, setAttendanceDate] = useState('');
  const [attendanceTime, setAttendanceTime] = useState('');
  const [duration, setDuration] = useState('');

  // Fitness fields
  const [purpose, setPurpose] = useState('');
  const [validUntil, setValidUntil] = useState('');

  const resetForm = () => {
    setSelectedPatient(null);
    setCid('');
    setDays('');
    setStartDate('');
    setDescription('');
    setAttendanceDate('');
    setAttendanceTime('');
    setDuration('');
    setPurpose('');
    setValidUntil('');
  };

  const buildContent = (): Record<string, string> => {
    switch (documentType) {
      case 'sick_leave':
        return {
          ...(cid ? { cid } : {}),
          days,
          ...(startDate ? { start_date: startDate } : {}),
          ...(description ? { description } : {}),
        };
      case 'attendance':
        return {
          ...(attendanceDate ? { attendance_date: attendanceDate } : {}),
          ...(attendanceTime ? { attendance_time: attendanceTime } : {}),
          ...(duration ? { duration } : {}),
        };
      case 'fitness':
        return {
          ...(purpose ? { purpose } : {}),
          ...(validUntil ? { valid_until: validUntil } : {}),
        };
    }
  };

  const validate = (): boolean => {
    if (!selectedPatient) {
      Alert.alert('', t('selectPatientRequired', 'Selecione um paciente'));
      return false;
    }
    if (documentType === 'sick_leave' && !days.trim()) {
      Alert.alert('', t('fillRequiredFields', 'Preencha os campos obrigatorios'));
      return false;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const result = await createDocument({
        patient_id: selectedPatient!.id,
        document_type: documentType as DocumentType,
        content: buildContent(),
      });
      const filename = `documento_${result.id}.pdf`;
      await downloadAndSharePdf(`/documents/${result.id}/pdf`, filename);
      Alert.alert('', t('documentCreatedSuccess', 'Documento gerado com sucesso!'));
      resetForm();
    } catch {
      Alert.alert('', t('errorCreatingDocument', 'Erro ao gerar documento'));
    } finally {
      setSaving(false);
    }
  };

  const DOC_TYPES: { value: DocumentSubType; labelKey: string; fallback: string }[] = [
    { value: 'sick_leave', labelKey: 'sickLeave', fallback: 'Atestado' },
    { value: 'attendance', labelKey: 'attendance', fallback: 'Comparecimento' },
    { value: 'fitness', labelKey: 'fitness', fallback: 'Aptidao' },
  ];

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

        {/* Document Type */}
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {t('documents', 'Documentos')}
        </Text>
        <View style={styles.typeRow}>
          {DOC_TYPES.map((dt) => {
            const selected = documentType === dt.value;
            return (
              <TouchableOpacity
                key={dt.value}
                style={[
                  styles.typeButton,
                  {
                    borderColor: selected ? theme.primary : theme.surfaceBorder,
                    backgroundColor: selected ? `${theme.primary}20` : theme.surface,
                  },
                ]}
                onPress={() => setDocumentType(dt.value)}>
                <Text
                  style={[
                    styles.typeButtonText,
                    { color: selected ? theme.primary : theme.text },
                  ]}
                  numberOfLines={1}>
                  {t(dt.labelKey, dt.fallback)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Dynamic form fields */}
        {documentType === 'sick_leave' && (
          <>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('cidCode', 'CID-10')}
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
              ]}
              value={cid}
              onChangeText={setCid}
              placeholder="Ex: J06.9"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('daysOff', 'Dias de Afastamento')} *
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
              ]}
              value={days}
              onChangeText={setDays}
              placeholder="Ex: 3"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('startDate', 'Data de Inicio')}
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
              ]}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('description', 'Descricao')}
            </Text>
            <TextInput
              style={[
                styles.textArea,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('descriptionPlaceholder', 'Descricao do quadro clinico...')}
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
            />
          </>
        )}

        {documentType === 'attendance' && (
          <>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('attendanceDate', 'Data do Comparecimento')}
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
              ]}
              value={attendanceDate}
              onChangeText={setAttendanceDate}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('attendanceTime', 'Horario')}
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
              ]}
              value={attendanceTime}
              onChangeText={setAttendanceTime}
              placeholder="HH:MM"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('durationMinutes', 'Duracao (minutos)')}
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
              ]}
              value={duration}
              onChangeText={setDuration}
              placeholder="Ex: 30"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
            />
          </>
        )}

        {documentType === 'fitness' && (
          <>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('purpose', 'Finalidade')}
            </Text>
            <TextInput
              style={[
                styles.textArea,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
              ]}
              value={purpose}
              onChangeText={setPurpose}
              placeholder={t('purposePlaceholder', 'Finalidade do atestado de aptidao...')}
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('validUntil', 'Valido Ate')}
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
              ]}
              value={validUntil}
              onChangeText={setValidUntil}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={theme.textMuted}
            />
          </>
        )}

        {/* Generate Button */}
        <View style={styles.ctaWrapper}>
          <GradientButton
            label={t('generateDocument', 'Gerar Documento')}
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
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    minHeight: 120,
  },
  ctaWrapper: {
    marginTop: spacing.lg,
  },
});
