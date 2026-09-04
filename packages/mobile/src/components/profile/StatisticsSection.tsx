import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { getComprehensiveStats, type ComprehensiveStats } from '../../services/profile';

export default function StatisticsSection() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [stats, setStats] = useState<ComprehensiveStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getComprehensiveStats();
        setStats(data);
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>
          {t('stats.noDataYet', 'Sem dados ainda. Comece a usar o Qython!')}
        </Text>
      </View>
    );
  }

  const { overview, consultations, academic } = stats;

  const overviewCards = [
    { label: t('stats.consultations', 'Consultas'), value: overview.total_consultations, color: '#03dac6', icon: '\u{1FA7A}' },
    { label: t('stats.materialsGenerated', 'Materiais'), value: overview.total_materials, color: '#ffc107', icon: '\uD83D\uDCDA' },
    { label: t('stats.arenaScore', 'Score Arena'), value: overview.arena_score, color: '#4caf50', icon: '\uD83C\uDFC6' },
  ];

  const topSpecialties = Object.entries(consultations.by_specialty || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Overview KPIs */}
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        {t('stats.overview', 'Visao Geral')}
      </Text>
      <View style={styles.overviewGrid}>
        {overviewCards.map((card, idx) => (
          <View key={idx} style={[styles.kpiCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            <Text style={styles.kpiIcon}>{card.icon}</Text>
            <Text style={[styles.kpiValue, { color: card.color }]}>{card.value}</Text>
            <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>{card.label}</Text>
          </View>
        ))}
      </View>

      {/* Consultations by specialty */}
      {topSpecialties.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t('stats.bySpecialty', 'Por Especialidade')}
          </Text>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            {topSpecialties.map(([specialty, count], idx) => {
              const maxCount = topSpecialties[0][1] as number;
              const pct = maxCount > 0 ? Math.round(((count as number) / maxCount) * 100) : 0;
              return (
                <View key={idx} style={styles.barRow}>
                  <Text style={[styles.barLabel, { color: theme.text }]} numberOfLines={1}>
                    {specialty}
                  </Text>
                  <View style={styles.barContainer}>
                    <View style={[styles.barTrack, { backgroundColor: theme.surfaceBorder }]}>
                      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: '#03dac6' }]} />
                    </View>
                    <Text style={[styles.barValue, { color: theme.textMuted }]}>{count}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Academic stats */}
      {academic && academic.quizzes_completed > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t('stats.academicCenter', 'Centro Academico')}
          </Text>
          <View style={styles.statusGrid}>
            {[
              { label: t('stats.quizzesCompleted', 'Quizzes'), value: academic.quizzes_completed, color: '#bb86fc' },
              { label: t('stats.correctRate', 'Acertos'), value: `${Math.round(academic.correct_rate * 100)}%`, color: '#4caf50' },
              { label: t('stats.totalScore', 'Pontuacao'), value: overview.arena_score, color: '#ffc107' },
            ].map((item, idx) => (
              <View key={idx} style={[styles.statusCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                <Text style={[styles.statusValue, { color: item.color }]}>{item.value}</Text>
                <Text style={[styles.statusLabel, { color: theme.textMuted }]}>{item.label}</Text>
              </View>
            ))}
          </View>
          {academic.correct_rate > 0 && (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
              <Text style={[styles.avgLabel, { color: theme.textMuted, marginBottom: spacing.xs }]}>
                {t('stats.correctRate', 'Taxa de Acertos')}
              </Text>
              <View style={[styles.barTrack, { backgroundColor: theme.surfaceBorder, height: 8, borderRadius: 4 }]}>
                <View
                  style={[styles.barFill, {
                    width: `${Math.round(academic.correct_rate * 100)}%`,
                    backgroundColor: '#4caf50',
                    height: 8,
                    borderRadius: 4,
                  }]}
                />
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyText: { ...typography.body, textAlign: 'center' },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  sectionTitle: {
    ...typography.label, fontWeight: '700', marginBottom: spacing.md, marginTop: spacing.md,
  },
  overviewGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  kpiCard: {
    width: '47%', borderRadius: borderRadius.lg, borderWidth: 1,
    padding: spacing.md, alignItems: 'center',
  },
  kpiIcon: { fontSize: 24, marginBottom: spacing.xs },
  kpiValue: { ...typography.h2, fontWeight: '700', fontVariant: ['tabular-nums'] },
  kpiLabel: { ...typography.caption, marginTop: spacing.xs, textAlign: 'center' },
  card: {
    borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.base, marginBottom: spacing.sm,
  },
  barRow: { marginBottom: spacing.sm },
  barLabel: { ...typography.bodySmall, fontWeight: '500', marginBottom: 4 },
  barContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barTrack: { flex: 1, height: 6, borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },
  barValue: { ...typography.caption, fontVariant: ['tabular-nums'], width: 30, textAlign: 'right' },
  statusGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statusCard: {
    flex: 1, borderRadius: borderRadius.lg, borderWidth: 1,
    padding: spacing.md, alignItems: 'center',
  },
  statusValue: { ...typography.h3, fontWeight: '700' },
  statusLabel: { ...typography.caption, marginTop: spacing.xs },
  avgRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs,
  },
  avgLabel: { ...typography.bodySmall },
  avgValue: { ...typography.bodySmall, fontWeight: '600' },
});
