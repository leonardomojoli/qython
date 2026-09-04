import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

const STATUS_COLORS = {
  green: '#03dac6',
  yellow: '#f39c12',
  red: '#e74c3c',
} as const;

interface Props {
  formattedTime: string;
  isRunning: boolean;
  isPaused: boolean;
  statusColor: 'green' | 'yellow' | 'red';
  onPause: () => void;
  onResume: () => void;
}

export default function ConsultationTimer({
  formattedTime,
  isRunning,
  isPaused,
  statusColor,
  onPause,
  onResume,
}: Props) {
  const { theme } = useTheme();
  const color = STATUS_COLORS[statusColor];

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
      <Text style={[styles.timerText, { color }]}>{formattedTime}</Text>

      {(isRunning || isPaused) && (
        <TouchableOpacity
          style={[styles.controlButton, { borderColor: theme.surfaceBorder }]}
          onPress={isPaused ? onResume : onPause}
          activeOpacity={0.7}>
          <Text style={[styles.controlIcon, { color: theme.text }]}>
            {isPaused ? '\u25B6' : '\u23F8'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
  },
  timerText: {
    ...typography.h3,
    fontVariant: ['tabular-nums'],
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlIcon: {
    fontSize: 16,
  },
});
