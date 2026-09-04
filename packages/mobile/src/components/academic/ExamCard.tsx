import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { ArenaExam } from '../../types/academic';

interface Props {
  exam: ArenaExam;
  isEnrolled: boolean;
  onPlay: () => void;
  onEnroll: () => void;
  onUnenroll: () => void;
}

export default function ExamCard({
  exam,
  isEnrolled,
  onPlay,
  onEnroll,
  onUnenroll,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
        isEnrolled && { borderColor: theme.primary + '60' },
      ]}>
      <View style={styles.headerRow}>
        <Text style={styles.flag}>{exam.flag}</Text>
        <View style={styles.info}>
          <Text style={[styles.title, { color: theme.text }]}>{t(exam.title_key)}</Text>
          <Text style={[styles.country, { color: theme.textMuted }]}>{exam.country}</Text>
        </View>
      </View>

      <Text style={[styles.desc, { color: theme.textMuted }]} numberOfLines={2}>
        {t(exam.description_key)}
      </Text>

      <View style={styles.actions}>
        {isEnrolled ? (
          <>
            <TouchableOpacity
              style={[styles.playBtn, { backgroundColor: theme.primary }]}
              onPress={onPlay}
              activeOpacity={0.8}>
              <Text style={styles.playText}>▶ {t('startQuiz', 'Iniciar Simulado')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.leaveBtn, { borderColor: theme.surfaceBorder }]}
              onPress={onUnenroll}>
              <Text style={[styles.leaveBtnText, { color: theme.textMuted }]}>
                {t('leave', 'Sair')}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.enrollBtn, { backgroundColor: theme.primary }]}
            onPress={onEnroll}
            activeOpacity={0.8}>
            <Text style={styles.enrollText}>{t('enroll', 'Inscrever-se')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  flag: {
    fontSize: 28,
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
  },
  title: {
    ...typography.label,
    fontWeight: '600',
  },
  country: {
    ...typography.caption,
  },
  desc: {
    ...typography.bodySmall,
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  playBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  playText: {
    ...typography.buttonSmall,
    color: '#fff',
  },
  leaveBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  leaveBtnText: {
    ...typography.buttonSmall,
  },
  enrollBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  enrollText: {
    ...typography.buttonSmall,
    color: '#fff',
  },
});
