// Arena em DUAS zonas (paridade com o web): "Ligas Nacionais" (disputar com todos —
// hub por exame com posição nacional + catálogo embutido) e "Meus Concursos"
// (treinar no seu ritmo). O catálogo não é mais aba: é matrícula dentro da disputa.
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useUser } from '../../contexts/UserContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  getAvailableExams,
  getEnrolledExams,
  getExamRanking,
  enrollInExam,
  unenrollFromExam,
  getCurrentSeason,
  startQuiz,
  getMyXpProfile,
} from '../../services/academic';
import type { ArenaExam, Season, JobStatus, XpProfile, RankingEntry } from '../../types/academic';
import { WEB_BASE_URL } from '../../config/env';
import { ARENA_ALLOWED_PLANS } from '../../types/academic';
import SeasonBanner from '../../components/academic/SeasonBanner';
import ExamCard from '../../components/academic/ExamCard';
import RankingList from '../../components/academic/RankingList';
import QuizPlayerModal from '../../components/academic/QuizPlayerModal';
import ChallengeSection from '../../components/academic/ChallengeSection';
import MeusConcursosView from '../../components/academic/MeusConcursosView';

// Mini-hub de um exame inscrito: posição nacional + ações + ranking (preview/completo).
// Definido FORA do ArenaTab — componente estável entre renders (estado próprio não reseta).
interface ExamHubProps {
  exam: ArenaExam;
  currentUserDisplay: string;
  refreshTick: number;
  onPlay: () => void;
  onChallenge: () => void;
  onOvertake: (name: string) => void;
  onUnenroll: () => void;
}

function ExamHub({
  exam,
  currentUserDisplay,
  refreshTick,
  onPlay,
  onChallenge,
  onOvertake,
  onUnenroll,
}: ExamHubProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [ranking, setRanking] = useState<RankingEntry[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    getExamRanking(exam.exam_code)
      .then((data) => {
        if (alive) setRanking(data.ranking_data || []);
      })
      .catch(() => {
        if (alive) setRanking([]);
      });
    return () => {
      alive = false;
    };
  }, [exam.exam_code, refreshTick]);

  const myEntry = ranking?.find((r) => r.isRealUser && r.name === currentUserDisplay) || null;
  const total = ranking?.length || 0;
  const topPct = myEntry && total > 0 ? Math.max(1, Math.round((myEntry.rank / total) * 100)) : null;

  return (
    <View style={[styles.hubCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
      <View style={styles.hubHeader}>
        <Text style={styles.hubFlag}>{exam.flag}</Text>
        <View style={styles.hubInfo}>
          <Text style={[styles.hubTitle, { color: theme.text }]} numberOfLines={1}>
            {t(exam.title_key)}
          </Text>
          <Text style={[styles.hubCountry, { color: theme.textMuted }]}>{exam.country}</Text>
        </View>
        {myEntry ? (
          <View style={styles.hubPosition}>
            <Text style={[styles.hubPositionRank, { color: theme.text }]}>
              #{myEntry.rank}{' '}
              <Text style={[styles.hubPositionTotal, { color: theme.textMuted }]}>
                {t('rankOfTotal', { total, defaultValue: `de ${total}` })}
              </Text>
            </Text>
            {topPct !== null && topPct <= 50 && (
              <Text style={styles.hubPositionPct}>
                {t('topPercent', { pct: topPct, defaultValue: `top ${topPct}%` })}
              </Text>
            )}
          </View>
        ) : ranking !== null ? (
          <Text style={[styles.hubPositionHint, { color: theme.textMuted }]}>
            {t('noXpInExam', 'Sem XP neste exame ainda — jogue para entrar no ranking')}
          </Text>
        ) : null}
      </View>

      <View style={styles.hubActions}>
        <TouchableOpacity
          style={[styles.hubPlayBtn, { backgroundColor: theme.primary }]}
          onPress={onPlay}
          activeOpacity={0.8}>
          <Text style={styles.hubPlayText}>▶ {t('startQuiz', 'Iniciar Simulado')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.hubChallengeBtn} onPress={onChallenge}>
          <Text style={styles.hubChallengeText}>⚔️ {t('challenge', 'Desafiar')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.hubRankToggle, { borderColor: theme.surfaceBorder }]}
          onPress={() => setExpanded((v) => !v)}>
          <Text style={[styles.hubRankToggleText, { color: theme.textMuted }]}>
            {t('ranking', 'Ranking')} {expanded ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.hubLeaveBtn} onPress={onUnenroll}>
          <Text style={[styles.hubLeaveText, { color: theme.textMuted }]}>{t('leave', 'Sair')}</Text>
        </TouchableOpacity>
      </View>

      {ranking === null ? (
        <View style={styles.hubLoading}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <RankingList
          ranking={ranking}
          mode={expanded ? 'full' : 'preview'}
          currentUserDisplay={currentUserDisplay}
          onOvertake={onOvertake}
        />
      )}
    </View>
  );
}

