import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { Library } from '../../types/academic';
import { resolveLibraryIcon } from '../../types/academic';

interface Props {
  library: Library;
  onPress: () => void;
  onDelete: () => void;
  onEdit?: () => void;
}

export default function LibraryCard({ library, onPress, onDelete, onEdit }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const icon = resolveLibraryIcon(library.icon);

  const handleLongPress = () => {
    Alert.alert(
      library.name,
      '',
      [
        ...(onEdit
          ? [{
              text: t('edit', 'Editar'),
              onPress: onEdit,
            }]
          : []),
        {
          text: t('delete', 'Excluir'),
          style: 'destructive' as const,
          onPress: () => {
            Alert.alert(
              t('deleteLibraryConfirmationTitle', 'Confirmar Exclusão'),
              t('deleteLibraryConfirmationMessage', {
                name: library.name,
                defaultValue: `Tem certeza que deseja excluir a biblioteca "${library.name}"?`,
              }),
              [
                { text: t('cancel', 'Cancelar'), style: 'cancel' },
                { text: t('delete', 'Excluir'), style: 'destructive', onPress: onDelete },
              ],
            );
          },
        },
        { text: t('cancel', 'Cancelar'), style: 'cancel' as const },
      ],
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
      ]}
      onPress={onPress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}>
      {/* Action buttons */}
      <View style={styles.cardActions}>
        {onEdit && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.primary + '15' }]}
            onPress={onEdit}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <Text style={[styles.actionIcon, { color: theme.primary }]}>{'\u270E'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.error + '15' }]}
          onPress={handleLongPress}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
          <Text style={[styles.actionIcon, { color: theme.error }]}>{'\u2715'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
        {library.name}
      </Text>
      {library.description ? (
        <Text
          style={[styles.description, { color: theme.textMuted }]}
          numberOfLines={2}>
          {library.description}
        </Text>
      ) : null}
      <Text style={[styles.count, { color: theme.textMuted }]}>
        {library.document_count || 0}{' '}
        {(library.document_count || 0) === 1
          ? t('documentSingular', 'documento')
          : t('documentPlural', 'documentos')}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    margin: spacing.xs,
    alignItems: 'center',
    minHeight: 140,
  },
  cardActions: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    gap: 4,
    zIndex: 1,
  },
  actionBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 12,
    fontWeight: '700',
  },
  icon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  name: {
    ...typography.label,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  count: {
    ...typography.caption,
    marginTop: 'auto' as unknown as number,
  },
});
