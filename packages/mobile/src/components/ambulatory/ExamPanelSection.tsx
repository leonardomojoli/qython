import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface Props {
  label: string;
  exams: Array<{ name: string; code: string }>;
  selectedCodes: Set<string>;
  onToggle: (exam: { name: string; code: string; category?: string }) => void;
}

export default function ExamPanelSection({
  label,
  exams,
  selectedCodes,
  onToggle,
}: Props) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const selectedCount = exams.filter((e) => selectedCodes.has(e.code)).length;

  return (
    <View style={[styles.container, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}>
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
        <View style={styles.headerRight}>
          {selectedCount > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.primary }]}>
              <Text style={styles.badgeText}>{selectedCount}</Text>
            </View>
          )}
          <Text style={[styles.chevron, { color: theme.textMuted }]}>
            {expanded ? '\u25B2' : '\u25BC'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Exam list */}
      {expanded && (
        <View style={[styles.examList, { borderTopColor: theme.surfaceBorder }]}>
          {exams.map((exam) => {
            const isSelected = selectedCodes.has(exam.code);
            return (
              <TouchableOpacity
                key={exam.code}
                style={styles.examRow}
                onPress={() => onToggle(exam)}
                activeOpacity={0.7}>
                <Text style={[styles.checkbox, { color: isSelected ? theme.primary : theme.textMuted }]}>
                  {isSelected ? '\u2611' : '\u2610'}
                </Text>
                <Text
                  style={[
                    styles.examName,
                    { color: isSelected ? theme.text : theme.textSecondary },
                  ]}>
                  {exam.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  badgeText: {
    ...typography.caption,
    color: '#fff',
    fontWeight: '700',
  },
  chevron: {
    ...typography.bodySmall,
  },
  examList: {
    borderTopWidth: 1,
    paddingVertical: spacing.xs,
  },
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  checkbox: {
    fontSize: 20,
    marginRight: spacing.md,
  },
  examName: {
    ...typography.bodySmall,
    flex: 1,
  },
});
