import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

const ICON_MAP: Record<string, string> = {
  tint: '\u{1F4A7}',
  'heart-pulse': '\u{1F493}',
  apple: '\u{1F34E}',
  utensils: '\u{1F37D}',
  hospital: '\u{1F3E5}',
  bandage: '\u{1FA79}',
  capsules: '\u{1F48A}',
};

interface Props {
  iconKey: string;
  title: string;
  specialty: string;
  selected?: boolean;
  onPress: () => void;
}

export default function OrientationTemplateCard({
  iconKey,
  title,
  specialty,
  selected,
  onPress,
}: Props) {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: selected ? theme.primary : theme.surfaceBorder,
          borderWidth: selected ? 2 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}>
      <Text style={styles.icon}>{ICON_MAP[iconKey] || '\u{1F4C4}'}</Text>
      <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[styles.specialty, { color: theme.textMuted }]} numberOfLines={1}>
        {specialty}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    margin: spacing.xs,
    minHeight: 100,
  },
  icon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.caption,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  specialty: {
    ...typography.caption,
    textAlign: 'center',
  },
});
