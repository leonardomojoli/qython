import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface MoreItem {
  key: string;
  label: string;
  icon: string;
  screen: string;
}

export default function MoreScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  const items: MoreItem[] = [
    {
      key: 'notifications',
      label: t('notifications', 'Notificações'),
      icon: '🔔',
      screen: 'NotificationCenter',
    },
    {
      key: 'profile',
      label: t('profile', 'Perfil'),
      icon: '👤',
      screen: 'ProfileStack',
    },
    {
      key: 'anamnesisTemplates',
      label: t('anamnesisTemplates', 'Templates de Anamnese'),
      icon: '📝',
      screen: 'AnamnesisTemplates',
    },
    {
      key: 'connectors',
      label: t('connectorsTitle', 'Conectores'),
      icon: '🔌',
      screen: 'Connectors',
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={[styles.item, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}
          onPress={() => navigation.navigate(item.screen)}
          activeOpacity={0.7}>
          <Text style={styles.itemIcon}>{item.icon}</Text>
          <Text style={[styles.itemLabel, { color: theme.text }]}>{item.label}</Text>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.base,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.base,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  itemIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  itemLabel: {
    ...typography.body,
    flex: 1,
  },
  chevron: {
    fontSize: 24,
    fontWeight: '300',
  },
});
