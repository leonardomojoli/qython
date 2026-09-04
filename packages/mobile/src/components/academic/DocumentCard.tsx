import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { LibraryDocument } from '../../types/academic';
import { DOCUMENT_STATUS_CONFIG } from '../../types/academic';

interface Props {
  document: LibraryDocument;
  onDelete: () => void;
  onRetry?: () => void;
}

export default function DocumentCard({ document: doc, onDelete, onRetry }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const statusConfig = DOCUMENT_STATUS_CONFIG[doc.status];

  const displayName = doc.original_filename.replace(/\.[^/.]+$/, '');
  const extension = doc.original_filename.split('.').pop()?.toUpperCase() || '';
  const isPending = doc.status === 'pending' || doc.status === 'processing';

  const handleDelete = () => {
    Alert.alert(
      t('deleteDocumentConfirmationTitle', 'Confirmar Exclusão de Documento'),
      t('deleteDocumentConfirmationMessage', {
        name: doc.original_filename,
        defaultValue: `Tem certeza que deseja excluir o documento "${doc.original_filename}"?`,
      }),
      [
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
        { text: t('delete', 'Excluir'), style: 'destructive', onPress: onDelete },
      ],
    );
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.surfaceBorder,
          shadowColor: theme.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.07,
          shadowRadius: 7,
          elevation: 2,
        },
      ]}>
      <View style={styles.fileIcon}>
        <Text style={styles.extensionText}>{extension}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
          {displayName}
        </Text>
        <View style={styles.statusRow}>
          {isPending ? (
            <ActivityIndicator size="small" color={statusConfig.color} />
          ) : (
            <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
          )}
          <Text style={[styles.statusText, { color: statusConfig.color }]}>
            {t(statusConfig.labelKey)}
          </Text>
        </View>
      </View>
      {doc.status === 'error' && onRetry && (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} hitSlop={8}>
          <Text style={[styles.retryText, { color: theme.primary }]}>↻</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} hitSlop={8}>
        <Text style={[styles.deleteText, { color: theme.textMuted }]}>✕</Text>
      </TouchableOpacity>
    </View>
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
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(128,128,128,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  extensionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
  },
  info: {
    flex: 1,
  },
  name: {
    ...typography.bodySmall,
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...typography.caption,
  },
  retryBtn: {
    padding: spacing.sm,
  },
  retryText: {
    fontSize: 18,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: spacing.sm,
  },
  deleteText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
