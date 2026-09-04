import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { alpha } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface Props {
  name: string;
  activePrinciple: string;
  onRemove: () => void;
}

export default function MedicationPill({ name, activePrinciple, onRemove }: Props) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: alpha(theme.primary, 0.12),
          borderColor: alpha(theme.primary, 0.28),
        },
      ]}>
      <View style={styles.textContainer}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.principle, { color: theme.textSecondary }]} numberOfLines={1}>
          ({activePrinciple})
        </Text>
      </View>
      <TouchableOpacity style={styles.removeBtn} onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={[styles.removeText, { color: theme.textMuted }]}>X</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    gap: spacing.sm,
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  name: {
    ...typography.bodySmall,
    fontWeight: '500',
    flexShrink: 1,
  },
  principle: {
    ...typography.caption,
    flexShrink: 1,
  },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
