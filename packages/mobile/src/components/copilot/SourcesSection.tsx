import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { ChatSource } from '../../services/copilot';
import { referenceBadgeI18nKey, referenceUrl } from '@qython/shared/src/references';

interface Props {
  sources: ChatSource[];
}

export default function SourcesSection({ sources }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  if (!sources || sources.length === 0) {
    return null;
  }

  const handlePress = (url?: string) => {
    if (url) {
      Linking.openURL(url);
    }
  };

  return (
    <View style={[styles.container, { borderTopColor: theme.surfaceBorder }]}>
      <Text style={[styles.title, { color: theme.textSecondary }]}>
        {t('sources', 'Fontes')}
      </Text>
      {sources.map((source, index) => {
        const url = referenceUrl(source);
        const badge = t(referenceBadgeI18nKey(source));
        return (
          <TouchableOpacity
            key={index}
            style={[styles.source, { backgroundColor: theme.surface }]}
            onPress={() => handlePress(url)}
            disabled={!url}
            activeOpacity={0.7}>
            <View style={styles.sourceRow}>
              <Text style={[styles.sourceNum, { color: theme.primary }]}>[{index + 1}]</Text>
              {badge && (
                <Text
                  style={[
                    styles.badge,
                    {
                      color: theme.primary,
                      borderColor: theme.primary + '55',
                      backgroundColor: theme.primary + '14',
                    },
                  ]}>
                  {badge}
                </Text>
              )}
              <Text
                style={[styles.sourceTitle, { color: url ? theme.text : theme.textMuted }]}
                numberOfLines={2}>
                {source.title}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  title: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  source: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sourceNum: {
    ...typography.caption,
    fontWeight: '700',
  },
  badge: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sourceTitle: {
    ...typography.bodySmall,
    flex: 1,
  },
});
