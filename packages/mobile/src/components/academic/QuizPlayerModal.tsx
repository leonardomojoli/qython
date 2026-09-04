import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  getSimuladoJobStatus,
  clearSimuladoJob,
  submitQuiz,
} from '../../services/academic';
import type { JobStatus, QuizQuestion, QuizResult, AnswerDetail } from '../../types/academic';

interface Props {
  activeJob: JobStatus;
  onClose: () => void;
  onShareResult?: (score: number, total: number, correct: number) => void;
}

const QUIZ_DURATION = 4 * 60 * 60;

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  facil: { bg: '#22c55e20', text: '#22c55e', label: 'Fácil' },
  medio: { bg: '#f59e0b20', text: '#f59e0b', label: 'Médio' },
  dificil: { bg: '#ef444420', text: '#ef4444', label: 'Difícil' },
};

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function QuizPlayerModal({ activeJob, onClose, onShareResult }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const startTimeRef = useRef(Date.now());

  const [jobStatus, setJobStatus] = useState(activeJob.status);
  const [errorMessage, setErrorMessage] = useState(activeJob.error_message);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(QUIZ_DURATION);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [expandedReview, setExpandedReview] = useState<Record<number, boolean>>({});
  const submitRef = useRef(false);

  // Poll job status
  useEffect(() => {
    if (!['pending', 'processing'].includes(jobStatus)) return;

    const interval = setInterval(async () => {
      try {
        const updated = await getSimuladoJobStatus(activeJob.id);
        setJobStatus(updated.status);

        if (updated.status === 'completed') {
          setQuestions(updated.result_content?.questionario_objetivo || []);
          startTimeRef.current = Date.now();
          clearSimuladoJob(updated.id).catch(() => {});
        } else if (updated.status === 'error') {
          setErrorMessage(updated.error_message || t('unknownError', 'Erro desconhecido'));
          clearSimuladoJob(updated.id).catch(() => {});
        }
      } catch {
        setJobStatus('error');
        setErrorMessage(t('unknownError', 'Erro desconhecido'));
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeJob.id, jobStatus, t]);

  // Timer
  useEffect(() => {
    if (jobStatus !== 'completed' || result) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [jobStatus, result]);

  const handleAnswerSelect = (answerIndex: number) => {
    setAnswers((prev) => ({ ...prev, [currentIndex]: answerIndex }));
  };

  const handleSubmit = useCallback(async () => {
    if (submitRef.current || !questions) return;
    submitRef.current = true;

    try {
      const timeElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const res = await submitQuiz({
        specialty: activeJob.exam || 'Geral',
        mode: activeJob.exam || 'challenge',
        answers,
        questions,
        time_elapsed_seconds: timeElapsed,
      });
      setResult(res);
    } catch {
      Alert.alert('', t('errorSubmittingQuiz', 'Erro ao enviar quiz'));
    } finally {
      submitRef.current = false;
    }
  }, [answers, questions, activeJob.exam, t]);

  const confirmSubmit = () => {
    const totalQ = questions?.length || 0;
    const answered = Object.keys(answers).length;
    const unanswered = totalQ - answered;

    if (unanswered > 0) {
      Alert.alert(
        t('finishQuiz', 'Finalizar Quiz'),
        `${unanswered} ${t('unanswered', 'sem resposta')}`,
        [
          { text: t('cancel', 'Cancelar'), style: 'cancel' },
          { text: t('finishQuiz', 'Finalizar'), onPress: handleSubmit },
        ],
      );
    } else {
      handleSubmit();
    }
  };

  const handleClose = () => {
    if (questions && !result) {
      Alert.alert(
        t('exitQuiz', 'Sair do Quiz'),
        t('exitQuizWarning', 'Tem certeza? Seu progresso será perdido.'),
        [
          { text: t('cancel', 'Cancelar'), style: 'cancel' },
          { text: t('exitQuiz', 'Sair'), style: 'destructive', onPress: onClose },
        ],
      );
    } else {
      onClose();
    }
  };

  const totalQ = questions?.length || 0;
  const currentQuestion = questions?.[currentIndex];
  const progress = totalQ > 0 ? ((currentIndex + 1) / totalQ) * 100 : 0;

  // ─── Render: Loading ───
  const renderLoading = () => (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={[styles.loadingText, { color: theme.textMuted }]}>
        {t('generatingMaterial', 'Gerando material...')}
      </Text>
    </View>
  );

  // ─── Render: Error ───
  const renderError = () => (
    <View style={styles.centered}>
      <Text style={styles.errorIcon}>❌</Text>
      <Text style={[styles.errorText, { color: theme.text }]}>
        {errorMessage}
      </Text>
      <TouchableOpacity
        style={[styles.closeErrorBtn, { backgroundColor: theme.primary }]}
        onPress={onClose}>
        <Text style={styles.closeErrorText}>{t('close', 'Fechar')}</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Render: XP Result ───
  const renderResult = () => {
    const xpEarned = result?.xp_earned ?? 0;
    const breakdown = result?.xp_breakdown;
    const streak = result?.streak;
    const answersDetail = result?.answers_detail || [];

    return (
      <ScrollView contentContainerStyle={styles.resultScroll}>
        {/* XP Big Display */}
        <Text style={[styles.resultXpBig, { color: theme.primary }]}>
          +{xpEarned} XP
        </Text>
        <Text style={[styles.resultAccuracy, { color: theme.textMuted }]}>
          {result?.correct_count ?? result?.correct ?? 0}/{result?.total_questions ?? result?.total ?? totalQ}{' '}
          {t('correct', 'corretas')} ({result?.accuracy_pct ?? 0}%)
        </Text>

        {/* XP Breakdown */}
        {breakdown && (
          <View style={[styles.xpBreakdownBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '25' }]}>
            {breakdown.quiz_base > 0 && (
              <View style={styles.xpRow}>
                <Text style={[styles.xpRowLabel, { color: theme.textMuted }]}>✓ {t('baseXp', 'XP Base')}</Text>
                <Text style={[styles.xpRowValue, { color: theme.primary }]}>+{breakdown.quiz_base}</Text>
              </View>
            )}
            {breakdown.difficulty_bonus > 0 && (
              <View style={styles.xpRow}>
                <Text style={[styles.xpRowLabel, { color: theme.textMuted }]}>⚡ {t('difficultyBonus', 'Bônus Dificuldade')}</Text>
                <Text style={[styles.xpRowValue, { color: theme.primary }]}>+{breakdown.difficulty_bonus}</Text>
              </View>
            )}
            {breakdown.accuracy_bonus > 0 && (
              <View style={styles.xpRow}>
                <Text style={[styles.xpRowLabel, { color: theme.textMuted }]}>🏆 {t('accuracyBonus', 'Bônus Acurácia')}</Text>
                <Text style={[styles.xpRowValue, { color: theme.primary }]}>+{breakdown.accuracy_bonus}</Text>
              </View>
            )}
            {breakdown.streak_bonus > 0 && (
              <View style={styles.xpRow}>
                <Text style={[styles.xpRowLabel, { color: theme.textMuted }]}>🔥 {t('streakBonus', 'Bônus Sequência')}</Text>
                <Text style={[styles.xpRowValue, { color: theme.primary }]}>+{breakdown.streak_bonus}</Text>
              </View>
            )}
            {breakdown.speed_bonus > 0 && (
              <View style={styles.xpRow}>
                <Text style={[styles.xpRowLabel, { color: theme.textMuted }]}>🕐 {t('speedBonus', 'Bônus Velocidade')}</Text>
                <Text style={[styles.xpRowValue, { color: theme.primary }]}>+{breakdown.speed_bonus}</Text>
              </View>
            )}
            {breakdown.challenge_bonus > 0 && (
              <View style={styles.xpRow}>
                <Text style={[styles.xpRowLabel, { color: theme.textMuted }]}>⚔️ {t('challengeBonus', 'Bônus Desafio')}</Text>
                <Text style={[styles.xpRowValue, { color: theme.primary }]}>+{breakdown.challenge_bonus}</Text>
              </View>
            )}
          </View>
        )}

        {/* Streak */}
        <View style={styles.metaBadgesRow}>
          {streak && streak.current > 0 && (
            <View style={[styles.streakBadge, { backgroundColor: '#ff8c0015', borderColor: '#ff8c0030' }]}>
              <Text style={styles.streakText}>🔥 {streak.current} {t('dayStreak', 'dias')}</Text>
              {streak.is_new_record && (
                <Text style={styles.newRecordText}>🎉 {t('newRecord', 'Novo recorde!')}</Text>
              )}
            </View>
          )}
        </View>

        {/* Ranking Update */}
        {result?.ranking_update && (
          <View style={[styles.rankingUpdateBox, { backgroundColor: theme.secondary + '15', borderColor: theme.secondary + '30' }]}>
            <Text style={[styles.rankingUpdateText, { color: theme.secondary }]}>
              ↑ #{result.ranking_update.rank_position} — Top {result.ranking_update.percentile}%
            </Text>
          </View>
        )}

        {/* Answer Review */}
        {answersDetail.length > 0 && (
          <View style={styles.reviewSection}>
            <Text style={[styles.reviewTitle, { color: theme.text }]}>
              {t('answerReview', 'Revisão de Respostas')}
            </Text>
            {answersDetail.map((item: AnswerDetail, idx: number) => {
              const isExpanded = expandedReview[idx];
              const diffStyle = DIFFICULTY_COLORS[item.difficulty] || DIFFICULTY_COLORS.medio;
              const userLetter = item.user_answer != null ? String.fromCharCode(65 + item.user_answer) : '—';
              const correctLetter = String.fromCharCode(65 + item.correct_answer);

              return (
                <View key={idx} style={[styles.reviewItem, { borderColor: theme.surfaceBorder, borderLeftColor: item.is_correct ? '#22c55e' : '#ef4444' }]}>
                  <TouchableOpacity
                    style={styles.reviewItemHeader}
                    onPress={() => setExpandedReview(prev => ({ ...prev, [idx]: !prev[idx] }))}
                    activeOpacity={0.7}>
                    <Text style={[styles.reviewNumber, { color: theme.textMuted }]}>{idx + 1}</Text>
                    <Text style={[styles.reviewStatusIcon, { color: item.is_correct ? '#22c55e' : '#ef4444' }]}>
                      {item.is_correct ? '✓' : '✗'}
                    </Text>
                    <Text style={[styles.reviewAnswerText, { color: theme.text }]}>
                      {userLetter} {!item.is_correct && `→ ${correctLetter}`}
                    </Text>
                    <View style={[styles.reviewDiffBadge, { backgroundColor: diffStyle.bg }]}>
                      <Text style={[styles.reviewDiffText, { color: diffStyle.text }]}>{diffStyle.label}</Text>
                    </View>
                    <Text style={[styles.reviewChevron, { color: theme.textMuted }]}>
                      {isExpanded ? '▲' : '▼'}
                    </Text>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={[styles.reviewItemBody, { borderTopColor: theme.surfaceBorder }]}>
                      <Text style={[styles.reviewQuestionText, { color: theme.text }]}>
                        {item.question_text}
                      </Text>
                      {item.alternatives.map((alt, altIdx) => (
                        <View
                          key={altIdx}
                          style={[
                            styles.reviewAlt,
                            { backgroundColor: theme.surface },
                            altIdx === item.correct_answer && { backgroundColor: '#22c55e15', borderColor: '#22c55e30', borderWidth: 1 },
                            altIdx === item.user_answer && !item.is_correct && { backgroundColor: '#ef444415', borderColor: '#ef444430', borderWidth: 1 },
                          ]}>
                          <Text style={[styles.reviewAltLetter, { color: theme.textMuted }]}>
                            {String.fromCharCode(65 + altIdx)}
                          </Text>
                          <Text style={[styles.reviewAltText, { color: theme.text }]}>{alt}</Text>
                        </View>
                      ))}
                      {item.explanation && (
                        <View style={[styles.reviewExplanation, { backgroundColor: theme.primary + '08' }]}>
                          <Text style={[styles.reviewExplanationText, { color: theme.text }]}>
                            {t('explanation', 'Explicação')}: {item.explanation}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Actions */}
        <View style={styles.resultActions}>
          {onShareResult && result && (
            <TouchableOpacity
              style={[styles.shareResultBtn, { borderColor: theme.primary }]}
              onPress={() =>
                onShareResult(result.xp_earned ?? result.score, result.total_questions ?? result.total, result.correct_count ?? result.correct)
              }>
              <Text style={[styles.shareResultText, { color: theme.primary }]}>
                {t('shareResult', 'Compartilhar')}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.closeResultBtn, { backgroundColor: theme.primary }]}
            onPress={onClose}>
            <Text style={styles.closeResultBtnText}>{t('close', 'Fechar')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // ─── Render: Quiz ───
  const renderQuiz = () => {
    if (!currentQuestion) return null;

    return (
      <View style={styles.quizContainer}>
        {/* Progress bar */}
        <View style={[styles.progressBg, { backgroundColor: theme.surfaceBorder }]}>
          <View
            style={[styles.progressFill, { width: `${progress}%`, backgroundColor: theme.primary }]}
          />
        </View>

        <ScrollView contentContainerStyle={styles.questionScroll}>
          <Text style={[styles.questionCounter, { color: theme.textMuted }]}>
            {currentIndex + 1} / {totalQ}
          </Text>
          {currentQuestion.bloco ? (
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13, marginBottom: 4 }}>{currentQuestion.bloco}</Text>
          ) : null}

          {/* Difficulty & topic badges */}
          {(currentQuestion.dificuldade || currentQuestion.topico) && (
            <View style={styles.metaRow}>
              {currentQuestion.dificuldade && (
                <View style={[
                  styles.difficultyBadge,
                  { backgroundColor: DIFFICULTY_COLORS[currentQuestion.dificuldade]?.bg || '#f59e0b20' },
                ]}>
                  <Text style={[
                    styles.difficultyText,
                    { color: DIFFICULTY_COLORS[currentQuestion.dificuldade]?.text || '#f59e0b' },
                  ]}>
                    {currentQuestion.dificuldade === 'facil'
                      ? t('easy', 'Fácil')
                      : currentQuestion.dificuldade === 'dificil'
                        ? t('hard', 'Difícil')
                        : t('medium', 'Médio')}
                  </Text>
                </View>
              )}
              {currentQuestion.topico && (
                <View style={[styles.topicBadge, { backgroundColor: theme.surfaceBorder }]}>
                  <Text style={[styles.topicText, { color: theme.textMuted }]}>
                    {currentQuestion.topico}
                  </Text>
                </View>
              )}
            </View>
          )}

          <Text style={[styles.questionText, { color: theme.text }]}>
            {currentQuestion.pergunta}
          </Text>

          {currentQuestion.alternativas.map((alt, idx) => {
            const isSelected = answers[currentIndex] === idx;
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.option,
                  { borderColor: theme.surfaceBorder },
                  isSelected && { borderColor: theme.primary, backgroundColor: theme.primary + '15' },
                ]}
                onPress={() => handleAnswerSelect(idx)}
                activeOpacity={0.7}>
                <View
                  style={[
                    styles.optionLetter,
                    isSelected
                      ? { backgroundColor: theme.primary }
                      : { backgroundColor: theme.surface },
                  ]}>
                  <Text
                    style={[
                      styles.optionLetterText,
                      { color: isSelected ? '#fff' : theme.textMuted },
                    ]}>
                    {String.fromCharCode(65 + idx)}
                  </Text>
                </View>
                <Text style={[styles.optionText, { color: theme.text }]}>{alt}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Footer navigation */}
        <View style={[styles.footer, { borderTopColor: theme.surfaceBorder }]}>
          <TouchableOpacity
            style={[styles.navBtn, { opacity: currentIndex === 0 ? 0.3 : 1 }]}
            onPress={() => setCurrentIndex((p) => Math.max(0, p - 1))}
            disabled={currentIndex === 0}>
            <Text style={[styles.navBtnText, { color: theme.primary }]}>
              ◂ {t('previous', 'Anterior')}
            </Text>
          </TouchableOpacity>

          {/* Question dots indicator */}
          <View style={styles.dotsContainer}>
            {Array.from({ length: Math.min(totalQ, 10) }, (_, i) => {
              const qIdx =
                totalQ <= 10
                  ? i
                  : Math.round((i / 9) * (totalQ - 1));
              const isAnswered = answers[qIdx] !== undefined;
              const isCurrent = qIdx === currentIndex;
              return (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: isCurrent
                        ? theme.primary
                        : isAnswered
                          ? theme.primary + '60'
                          : theme.surfaceBorder,
                    },
                  ]}
                />
              );
            })}
          </View>

          {currentIndex === totalQ - 1 ? (
            <TouchableOpacity
              style={[styles.finishBtn, { backgroundColor: theme.primary }]}
              onPress={confirmSubmit}>
              <Text style={styles.finishBtnText}>
                {t('finishQuiz', 'Finalizar')}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => setCurrentIndex((p) => Math.min(totalQ - 1, p + 1))}>
              <Text style={[styles.navBtnText, { color: theme.primary }]}>
                {t('next', 'Próximo')} ▸
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <TouchableOpacity onPress={handleClose} style={styles.headerCloseBtn}>
            <Text style={[styles.headerCloseText, { color: theme.textMuted }]}>✕</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {result
              ? t('quizResults', 'Resultado')
              : jobStatus === 'completed'
                ? (activeJob.exam || 'Quiz')
                : t('generatingMaterial', 'Gerando...')}
          </Text>
          {jobStatus === 'completed' && !result && (
            <Text style={[styles.timer, { color: theme.primary }]}>
              {formatTime(timeLeft)}
            </Text>
          )}
        </View>

        {/* Content */}
        {(jobStatus === 'pending' || jobStatus === 'processing') && renderLoading()}
        {jobStatus === 'error' && renderError()}
        {jobStatus === 'completed' && result && renderResult()}
        {jobStatus === 'completed' && !result && renderQuiz()}
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
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: 1,
  },
  headerCloseBtn: {
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
  headerCloseText: {
    fontSize: 20,
    fontWeight: '600',
  },
  headerTitle: {
    ...typography.h3,
    flex: 1,
  },
  timer: {
    ...typography.label,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.base,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: spacing.base,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  closeErrorBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  closeErrorText: {
    ...typography.button,
    color: '#fff',
  },

  // ─── Result Screen ───
  resultScroll: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  resultXpBig: {
    fontSize: 48,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  resultAccuracy: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  xpBreakdownBox: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  xpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  xpRowLabel: {
    ...typography.bodySmall,
  },
  xpRowValue: {
    ...typography.label,
    fontWeight: '700',
  },
  metaBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  streakText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: '#ff8c00',
  },
  newRecordText: {
    ...typography.caption,
    color: '#ff8c00',
  },
  rankingUpdateBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.base,
  },
  rankingUpdateText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  reviewSection: {
    marginTop: spacing.sm,
  },
  reviewTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  reviewItem: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  reviewItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  reviewNumber: {
    ...typography.caption,
    fontWeight: '700',
    width: 24,
    textAlign: 'center',
  },
  reviewStatusIcon: {
    fontWeight: '700',
    fontSize: 16,
    width: 20,
    textAlign: 'center',
  },
  reviewAnswerText: {
    ...typography.bodySmall,
    fontWeight: '500',
    flex: 1,
  },
  reviewDiffBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  reviewDiffText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  reviewChevron: {
    fontSize: 10,
  },
  reviewItemBody: {
    padding: spacing.md,
    borderTopWidth: 1,
  },
  reviewQuestionText: {
    ...typography.bodySmall,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  reviewAlt: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: 4,
    gap: spacing.sm,
  },
  reviewAltLetter: {
    ...typography.caption,
    fontWeight: '700',
    width: 18,
  },
  reviewAltText: {
    ...typography.caption,
    flex: 1,
  },
  reviewExplanation: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  reviewExplanationText: {
    ...typography.caption,
    lineHeight: 18,
  },
  resultActions: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  shareResultBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  shareResultText: {
    ...typography.button,
  },
  closeResultBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  closeResultBtnText: {
    ...typography.button,
    color: '#fff',
  },

  // ─── Quiz Screen ───
  quizContainer: {
    flex: 1,
  },
  progressBg: {
    height: 3,
  },
  progressFill: {
    height: 3,
  },
  questionScroll: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  questionCounter: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  difficultyBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 20,
  },
  difficultyText: {
    ...typography.caption,
    fontWeight: '700',
  },
  topicBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 20,
  },
  topicText: {
    ...typography.caption,
    fontWeight: '500',
  },
  questionText: {
    ...typography.body,
    fontWeight: '500',
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  optionLetter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  optionLetterText: {
    ...typography.label,
    fontWeight: '700',
  },
  optionText: {
    ...typography.bodySmall,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    borderTopWidth: 1,
  },
  navBtn: {
    padding: spacing.sm,
  },
  navBtnText: {
    ...typography.buttonSmall,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  finishBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.md,
  },
  finishBtnText: {
    ...typography.buttonSmall,
    color: '#fff',
  },
});
