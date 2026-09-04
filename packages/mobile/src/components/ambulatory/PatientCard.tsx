import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { Patient } from '../../types/ambulatory';

interface Props {
  patient: Patient;
  onPress: (patient: Patient) => void;
  onLongPress?: (patient: Patient) => void;
}

export default function PatientCard({ patient, onPress, onLongPress }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const alerts = [
    ...patient.allergies.map((a) => ({ text: a, type: 'allergy' as const })),
    ...patient.chronic_conditions.map((c) => ({ text: c, type: 'condition' as const })),
  ];

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
      onPress={() => onPress(patient)}
      onLongPress={() => onLongPress?.(patient)}
      activeOpacity={0.7}>
      <View style={styles.header}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {patient.full_name}
        </Text>
        {patient.phone && (
          <Text style={[styles.phone, { color: theme.textMuted }]} numberOfLines={1}>
            {patient.phone}
          </Text>
        )}
      </View>

      {alerts.length > 0 && (
        <View style={styles.alertsRow}>
          {alerts.slice(0, 4).map((alert, idx) => (
            <View
              key={idx}
              style={[
                styles.alertChip,
                {
                  backgroundColor:
                    alert.type === 'allergy'
                      ? 'rgba(231, 76, 60, 0.15)'
                      : 'rgba(243, 156, 18, 0.15)',
                },
              ]}>
              <Text
                style={[
                  styles.alertText,
                  {
                    color: alert.type === 'allergy' ? '#e74c3c' : '#f39c12',
                  },
                ]}
                numberOfLines={1}>
                {alert.text}
              </Text>
            </View>
          ))}
          {alerts.length > 4 && (
            <Text style={[styles.moreAlerts, { color: theme.textMuted }]}>
              +{alerts.length - 4}
            </Text>
          )}
        </View>
      )}

      {patient.current_medications.length > 0 && (
        <Text style={[styles.medications, { color: theme.textMuted }]} numberOfLines={1}>
          {t('currentMedications', 'Medicamentos')}: {patient.current_medications.join(', ')}
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
    marginBottom: spacing.xs,
  },
  name: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
  },
  phone: {
    ...typography.caption,
    marginLeft: spacing.sm,
  },
  alertsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  alertChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  alertText: {
    ...typography.caption,
    fontWeight: '500',
  },
  moreAlerts: {
    ...typography.caption,
    alignSelf: 'center',
  },
  medications: {
    ...typography.caption,
    marginTop: spacing.sm,
  },
});
