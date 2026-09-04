import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface Option {
  id: string;
  text: string;
  points: number;
  is_best: boolean;
  feedback: string;
  next: string;
}

interface Block {
  id: string;
  type: 'start' | 'scenario' | 'end';
  content: string;
  vitals?: Record<string, string>;
  exam_results?: Record<string, string>;
  decision?: {
    question: string;
    options: Option[];
  };
  summary?: string;
  learning_points?: string[];
}

interface ClinicalCase {
  title: string;
  patient: { age: number; gender: string; complaint: string };
  blocks: Block[];
}

interface Props {
  caseData: { clinical_case: ClinicalCase };
  onClose: () => void;
}

export default function ClinicalCasePlayer({ caseData, onClose }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const clinicalCase = caseData.clinical_case;

  const [currentBlockId, setCurrentBlockId] = useState('start');
  const [selectedOption, setSelectedOption] = useState<Option | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [score, setScore] = useState(0);
  const [maxPossibleScore, setMaxPossibleScore] = useState(0);

  const currentBlock = clinicalCase.blocks.find(b => b.id === currentBlockId) || clinicalCase.blocks[0];

  const handleSelectOption = useCallback((option: Option) => {
    if (showFeedback) return;
    setSelectedOption(option);
    setShowFeedback(true);
    setScore(prev => prev + option.points);
    const bestOption = currentBlock.decision?.options.find(o => o.is_best);
    if (bestOption) setMaxPossibleScore(prev => prev + bestOption.points);
  }, [showFeedback, currentBlock]);

  const handleContinue = useCallback(() => {
    if (selectedOption) {
      setCurrentBlockId(selectedOption.next);
      setSelectedOption(null);
      setShowFeedback(false);
    }
  }, [selectedOption]);

  const handleRestart = useCallback(() => {
    setCurrentBlockId('start');
    setSelectedOption(null);
    setShowFeedback(false);
    setScore(0);
    setMaxPossibleScore(0);
  }, []);

  const getGrade = () => {
    if (maxPossibleScore === 0) return { label: '—', color: theme.textMuted };
    const pct = (score / maxPossibleScore) * 100;
    if (pct >= 90) return { label: t('excellent', 'Excelente'), color: '#10b981' };
    if (pct >= 70) return { label: t('good', 'Bom'), color: '#3b82f6' };
    if (pct >= 50) return { label: t('regular', 'Regular'), color: '#f59e0b' };
    return { label: t('needsImprovement', 'Precisa melhorar'), color: '#ef4444' };
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeBtnText, { color: theme.primary }]}>
              {t('close', 'Fechar')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {clinicalCase.title}
          </Text>
          <View style={[styles.scoreBadge, { backgroundColor: `${theme.primary}20` }]}>
            <Text style={[styles.scoreText, { color: theme.primary }]}>{score} pts</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Patient card */}
          <View style={[styles.patientCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            <Text style={styles.patientIcon}>{'👤'}</Text>
            <View style={styles.patientInfo}>
              <Text style={[styles.patientAge, { color: theme.text }]}>
                {clinicalCase.patient.age} {t('yearsOld', 'anos')}, {clinicalCase.patient.gender === 'M' ? t('male', 'Masculino') : t('female', 'Feminino')}
              </Text>
              <Text style={[styles.patientComplaint, { color: theme.textSecondary }]}>
                {clinicalCase.patient.complaint}
              </Text>
            </View>
          </View>

          {currentBlock.type === 'end' ? (
            /* End Screen */
            <View style={styles.endContainer}>
              <Text style={styles.trophyIcon}>{'🏆'}</Text>
              <Text style={[styles.endTitle, { color: theme.text }]}>
                {t('caseCompleted', 'Caso Finalizado!')}
              </Text>
              <View style={[styles.scoreCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                <Text style={[styles.finalScore, { color: theme.text }]}>
                  {score} / {maxPossibleScore}
                </Text>
                <Text style={[styles.gradeText, { color: getGrade().color }]}>
                  {getGrade().label}
                </Text>
                {maxPossibleScore > 0 && (
                  <Text style={[styles.pctText, { color: theme.textMuted }]}>
                    {Math.round((score / maxPossibleScore) * 100)}%
                  </Text>
                )}
              </View>
              {currentBlock.summary && (
                <Text style={[styles.summaryText, { color: theme.textSecondary }]}>
                  {currentBlock.summary}
                </Text>
              )}
              {currentBlock.learning_points && currentBlock.learning_points.length > 0 && (
                <View style={styles.learningSection}>
                  <Text style={[styles.learningSectionTitle, { color: theme.text }]}>
                    {t('learningPoints', 'Pontos de Aprendizado')}
                  </Text>
                  {currentBlock.learning_points.map((lp, i) => (
                    <Text key={i} style={[styles.learningPoint, { color: theme.textSecondary }]}>
                      {'💡 '}{lp}
                    </Text>
                  ))}
                </View>
              )}
              <TouchableOpacity
                style={[styles.restartBtn, { backgroundColor: theme.primary }]}
                onPress={handleRestart}>
                <Text style={styles.restartBtnText}>{t('playAgain', 'Jogar Novamente')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Scenario */
            <>
              <Text style={[styles.scenarioText, { color: theme.text }]}>
                {currentBlock.content}
              </Text>

              {/* Vitals */}
              {currentBlock.vitals && Object.keys(currentBlock.vitals).length > 0 && (
                <View style={[styles.dataCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                  <Text style={[styles.dataCardTitle, { color: theme.primary }]}>
                    {'❤️ '}{t('vitals', 'Sinais Vitais')}
                  </Text>
                  <View style={styles.dataGrid}>
                    {Object.entries(currentBlock.vitals).map(([key, val]) => (
                      <View key={key} style={styles.dataItem}>
                        <Text style={[styles.dataLabel, { color: theme.textMuted }]}>{key}</Text>
                        <Text style={[styles.dataValue, { color: theme.text }]}>{val}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Exam Results */}
              {currentBlock.exam_results && Object.keys(currentBlock.exam_results).length > 0 && (
                <View style={[styles.dataCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                  <Text style={[styles.dataCardTitle, { color: theme.primary }]}>
                    {'🧪 '}{t('examResults', 'Exames')}
                  </Text>
                  <View style={styles.dataGrid}>
                    {Object.entries(currentBlock.exam_results).map(([key, val]) => (
                      <View key={key} style={styles.dataItem}>
                        <Text style={[styles.dataLabel, { color: theme.textMuted }]}>{key}</Text>
                        <Text style={[styles.dataValue, { color: theme.text }]}>{val}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Decision */}
              {currentBlock.decision && (
                <View style={styles.decisionSection}>
                  <Text style={[styles.questionText, { color: theme.text }]}>
                    {currentBlock.decision.question}
                  </Text>
                  {currentBlock.decision.options.map(option => {
                    const isSelected = selectedOption?.id === option.id;
                    const showResult = showFeedback && isSelected;
                    const isCorrect = option.is_best;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[
                          styles.optionBtn,
                          { borderColor: theme.surfaceBorder, backgroundColor: theme.surface },
                          showResult && isCorrect && { borderColor: '#10b981', backgroundColor: '#10b98115' },
                          showResult && !isCorrect && { borderColor: '#ef4444', backgroundColor: '#ef444415' },
                        ]}
                        onPress={() => handleSelectOption(option)}
                        disabled={showFeedback}>
                        <Text style={[styles.optionText, { color: theme.text }]}>
                          {option.text}
                        </Text>
                        {showResult && (
                          <Text style={{ color: isCorrect ? '#10b981' : '#ef4444', fontSize: 18 }}>
                            {isCorrect ? '✓' : '✗'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  {/* Feedback */}
                  {showFeedback && selectedOption && (
                    <View style={[styles.feedbackBox, {
                      backgroundColor: selectedOption.is_best ? '#10b98115' : '#ef444415',
                      borderColor: selectedOption.is_best ? '#10b981' : '#ef4444',
                    }]}>
                      <Text style={[styles.feedbackTitle, {
                        color: selectedOption.is_best ? '#10b981' : '#ef4444',
                      }]}>
                        {selectedOption.is_best
                          ? `✓ ${t('correctChoice', 'Escolha Correta')}`
                          : `✗ ${t('suboptimalChoice', 'Escolha Subótima')}`}
                        {' (+' + selectedOption.points + ' pts)'}
                      </Text>
                      <Text style={[styles.feedbackText, { color: theme.text }]}>
                        {selectedOption.feedback}
                      </Text>
                      <TouchableOpacity
                        style={[styles.continueBtn, { backgroundColor: theme.primary }]}
                        onPress={handleContinue}>
                        <Text style={styles.continueBtnText}>
                          {t('continue', 'Continuar')} →
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.base,
    borderBottomWidth: 1, gap: spacing.sm,
  },
  closeBtn: { paddingRight: spacing.sm },
  closeBtnText: { ...typography.buttonSmall },
  headerTitle: { ...typography.label, fontWeight: '600', flex: 1 },
  scoreBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  scoreText: { ...typography.label, fontWeight: '700' },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  patientCard: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.base,
    borderRadius: borderRadius.lg, borderWidth: 1, marginBottom: spacing.base, gap: spacing.md,
  },
  patientIcon: { fontSize: 32 },
  patientInfo: { flex: 1 },
  patientAge: { ...typography.label, fontWeight: '600' },
  patientComplaint: { ...typography.bodySmall, marginTop: spacing.xs },
  scenarioText: { ...typography.body, lineHeight: 26, marginBottom: spacing.base },
  dataCard: {
    padding: spacing.base, borderRadius: borderRadius.lg, borderWidth: 1,
    marginBottom: spacing.base,
  },
  dataCardTitle: { ...typography.label, fontWeight: '600', marginBottom: spacing.sm },
  dataGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  dataItem: { minWidth: '40%' },
  dataLabel: { ...typography.caption, textTransform: 'uppercase' },
  dataValue: { ...typography.body, fontWeight: '600', fontVariant: ['tabular-nums'] },
  decisionSection: { marginTop: spacing.sm },
  questionText: { ...typography.body, fontWeight: '600', marginBottom: spacing.base },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.base, borderRadius: borderRadius.lg, borderWidth: 1.5,
    marginBottom: spacing.sm,
  },
  optionText: { ...typography.body, flex: 1, marginRight: spacing.sm },
  feedbackBox: {
    padding: spacing.base, borderRadius: borderRadius.lg, borderWidth: 1,
    marginTop: spacing.sm,
  },
  feedbackTitle: { ...typography.label, fontWeight: '700', marginBottom: spacing.sm },
  feedbackText: { ...typography.body, lineHeight: 24, marginBottom: spacing.base },
  continueBtn: { paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  continueBtnText: { ...typography.button, color: '#fff' },
  endContainer: { alignItems: 'center', paddingTop: spacing.lg },
  trophyIcon: { fontSize: 64, marginBottom: spacing.base },
  endTitle: { ...typography.h2, marginBottom: spacing.base },
  scoreCard: {
    padding: spacing.lg, borderRadius: borderRadius.lg, borderWidth: 1,
    alignItems: 'center', marginBottom: spacing.base, width: '100%',
  },
  finalScore: { ...typography.h1, fontWeight: '700' },
  gradeText: { ...typography.h3, marginTop: spacing.xs },
  pctText: { ...typography.body, marginTop: spacing.xs },
  summaryText: { ...typography.body, textAlign: 'center', marginBottom: spacing.base, lineHeight: 24 },
  learningSection: { width: '100%', marginTop: spacing.sm },
  learningSectionTitle: { ...typography.label, fontWeight: '700', marginBottom: spacing.sm },
  learningPoint: { ...typography.body, marginBottom: spacing.sm, lineHeight: 24 },
  restartBtn: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, marginTop: spacing.base },
  restartBtnText: { ...typography.button, color: '#fff' },
});
