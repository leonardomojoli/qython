import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { getSubtemplatesForSpecialty } from '../../data/subtemplates';
import type { Subtemplate } from '../../types/ambulatory';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (content: string) => void;
  specialty: string;
}

interface CategorySection {
  key: string;
  labelKey: string;
  items: Subtemplate[];
}

export default function SubtemplateSheet({
  visible,
  onClose,
  onSelect,
  specialty,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const sections: CategorySection[] = useMemo(() => {
    const grouped = getSubtemplatesForSpecialty(specialty);
    return Object.entries(grouped).map(([key, value]) => ({
      key,
      labelKey: value.labelKey,
      items: value.items,
    }));
  }, [specialty]);

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelect = (content: string) => {
    onSelect(content);
    onClose();
  };

  const renderCategory = ({ item }: { item: CategorySection }) => {
    const isExpanded = expandedCategories.has(item.key);

    return (
      <View>
        <TouchableOpacity
          style={[styles.categoryHeader, { borderBottomColor: theme.surfaceBorder }]}
          onPress={() => toggleCategory(item.key)}
          activeOpacity={0.7}>
          <Text style={[styles.categoryLabel, { color: theme.text }]}>
            {t(item.labelKey, item.labelKey)}
          </Text>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>
            {isExpanded ? '\u25B2' : '\u25BC'}
          </Text>
        </TouchableOpacity>

        {isExpanded &&
          item.items.map((sub) => (
            <TouchableOpacity
              key={sub.id}
              style={[styles.subtemplateItem, { borderBottomColor: theme.surfaceBorder }]}
              onPress={() => handleSelect(sub.content)}
              activeOpacity={0.7}>
              <Text style={[styles.subtemplateText, { color: theme.textSecondary }]}>
                {t(sub.labelKey, sub.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.headerButton, { color: theme.textMuted }]}>
              {t('close', 'Fechar')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {t('clinicalProtocols', 'Protocolos Clínicos')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {sections.length > 0 ? (
          <FlatList
            data={sections}
            keyExtractor={(item) => item.key}
            renderItem={renderCategory}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>{'\uD83D\uDCCB'}</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {t(
                'noProtocolsForSpecialty',
                'Nenhum protocolo disponível para esta especialidade',
              )}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  headerButton: {
    ...typography.body,
  },
  headerSpacer: {
    width: 60,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
  },
  categoryLabel: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
  },
  chevron: {
    fontSize: 12,
    marginLeft: spacing.sm,
  },
  subtemplateItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subtemplateText: {
    ...typography.bodySmall,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.base,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 24,
  },
});
