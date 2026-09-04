import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import GovProgramBadge from './GovProgramBadge';
import ControlledBadge from './ControlledBadge';
import type { Medication } from '../../types/pharmacy';

interface Props {
  medication: Medication;
  selectedCountry: string;
  onPress: () => void;
}

export default function MedicationCard({
  medication,
  selectedCountry,
  onPress,
}: Props) {
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
          {medication.name}
        </Text>
        <View style={styles.badges}>
          <GovProgramBadge
            programs={medication.government_programs || []}
            fallbackFarmaciaPopular={medication.farmacia_popular}
            selectedCountry={selectedCountry}
            compact
          />
          <ControlledBadge type={medication.controlled_type} />
        </View>
      </View>
      <Text style={[styles.principle, { color: theme.textSecondary }]} numberOfLines={1}>
        {medication.active_principle}
      </Text>
      <Text style={[styles.presentation, { color: theme.textMuted }]} numberOfLines={1}>
        {medication.presentation}
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
  principle: {
    ...typography.bodySmall,
    marginBottom: 2,
  },
  presentation: {
    ...typography.caption,
  },
});
