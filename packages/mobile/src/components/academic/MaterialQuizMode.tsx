import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import MarkdownRenderer from '../copilot/MarkdownRenderer';
import { InlineMarkdownText } from '../common/InlineMarkdownText';

/**
 * Modo Quiz do material gerado (questionário) — espelho do web (MaterialResultModal):
 * 3 telas — visualização (lista + "Modo Quiz" + embaralhar), quiz interativo (1 questão
 * por vez, "Confirmar resposta" = modo treino que revela acerto/erro + justificativa na
 * hora) e resultado (placar + revisão). Distinto do simulado da Arena (que é pontuado).
 *
 * ⚠️ O material gerado usa `resposta_correta` como LETRA (a-e) + `justificativa` — forma
 * diferente do tipo QuizQuestion da Arena (índice numérico + `explicacao`).
 */

interface ObjQuestion {
  pergunta: string;
  alternativas: string[];
  resposta_correta: string; // letra a-e
  justificativa?: string;
  dificuldade?: 'facil' | 'medio' | 'dificil';
  topico?: string;
  bloco?: string; // matéria da prova (blueprint de Meus Concursos), ex.: "Língua Portuguesa"
  texto_base?: string; // rótulo do texto de apoio ("Texto I"), quando a questão se ancora num
}

export interface SupportText {
  rotulo: string;
  conteudo: string;
  fonte?: string | null;
}

interface SubjQuestion {
  pergunta: string;
  resposta_esperada?: string;
  dificuldade?: string;
  topico?: string;
}

interface Props {
  title: string;
  objectiveQuestions: ObjQuestion[];
  subjectiveQuestions?: SubjQuestion[];
  // Textos-base compartilhados ("Texto I" ancorando 2-4 questões, formato de banca)
  supportTexts?: SupportText[];
  onClose: () => void;
  trainingNote?: string;
  // Meus Concursos: duração oficial da prova → cronômetro REGRESSIVO com entrega automática
  timeLimitMinutes?: number | null;
  // Meus Concursos: simulação do dia da prova — abre direto no quiz, sem embaralhar
  // e sem tags de dificuldade/tema durante a resposta
  examMode?: boolean;
  // Pontuação ponderada (blueprint do card): peso/mínimo por bloco + nota de corte
  scoring?: { blueprint?: any[]; passingScore?: number | null } | null;
  // Entrega persistida (fechar = entregar): restaura o resultado salvo e salva novas entregas
  initialAttempt?: { answers?: Record<string, string>; elapsed_seconds?: number } | null;
  onSaveAttempt?: (attempt: {
    answers: Record<number, string>;
    correct: number;
    incorrect: number;
    unanswered: number;
    total: number;
    elapsed_seconds: number;
    auto_delivered: boolean;
  }) => void;
}

const GREEN = '#22c55e';
const RED = '#ef4444';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Embaralha as alternativas e remapeia a letra correta (igual ao web).
function shuffleAlternatives(q: ObjQuestion): ObjQuestion {
  const alts = q.alternativas.map((text, idx) => ({ text, idx }));
  const shuffled = shuffleArray(alts);
  const origCorrect = (q.resposta_correta || 'a').charCodeAt(0) - 97;
  const newCorrect = shuffled.findIndex((a) => a.idx === origCorrect);
  return {
    ...q,
    alternativas: shuffled.map((a) => a.text),
    resposta_correta: String.fromCharCode(97 + Math.max(0, newCorrect)),
  };
}

