import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Share,
  Alert,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface Chapter {
  time: number;
  title: string;
}

interface Props {
  title: string;
  videoUrl: string;
  duration?: string;
  chapters?: Chapter[];
  onClose?: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VideoLessonPlayer({ title, videoUrl, duration, chapters, onClose }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const handlePlay = async () => {
    try {
      const canOpen = await Linking.canOpenURL(videoUrl);
      if (canOpen) {
        await Linking.openURL(videoUrl);
      } else {
        Alert.alert('', t('cannotOpenVideo', 'Nao foi possivel abrir o video.'));
      }
    } catch {
      Alert.alert('', t('cannotOpenVideo', 'Nao foi possivel abrir o video.'));
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title,
        message: `${title}\n${videoUrl}`,
        url: videoUrl,
      });
    } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{'🎬'}</Text>
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {title}
          </Text>
          {duration && (
            <Text style={[styles.duration, { color: theme.textMuted }]}>
              {duration}
            </Text>
          )}
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeBtnText, { color: theme.textMuted }]}>
              {'\u2715'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Chapters */}
      {chapters && chapters.length > 0 && (
        <View style={styles.chaptersSection}>
          <Text style={[styles.chaptersTitle, { color: theme.textMuted }]}>
            {t('chapters', 'Capítulos')} ({chapters.length})
          </Text>
          <ScrollView style={styles.chaptersList} nestedScrollEnabled>
            {chapters.map((chapter, i) => (
              <View key={i} style={[styles.chapterRow, { borderBottomColor: theme.surfaceBorder }]}>
                <Text style={[styles.chapterTime, { color: theme.primary }]}>
                  {formatDuration(chapter.time)}
                </Text>
                <Text style={[styles.chapterTitle, { color: theme.text }]} numberOfLines={1}>
                  {chapter.title}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.playBtn, { backgroundColor: theme.primary }]}
          onPress={handlePlay}
          activeOpacity={0.8}>
          <Text style={styles.playBtnIcon}>{'▶'}</Text>
          <Text style={styles.playBtnText}>
            {t('watchVideo', 'Assistir Video')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.shareBtn, { borderColor: theme.surfaceBorder }]}
          onPress={handleShare}
          activeOpacity={0.8}>
          <Text style={[styles.shareBtnText, { color: theme.primary }]}>
            {t('downloadMaterial', 'Compartilhar')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconContainer: {
    width: 48, height: 48, borderRadius: borderRadius.md,
    backgroundColor: 'rgba(88, 166, 255, 0.15)',
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  icon: { fontSize: 24 },
  info: { flex: 1 },
  title: { ...typography.label, fontWeight: '600' },
  duration: { ...typography.caption, marginTop: spacing.xs },
  closeBtn: { padding: spacing.sm },
  closeBtnText: { fontSize: 16, fontWeight: '600' },
  chaptersSection: { marginBottom: spacing.md },
  chaptersTitle: { ...typography.caption, fontWeight: '600', textTransform: 'uppercase', marginBottom: spacing.sm },
  chaptersList: { maxHeight: 120 },
  chapterRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.sm,
  },
  chapterTime: { ...typography.caption, fontWeight: '600', fontVariant: ['tabular-nums'], width: 50 },
  chapterTitle: { ...typography.bodySmall, flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  playBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, borderRadius: borderRadius.md, gap: spacing.sm,
  },
  playBtnIcon: { color: '#fff', fontSize: 14 },
  playBtnText: { ...typography.buttonSmall, color: '#fff' },
  shareBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, borderRadius: borderRadius.md, borderWidth: 1,
  },
  shareBtnText: { ...typography.buttonSmall },
});
