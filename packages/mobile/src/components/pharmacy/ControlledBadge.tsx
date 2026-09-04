import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface Props {
  type: string | null;
}

export default function ControlledBadge({ type }: Props) {
  if (!type) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{type.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#e74c3c30',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  text: {
    ...typography.caption,
    fontWeight: '700',
    color: '#e74c3c',
  },
});
