import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useUser } from '../../contexts/UserContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  getChallenges,
  createChallenge,
  respondToChallenge,
  findRandomOpponent,
  type ArenaChallenge,
} from '../../services/academic';
import type { ArenaExam } from '../../types/academic';

interface Props {
  exams: ArenaExam[];
  enrolledCodes: string[];
  onStartQuiz?: (exam: ArenaExam) => void;
  // Setado pelos hubs de exame ("Desafiar"/"Ultrapassar"): abre o form já mirado.
  // ts força o efeito mesmo repetindo o mesmo alvo.
  prefill?: { examCode: string; opponent?: string; ts: number } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f39c12',
  accepted: '#03dac6',
  declined: '#e74c3c',
  completed: '#4caf50',
  expired: '#888',
};

export default function ChallengeSection({ exams, enrolledCodes, onStartQuiz, prefill }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { user } = useUser();
  const [sent, setSent] = useState<ArenaChallenge[]>([]);
  const [received, setReceived] = useState<ArenaChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [matchmaking, setMatchmaking] = useState(false);

  // Create challenge form
  const [showForm, setShowForm] = useState(false);
  const [opponentUsername, setOpponentUsername] = useState('');
  const [selectedExamCode, setSelectedExamCode] = useState('');

  const fetchChallenges = useCallback(async () => {
    try {
      const data = await getChallenges();
      setSent(data.sent || []);
      setReceived(data.received || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

  useEffect(() => {
    if (prefill) {
      setShowForm(true);
      setSelectedExamCode(prefill.examCode);
      setOpponentUsername(prefill.opponent ?? '');
    }
  }, [prefill]);

  const handleCreate = async () => {
    if (!opponentUsername.trim()) {
      Alert.alert('', t('enterOpponentUsername', 'Digite o @username do oponente'));
      return;
    }
    if (!selectedExamCode) {
      Alert.alert('', t('selectExamForChallenge', 'Selecione um exame'));
      return;
    }
    setCreating(true);
    try {
      const selectedExam = exams.find((e) => e.exam_code === selectedExamCode);
      await createChallenge(
        opponentUsername.trim().replace('@', ''),
        selectedExamCode,
        selectedExam ? t(selectedExam.title_key) : undefined,
      );
      Alert.alert('', t('challengeSent', 'Desafio enviado!'));
      setOpponentUsername('');
      setShowForm(false);
      fetchChallenges();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('errorCreatingChallenge', 'Erro ao criar desafio');
      Alert.alert('', msg);
    } finally {
      setCreating(false);
    }
  };

  const handleMatchmaking = async (examCode: string) => {
    setMatchmaking(true);
    try {
      const result = await findRandomOpponent(examCode);
      Alert.alert('', `${t('matchFound', 'Oponente encontrado!')} @${result.opponent_username}`);
      fetchChallenges();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('noOpponentsFound', 'Nenhum oponente disponível');
      Alert.alert('', msg);
    } finally {
      setMatchmaking(false);
    }
  };

  const handleRespond = (challenge: ArenaChallenge, accept: boolean) => {
    const action = accept ? t('accept', 'Aceitar') : t('decline', 'Recusar');
    Alert.alert(
      action,
      t('respondChallengeConfirm', 'Deseja {{action}} o desafio de @{{user}}?', {
        action: action.toLowerCase(),
        user: challenge.challenger_username,
      }),
      [
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
        {
          text: action,
          style: accept ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await respondToChallenge(challenge.id, accept);
              fetchChallenges();
              if (accept && onStartQuiz) {
                const exam = exams.find((e) => e.exam_code === challenge.exam_code);
                if (exam) onStartQuiz(exam);
              }
            } catch {
              Alert.alert('', t('error', 'Erro'));
            }
          },
        },
      ],
    );
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getResultText = (challenge: ArenaChallenge) => {
    if (challenge.status !== 'completed') return null;
    if (!challenge.winner_id) return t('challengeTie', 'Empate');
    return challenge.winner_id === user?.id
      ? t('challengeWon', 'Vitoria!')
      : t('challengeLost', 'Derrota');
  };

  const enrolledExams = exams.filter((e) => enrolledCodes.includes(e.exam_code));

  const renderChallenge = (challenge: ArenaChallenge, direction: 'sent' | 'received') => {
    const isSent = direction === 'sent';
    const opponent = isSent ? challenge.opponent_username : challenge.challenger_username;
    const statusColor = STATUS_COLORS[challenge.status] || theme.textMuted;
    const examInfo = exams.find((e) => e.exam_code === challenge.exam_code);
    const result = getResultText(challenge);

    return (
      <View
        key={challenge.id}
        style={[styles.challengeCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <View style={styles.challengeHeader}>
          <Text style={[styles.opponentName, { color: theme.text }]}>
            {isSent ? '\u2192' : '\u2190'} @{opponent}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {t(`challengeStatus_${challenge.status}`, challenge.status)}
            </Text>
          </View>
        </View>

        <Text style={[styles.examName, { color: theme.textMuted }]}>
          {examInfo ? `${examInfo.flag} ${t(examInfo.title_key)}` : challenge.exam_code}
        </Text>

        {challenge.status === 'completed' && (
          <View style={styles.scoresRow}>
            <Text style={[styles.scoreText, { color: theme.text }]}>
              {challenge.challenger_xp ?? challenge.challenger_score ?? '-'} XP x {challenge.opponent_xp ?? challenge.opponent_score ?? '-'} XP
            </Text>
            {result && (
              <Text
                style={[
                  styles.resultText,
                  { color: result.includes('Vitoria') || result.includes('Won') ? '#4caf50' : result.includes('Empate') || result.includes('Tie') ? '#f39c12' : '#e74c3c' },
                ]}>
                {result}
              </Text>
            )}
          </View>
        )}

        {/* Accept/Decline buttons for received pending challenges */}
        {!isSent && challenge.status === 'pending' && (
          <View style={styles.responseRow}>
            <TouchableOpacity
              style={[styles.responseBtn, { backgroundColor: '#4caf50' }]}
              onPress={() => handleRespond(challenge, true)}
              activeOpacity={0.7}>
              <Text style={styles.responseBtnText}>{t('accept', 'Aceitar')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.responseBtn, { backgroundColor: '#e74c3c' }]}
              onPress={() => handleRespond(challenge, false)}
              activeOpacity={0.7}>
              <Text style={styles.responseBtnText}>{t('decline', 'Recusar')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[styles.dateText, { color: theme.textMuted }]}>
          {formatDate(challenge.created_at)}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  const pendingReceived = received.filter((c) => c.status === 'pending');
  const allChallenges = [
    ...pendingReceived.map((c) => ({ ...c, _dir: 'received' as const })),
    ...sent.map((c) => ({ ...c, _dir: 'sent' as const })),
    ...received.filter((c) => c.status !== 'pending').map((c) => ({ ...c, _dir: 'received' as const })),
  ];

  return (
    <View>
      {/* Header + New Challenge button */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {'\u2694'} {t('challenges', 'Desafios')}
        </Text>
        <TouchableOpacity
          style={[styles.newChallengeBtn, { backgroundColor: theme.primary }]}
          onPress={() => setShowForm(!showForm)}
          activeOpacity={0.7}>
          <Text style={styles.newChallengeBtnText}>
            {showForm ? '\u2715' : '+'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pending indicator */}
      {pendingReceived.length > 0 && (
        <View style={[styles.pendingBanner, { backgroundColor: '#f39c12' + '20' }]}>
          <Text style={[styles.pendingText, { color: '#f39c12' }]}>
            {t('pendingChallenges', '{{count}} desafio(s) pendente(s)', {
              count: pendingReceived.length,
            })}
          </Text>
        </View>
      )}

      {/* Matchmaking buttons per enrolled exam */}
      {enrolledExams.length > 0 && (
        <View style={styles.matchmakingRow}>
          {enrolledExams.map((exam) => (
            <TouchableOpacity
              key={exam.exam_code}
              style={[styles.matchmakingBtn, { backgroundColor: '#ffc10720', borderColor: '#ffc10750' }]}
              onPress={() => handleMatchmaking(exam.exam_code)}
              disabled={matchmaking}
              activeOpacity={0.7}>
              <Text style={styles.matchmakingBtnText}>
                {matchmaking ? '...' : `🎲 ${exam.flag} ${t('findRandomOpponent', 'Oponente Aleatório')}`}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={[styles.xpHintText, { color: theme.primary }]}>
            ⚡ {t('challengeXpReward', '+20 XP por participar, +30 XP por vencer')}
          </Text>
        </View>
      )}

      {/* Create form */}
      {showForm && (
        <View style={[styles.formCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          <TextInput
            style={[styles.usernameInput, { color: theme.text, borderColor: theme.surfaceBorder }]}
            value={opponentUsername}
            onChangeText={setOpponentUsername}
            placeholder={t('opponentUsername', '@username do oponente')}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.examPicker}>
            {enrolledExams.map((exam) => (
              <TouchableOpacity
                key={exam.exam_code}
                style={[
                  styles.examOption,
                  {
                    borderColor: selectedExamCode === exam.exam_code ? theme.primary : theme.surfaceBorder,
                    backgroundColor: selectedExamCode === exam.exam_code ? theme.primary + '20' : 'transparent',
                  },
                ]}
                onPress={() => setSelectedExamCode(exam.exam_code)}>
                <Text style={[styles.examOptionText, {
                  color: selectedExamCode === exam.exam_code ? theme.primary : theme.text,
                }]}>
                  {exam.flag} {t(exam.title_key)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.sendChallengeBtn, { backgroundColor: theme.primary }]}
            onPress={handleCreate}
            disabled={creating}
            activeOpacity={0.7}>
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendChallengeBtnText}>
                {t('sendChallenge', 'Enviar Desafio')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Challenges list */}
      {allChallenges.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>
          {t('noChallengesYet', 'Nenhum desafio ainda. Desafie um colega!')}
        </Text>
      ) : (
        allChallenges.map((c) => renderChallenge(c, c._dir))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '700',
  },
  newChallengeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newChallengeBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  pendingBanner: {
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  pendingText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  formCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  usernameInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  examPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  examOption: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  examOptionText: {
    ...typography.caption,
    fontWeight: '500',
  },
  sendChallengeBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  sendChallengeBtnText: {
    ...typography.button,
    color: '#fff',
  },
  challengeCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  opponentName: {
    ...typography.body,
    fontWeight: '600',
  },
  statusBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  examName: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  scoresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  scoreText: {
    ...typography.body,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  resultText: {
    ...typography.bodySmall,
    fontWeight: '700',
  },
  responseRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  responseBtn: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  responseBtnText: {
    ...typography.buttonSmall,
    color: '#fff',
  },
  dateText: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  emptyText: {
    ...typography.bodySmall,
    textAlign: 'center',
    padding: spacing.lg,
  },
  matchmakingRow: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  matchmakingBtn: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  matchmakingBtnText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: '#ff9800',
  },
  xpHintText: {
    ...typography.caption,
    textAlign: 'center',
    fontWeight: '500',
  },
});
