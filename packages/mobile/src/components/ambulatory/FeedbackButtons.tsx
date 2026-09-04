import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { submitFeedback } from '../../services/ambulatory';

interface Props {
  contentType: 'improved_notes' | 'summary' | 'patient_orientation';
  contentId?: number;
  trainingDataId?: number;
  onFeedback?: () => void;
}

export default function FeedbackButtons({
  contentType,
  contentId,
  trainingDataId,
  onFeedback,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [submitted, setSubmitted] = useState<'like' | 'dislike' | null>(null);

  const handleLike = async () => {
    if (submitted) return;
    try {
      await submitFeedback({
        feedback_type: 'like',
        content_type: contentType,
        content_id: contentId,
        training_data_id: trainingDataId,
      });
      setSubmitted('like');
      onFeedback?.();
    } catch {
      // Silently fail on feedback error
    }
  };

  const handleDislike = async () => {
    if (submitted) return;
    try {
      await submitFeedback({
        feedback_type: 'dislike',
        content_type: contentType,
        content_id: contentId,
        training_data_id: trainingDataId,
      });
      setSubmitted('dislike');
      onFeedback?.();
    } catch {
      // Silently fail on feedback error
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.button,
          {
            borderColor: submitted === 'like' ? theme.success : theme.surfaceBorder,
            backgroundColor: submitted === 'like' ? `${theme.success}20` : 'transparent',
          },
        ]}
        onPress={handleLike}
        disabled={submitted !== null}
        activeOpacity={0.7}>
        <Text style={styles.icon}>{'\uD83D\uDC4D'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.button,
          {
            borderColor: submitted === 'dislike' ? theme.error : theme.surfaceBorder,
            backgroundColor: submitted === 'dislike' ? `${theme.error}20` : 'transparent',
          },
        ]}
        onPress={handleDislike}
        disabled={submitted !== null}
        activeOpacity={0.7}>
        <Text style={styles.icon}>{'\uD83D\uDC4E'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 18,
  },
});
