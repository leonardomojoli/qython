import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { GovernmentProgram } from '../../types/pharmacy';

interface Props {
  programs: GovernmentProgram[];
  fallbackFarmaciaPopular?: boolean;
  selectedCountry?: string;
  compact?: boolean;
}

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  farmacia_popular: { bg: '#27ae6030', text: '#27ae60' },
  cbaf: { bg: '#3498db30', text: '#3498db' },
  ceaf: { bg: '#8e44ad30', text: '#8e44ad' },
  free: { bg: '#27ae6030', text: '#27ae60' },
  subsidy: { bg: '#f39c1230', text: '#f39c12' },
};

function getShortName(name: string): string {
  const idx = name.indexOf(' - ');
  return idx > 0 ? name.substring(0, idx) : name;
}

export default function GovProgramBadge({
  programs,
  fallbackFarmaciaPopular,
  selectedCountry,
  compact,
}: Props) {
  const { t } = useTranslation();

  if (programs.length > 0) {
    return (
      <View style={styles.container}>
        {programs.map((prog) => {
          const displayName = compact ? getShortName(prog.name) : prog.name;
          const colorKey = BADGE_COLORS[prog.code] ||
            (prog.all_items_free ? BADGE_COLORS.free : BADGE_COLORS.subsidy);
          return (
            <View
              key={prog.code}
              style={[styles.badge, { backgroundColor: colorKey.bg }]}>
              <Text style={[styles.badgeText, { color: colorKey.text }]} numberOfLines={1}>
                {prog.all_items_free
                  ? `${t('govProgramFreeLabel')} - ${displayName}`
                  : `${t('govProgramSubsidyLabel')} - ${displayName}`}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  if (selectedCountry === 'br' && fallbackFarmaciaPopular) {
    return (
      <View style={styles.container}>
        <View style={[styles.badge, { backgroundColor: BADGE_COLORS.free.bg }]}>
          <Text style={[styles.badgeText, { color: BADGE_COLORS.free.text }]} numberOfLines={1}>
            {t('govProgramFreeBr')}
          </Text>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
});
