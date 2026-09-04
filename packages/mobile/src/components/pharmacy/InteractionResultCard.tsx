import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { SEVERITY_CONFIG, type DrugInteraction } from '../../types/pharmacy';

interface Props {
  interaction: DrugInteraction;
}

export default function InteractionResultCard({ interaction }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const config = SEVERITY_CONFIG[interaction.severity] || SEVERITY_CONFIG.mild;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.surfaceBorder,
          borderLeftColor: config.color,
        },
      ]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.severity, { color: config.color }]}>
          {t(config.label)}
        </Text>
        <Text style={[styles.pair, { color: theme.text }]}>
          {interaction.active_principle_a} + {interaction.active_principle_b}
        </Text>
      </View>

      <Text style={[styles.description, { color: theme.textSecondary }]}>
        {interaction.description}
      </Text>

      {interaction.mechanism && (
        <View style={styles.detail}>
          <Text style={[styles.detailLabel, { color: theme.textMuted }]}>
            {t('interactionMechanism')}:
          </Text>
          <Text style={[styles.detailValue, { color: theme.text }]}>
            {interaction.mechanism}
          </Text>
        </View>
      )}

      {interaction.clinical_management && (
        <View style={styles.detail}>
          <Text style={[styles.detailLabel, { color: theme.textMuted }]}>
            {t('interactionManagement')}:
          </Text>
          <Text style={[styles.detailValue, { color: theme.text }]}>
            {interaction.clinical_management}
          </Text>
        </View>
      )}

      {interaction.evidence_level && (
        <View style={styles.meta}>
          {interaction.source && (
            <Text style={[styles.metaText, { color: theme.textMuted }]}>
              {interaction.source}
            </Text>
          )}
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            {interaction.evidence_level}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  header: {
    marginBottom: spacing.sm,
  },
  severity: {
    ...typography.buttonSmall,
    fontWeight: '700',
    marginBottom: 2,
  },
  pair: {
    ...typography.bodySmall,
    fontWeight: '500',
  },
  description: {
    ...typography.bodySmall,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  detail: {
    marginBottom: spacing.sm,
  },
  detailLabel: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: 2,
  },
  detailValue: {
    ...typography.bodySmall,
    lineHeight: 20,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  metaText: {
    ...typography.caption,
  },
});
