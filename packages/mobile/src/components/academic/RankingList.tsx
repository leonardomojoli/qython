// Leaderboard de um exame (apresentação pura — o fetch vive no ExamHub do ArenaTab).
// mode='preview': top 3 + vizinhança do usuário; mode='full': lista completa.
// onOvertake: desafio direto à linha imediatamente acima do usuário (só user real).
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type { RankingEntry } from '../../types/academic';

const RANK_MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

type Row = RankingEntry | { gap: true };

interface Props {
  ranking: RankingEntry[];
  mode?: 'preview' | 'full';
  currentUserDisplay: string;
  onOvertake?: (name: string) => void;
}

export default function RankingList({ ranking, mode = 'full', currentUserDisplay, onOvertake }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  if (ranking.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>
          {t('noRankingData', 'Nenhum dado de ranking ainda.')}
        </Text>
      </View>
    );
  }

  const myEntry = ranking.find((r) => r.isRealUser && r.name === currentUserDisplay) || null;
  const myRank = myEntry?.rank ?? null;

  let rows: Row[] = ranking;
  if (mode === 'preview') {
    if (myRank && myRank > 4) {
      const vicinity = ranking.filter((r) => Math.abs(r.rank - myRank) <= 1);
      rows = [...ranking.slice(0, 3), { gap: true }, ...vicinity];
    } else {
      rows = ranking.slice(0, 6);
    }
  }

  return (
    <View>
      {rows.map((row, idx) => {
        if ('gap' in row) {
          return (
            <Text key={`gap-${idx}`} style={[styles.gapRow, { color: theme.textMuted }]}>
              ···
            </Text>
          );
        }
        const item = row;
        const isCurrentUser = item.name === currentUserDisplay;
        const isTop3 = item.rank <= 3;
        const medalColor = isTop3 ? MEDAL_COLORS[item.rank - 1] : undefined;
        const medal = RANK_MEDALS[item.rank];
        const canOvertake = Boolean(
          onOvertake && myRank && item.rank === myRank - 1 &&
          item.isRealUser && item.name?.startsWith('@') && !isCurrentUser,
        );

        return (
          <View
            key={item.rank}
            style={[
              styles.row,
              { borderBottomColor: theme.surfaceBorder },
              isCurrentUser && { backgroundColor: theme.primary + '15' },
            ]}>
            <View
              style={[
                styles.rankBadge,
                medalColor
                  ? { backgroundColor: medalColor }
                  : { backgroundColor: theme.surface },
              ]}>
              {medal ? (
                <Text style={styles.medalEmoji}>{medal}</Text>
              ) : (
                <Text
                  style={[
                    styles.rankText,
                    { color: theme.textMuted },
                  ]}>
                  {item.rank}
                </Text>
              )}
            </View>
            <Text
              style={[styles.name, { color: theme.text }, isCurrentUser && { fontWeight: '600' }]}
              numberOfLines={1}>
              {item.name}
              {isCurrentUser ? ` (${t('you', 'você')})` : ''}
            </Text>
            {canOvertake && (
              <TouchableOpacity
                style={[styles.overtakeBtn, { borderColor: theme.primary + '50', backgroundColor: theme.primary + '10' }]}
                onPress={() => onOvertake!(item.name)}>
                <Text style={[styles.overtakeText, { color: theme.primary }]}>
                  ⚔️ {t('overtake', 'Ultrapassar')}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.score, { color: theme.primary }]}>
              {(item.xp ?? 0).toLocaleString()} XP
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  gapRow: {
    ...typography.caption,
    textAlign: 'center',
    paddingVertical: 2,
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  rankText: {
    ...typography.caption,
    fontWeight: '700',
  },
  medalEmoji: {
    fontSize: 16,
  },
  name: {
    ...typography.bodySmall,
    flex: 1,
  },
  overtakeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  overtakeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  score: {
    ...typography.label,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
