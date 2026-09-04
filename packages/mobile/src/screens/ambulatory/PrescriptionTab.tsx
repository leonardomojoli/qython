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
import {
  createPrescription,
  createDocument,
  downloadAndSharePdf,
} from '../../services/ambulatory';
import { PRESCRIPTION_TYPES } from '../../types/ambulatory';
import PatientPickerModal from '../../components/ambulatory/PatientPickerModal';
import SpecialtyPicker from '../../components/ambulatory/SpecialtyPicker';
import PrescriptionItemRow from '../../components/ambulatory/PrescriptionItemRow';
import { useNetwork } from '../../contexts/NetworkContext';
import OfflineFeatureGate from '../../components/common/OfflineFeatureGate';
import GradientButton from '../../components/shared/GradientButton';
import type {
  Patient,
  PrescriptionType,
  PrescriptionItem,
  Urgency,
} from '../../types/ambulatory';

type SubTab = 'prescription' | 'report' | 'referral';

const emptyItem = (): PrescriptionItem => ({
  medication: '',
  dosage: '',
  frequency: '',
  duration: '',
  quantity: '',
  instructions: '',
});

export default function PrescriptionTab() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { isInternetReachable } = useNetwork();
  const isOffline = !isInternetReachable;

  const [subTab, setSubTab] = useState<SubTab>('prescription');

  // ─── Prescription state ──────────────────────────────────
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [prescriptionType, setPrescriptionType] = useState<PrescriptionType>('simple');
  const [items, setItems] = useState<PrescriptionItem[]>([emptyItem()]);
  const [notes, setNotes] = useState('');
  const [patientPickerVisible, setPatientPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // ─── Report state ────────────────────────────────────────
  const [reportDiagnosis, setReportDiagnosis] = useState('');
  const [reportContent, setReportContent] = useState('');

  // ─── Referral state ──────────────────────────────────────
  const [referralSpecialty, setReferralSpecialty] = useState('');
  const [referralReason, setReferralReason] = useState('');
  const [referralUrgency, setReferralUrgency] = useState<Urgency>('routine');
  const [specialtyPickerVisible, setSpecialtyPickerVisible] = useState(false);

  const handleItemChange = (
    index: number,
    field: keyof PrescriptionItem,
    value: string,
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddItem = () => {
    setItems((prev) => [...prev, emptyItem()]);
  };

  // ─── Save Prescription ──────────────────────────────────
  const handleSavePrescription = async () => {
    if (!selectedPatient) {
      Alert.alert('', t('selectPatientRequired', 'Selecione um paciente'));
      return;
    }
    const validItems = items.filter((item) => item.medication.trim());
    if (validItems.length === 0) {
      Alert.alert(
        '',
        t('addAtLeastOneMedication', 'Adicione pelo menos um medicamento'),
      );
      return;
    }

    setSaving(true);
    try {
      const result = await createPrescription({
        patient_id: selectedPatient.id,
        prescription_type: prescriptionType,
        items: validItems,
        notes: notes || undefined,
      });
      Alert.alert(
        '',
        t('prescriptionCreatedSuccess', 'Receita gerada com sucesso!'),
      );
      // Share PDF
      if (isInternetReachable) {
        downloadAndSharePdf(
          `/prescriptions/${result.id}/pdf`,
          `Receita_${selectedPatient.full_name.replace(/\s/g, '_')}.pdf`,
        );
      }
      // Reset
      setSelectedPatient(null);
      setPrescriptionType('simple');
      setItems([emptyItem()]);
      setNotes('');
    } catch {
      Alert.alert(
        '',
        t('errorCreatingPrescription', 'Erro ao gerar receita'),
      );
    } finally {
      setSaving(false);
    }
  };

  // ─── Save Report ────────────────────────────────────────
  const handleSaveReport = async () => {
    if (!selectedPatient) {
      Alert.alert('', t('selectPatientRequired', 'Selecione um paciente'));
      return;
    }
    if (!reportContent.trim()) {
      Alert.alert('', t('fillRequiredFields', 'Preencha os campos obrigatorios'));
      return;
    }

    setSaving(true);
    try {
      const result = await createDocument({
        patient_id: selectedPatient.id,
        document_type: 'report',
        content: {
          diagnosis: reportDiagnosis,
          report_content: reportContent,
        },
      });
      Alert.alert('', t('reportCreatedSuccess', 'Relatorio gerado com sucesso!'));
      if (isInternetReachable) {
        downloadAndSharePdf(
          `/documents/${result.id}/pdf`,
          `Relatorio_${selectedPatient.full_name.replace(/\s/g, '_')}.pdf`,
        );
      }
      setReportDiagnosis('');
      setReportContent('');
    } catch {
      Alert.alert('', t('errorCreatingReport', 'Erro ao gerar relatorio'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Save Referral ──────────────────────────────────────
  const handleSaveReferral = async () => {
    if (!selectedPatient) {
      Alert.alert('', t('selectPatientRequired', 'Selecione um paciente'));
      return;
    }
    if (!referralSpecialty.trim()) {
      Alert.alert(
        '',
        t('specialtyRequired', 'Informe a especialidade'),
      );
      return;
    }

    setSaving(true);
    try {
      const result = await createDocument({
        patient_id: selectedPatient.id,
        document_type: 'referral',
        content: {
          specialty: referralSpecialty,
          reason: referralReason,
          urgency: referralUrgency,
        },
      });
      Alert.alert(
        '',
        t('referralCreatedSuccess', 'Encaminhamento gerado com sucesso!'),
      );
      if (isInternetReachable) {
        downloadAndSharePdf(
          `/documents/${result.id}/pdf`,
          `Encaminhamento_${selectedPatient.full_name.replace(/\s/g, '_')}.pdf`,
        );
      }
      setReferralSpecialty('');
      setReferralReason('');
      setReferralUrgency('routine');
    } catch {
      Alert.alert(
        '',
        t('errorCreatingReferral', 'Erro ao gerar encaminhamento'),
      );
    } finally {
      setSaving(false);
    }
  };

  const urgencyOptions: { value: Urgency; label: string }[] = [
    { value: 'routine', label: t('routine', 'Rotina') },
    { value: 'urgent', label: t('urgentLabel', 'Urgente') },
    { value: 'emergency', label: t('emergency', 'Emergencia') },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Sub-tabs */}
      <View style={[styles.subTabRow, { borderBottomColor: theme.surfaceBorder }]}>
        {([
          { key: 'prescription' as SubTab, label: t('prescriptionSubTab', 'Prescricao') },
          { key: 'report' as SubTab, label: t('report', 'Relatorio') },
          { key: 'referral' as SubTab, label: t('referral', 'Encaminhamento') },
        ]).map((tab) => {
          const active = subTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.subTab,
                active && { borderBottomColor: theme.primary },
              ]}
              onPress={() => setSubTab(tab.key)}>
              <Text
                style={[
                  styles.subTabText,
                  { color: active ? theme.primary : theme.textMuted },
                  active && styles.subTabTextActive,
                ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {/* Patient (required for all sub-tabs) */}
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {t('patient', 'Paciente')} *
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

        {/* ─── Prescription Sub-Tab ─────────────────────── */}
        {subTab === 'prescription' && (
          <>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('prescriptionType', 'Tipo de Receita')}
            </Text>
            <View style={styles.typeRow}>
              {PRESCRIPTION_TYPES.map((pt) => {
                const selected = prescriptionType === pt.value;
                return (
                  <TouchableOpacity
                    key={pt.value}
                    style={[
                      styles.typeButton,
                      {
                        borderColor: selected
                          ? theme.primary
                          : theme.surfaceBorder,
                        backgroundColor: selected
                          ? `${theme.primary}20`
                          : theme.surface,
                      },
                    ]}
                    onPress={() => setPrescriptionType(pt.value)}>
                    <Text
                      style={[
                        styles.typeButtonText,
                        { color: selected ? theme.primary : theme.text },
                      ]}
                      numberOfLines={1}>
                      {t(pt.labelKey, pt.value)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('medications', 'Medicamentos')}
            </Text>
            {items.map((item, idx) => (
              <PrescriptionItemRow
                key={idx}
                item={item}
                index={idx}
                onChange={handleItemChange}
                onRemove={handleRemoveItem}
              />
            ))}

            <TouchableOpacity
              style={[styles.addButton, { borderColor: theme.primary }]}
              onPress={handleAddItem}>
              <Text style={[styles.addButtonText, { color: theme.primary }]}>
                + {t('addMedication', 'Adicionar Medicamento')}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('notes', 'Observacoes')}
            </Text>
            <TextInput
              style={[
                styles.notesInput,
                {
                  color: theme.text,
                  backgroundColor: theme.surface,
                  borderColor: theme.surfaceBorder,
                },
              ]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('notesPlaceholder', 'Observacoes adicionais...')}
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.ctaWrapper}>
              <GradientButton
                label={t('generatePrescription', 'Gerar Receita')}
                onPress={handleSavePrescription}
                loading={saving}
              />
            </View>
          </>
        )}

        {/* ─── Report Sub-Tab ───────────────────────────── */}
        {subTab === 'report' && (
          <>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('diagnosis', 'Diagnostico')}
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  color: theme.text,
                  backgroundColor: theme.surface,
                  borderColor: theme.surfaceBorder,
                },
              ]}
              value={reportDiagnosis}
              onChangeText={setReportDiagnosis}
              placeholder={t('diagnosisPlaceholder', 'CID ou diagnostico...')}
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('reportContent', 'Conteudo do Relatorio')} *
            </Text>
            <TextInput
              style={[
                styles.notesInput,
                {
                  color: theme.text,
                  backgroundColor: theme.surface,
                  borderColor: theme.surfaceBorder,
                },
                { minHeight: 200 },
              ]}
              value={reportContent}
              onChangeText={setReportContent}
              placeholder={t(
                'reportPlaceholder',
                'Descreva o relatorio clinico...',
              )}
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.ctaWrapper}>
              <GradientButton
                label={t('generateReport', 'Gerar Relatorio')}
                onPress={handleSaveReport}
                loading={saving}
              />
            </View>
          </>
        )}

        {/* ─── Referral Sub-Tab ─────────────────────────── */}
        {subTab === 'referral' && (
          <>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('destinationSpecialty', 'Especialidade Destino')} *
            </Text>
            <TouchableOpacity
              style={[
                styles.selector,
                {
                  borderColor: theme.surfaceBorder,
                  backgroundColor: theme.surface,
                },
              ]}
              onPress={() => setSpecialtyPickerVisible(true)}>
              <Text
                style={[
                  styles.selectorText,
                  {
                    color: referralSpecialty
                      ? theme.text
                      : theme.textMuted,
                  },
                ]}>
                {referralSpecialty ||
                  t('selectSpecialty', 'Selecionar especialidade...')}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('referralReason', 'Motivo do Encaminhamento')}
            </Text>
            <TextInput
              style={[
                styles.notesInput,
                {
                  color: theme.text,
                  backgroundColor: theme.surface,
                  borderColor: theme.surfaceBorder,
                },
              ]}
              value={referralReason}
              onChangeText={setReferralReason}
              placeholder={t(
                'referralReasonPlaceholder',
                'Descreva o motivo do encaminhamento...',
              )}
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
            />

            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('urgency', 'Urgencia')}
            </Text>
            <View style={styles.typeRow}>
              {urgencyOptions.map((opt) => {
                const selected = referralUrgency === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.typeButton,
                      {
                        borderColor: selected
                          ? theme.primary
                          : theme.surfaceBorder,
                        backgroundColor: selected
                          ? `${theme.primary}20`
                          : theme.surface,
                      },
                    ]}
                    onPress={() => setReferralUrgency(opt.value)}>
                    <Text
                      style={[
                        styles.typeButtonText,
                        { color: selected ? theme.primary : theme.text },
                      ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.ctaWrapper}>
              <GradientButton
                label={t('generateReferral', 'Gerar Encaminhamento')}
                onPress={handleSaveReferral}
                loading={saving}
              />
            </View>
          </>
        )}
      </ScrollView>

      <PatientPickerModal
        visible={patientPickerVisible}
        onClose={() => setPatientPickerVisible(false)}
        onSelect={(patient) => {
          setSelectedPatient(patient);
          setPatientPickerVisible(false);
        }}
      />

      <SpecialtyPicker
        visible={specialtyPickerVisible}
        onClose={() => setSpecialtyPickerVisible(false)}
        onSelect={setReferralSpecialty}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  subTabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  subTab: {
    flex: 1,
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  subTabText: {
    ...typography.buttonSmall,
  },
  subTabTextActive: {
    fontWeight: '700',
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
  addButton: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  addButtonText: {
    ...typography.buttonSmall,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
  },
  notesInput: {
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