export default function ArenaTab() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { user } = useUser();

  const [exams, setExams] = useState<ArenaExam[]>([]);
  const [enrolledCodes, setEnrolledCodes] = useState<string[]>([]);
  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'ligas' | 'meusCards'>('ligas');
  const [showCatalog, setShowCatalog] = useState(false);
  const [activeJob, setActiveJob] = useState<JobStatus | null>(null);
  const [xpProfile, setXpProfile] = useState<XpProfile | null>(null);
  const [challengePrefill, setChallengePrefill] = useState<{ examCode: string; opponent?: string; ts: number } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const hasAccess =
    ARENA_ALLOWED_PLANS.includes(user?.plan || '') || false;
  const currentUserDisplay = user?.username ? `@${user.username}` : user?.full_name || '';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [examsData, enrolledData, seasonData, profileData] = await Promise.all([
        getAvailableExams(),
        getEnrolledExams(),
        getCurrentSeason().catch(() => ({ season: null })),
        getMyXpProfile().catch(() => null),
      ]);
      setExams(examsData || []);
      setEnrolledCodes(enrolledData?.enrolled_codes || []);
      setSeason(seasonData?.season || null);
      setXpProfile(profileData || null);
      setRefreshTick((tick) => tick + 1);
    } catch {
      Alert.alert('', t('errorFetchingArenaData', 'Erro ao carregar os dados da Arena.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (hasAccess) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [fetchData, hasAccess]);

  const handleEnroll = async (examCode: string) => {
    try {
      await enrollInExam(examCode);
      Alert.alert('', t('enrollSuccess', 'Inscrição realizada com sucesso!'));
      setShowCatalog(false);
      fetchData();
    } catch {
      Alert.alert('', t('errorEnrolling', 'Erro ao inscrever-se.'));
    }
  };

  const handleUnenroll = async (examCode: string) => {
    try {
      await unenrollFromExam(examCode);
      Alert.alert('', t('unenrollSuccess', 'Inscrição removida com sucesso.'));
      fetchData();
    } catch {
      Alert.alert('', t('errorUnenrolling', 'Erro ao cancelar inscrição.'));
    }
  };

  const handleStartQuiz = async (exam: ArenaExam) => {
    try {
      const job = await startQuiz(exam.exam_code, exam.exam_code, exam.language);
      setActiveJob(job);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('errorStartingSimulado', 'Erro ao iniciar simulado.');
      Alert.alert('', msg);
    }
  };

  const handleCloseQuiz = () => {
    setActiveJob(null);
    fetchData();
  };

  const handleShareResult = async (score: number, total: number, correct: number) => {
    try {
      const message = t('shareResultMessage', {
        score,
        correct,
        total,
        defaultValue: `Fiz ${correct}/${total} no simulado da Arena Qython! Pontuacao: ${score}`,
      });
      await Share.share({
        title: t('shareResult', 'Compartilhar Resultado'),
        message: `${message}\n\n${WEB_BASE_URL}`,
      });
    } catch {
      // User cancelled share
    }
  };

  // Upgrade screen for plans without access
  if (!hasAccess) {
    return (
      <View style={styles.upgradeContainer}>
        <Text style={styles.upgradeIcon}>🏆</Text>
        <Text style={[styles.upgradeTitle, { color: theme.text }]}>
          {t('arenaUpgradeTitle', 'Arena Qython')}
        </Text>
        <Text style={[styles.upgradeDesc, { color: theme.textMuted }]}>
          {t('arenaUpgradeDesc', 'Compete nos rankings nacionais de residência médica! Disponível a partir do Plano Residente.')}
        </Text>
        <View style={styles.upgradeBenefits}>
          <Text style={[styles.benefitText, { color: theme.text }]}>
            🏆 {t('arenaFeature1', 'Rankings nacionais por prova')}
          </Text>
          <Text style={[styles.benefitText, { color: theme.text }]}>
            📊 {t('arenaFeature2', 'Simulados com questões reais')}
          </Text>
          <Text style={[styles.benefitText, { color: theme.text }]}>
            🎯 {t('arenaFeature3', 'Compare seu desempenho com milhares')}
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const enrolledExams = enrolledCodes
    .map((code) => exams.find((e) => e.exam_code === code))
    .filter(Boolean) as ArenaExam[];

  const hasAnyXp = (xpProfile?.total_xp || 0) > 0 || (xpProfile?.season_xp || 0) > 0;

  // Catálogo de exames = matrícula na disputa (hero quando não há inscrição)
  const renderCatalog = (isHero: boolean) => (
    <View style={styles.catalogSection}>
      <View style={styles.catalogHeader}>
        <Text style={[styles.catalogTitle, { color: theme.text }]}>
          🌍 {t('catalogHeroTitle', 'Escolha seu concurso e entre na disputa')}
        </Text>
        {!isHero && (
          <TouchableOpacity onPress={() => setShowCatalog(false)}>
            <Text style={[styles.catalogClose, { color: theme.textMuted }]}>▲</Text>
          </TouchableOpacity>
        )}
      </View>
      {exams.map((exam) => (
        <ExamCard
          key={exam.exam_code}
          exam={exam}
          isEnrolled={enrolledCodes.includes(exam.exam_code)}
          onPlay={() => handleStartQuiz(exam)}
          onEnroll={() => handleEnroll(exam.exam_code)}
          onUnenroll={() => handleUnenroll(exam.exam_code)}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Duas zonas: disputar × treinar */}
      <View style={[styles.modeSwitch, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity
          style={[
            styles.modeBtn,
            activeView === 'ligas' && { borderBottomColor: theme.primary },
          ]}
          onPress={() => setActiveView('ligas')}>
          <Text
            style={[
              styles.modeTitle,
              { color: activeView === 'ligas' ? theme.primary : theme.textMuted },
            ]}>
            🏆 {t('myRankings', 'Ligas Nacionais')}
          </Text>
          <Text style={[styles.modeSub, { color: theme.textMuted }]}>
            {t('arenaModeLigasSub', 'Dispute com seus concorrentes')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modeBtn,
            activeView === 'meusCards' && { borderBottomColor: theme.primary },
          ]}
          onPress={() => setActiveView('meusCards')}>
          <Text
            style={[
              styles.modeTitle,
              { color: activeView === 'meusCards' ? theme.primary : theme.textMuted },
            ]}>
            🗂️ {t('mcTitle', 'Meus Concursos')}
          </Text>
          <Text style={[styles.modeSub, { color: theme.textMuted }]}>
            {t('arenaModeTreinoSub', 'Treine no seu ritmo')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Temporada pertence à disputa (fora do scroll, largura cheia como antes) */}
      {activeView === 'ligas' && season && <SeasonBanner season={season} />}

      <ScrollView contentContainerStyle={styles.content}>
        {activeView === 'ligas' ? (
          <>
            {xpProfile && !hasAnyXp && (
              <View style={[styles.xpCard, styles.xpEmptyCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                <Text style={styles.xpEmptyIcon}>🏁</Text>
                <View style={styles.xpEmptyInfo}>
                  <Text style={[styles.xpEmptyTitle, { color: theme.text }]}>
                    {t('arenaXpEmptyTitle', 'Entre na disputa')}
                  </Text>
                  <Text style={[styles.xpEmptyDesc, { color: theme.textMuted }]}>
                    {t('arenaXpEmptyDesc', 'Complete um simulado para ganhar seus primeiros XP e aparecer no ranking da temporada.')}
                  </Text>
                </View>
              </View>
            )}
            {xpProfile && hasAnyXp && (
              <View style={[styles.xpCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                <View style={styles.xpCardMain}>
                  <View style={styles.xpLeagueSection}>
                    <Text style={styles.xpSeasonIcon}>⚡</Text>
                    <View>
                      <Text style={[styles.xpSeasonLabel, { color: theme.textMuted }]}>
                        {t('seasonXpLabel', 'XP da temporada')}
                      </Text>
                      <Text style={[styles.xpSeasonXp, { color: theme.text }]}>
                        {(xpProfile.season_xp || 0).toLocaleString()} XP
                      </Text>
                    </View>
                  </View>
                  <View style={styles.xpStatsRow}>
                    {xpProfile.current_streak > 0 && (
                      <View style={[styles.xpStatBadge, { backgroundColor: '#ff8c0010' }]}>
                        <Text style={styles.xpStatText}>🔥 {xpProfile.current_streak} {t('dayStreak', 'dias')}</Text>
                      </View>
                    )}
                    <View style={[styles.xpStatBadge, { backgroundColor: theme.primary + '10' }]}>
                      <Text style={[styles.xpStatText, { color: theme.primary }]}>
                        ⚡ {(xpProfile.total_xp || 0).toLocaleString()} XP {t('total', 'total')}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Desafios pendentes/recebidos */}
            <ChallengeSection
              exams={exams}
              enrolledCodes={enrolledCodes}
              onStartQuiz={handleStartQuiz}
              prefill={challengePrefill}
            />

            {enrolledExams.length === 0 ? (
              renderCatalog(true)
            ) : (
              <>
                {enrolledExams.map((exam) => (
                  <ExamHub
                    key={exam.exam_code}
                    exam={exam}
                    currentUserDisplay={currentUserDisplay}
                    refreshTick={refreshTick}
                    onPlay={() => handleStartQuiz(exam)}
                    onChallenge={() => setChallengePrefill({ examCode: exam.exam_code, ts: Date.now() })}
                    onOvertake={(name) => setChallengePrefill({ examCode: exam.exam_code, opponent: name, ts: Date.now() })}
                    onUnenroll={() => handleUnenroll(exam.exam_code)}
                  />
                ))}
                {showCatalog ? (
                  renderCatalog(false)
                ) : (
                  <TouchableOpacity
                    style={[styles.addExamCard, { borderColor: theme.surfaceBorder }]}
                    onPress={() => setShowCatalog(true)}>
                    <Text style={[styles.addExamText, { color: theme.textMuted }]}>
                      ＋ {t('addExam', 'Adicionar concurso')}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        ) : (
          <MeusConcursosView />
        )}
      </ScrollView>

      {/* Quiz player */}
      {activeJob && (
        <QuizPlayerModal
          activeJob={activeJob}
          onClose={handleCloseQuiz}
          onShareResult={handleShareResult}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Duas zonas
  modeSwitch: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 1,
  },
  modeTitle: {
    ...typography.buttonSmall,
  },
  modeSub: {
    ...typography.caption,
    fontSize: 11,
  },
  content: {
    padding: spacing.base,
    flexGrow: 1,
  },
  // Mini-hub de exame
  hubCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  hubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    gap: spacing.sm,
  },
  hubFlag: {
    fontSize: 26,
  },
  hubInfo: {
    flex: 1,
  },
  hubTitle: {
    ...typography.label,
    fontWeight: '600',
  },
  hubCountry: {
    ...typography.caption,
  },
  hubPosition: {
    alignItems: 'flex-end',
  },
  hubPositionRank: {
    ...typography.h3,
    fontWeight: '700',
  },
  hubPositionTotal: {
    ...typography.caption,
    fontWeight: '500',
  },
  hubPositionPct: {
    ...typography.caption,
    fontWeight: '600',
    color: '#03dac6',
  },
  hubPositionHint: {
    ...typography.caption,
    maxWidth: 140,
    textAlign: 'right',
  },
  hubActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  hubPlayBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  hubPlayText: {
    ...typography.buttonSmall,
    color: '#fff',
  },
  hubChallengeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: '#ffc10760',
    backgroundColor: '#ffc10715',
  },
  hubChallengeText: {
    ...typography.buttonSmall,
    color: '#ffc107',
  },
  hubRankToggle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  hubRankToggleText: {
    ...typography.caption,
    fontWeight: '600',
  },
  hubLeaveBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  hubLeaveText: {
    ...typography.caption,
  },
  hubLoading: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  // Catálogo (matrícula na disputa)
  catalogSection: {
    marginTop: spacing.sm,
  },
  catalogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  catalogTitle: {
    ...typography.label,
    fontWeight: '600',
    flex: 1,
  },
  catalogClose: {
    fontSize: 16,
    paddingHorizontal: spacing.sm,
  },
  addExamCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  addExamText: {
    ...typography.buttonSmall,
  },
  // Upgrade screen
  upgradeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  upgradeIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  upgradeTitle: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  upgradeDesc: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  upgradeBenefits: {
    gap: spacing.md,
    alignSelf: 'stretch',
    paddingHorizontal: spacing.base,
  },
  benefitText: {
    ...typography.body,
  },
  // XP Profile Card
  xpCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  xpCardMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  // Estado sem XP: convite p/ entrar na disputa
  xpEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  xpEmptyIcon: {
    fontSize: 28,
  },
  xpEmptyInfo: {
    flex: 1,
    gap: 2,
  },
  xpEmptyTitle: {
    ...typography.label,
    fontWeight: '700',
  },
  xpEmptyDesc: {
    ...typography.bodySmall,
  },
  xpLeagueSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  xpSeasonIcon: {
    fontSize: 24,
  },
  xpSeasonLabel: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  xpSeasonXp: {
    ...typography.label,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  xpStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  xpStatBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  xpStatText: {
    ...typography.caption,
    fontWeight: '600',
    color: '#ff8c00',
  },
});
