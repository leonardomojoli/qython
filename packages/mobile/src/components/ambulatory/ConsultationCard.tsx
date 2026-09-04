import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { Consultation } from '../../types/ambulatory';

interface Props {
  consultation: Consultation;
  onPress: (consultation: Consultation) => void;
  onLongPress?: (consultation: Consultation) => void;
}

export default function ConsultationCard({ consultation, onPress, onLongPress }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const preview =
    consultation.summary ||
    consultation.improved_notes ||
    consultation.raw_notes ||
    '';

  const date = new Date(consultation.created_at).toLocaleDateString();
  const typeLabel = consultation.is_first_consultation
    ? t('firstConsultation', 'Primeira')
    : t('returnConsultation', 'Retorno');

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.surfaceBorder,
          shadowColor: theme.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 2,
        },
      ]}
      onPress={() => onPress(consultation)}
      onLongPress={onLongPress ? () => onLongPress(consultation) : undefined}
      activeOpacity={0.7}>
      <View style={styles.header}>
        <Text style={[styles.specialty, { color: theme.primary }]} numberOfLines={1}>
          {consultation.specialty}
        </Text>
        <Text style={[styles.date, { color: theme.textMuted }]}>{date}</Text>
      </View>

      <View style={styles.metaRow}>
        <View style={[styles.typeBadge, { backgroundColor: `${theme.primary}15` }]}>
          <Text style={[styles.typeBadgeText, { color: theme.primary }]}>{typeLabel}</Text>
        </View>
        {consultation.patient_name && (
          <Text style={[styles.patient, { color: theme.textMuted }]} numberOfLines={1}>
            {consultation.patient_name}
          </Text>
        )}
      </View>

      {preview.length > 0 && (
        <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={2}>
          {preview}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  specialty: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
  },
  date: {
    ...typography.caption,
    marginLeft: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  typeBadgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  patient: {
    ...typography.caption,
    flex: 1,
  },
  preview: {
    ...typography.bodySmall,
    marginTop: spacing.sm,
  },
});
