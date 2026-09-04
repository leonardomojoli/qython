import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import GovProgramBadge from './GovProgramBadge';
import type { Medication } from '../../types/pharmacy';

interface Props {
  supply: Medication;
  selectedCountry: string;
  onPress: () => void;
}

export default function SupplyCard({ supply, selectedCountry, onPress }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

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
      onPress={onPress}
      activeOpacity={0.7}>
      <View style={styles.header}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
          {supply.name}
        </Text>
        <View style={styles.badges}>
          <GovProgramBadge
            programs={supply.government_programs || []}
            fallbackFarmaciaPopular={supply.farmacia_popular}
            selectedCountry={selectedCountry}
            compact
          />
          {supply.requires_prescription && (
            <View style={styles.lmeBadge}>
              <Text style={styles.lmeText}>{t('requiresLME')}</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.category, { color: theme.textSecondary }]} numberOfLines={1}>
        {supply.therapeutic_class}
      </Text>
      <Text style={[styles.presentation, { color: theme.textMuted }]} numberOfLines={1}>
        {supply.presentation}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  name: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    alignItems: 'center',
  },
  lmeBadge: {
    backgroundColor: '#8e44ad30',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  lmeText: {
    ...typography.caption,
    fontWeight: '600',
    color: '#8e44ad',
  },
  category: {
    ...typography.bodySmall,
    marginBottom: 2,
  },
  presentation: {
    ...typography.caption,
  },
});
