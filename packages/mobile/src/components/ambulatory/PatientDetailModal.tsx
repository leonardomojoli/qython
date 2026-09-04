import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import PatientFormModal from './PatientFormModal';
import type { Patient } from '../../types/ambulatory';

interface Props {
  visible: boolean;
  patient: Patient | null;
  onClose: () => void;
  onPatientUpdated: (patient: Patient) => void;
}

export default function PatientDetailModal({
  visible,
  patient,
  onClose,
  onPatientUpdated,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [editVisible, setEditVisible] = useState(false);

  if (!patient) return null;

  const renderSection = (title: string, items: string[], color: string) => {
    if (items.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        <View style={styles.chipsRow}>
          {items.map((item, idx) => (
            <View key={idx} style={[styles.chip, { backgroundColor: `${color}20` }]}>
              <Text style={[styles.chipText, { color }]}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderInfoRow = (label: string, value: string | null | undefined) => {
    if (!value) return null;
    return (
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: theme.text }]}>{value}</Text>
      </View>
    );
  };

  const historyEntries = patient.clinical_history_parsed || [];

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.headerButton, { color: theme.textMuted }]}>
                {t('close', 'Fechar')}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
              {patient.full_name}
            </Text>
            <TouchableOpacity onPress={() => setEditVisible(true)}>
              <Text style={[styles.headerButton, { color: theme.primary }]}>
                {t('edit', 'Editar')}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Basic Info */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
              {renderInfoRow(t('birthDate', 'Data de Nascimento'), patient.birth_date)}
              {renderInfoRow(
                t('gender', 'Sexo'),
                patient.gender ? t(patient.gender, patient.gender) : null,
              )}
              {renderInfoRow(t('phone', 'Telefone'), patient.phone)}
              {renderInfoRow('Email', patient.email)}
              {renderInfoRow(t('document', 'Documento'), patient.document_id)}
              {renderInfoRow(t('address', 'Endereco'), patient.address)}
            </View>

            {/* Clinical Alerts */}
            {renderSection(t('allergies', 'Alergias'), patient.allergies, '#e74c3c')}
            {renderSection(
              t('chronicConditions', 'Condicoes Cronicas'),
              patient.chronic_conditions,
              '#f39c12',
            )}
            {renderSection(
              t('currentMedications', 'Medicamentos em Uso'),
              patient.current_medications,
              '#3498db',
            )}

            {/* Notes */}
            {patient.notes && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  {t('notes', 'Observacoes')}
                </Text>
                <Text style={[styles.notesText, { color: theme.textSecondary }]}>
                  {patient.notes}
                </Text>
              </View>
            )}

            {/* Clinical History */}
            {historyEntries.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  {t('patientHistory', 'Historico Clinico')}
                </Text>
                {historyEntries.map((entry, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.historyEntry,
                      { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
                    ]}>
                    <Text style={[styles.historyDate, { color: theme.primary }]}>
                      {entry.date}
                    </Text>
                    {entry.chief_complaint && (
                      <Text style={[styles.historyField, { color: theme.text }]}>
                        {t('consultationReason', 'Queixa')}: {entry.chief_complaint}
                      </Text>
                    )}
                    {entry.diagnosis && (
                      <Text style={[styles.historyField, { color: theme.text }]}>
                        {t('diagnosis', 'Diagnostico')}: {entry.diagnosis}
                      </Text>
                    )}
                    {entry.plan && (
                      <Text style={[styles.historyField, { color: theme.text }]}>
                        {t('plan', 'Conduta')}: {entry.plan}
                      </Text>
                    )}
                    {entry.provider && (
                      <Text style={[styles.historyProvider, { color: theme.textMuted }]}>
                        {entry.provider}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      <PatientFormModal
        visible={editVisible}
        patient={patient}
        onClose={() => setEditVisible(false)}
        onSaved={onPatientUpdated}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  headerButton: {
    ...typography.body,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    ...typography.bodySmall,
  },
  infoValue: {
    ...typography.bodySmall,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  chipText: {
    ...typography.bodySmall,
    fontWeight: '500',
  },
  notesText: {
    ...typography.body,
    lineHeight: 22,
  },
  historyEntry: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  historyDate: {
    ...typography.bodySmall,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  historyField: {
    ...typography.bodySmall,
    marginBottom: spacing.xs,
  },
  historyProvider: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
});
