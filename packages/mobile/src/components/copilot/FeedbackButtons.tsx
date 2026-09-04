import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing } from '../../theme/spacing';

interface Props {
  messageId: number;
  currentFeedback: 'like' | 'dislike' | null;
  onFeedback: (messageId: number, feedback: 'like' | 'dislike') => void;
}

export default function FeedbackButtons({ messageId, currentFeedback, onFeedback }: Props) {
  const { theme } = useTheme();
  const [feedback, setFeedback] = useState(currentFeedback);

  const handleFeedback = (type: 'like' | 'dislike') => {
    if (feedback === type) {
      return;
    }
    setFeedback(type);
    onFeedback(messageId, type);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.button,
          feedback === 'like' && { backgroundColor: theme.success + '20' },
        ]}
        onPress={() => handleFeedback('like')}
        activeOpacity={0.7}>
        <View style={styles.iconWrapper}>
          <View style={[
            styles.thumbIcon,
            { borderColor: feedback === 'like' ? theme.success : theme.textMuted },
          ]}>
            <View style={[styles.thumbUp, { backgroundColor: feedback === 'like' ? theme.success : theme.textMuted }]} />
          </View>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.button,
          feedback === 'dislike' && { backgroundColor: theme.error + '20' },
        ]}
        onPress={() => handleFeedback('dislike')}
        activeOpacity={0.7}>
        <View style={styles.iconWrapper}>
          <View style={[
            styles.thumbIcon,
            styles.thumbDown,
            { borderColor: feedback === 'dislike' ? theme.error : theme.textMuted },
          ]}>
            <View style={[styles.thumbUp, { backgroundColor: feedback === 'dislike' ? theme.error : theme.textMuted }]} />
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  button: {
    padding: spacing.xs,
    borderRadius: 4,
  },
  iconWrapper: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbIcon: {
    width: 16,
    height: 16,
    borderWidth: 1.5,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbDown: {
    transform: [{ rotate: '180deg' }],
  },
  thumbUp: {
    width: 6,
    height: 6,
    borderRadius: 1,
  },
});
