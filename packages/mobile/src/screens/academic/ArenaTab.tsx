// Arena em DUAS zonas (paridade com o web): "Simulados" (um card por concurso em que você se
// inscreveu, com o catálogo embutido) e "Meus Concursos" (treinar no seu ritmo). O catálogo não é
// aba: é a inscrição dentro da zona de simulados.
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  getAvailableExams,
  getEnrolledExams,
  enrollInExam,
  unenrollFromExam,
  startQuiz,
  getMyXpProfile,
} from '../../services/academic';
import type { ArenaExam, JobStatus, XpProfile } from '../../types/academic';
import ExamCard from '../../components/academic/ExamCard';
import QuizPlayerModal from '../../components/academic/QuizPlayerModal';
import MeusConcursosView from '../../components/academic/MeusConcursosView';

// Card de um exame inscrito: o simulado e a saída. Definido FORA do ArenaTab — componente estável
// entre renders.
interface ExamHubProps {
  exam: ArenaExam;
  onPlay: () => void;
  onUnenroll: () => void;
}

function ExamHub({ exam, onPlay, onUnenroll }: ExamHubProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

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
      </View>

      <View style={styles.hubActions}>
        <TouchableOpacity
          style={[styles.hubPlayBtn, { backgroundColor: theme.primary }]}
          onPress={onPlay}
          activeOpacity={0.8}>
          <Text style={styles.hubPlayText}>▶ {t('startQuiz', 'Iniciar Simulado')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.hubLeaveBtn} onPress={onUnenroll}>
          <Text style={[styles.hubLeaveText, { color: theme.textMuted }]}>{t('leave', 'Sair')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ArenaTab() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const [exams, setExams] = useState<ArenaExam[]>([]);
  const [enrolledCodes, setEnrolledCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'simulados' | 'meusCards'>('simulados');
  const [showCatalog, setShowCatalog] = useState(false);
  const [activeJob, setActiveJob] = useState<JobStatus | null>(null);
  const [xpProfile, setXpProfile] = useState<XpProfile | null>(null);


  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [examsData, enrolledData, profileData] = await Promise.all([
        getAvailableExams(),
        getEnrolledExams(),
        getMyXpProfile().catch(() => null),
      ]);
      setExams(examsData || []);
      setEnrolledCodes(enrolledData?.enrolled_codes || []);
      setXpProfile(profileData || null);
    } catch {
      Alert.alert('', t('errorFetchingArenaData', 'Erro ao carregar os dados da Arena.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const hasAnyXp = (xpProfile?.total_xp || 0) > 0;

  // Catálogo de exames = inscrição (hero quando não há inscrição)
  const renderCatalog = (isHero: boolean) => (
    <View style={styles.catalogSection}>
      <View style={styles.catalogHeader}>
        <Text style={[styles.catalogTitle, { color: theme.text }]}>
          🌍 {t('catalogHeroTitleLocal', 'Escolha o concurso que você vai prestar')}
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
      {/* Duas zonas: simulados × treinar */}
      <View style={[styles.modeSwitch, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity
          style={[
            styles.modeBtn,
            activeView === 'simulados' && { borderBottomColor: theme.primary },
          ]}
          onPress={() => setActiveView('simulados')}>
          <Text
            style={[
              styles.modeTitle,
              { color: activeView === 'simulados' ? theme.primary : theme.textMuted },
            ]}>
            🏆 {t('arenaSimuladosTitle', 'Simulados')}
          </Text>
          <Text style={[styles.modeSub, { color: theme.textMuted }]}>
            {t('arenaModeSimuladosSub', 'Questões no estilo de cada prova')}
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

      <ScrollView contentContainerStyle={styles.content}>
        {activeView === 'simulados' ? (
          <>
            {xpProfile && !hasAnyXp && (
              <View style={[styles.xpCard, styles.xpEmptyCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                <Text style={styles.xpEmptyIcon}>🏁</Text>
                <View style={styles.xpEmptyInfo}>
                  <Text style={[styles.xpEmptyTitle, { color: theme.text }]}>
                    {t('arenaXpEmptyTitleLocal', 'Comece um simulado')}
                  </Text>
                  <Text style={[styles.xpEmptyDesc, { color: theme.textMuted }]}>
                    {t('arenaXpEmptyDescLocal', 'Complete um simulado para ganhar seus primeiros XP.')}
                  </Text>
                </View>
              </View>
            )}
            {xpProfile && hasAnyXp && (
              <View style={[styles.xpCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                <View style={styles.xpCardMain}>
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

            {enrolledExams.length === 0 ? (
              renderCatalog(true)
            ) : (
              <>
                {enrolledExams.map((exam) => (
                  <ExamHub
                    key={exam.exam_code}
                    exam={exam}
                    onPlay={() => handleStartQuiz(exam)}
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
        <QuizPlayerModal activeJob={activeJob} onClose={handleCloseQuiz} />
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
  hubLeaveBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  hubLeaveText: {
    ...typography.caption,
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
