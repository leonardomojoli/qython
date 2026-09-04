import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Share,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface SlideContent {
  type: 'text' | 'table' | 'image_suggestion' | 'key_takeaway' | 'clinical_vignette';
  points?: string[];
  title?: string;
  columns?: string[];
  rows?: string[][];
  description?: string;
  scenario?: string;
  question?: string;
  answer?: string;
}

interface Slide {
  title: string;
  speaker_notes?: string;
  content: SlideContent[];
}

interface SlideshowData {
  title: string;
  slides: Slide[];
}

interface Props {
  data: SlideshowData;
  onClose: () => void;
}

export default function SlideshowViewer({ data, onClose }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewedSlides, setViewedSlides] = useState<Record<number, boolean>>({ 0: true });
  const [showGrid, setShowGrid] = useState(false);

  const slide = data.slides[currentSlide];
  const total = data.slides.length;
  const viewedCount = Object.keys(viewedSlides).length;

  const goTo = useCallback((index: number) => {
    setCurrentSlide(index);
    setViewedSlides(prev => ({ ...prev, [index]: true }));
    setShowGrid(false);
  }, []);

  const goNext = useCallback(() => {
    if (currentSlide < total - 1) goTo(currentSlide + 1);
  }, [currentSlide, total, goTo]);

  const goPrev = useCallback(() => {
    if (currentSlide > 0) goTo(currentSlide - 1);
  }, [currentSlide, goTo]);

  const handleShare = async () => {
    const lines = data.slides.map((s, i) =>
      `## Slide ${i + 1}: ${s.title}\n${s.content.map(c =>
        c.type === 'text' ? (c.points || []).join('\n') : ''
      ).join('\n')}${s.speaker_notes ? `\n\n_${s.speaker_notes}_` : ''}`
    ).join('\n\n---\n\n');
    const md = `# ${data.title}\n\n${lines}`;
    try {
      await Share.share({ title: data.title, message: md });
    } catch {}
  };

  const renderContent = (content: SlideContent, idx: number) => {
    switch (content.type) {
      case 'text':
        return (
          <View key={idx} style={styles.contentBlock}>
            {(content.points || []).map((point, pi) => {
              const isSub = point.startsWith('  ');
              return (
                <Text
                  key={pi}
                  style={[
                    styles.bulletPoint,
                    { color: theme.text },
                    isSub && styles.subBullet,
                  ]}>
                  {isSub ? '  ◦ ' : '• '}{point.trimStart()}
                </Text>
              );
            })}
          </View>
        );
      case 'table':
        return (
          <View key={idx} style={styles.contentBlock}>
            {content.title && (
              <Text style={[styles.tableTitle, { color: theme.text }]}>{content.title}</Text>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: `${theme.primary}20` }]}>
                  {(content.columns || []).map((col, ci) => (
                    <Text key={ci} style={[styles.tableCell, styles.tableHeaderCell, { color: theme.text }]}>
                      {col}
                    </Text>
                  ))}
                </View>
                {(content.rows || []).map((row, ri) => (
                  <View key={ri} style={[styles.tableRow, { borderColor: theme.surfaceBorder }]}>
                    {row.map((cell, ci) => (
                      <Text key={ci} style={[styles.tableCell, { color: theme.textSecondary }]}>
                        {cell}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        );
      case 'key_takeaway':
        return (
          <View key={idx} style={[styles.takeaway, { backgroundColor: `${theme.primary}15`, borderColor: `${theme.primary}40` }]}>
            <Text style={[styles.takeawayLabel, { color: theme.primary }]}>
              {t('keyTakeaway', 'Pontos-chave')}
            </Text>
            {(content.points || []).map((p, pi) => (
              <Text key={pi} style={[styles.bulletPoint, { color: theme.text }]}>
                {'★ '}{p}
              </Text>
            ))}
          </View>
        );
      case 'clinical_vignette':
        return (
          <View key={idx} style={[styles.vignette, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            {content.title && (
              <Text style={[styles.vignetteTitle, { color: theme.primary }]}>{content.title}</Text>
            )}
            {content.scenario && (
              <Text style={[styles.vignetteText, { color: theme.text }]}>{content.scenario}</Text>
            )}
            {content.question && (
              <Text style={[styles.vignetteQuestion, { color: theme.text }]}>
                {t('question', 'Pergunta')}: {content.question}
              </Text>
            )}
            {content.answer && (
              <Text style={[styles.vignetteAnswer, { color: theme.textSecondary }]}>
                {t('answer', 'Resposta')}: {content.answer}
              </Text>
            )}
          </View>
        );
      default:
        return null;
    }
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
            {data.title}
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setShowGrid(!showGrid)} style={styles.actionBtn}>
              <Text style={{ color: theme.primary, fontSize: 16 }}>{'⊞'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.actionBtn}>
              <Text style={{ color: theme.primary, fontSize: 16 }}>{'↗'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressBar, { backgroundColor: theme.surfaceBorder }]}>
          <View style={[styles.progressFill, { width: `${(viewedCount / total) * 100}%`, backgroundColor: theme.primary }]} />
        </View>

        {showGrid ? (
          /* Grid View */
          <FlatList
            data={data.slides}
            numColumns={2}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.gridContainer}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[
                  styles.gridCard,
                  { backgroundColor: theme.surface, borderColor: index === currentSlide ? theme.primary : theme.surfaceBorder },
                ]}
                onPress={() => goTo(index)}>
                <Text style={[styles.gridNumber, { color: theme.primary }]}>{index + 1}</Text>
                <Text style={[styles.gridTitle, { color: theme.text }]} numberOfLines={2}>
                  {item.title}
                </Text>
                {viewedSlides[index] && (
                  <Text style={[styles.gridViewed, { color: theme.primary }]}>{'✓'}</Text>
                )}
              </TouchableOpacity>
            )}
          />
        ) : (
          /* Slide View */
          <ScrollView contentContainerStyle={styles.slideContainer}>
            <Text style={[styles.slideTitle, { color: theme.text }]}>{slide.title}</Text>
            {slide.content.map((c, i) => renderContent(c, i))}
            {slide.speaker_notes && (
              <View style={[styles.notesSection, { backgroundColor: `${theme.primary}08`, borderColor: theme.surfaceBorder }]}>
                <Text style={[styles.notesLabel, { color: theme.textMuted }]}>
                  {t('speakerNotes', 'Notas')}
                </Text>
                <Text style={[styles.notesText, { color: theme.textSecondary }]}>
                  {slide.speaker_notes}
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Navigation */}
        {!showGrid && (
          <View style={[styles.navBar, { borderTopColor: theme.surfaceBorder }]}>
            <TouchableOpacity
              onPress={goPrev}
              disabled={currentSlide === 0}
              style={[styles.navBtn, currentSlide === 0 && styles.navBtnDisabled]}>
              <Text style={[styles.navBtnText, { color: currentSlide === 0 ? theme.textMuted : theme.primary }]}>
                {'← '}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.slideCounter, { color: theme.text }]}>
              {currentSlide + 1} / {total}
            </Text>
            <TouchableOpacity
              onPress={goNext}
              disabled={currentSlide === total - 1}
              style={[styles.navBtn, currentSlide === total - 1 && styles.navBtnDisabled]}>
              <Text style={[styles.navBtnText, { color: currentSlide === total - 1 ? theme.textMuted : theme.primary }]}>
                {' →'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  closeBtn: { paddingRight: spacing.sm },
  closeBtnText: { ...typography.buttonSmall },
  headerTitle: { ...typography.label, fontWeight: '600', flex: 1 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { padding: spacing.xs },
  progressBar: { height: 3 },
  progressFill: { height: 3, borderRadius: 2 },
  slideContainer: { padding: spacing.base, paddingBottom: spacing.xxl },
  slideTitle: { ...typography.h2, marginBottom: spacing.base },
  contentBlock: { marginBottom: spacing.base },
  bulletPoint: { ...typography.body, marginBottom: spacing.xs, lineHeight: 24 },
  subBullet: { marginLeft: spacing.base, fontSize: 14 },
  tableTitle: { ...typography.label, fontWeight: '600', marginBottom: spacing.sm },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tableHeader: { borderBottomWidth: 2 },
  tableCell: { ...typography.bodySmall, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 100 },
  tableHeaderCell: { fontWeight: '600' },
  takeaway: { padding: spacing.base, borderRadius: borderRadius.lg, borderWidth: 1, marginBottom: spacing.base },
  takeawayLabel: { ...typography.label, fontWeight: '700', marginBottom: spacing.sm },
  vignette: { padding: spacing.base, borderRadius: borderRadius.lg, borderWidth: 1, marginBottom: spacing.base },
  vignetteTitle: { ...typography.label, fontWeight: '700', marginBottom: spacing.sm },
  vignetteText: { ...typography.body, marginBottom: spacing.sm },
  vignetteQuestion: { ...typography.body, fontWeight: '600', marginBottom: spacing.xs },
  vignetteAnswer: { ...typography.body, fontStyle: 'italic' },
  notesSection: { marginTop: spacing.lg, padding: spacing.base, borderRadius: borderRadius.lg, borderWidth: 1 },
  notesLabel: { ...typography.caption, fontWeight: '600', textTransform: 'uppercase', marginBottom: spacing.xs },
  notesText: { ...typography.bodySmall, lineHeight: 22 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    borderTopWidth: 1,
  },
  navBtn: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { ...typography.button, fontSize: 20 },
  slideCounter: { ...typography.label, fontWeight: '600' },
  gridContainer: { padding: spacing.base },
  gridCard: {
    flex: 1,
    margin: spacing.xs,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    minHeight: 90,
  },
  gridNumber: { ...typography.caption, fontWeight: '700', marginBottom: spacing.xs },
  gridTitle: { ...typography.bodySmall, fontWeight: '500' },
  gridViewed: { position: 'absolute', top: spacing.sm, right: spacing.sm, fontSize: 14 },
});
