import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNetwork } from '../../contexts/NetworkContext';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
}

export default function OfflineFeatureGate({ children, fallbackMessage }: Props) {
  const { isInternetReachable } = useNetwork();
  const { theme } = useTheme();
  const { t } = useTranslation();

  if (isInternetReachable) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
      <Text style={[styles.text, { color: theme.textMuted }]}>
        {fallbackMessage || t('offlineFeatureGate', 'Requer conexao com a internet')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  text: {
    ...typography.caption,
    textAlign: 'center',
  },
});
