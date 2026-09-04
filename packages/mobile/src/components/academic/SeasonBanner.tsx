import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { Season } from '../../types/academic';

interface Props {
  season: Season;
}

export default function SeasonBanner({ season }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const timerText = season.is_active
    ? `${season.days_remaining} ${t('daysRemaining', 'dias restantes')}`
    : `${t('startsIn', 'Começa em')} ${season.days_until_start} ${t('days', 'dias')}`;

  return (
    <View style={[styles.banner, { backgroundColor: theme.primary + '20' }]}>
      <View style={styles.row}>
        <View>
          <Text style={[styles.label, { color: theme.primary }]}>
            {t('currentSeason', 'Temporada Atual')}
          </Text>
          <Text style={[styles.name, { color: theme.text }]}>{season.name}</Text>
        </View>
        <View style={[styles.timerBadge, { backgroundColor: theme.primary + '30' }]}>
          <Text style={[styles.timerText, { color: theme.primary }]}>{timerText}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    margin: spacing.base,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  name: {
    ...typography.h3,
    marginTop: spacing.xs,
  },
  timerBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  timerText: {
    ...typography.caption,
    fontWeight: '600',
  },
});
