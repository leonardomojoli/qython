import React, { useState, useEffect, useMemo } from 'react';
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
import {
  getAllAchievementDefs,
  getUserAchievements,
  getUserStats,
  type AchievementDef,
  type UserAchievement,
  type UserStats,
} from '../../services/profile';

const CATEGORY_ORDER = ['onboarding', 'consultas', 'arena', 'pesquisa'];
const CATEGORY_LABELS: Record<string, string> = {
  onboarding: 'Bem-Vindo',
  consultas: 'Consultas',
  arena: 'Arena',
  pesquisa: 'Pesquisa',
};
const TIER_COLORS: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  diamond: '#B9F2FF',
};

export default function AchievementsSection() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [allDefs, setAllDefs] = useState<Record<string, AchievementDef>>({});
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [defs, achievements, userStats] = await Promise.all([
          getAllAchievementDefs(),
          getUserAchievements(),
          getUserStats(),
        ]);
        setAllDefs(defs);
        setUserAchievements(achievements);
        setStats(userStats);
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const unlockedSet = useMemo(
    () => new Set(userAchievements.map(a => a.badge_code)),
    [userAchievements],
  );

  const achievementsByDate = useMemo(() => {
    const map: Record<string, string> = {};
    userAchievements.forEach(a => {
      map[a.badge_code] = new Date(a.achieved_at).toLocaleDateString();
    });
    return map;
  }, [userAchievements]);

  const grouped = useMemo(() => {
    const groups: Record<string, { code: string; def: AchievementDef }[]> = {};
    Object.entries(allDefs).forEach(([code, def]) => {
      if (!groups[def.category]) groups[def.category] = [];
      groups[def.category].push({ code, def });
    });
    return groups;
  }, [allDefs]);

  const getProgressForCategory = (category: string) => {
    if (!stats) return null;
    const badges = grouped[category] || [];
    const thresholds = badges.map(b => {
      const match = b.code.match(/_(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    }).filter(t => t > 0).sort((a, b) => a - b);

    let current = 0;
    switch (category) {
      case 'consultas': current = stats.consultations_created; break;
      case 'arena': current = stats.quizzes_completed; break;
      case 'pesquisa': current = stats.copilot_conversations; break;
      default: return null;
    }

    const nextThreshold = thresholds.find(t => current < t);
    if (!nextThreshold) return null;
    return { current, target: nextThreshold, pct: Math.min(Math.round((current / nextThreshold) * 100), 100) };
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (Object.keys(allDefs).length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>
          {t('noAchievements', 'Nenhuma conquista disponivel.')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {CATEGORY_ORDER.filter(cat => grouped[cat]).map(cat => {
        const badges = grouped[cat];
        const progress = getProgressForCategory(cat);
        return (
          <View key={cat} style={styles.categorySection}>
            <Text style={[styles.categoryTitle, { color: theme.text }]}>
              {t(`achievementCat_${cat}`, CATEGORY_LABELS[cat] || cat)}
            </Text>

            {/* Progress bar */}
            {progress && (
              <View style={styles.progressSection}>
                <View style={[styles.progressBar, { backgroundColor: theme.surfaceBorder }]}>
                  <View style={[styles.progressFill, { width: `${progress.pct}%`, backgroundColor: theme.primary }]} />
                </View>
                <Text style={[styles.progressText, { color: theme.textMuted }]}>
                  {progress.current}/{progress.target}
                </Text>
              </View>
            )}

            {/* Badges grid */}
            <View style={styles.badgesGrid}>
              {badges.map(({ code, def }) => {
                const unlocked = unlockedSet.has(code);
                const tierColor = TIER_COLORS[def.tier] || theme.textMuted;
                return (
                  <View
                    key={code}
                    style={[
                      styles.badge,
                      { backgroundColor: theme.surface, borderColor: unlocked ? tierColor : theme.surfaceBorder },
                      !unlocked && styles.badgeLocked,
                    ]}>
                    <Text style={styles.badgeIcon}>{def.icon}</Text>
                    <Text
                      style={[styles.badgeTitle, { color: unlocked ? theme.text : theme.textMuted }]}
                      numberOfLines={2}>
                      {def.title}
                    </Text>
                    {unlocked ? (
                      <Text style={[styles.badgeDate, { color: tierColor }]}>
                        {'\u2713'} {achievementsByDate[code]}
                      </Text>
                    ) : (
                      <Text style={[styles.badgeDate, { color: theme.textMuted }]}>
                        {'\u25CB'}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyText: { ...typography.body, textAlign: 'center' },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  categorySection: { marginBottom: spacing.lg },
  categoryTitle: {
    ...typography.label, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: spacing.sm,
  },
  progressSection: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md,
  },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },
  progressFill: { height: 4, borderRadius: 2 },
  progressText: { ...typography.caption, fontVariant: ['tabular-nums'] },
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    width: '30%', borderRadius: borderRadius.lg, borderWidth: 1.5,
    padding: spacing.sm, alignItems: 'center', minHeight: 90,
  },
  badgeLocked: { opacity: 0.5 },
  badgeIcon: { fontSize: 24, marginBottom: spacing.xs },
  badgeTitle: { ...typography.caption, fontWeight: '600', textAlign: 'center', marginBottom: spacing.xs },
  badgeDate: { ...typography.caption, fontSize: 10 },
});
