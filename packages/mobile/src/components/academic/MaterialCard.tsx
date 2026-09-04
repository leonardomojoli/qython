import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { MATERIAL_TYPE_CONFIG } from '../../types/academic';
import type { LibraryMaterial } from '../../types/academic';

interface Props {
  material: LibraryMaterial;
  onPress: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f1c40f',
  processing: '#3498db',
  completed: '#27ae60',
  error: '#e74c3c',
};

export default function MaterialCard({ material, onPress }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const config = MATERIAL_TYPE_CONFIG[material.material_type];
  const icon = config?.icon || '\uD83D\uDCC4';
  const labelKey = config?.labelKey || material.material_type;
  const isPending = material.status === 'pending' || material.status === 'processing';
  const statusColor = STATUS_COLORS[material.status] || theme.textMuted;

  const formattedDate = new Date(material.created_at).toLocaleDateString();

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
      disabled={isPending}
      activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {material.title || t(labelKey)}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.date, { color: theme.textMuted }]}>
            {formattedDate}
          </Text>
          {isPending ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={statusColor} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {t('processing', 'Processando...')}
              </Text>
            </View>
          ) : material.status === 'error' ? (
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {t('statusError', 'Erro')}
              </Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {t('completed', 'Pronto')}
              </Text>
            </View>
          )}
        </View>
      </View>
      {!isPending && material.status === 'completed' && (
        <Text style={[styles.chevron, { color: theme.textMuted }]}>{'\u25B8'}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(128,128,128,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  icon: {
    fontSize: 22,
  },
  info: {
    flex: 1,
  },
  title: {
    ...typography.bodySmall,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  date: {
    ...typography.caption,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusText: {
    ...typography.caption,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusBadgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 18,
    marginLeft: spacing.sm,
  },
});
