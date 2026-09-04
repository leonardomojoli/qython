import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { ProposedChange } from '../../services/ambulatory';

interface Props {
  visible: boolean;
  changes: ProposedChange[];
  onApply: (accepted: ProposedChange[], rejected: ProposedChange[]) => void;
  onSkip: () => void;
}

const ACTION_COLORS: Record<string, string> = {
  ADD: '#2e7d32',
  REMOVE: '#c62828',
  MODIFY: '#f9a825',
  UPDATE: '#1565c0',
};

const CATEGORY_KEYS: Record<string, string> = {
  medications: 'medications',
  chronic_conditions: 'chronicConditions',
  allergies: 'allergies',
};

function getCategoryLabel(category: string): string {
  if (category.startsWith('demographics')) return 'contactInfo';
  return CATEGORY_KEYS[category] || category;
}

function getActionKey(action: string): string {
  const upper = action.toUpperCase();
  switch (upper) {
    case 'ADD': return 'changeAdd';
    case 'REMOVE': return 'changeRemove';
    case 'MODIFY': return 'changeModify';
    case 'UPDATE': return 'changeUpdate';
    default: return 'changeUpdate';
  }
}

export default function PatientUpdateSheet({
  visible,
  changes,
  onApply,
  onSkip,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(changes.map((_, i) => i)));

  // Reset selection when changes update
  React.useEffect(() => {
    setSelected(new Set(changes.map((_, i) => i)));
  }, [changes]);

  const grouped = useMemo(() => {
    const groups: Record<string, { index: number; change: ProposedChange }[]> = {};
    changes.forEach((change, index) => {
      const key = getCategoryLabel(change.category);
      if (!groups[key]) groups[key] = [];
      groups[key].push({ index, change });
    });
    return groups;
  }, [changes]);

  const allSelected = selected.size === changes.length;

  const toggleItem = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(changes.map((_, i) => i)));
    }
  };

  const handleApply = () => {
    const accepted = changes.filter((_, i) => selected.has(i));
    const rejected = changes.filter((_, i) => !selected.has(i));
    onApply(accepted, rejected);
  };

  const actionColor = (action: string) =>
    ACTION_COLORS[action.toUpperCase()] || ACTION_COLORS.UPDATE;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onSkip}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.background, borderColor: theme.surfaceBorder },
          ]}>
          {/* Handle bar */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: theme.textMuted }]} />
          </View>

          {/* Header */}
          <Text style={[styles.title, { color: theme.text }]}>
            {t('patientUpdatesDetected', 'Atualizações detectadas no cadastro')}
          </Text>
          <Text style={[styles.description, { color: theme.textMuted }]}>
            {t(
              'patientUpdatesDescription',
              'Com base nesta consulta, identificamos possíveis atualizações:',
            )}
          </Text>

          {/* Select all toggle */}
          <TouchableOpacity
            style={[styles.selectAllRow, { borderBottomColor: theme.surfaceBorder }]}
            onPress={toggleAll}
            activeOpacity={0.7}>
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: allSelected ? theme.primary : theme.textMuted,
                  backgroundColor: allSelected ? theme.primary : 'transparent',
                },
              ]}>
              {allSelected && <Text style={styles.checkmark}>{'\u2713'}</Text>}
            </View>
            <Text style={[styles.selectAllText, { color: theme.primary }]}>
              {allSelected
                ? t('deselectAll', 'Desmarcar todos')
                : t('selectAll', 'Selecionar todos')}
            </Text>
          </TouchableOpacity>

          {/* Changes list */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            {Object.entries(grouped).map(([categoryKey, items]) => (
              <View key={categoryKey} style={styles.categorySection}>
                <Text style={[styles.categoryTitle, { color: theme.text }]}>
                  {t(categoryKey, categoryKey)}
                </Text>
                {items.map(({ index, change }) => {
                  const isChecked = selected.has(index);
                  const badgeColor = actionColor(change.action);

                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.changeItem,
                        { borderColor: theme.surfaceBorder },
                      ]}
                      onPress={() => toggleItem(index)}
                      activeOpacity={0.7}>
                      <View style={styles.changeHeader}>
                        <View
                          style={[
                            styles.checkbox,
                            {
                              borderColor: isChecked ? theme.primary : theme.textMuted,
                              backgroundColor: isChecked ? theme.primary : 'transparent',
                            },
                          ]}>
                          {isChecked && (
                            <Text style={styles.checkmark}>{'\u2713'}</Text>
                          )}
                        </View>
                        <View style={styles.changeContent}>
                          <View style={styles.changeTopRow}>
                            <View
                              style={[
                                styles.actionBadge,
                                { backgroundColor: badgeColor },
                              ]}>
                              <Text style={styles.actionBadgeText}>
                                {t(getActionKey(change.action), change.action)}
                              </Text>
                            </View>
                            <Text
                              style={[styles.changeValue, { color: theme.text }]}
                              numberOfLines={2}>
                              {change.value}
                            </Text>
                          </View>
                          {change.old_value && (
                            <Text
                              style={[styles.oldValue, { color: theme.textMuted }]}
                              numberOfLines={1}>
                              {change.old_value} {'\u2192'} {change.value}
                            </Text>
                          )}
                          <Text
                            style={[styles.reasoning, { color: theme.textMuted }]}
                            numberOfLines={2}>
                            {change.reasoning}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          {/* Action buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.skipButton, { borderColor: theme.surfaceBorder }]}
              onPress={onSkip}
              activeOpacity={0.7}>
              <Text style={[styles.skipButtonText, { color: theme.textMuted }]}>
                {t('skipAll', 'Pular')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.applyButton,
                {
                  backgroundColor: selected.size > 0 ? theme.primary : theme.surfaceBorder,
                },
              ]}
              onPress={handleApply}
              disabled={selected.size === 0}
              activeOpacity={0.8}>
              <Text style={styles.applyButtonText}>
                {t('applySelected', 'Aplicar selecionados')} ({selected.size})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingBottom: spacing.lg,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.4,
  },
  title: {
    ...typography.h3,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.bodySmall,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  selectAllText: {
    ...typography.buttonSmall,
    marginLeft: spacing.md,
  },
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  categorySection: {
    marginBottom: spacing.md,
  },
  categoryTitle: {
    ...typography.label,
    fontWeight: '600',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  changeItem: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  changeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  changeContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  changeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  actionBadgeText: {
    ...typography.caption,
    color: '#fff',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  changeValue: {
    ...typography.body,
    fontWeight: '500',
    flex: 1,
  },
  oldValue: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  reasoning: {
    ...typography.caption,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
  skipButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  skipButtonText: {
    ...typography.button,
  },
  applyButton: {
    flex: 2,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  applyButtonText: {
    ...typography.button,
    color: '#fff',
  },
});