// Pontuação: "39" em vez de "39.0"; "1,5" com vírgula
function formatPoints(n: number): string {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(1).replace('.', ',');
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const TOPIC_LABELS: Record<string, string> = {
  fisiopatologia: 'Fisiopatologia', quadro_clinico: 'Quadro Clínico', diagnostico: 'Diagnóstico',
  tratamento: 'Tratamento', farmacologia: 'Farmacologia', epidemiologia: 'Epidemiologia',
  prevencao: 'Prevenção', anatomia: 'Anatomia', fisiologia: 'Fisiologia', semiologia: 'Semiologia',
  saude_coletiva: 'Saúde Coletiva', politicas_de_saude: 'Políticas de Saúde', atencao_primaria: 'Atenção Primária',
  gestao_em_saude: 'Gestão em Saúde', financiamento_saude: 'Financiamento', vigilancia_em_saude: 'Vigilância em Saúde',
  promocao_da_saude: 'Promoção da Saúde', etica_e_legislacao: 'Ética e Legislação',
};
function categoryLabel(topico?: string): string {
  if (!topico) return '';
  return TOPIC_LABELS[topico] || topico.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MaterialQuizMode({ title, objectiveQuestions, subjectiveQuestions = [], supportTexts = [], onClose, trainingNote, timeLimitMinutes = null, examMode = false, scoring = null, initialAttempt = null, onSaveAttempt }: Props) {
  // Texto-base: a questão aponta pelo rótulo; no quiz (uma questão por vez) o texto
  // é repetido em cada questão do grupo, senão o candidato ficaria sem ele.
  const renderSupport = (q?: { texto_base?: string }) => {
    const t = supportByLabel[String(q?.texto_base || '').trim().toLowerCase()];
    if (!t) return null;
    return (
      <View style={[styles.supportBox, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}>
        <Text style={[styles.supportLabel, { color: theme.primary }]}>{t.rotulo}</Text>
        <ScrollView style={styles.supportScroll} nestedScrollEnabled>
          <InlineMarkdownText style={[styles.supportBody, { color: theme.text }]}>
            {t.conteudo}
          </InlineMarkdownText>
        </ScrollView>
        {!!t.fonte && <Text style={[styles.supportSource, { color: theme.textSecondary }]}>{t.fonte}</Text>}
      </View>
    );
  };

  const supportByLabel = React.useMemo(() => {
    const map: Record<string, SupportText> = {};
    (supportTexts || []).forEach((t) => {
      const k = String(t?.rotulo || '').trim().toLowerCase();
      if (k && String(t?.conteudo || '').trim()) map[k] = t;
    });
    return map;
  }, [supportTexts]);
  const { t } = useTranslation();
  const { theme } = useTheme();

  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [questions, setQuestions] = useState<ObjQuestion[]>(objectiveQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  const difficultyLabel = (d?: string) =>
    d === 'facil' ? t('easy', 'Fácil') : d === 'medio' ? t('medium', 'Médio') : d === 'dificil' ? t('hard', 'Difícil') : (d || '');
  const difficultyColor = (d?: string) =>
    d === 'facil' ? GREEN : d === 'medio' ? '#f59e0b' : d === 'dificil' ? RED : theme.textMuted;

  // Timer do quiz ativo.
  useEffect(() => {
    if (quizMode && !submitted && startRef.current) {
      const id = setInterval(() => {
        if (startRef.current) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
      return () => clearInterval(id);
    }
  }, [quizMode, submitted]);

  // examMode: prova já ENTREGUE → restaura o resultado salvo (fechar = entregar);
  // sem entrega → abre DIRETO no quiz (responder não é opcional)
  useEffect(() => {
    if (!examMode || quizMode || submitted || objectiveQuestions.length === 0) return;
    if (initialAttempt && initialAttempt.answers) {
      setQuestions(objectiveQuestions);
      setAnswers((initialAttempt.answers || {}) as unknown as Record<number, string>);
      setElapsed(initialAttempt.elapsed_seconds || 0);
      setQuizMode(true);
      setSubmitted(true);
    } else {
      startQuiz();
    }
    // one-shot na montagem do modal da prova
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Entrega da prova (examMode): marca entregue e PERSISTE a tentativa
  const deliverExam = (autoDelivered: boolean) => {
    setSubmitted(true);
    if (examMode && onSaveAttempt) {
      let correct = 0, incorrect = 0, unanswered = 0;
      questions.forEach((q, idx) => {
        const ua = answers[idx];
        if (ua === undefined) unanswered++;
        else if (ua === q.resposta_correta) correct++;
        else incorrect++;
      });
      onSaveAttempt({
        answers,
        correct,
        incorrect,
        unanswered,
        total: questions.length,
        elapsed_seconds: elapsed,
        auto_delivered: autoDelivered,
      });
    }
  };

  // Fechar no meio da prova (examMode) = entregar com as respostas marcadas
  const guardedClose = () => {
    if (examMode && quizMode && !submitted) {
      Alert.alert(
        t('mcDeliverOnCloseTitle', 'Entregar a prova?'),
        t('mcDeliverOnCloseBody', 'Fechar agora entrega a prova com as respostas marcadas até aqui — questões em branco ficam sem resposta. O resultado fica salvo em "Ver provas".'),
        [
          { text: t('cancel', 'Cancelar'), style: 'cancel' },
          { text: t('mcDeliverAndClose', 'Entregar e fechar'), onPress: () => { deliverExam(false); onClose(); } },
        ],
      );
      return;
    }
    onClose();
  };

  // Cronômetro REGRESSIVO (card com tempo de prova definido): entrega automática ao zerar.
  const countdownRemaining = timeLimitMinutes ? Math.max(0, timeLimitMinutes * 60 - elapsed) : null;
  useEffect(() => {
    if (!quizMode || submitted || !timeLimitMinutes) return;
    if (elapsed >= timeLimitMinutes * 60) {
      deliverExam(true);
      Alert.alert('', t('mcTimeUp', 'Tempo esgotado — prova entregue automaticamente.'));
    }
    // deliverExam re-cria a cada render; o efeito já re-roda a cada segundo (elapsed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, quizMode, submitted, timeLimitMinutes, t]);

  const startQuiz = () => {
    let qs = [...objectiveQuestions];
    if (shuffleEnabled) qs = shuffleArray(qs).map(shuffleAlternatives);
    setQuestions(qs);
    setQuizMode(true);
    setSubmitted(false);
    setAnswers({});
    setRevealed({});
    setCurrentIndex(0);
    setElapsed(0);
    startRef.current = Date.now();
  };

  // Pontuação ponderada por bloco (examMode + blueprint do card)
  const computeScoring = () => {
    const blocks = scoring?.blueprint;
    if (!examMode || !Array.isArray(blocks) || blocks.length === 0) return null;
    const byLabel = new Map<string, any>();
    blocks.forEach((b: any) => {
      const label = (b.label || '').trim();
      if (!label) return;
      byLabel.set(label, {
        label,
        weight: b.weight === undefined || b.weight === null || b.weight === '' ? 1 : Number(b.weight) || 0,
        minCorrect: b.min_correct === undefined || b.min_correct === null || b.min_correct === '' ? null : Number(b.min_correct),
        correct: 0,
        total: 0,
      });
    });
    if (byLabel.size === 0) return null;
    questions.forEach((q, idx) => {
      const entry = byLabel.get((q.bloco || '').trim());
      if (!entry) return;
      entry.total += 1;
      if (answers[idx] === q.resposta_correta) entry.correct += 1;
    });
    const rows = [...byLabel.values()].filter((r) => r.total > 0).map((r) => ({
      ...r,
      points: r.correct * r.weight,
      maxPoints: r.total * r.weight,
      eliminated: r.minCorrect !== null && r.correct < r.minCorrect,
    }));
    if (rows.length === 0) return null;
    const points = rows.reduce((acc, r) => acc + r.points, 0);
    const maxPoints = rows.reduce((acc, r) => acc + r.maxPoints, 0);
    const eliminatedIn = rows.filter((r) => r.eliminated);
    const passingScore = scoring?.passingScore ?? null;
    return {
      rows,
      points,
      maxPoints,
      percentage: maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 0,
      eliminatedIn,
      passingScore,
      passed: passingScore === null || passingScore === undefined ? null : (eliminatedIn.length === 0 && points >= passingScore),
    };
  };

  const computeStats = () => {
    let correct = 0, incorrect = 0, unanswered = 0;
    const byTopic: Record<string, { correct: number; total: number }> = {};
    const byDifficulty: Record<string, { correct: number; total: number }> = {
      facil: { correct: 0, total: 0 }, medio: { correct: 0, total: 0 }, dificil: { correct: 0, total: 0 },
    };
    questions.forEach((q, idx) => {
      const ua = answers[idx];
      const ok = ua === q.resposta_correta;
      if (ua === undefined) unanswered++;
      else if (ok) correct++;
      else incorrect++;
      if (q.topico) {
        byTopic[q.topico] = byTopic[q.topico] || { correct: 0, total: 0 };
        byTopic[q.topico].total++;
        if (ok) byTopic[q.topico].correct++;
      }
      if (q.dificuldade && byDifficulty[q.dificuldade]) {
        byDifficulty[q.dificuldade].total++;
        if (ok) byDifficulty[q.dificuldade].correct++;
      }
    });
    const total = questions.length;
    return { correct, incorrect, unanswered, total, percentage: total ? Math.round((correct / total) * 100) : 0, byTopic, byDifficulty, elapsed };
  };

  const Header = (
    <>
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity onPress={guardedClose} style={styles.closeBtn}>
          <Text style={[styles.closeBtnText, { color: theme.primary }]}>{t('close', 'Fechar')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
        <View style={{ width: 50 }} />
      </View>
      {trainingNote ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(245,158,11,0.12)' }}>
          <Text style={{ fontSize: 14 }}>🎓</Text>
          <Text style={{ flexShrink: 1, fontSize: 12, color: '#d97706' }}>{trainingNote}</Text>
        </View>
      ) : null}
    </>
  );

  const MetaBadges = ({ q }: { q: ObjQuestion }) => (
    <View style={styles.metaRow}>
      {!!q.dificuldade && (
        <View style={[styles.badge, { backgroundColor: difficultyColor(q.dificuldade) + '22', borderColor: difficultyColor(q.dificuldade) }]}>
          <Text style={[styles.badgeText, { color: difficultyColor(q.dificuldade) }]}>{difficultyLabel(q.dificuldade)}</Text>
        </View>
      )}
      {!!q.topico && (
        <View style={[styles.badge, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          <Text style={[styles.badgeText, { color: theme.textMuted }]}>🏷 {categoryLabel(q.topico)}</Text>
        </View>
      )}
    </View>
  );

  // ─── Tela de resultado ─────────────────────────────────────────────────────
  if (quizMode && submitted) {
    const s = computeStats();
    const score = computeScoring();
    const scoreColor = s.percentage >= 70 ? GREEN : s.percentage >= 50 ? '#f59e0b' : RED;
    return (
      <Modal visible animationType="slide" onRequestClose={guardedClose}>
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          {Header}
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={[styles.resultsTitle, { color: theme.text }]}>📊 {examMode ? t('mcExamResults', 'Resultado do Simulado') : t('quizResults', 'Resultado do Quiz')}</Text>
            <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
              <Text style={[styles.scorePct, { color: scoreColor }]}>{score ? score.percentage : s.percentage}%</Text>
              <Text style={[styles.scoreSub, { color: theme.textMuted }]}>
                {score ? `${formatPoints(score.points)}/${formatPoints(score.maxPoints)} ${t('mcPoints', 'pontos')}` : `${s.correct}/${s.total}`}
              </Text>
            </View>
            {/* Pontuação é a nota; acertos contam outra história — mostrar as duas */}
            {score && (
              <Text style={[styles.scoreHitsLine, { color: theme.textMuted }]}>
                {t('mcHitsSummary', {
                  correct: s.correct,
                  total: s.total,
                  pct: s.percentage,
                  defaultValue: `${s.correct}/${s.total} acertos · ${s.percentage}%`,
                })}
              </Text>
            )}
            {/* Veredito: eliminação por matéria e/ou nota de corte */}
            {score && (score.eliminatedIn.length > 0 || score.passed !== null) && (
              <View style={[styles.verdict, {
                backgroundColor: (score.eliminatedIn.length > 0 || score.passed === false ? RED : GREEN) + '1a',
                borderColor: score.eliminatedIn.length > 0 || score.passed === false ? RED : GREEN,
              }]}>
                <Text style={[styles.verdictText, { color: score.eliminatedIn.length > 0 || score.passed === false ? RED : GREEN }]}>
                  {score.eliminatedIn.length > 0
                    ? t('mcVerdictEliminated', {
                      subjects: score.eliminatedIn.map((r: any) => `${r.label} (${r.correct}/${r.total})`).join(', '),
                      defaultValue: 'Eliminado por nota zerada/insuficiente em: {{subjects}}',
                    })
                    : score.passed
                      ? t('mcVerdictPassed', { points: formatPoints(score.points), cutoff: formatPoints(score.passingScore ?? 0), defaultValue: 'Aprovado' })
                      : t('mcVerdictFailed', { points: formatPoints(score.points), cutoff: formatPoints(score.passingScore ?? 0), defaultValue: 'Abaixo da nota de corte' })}
                </Text>
              </View>
            )}
            {/* Por matéria (blocos da prova) */}
            {score && (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.catTitle, { color: theme.text }]}>{t('mcBySubject', 'Por matéria')}</Text>
                {score.rows.map((r: any) => (
                  <View
                    key={r.label}
                    style={[styles.subjectRow, {
                      borderColor: r.eliminated ? RED : theme.surfaceBorder,
                      backgroundColor: r.eliminated ? RED + '10' : theme.surface,
                    }]}>
                    <Text style={[styles.subjectName, { color: theme.text }]} numberOfLines={2}>{r.label}</Text>
                    <Text style={[styles.subjectHits, { color: theme.textMuted }]}>{r.correct}/{r.total}</Text>
                    <Text style={[styles.subjectPoints, { color: theme.primary }]}>
                      {formatPoints(r.points)}/{formatPoints(r.maxPoints)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: GREEN + '1a', borderColor: GREEN }]}>
                <Text style={[styles.statVal, { color: GREEN }]}>{s.correct}</Text>
                <Text style={[styles.statLbl, { color: theme.textMuted }]}>{t('correct', 'Corretas')}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: RED + '1a', borderColor: RED }]}>
                <Text style={[styles.statVal, { color: RED }]}>{s.incorrect}</Text>
                <Text style={[styles.statLbl, { color: theme.textMuted }]}>{t('incorrect', 'Incorretas')}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                <Text style={[styles.statVal, { color: theme.text }]}>{s.unanswered}</Text>
                <Text style={[styles.statLbl, { color: theme.textMuted }]}>{t('unanswered', 'Em branco')}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                <Text style={[styles.statVal, { color: theme.text }]}>{formatTime(s.elapsed)}</Text>
                <Text style={[styles.statLbl, { color: theme.textMuted }]}>{t('timeElapsed', 'Tempo')}</Text>
              </View>
            </View>

            {Object.values(s.byDifficulty).some((v) => v.total > 0) && (
              <View style={styles.catSection}>
                <Text style={[styles.catTitle, { color: theme.text }]}>{t('byDifficulty', 'Por Dificuldade')}</Text>
                {Object.entries(s.byDifficulty).filter(([, v]) => v.total > 0).map(([k, v]) => (
                  <View key={k} style={[styles.catRow, { borderColor: theme.surfaceBorder }]}>
                    <Text style={[styles.catName, { color: difficultyColor(k) }]}>{difficultyLabel(k)}</Text>
                    <Text style={[styles.catScore, { color: theme.text }]}>{v.correct}/{v.total}</Text>
                  </View>
                ))}
              </View>
            )}
            {Object.keys(s.byTopic).length > 0 && (
              <View style={styles.catSection}>
                <Text style={[styles.catTitle, { color: theme.text }]}>{t('byTopic', 'Por Tópico')}</Text>
                {Object.entries(s.byTopic).map(([k, v]) => (
                  <View key={k} style={[styles.catRow, { borderColor: theme.surfaceBorder }]}>
                    <Text style={[styles.catName, { color: theme.textMuted }]}>{categoryLabel(k)}</Text>
                    <Text style={[styles.catScore, { color: theme.text }]}>{v.correct}/{v.total}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.catTitle, { color: theme.text, marginTop: 20 }]}>{t('reviewAnswers', 'Revisar Respostas')}</Text>
            {questions.map((q, index) => {
              const ua = answers[index];
              const ok = ua === q.resposta_correta;
              const border = ua === undefined ? theme.surfaceBorder : ok ? GREEN : RED;
              return (
                <View key={index} style={[styles.reviewCard, { backgroundColor: theme.surface, borderColor: border }]}>
                  {renderSupport(q)}
                  <InlineMarkdownText style={[styles.reviewQ, { color: theme.text }]}>{`${index + 1}. ${q.pergunta}`}</InlineMarkdownText>
                  {q.alternativas.map((alt, i) => {
                    const letter = String.fromCharCode(97 + i);
                    const isCorrect = q.resposta_correta === letter;
                    const isUser = ua === letter;
                    const c = isCorrect ? GREEN : isUser ? RED : theme.textMuted;
                    return (
                      <Text key={i} style={[styles.reviewAlt, { color: c }]}>
                        {isCorrect ? '✓ ' : isUser ? '✗ ' : ''}{letter.toUpperCase()}) {alt}
                      </Text>
                    );
                  })}
                  {!!q.justificativa && (
                    <View style={styles.justBlock}>
                      <Text style={[styles.justLabel, { color: theme.textMuted }]}>{t('justification', 'Justificativa')}:</Text>
                      <MarkdownRenderer content={q.justificativa} />
                    </View>
                  )}
                </View>
              );
            })}

            <View style={styles.resultActions}>
              {/* examMode: não há "visualização" — a prova só existe em modo quiz */}
              {!examMode && (
                <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.surfaceBorder }]} onPress={() => { setQuizMode(false); setSubmitted(false); }}>
                  <Text style={[styles.actionBtnText, { color: theme.text }]}>{t('backToView', 'Voltar à Visualização')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary, { backgroundColor: theme.primary }]} onPress={startQuiz}>
                <Text style={[styles.actionBtnText, { color: '#fff' }]}>{examMode ? t('mcRetakeExam', 'Refazer prova') : t('retryQuiz', 'Refazer')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  }

  // ─── Quiz interativo ───────────────────────────────────────────────────────
  if (quizMode) {
    const q = questions[currentIndex];
    // examMode: NUNCA revela durante a prova — gabarito só após a entrega
    const isRevealed = !examMode && !!revealed[currentIndex];
    const userAns = answers[currentIndex];
    const gotIt = userAns === q.resposta_correta;
    return (
      <Modal visible animationType="slide" onRequestClose={guardedClose}>
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          {Header}
          <View style={styles.quizTopBar}>
            <Text style={[styles.quizProgressText, { color: theme.textMuted }]}>{currentIndex + 1} / {questions.length}</Text>
            <View style={[styles.progressTrack, { backgroundColor: theme.surfaceBorder }]}>
              <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${((currentIndex + 1) / questions.length) * 100}%` }]} />
            </View>
            <Text
              style={[
                styles.quizTimer,
                {
                  color:
                    countdownRemaining !== null
                      ? countdownRemaining <= 60
                        ? RED
                        : countdownRemaining <= 300
                          ? '#f59e0b'
                          : theme.primary
                      : theme.primary,
                },
              ]}>
              {countdownRemaining !== null ? `⏳ ${formatTime(countdownRemaining)}` : formatTime(elapsed)}
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {/* Matéria/bloco da prova (ex.: "Língua Portuguesa") */}
            {!!q.bloco && (
              <View style={[styles.blockLabel, { backgroundColor: theme.primary + '14', borderLeftColor: theme.primary }]}>
                <Text style={[styles.blockLabelText, { color: theme.primary }]}>{q.bloco}</Text>
              </View>
            )}
            {/* examMode: prova real não mostra dificuldade/tema durante a resposta */}
            {!examMode && <MetaBadges q={q} />}
            {renderSupport(q)}
            <InlineMarkdownText style={[styles.questionText, { color: theme.text }]}>{q.pergunta}</InlineMarkdownText>

            {q.alternativas.map((alt, i) => {
              const letter = String.fromCharCode(97 + i);
              const isSelected = userAns === letter;
              const isCorrect = q.resposta_correta === letter;
              let bg: string = theme.surface, border: string = theme.surfaceBorder;
              const fg: string = theme.text;
              if (isRevealed) {
                if (isCorrect) { bg = GREEN + '26'; border = GREEN; }
                else if (isSelected) { bg = RED + '26'; border = RED; }
              } else if (isSelected) {
                bg = theme.primary + '26'; border = theme.primary;
              }
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={isRevealed ? 1 : 0.7}
                  disabled={isRevealed}
                  onPress={() => setAnswers((p) => ({ ...p, [currentIndex]: letter }))}
                  style={[styles.altBtn, { backgroundColor: bg, borderColor: border }]}>
                  <View style={[styles.altLetter, { backgroundColor: isSelected && !isRevealed ? theme.primary : theme.background, borderColor: theme.surfaceBorder }]}>
                    <Text style={[styles.altLetterText, { color: isSelected && !isRevealed ? '#fff' : theme.text }]}>{letter.toUpperCase()}</Text>
                  </View>
                  <InlineMarkdownText style={[styles.altText, { color: fg }]}>{alt}</InlineMarkdownText>
                  {isRevealed && isCorrect && <Text style={[styles.altIcon, { color: GREEN }]}>✓</Text>}
                  {isRevealed && isSelected && !isCorrect && <Text style={[styles.altIcon, { color: RED }]}>✗</Text>}
                </TouchableOpacity>
              );
            })}

            {/* Modo treino (opcional): confirmar revela acerto/erro + justificativa NA HORA.
                Sem confirmar, "Próximo" adia o gabarito pro fim — igual a um simulado.
                examMode: caminho INEXISTENTE — gabarito só após entregar a prova. */}
            {!examMode && !isRevealed && userAns !== undefined && (
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: theme.primary }]} onPress={() => setRevealed((p) => ({ ...p, [currentIndex]: true }))}>
                <Text style={styles.confirmBtnText}>✓ {t('confirmAnswer', 'Confirmar resposta')}</Text>
              </TouchableOpacity>
            )}
            {isRevealed && (
              <View style={[styles.feedback, { backgroundColor: (gotIt ? GREEN : RED) + '1a', borderColor: (gotIt ? GREEN : RED) }]}>
                <Text style={[styles.feedbackHead, { color: gotIt ? GREEN : RED }]}>
                  {gotIt ? `✓ ${t('youGotItRight', 'Você acertou!')}` : `✗ ${t('youGotItWrong', 'Resposta incorreta')} · ${t('correctAnswerShort', 'Correta')}: ${q.resposta_correta.toUpperCase()}`}
                </Text>
                {!!q.justificativa && (
                  <View style={styles.feedbackJustWrap}>
                    <MarkdownRenderer content={q.justificativa} />
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <View style={[styles.quizNav, { borderTopColor: theme.surfaceBorder }]}>
            <TouchableOpacity
              style={[styles.navBtn, { borderColor: theme.surfaceBorder, opacity: currentIndex === 0 ? 0.3 : 1 }]}
              disabled={currentIndex === 0}
              onPress={() => setCurrentIndex((p) => Math.max(0, p - 1))}>
              <Text style={[styles.navBtnText, { color: theme.text }]}>◂ {t('previous', 'Anterior')}</Text>
            </TouchableOpacity>
            {currentIndex === questions.length - 1 ? (
              <TouchableOpacity style={[styles.navBtn, styles.finishBtn, { backgroundColor: theme.primary }]} onPress={() => deliverExam(false)}>
                <Text style={[styles.navBtnText, { color: '#fff', fontWeight: '700' }]}>{examMode ? t('mcDeliverExam', 'Entregar prova') : t('finishQuiz', 'Finalizar')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.navBtn, { borderColor: theme.surfaceBorder }]} onPress={() => setCurrentIndex((p) => Math.min(questions.length - 1, p + 1))}>
                <Text style={[styles.navBtnText, { color: theme.text }]}>{t('next', 'Próximo')} ▸</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.exitBtn} onPress={() => setQuizMode(false)}>
            <Text style={[styles.exitBtnText, { color: theme.textMuted }]}>✕ {t('exitQuiz', 'Sair do Quiz')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  // ─── Visualização normal (lista + iniciar quiz) ────────────────────────────
  return (
    <Modal visible animationType="slide" onRequestClose={guardedClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {Header}
        <ScrollView contentContainerStyle={styles.content}>
          {objectiveQuestions.length > 0 && (
            <>
              <TouchableOpacity style={[styles.startQuizBtn, { backgroundColor: theme.primary }]} onPress={startQuiz}>
                <Text style={styles.startQuizText}>▶  {t('startQuizMode', 'Modo Quiz')}</Text>
              </TouchableOpacity>
              {/* examMode: prova na ordem oficial, sem embaralhar */}
              {!examMode && (
                <View style={styles.shuffleRow}>
                  <Switch value={shuffleEnabled} onValueChange={setShuffleEnabled} trackColor={{ true: theme.primary }} />
                  <Text style={[styles.shuffleLabel, { color: theme.textMuted }]}>🔀 {t('shuffleQuestions', 'Embaralhar')}</Text>
                </View>
              )}

              <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('objectiveQuestions', 'Questões Objetivas')}</Text>
              {objectiveQuestions.map((q, index) => (
                <React.Fragment key={index}>
                  {!!q.bloco && (index === 0 || objectiveQuestions[index - 1]?.bloco !== q.bloco) && (
                    <View style={[styles.blockLabel, { backgroundColor: theme.primary + '14', borderLeftColor: theme.primary }]}>
                      <Text style={[styles.blockLabelText, { color: theme.primary }]}>{q.bloco}</Text>
                    </View>
                  )}
                <View style={[styles.viewCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                  <MetaBadges q={q} />
                  <InlineMarkdownText style={[styles.viewQ, { color: theme.text }]}>{`${index + 1}. ${q.pergunta}`}</InlineMarkdownText>
                  {q.alternativas.map((alt, i) => (
                    <Text key={i} style={[styles.viewAlt, { color: theme.textSecondary }]}>{String.fromCharCode(97 + i)}) {alt}</Text>
                  ))}
                  <View style={[styles.viewAnswer, { borderTopColor: theme.surfaceBorder }]}>
                    <Text style={[styles.viewAnswerLine, { color: GREEN }]}>
                      {t('correctAlternative', 'Alternativa Correta')}: {(q.resposta_correta || '').toUpperCase()}
                    </Text>
                    {!!q.justificativa && (
                      <View style={styles.justBlock}>
                        <Text style={[styles.justLabel, { color: theme.textMuted }]}>{t('justification', 'Justificativa')}:</Text>
                        <MarkdownRenderer content={q.justificativa} />
                      </View>
                    )}
                  </View>
                </View>
                </React.Fragment>
              ))}
            </>
          )}

          {subjectiveQuestions.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 16 }]}>{t('subjectiveQuestions', 'Questões Discursivas')}</Text>
              {subjectiveQuestions.map((q, index) => (
                <View key={index} style={[styles.viewCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                  <InlineMarkdownText style={[styles.viewQ, { color: theme.text }]}>{`${index + 1}. ${q.pergunta}`}</InlineMarkdownText>
                  {!!q.resposta_esperada && (
                    <Text style={[styles.viewJust, { color: theme.textMuted, marginTop: 8 }]}>
                      <Text style={{ fontWeight: '700' }}>{t('expectedAnswer', 'Resposta esperada')}: </Text>{q.resposta_esperada}
                    </Text>
                  )}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  closeBtn: { paddingRight: 8, minWidth: 50 },
  closeBtnText: { fontSize: 15, fontWeight: '600' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 48 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '600' },

  // quiz ativo
  quizTopBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  quizProgressText: { fontSize: 13, fontWeight: '600' },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  quizTimer: { fontSize: 14, fontWeight: '700' },
  questionText: { fontSize: 16, fontWeight: '600', lineHeight: 24, marginBottom: 16 },
  supportBox: { borderWidth: 1, borderLeftWidth: 3, borderRadius: 8, padding: 12, marginBottom: 14 },
  supportLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  supportScroll: { maxHeight: 220 },
  supportBody: { fontSize: 14, lineHeight: 22 },
  supportSource: { fontSize: 11, fontStyle: 'italic', marginTop: 8 },
  altBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 2, marginBottom: 10 },
  altLetter: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  altLetterText: { fontWeight: '700', fontSize: 14 },
  altText: { flex: 1, fontSize: 15, lineHeight: 21 },
  altIcon: { fontSize: 18, fontWeight: '700' },
  confirmBtn: { marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  feedback: { marginTop: 14, padding: 14, borderRadius: 12, borderWidth: 1 },
  feedbackHead: { fontWeight: '700', fontSize: 14, marginBottom: 6 },
  feedbackJust: { fontSize: 14, lineHeight: 21 },
  quizNav: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, padding: 12, borderTopWidth: 1 },
  navBtn: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, minWidth: 110, alignItems: 'center' },
  navBtnText: { fontSize: 15, fontWeight: '600' },
  finishBtn: { borderWidth: 0 },
  exitBtn: { alignItems: 'center', paddingVertical: 12 },
  exitBtnText: { fontSize: 14 },

  // resultado
  resultsTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  scoreCircle: { alignSelf: 'center', width: 120, height: 120, borderRadius: 60, borderWidth: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  scorePct: { fontSize: 30, fontWeight: '800' },
  scoreSub: { fontSize: 14, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  statCard: { width: '47%', padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '800' },
  statLbl: { fontSize: 12, marginTop: 2 },
  catSection: { marginTop: 20 },
  catTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1 },
  catName: { fontSize: 14, fontWeight: '600' },
  catScore: { fontSize: 14, fontWeight: '700' },
  reviewCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  reviewQ: { fontSize: 15, fontWeight: '600', marginBottom: 8, lineHeight: 21 },
  reviewAlt: { fontSize: 14, lineHeight: 22 },
  reviewJust: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  feedbackJustWrap: { marginTop: 2 },
  justBlock: { marginTop: 8 },
  justLabel: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  resultActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  actionPrimary: { borderWidth: 0 },
  actionBtnText: { fontSize: 15, fontWeight: '600' },

  // visualização normal
  startQuizBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  startQuizText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  shuffleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 8 },
  shuffleLabel: { fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 12, marginBottom: 10 },
  viewCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  scoreHitsLine: { marginTop: 10, textAlign: 'center', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  verdict: { marginTop: 14, padding: 12, borderRadius: 10, borderWidth: 1 },
  verdictText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  subjectName: { flex: 1, fontSize: 13, fontWeight: '600' },
  subjectHits: { fontSize: 12, fontVariant: ['tabular-nums'] },
  subjectPoints: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  blockLabel: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderLeftWidth: 3, marginBottom: 10 },
  blockLabelText: { fontSize: 13, fontWeight: '700' },
  viewQ: { fontSize: 15, fontWeight: '600', lineHeight: 22, marginBottom: 8 },
  viewAlt: { fontSize: 14, lineHeight: 22 },
  viewAnswer: { marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  viewAnswerLine: { fontSize: 14, fontWeight: '700' },
  viewJust: { fontSize: 13, lineHeight: 20, marginTop: 6 },
});
