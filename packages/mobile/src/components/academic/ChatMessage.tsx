import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface Props {
  sender: 'user' | 'bot';
  content: string;
  isLoading?: boolean;
  onLike?: () => void;
  onDislike?: () => void;
}

// Simple markdown-like formatting: **bold**, *italic*, - list items
function formatText(text: string) {
  // Split into lines for list handling
  return text.split('\n').map((line, i) => {
    const isBullet = /^[-•]\s/.test(line.trim());
    const formatted = line
      .replace(/\*\*(.+?)\*\*/g, '⟨b⟩$1⟨/b⟩')
      .replace(/\*(.+?)\*/g, '⟨i⟩$1⟨/i⟩');

    return (
      <Text key={i} style={isBullet ? styles.bulletLine : undefined}>
        {formatted.split(/⟨\/?[bi]⟩/).map((part, j) => {
          // Determine if this part was wrapped in bold or italic tags
          const before = formatted.substring(
            0,
            formatted.indexOf(part),
          );
          const isBold = (before.match(/⟨b⟩/g) || []).length > (before.match(/⟨\/b⟩/g) || []).length;
          const isItalic = (before.match(/⟨i⟩/g) || []).length > (before.match(/⟨\/i⟩/g) || []).length;
          return (
            <Text
              key={j}
              style={[
                isBold && styles.bold,
                isItalic && styles.italic,
              ]}>
              {part}
            </Text>
          );
        })}
        {i < text.split('\n').length - 1 ? '\n' : ''}
      </Text>
    );
  });
}

export default function ChatMessage({
  sender,
  content,
  isLoading,
  onLike,
  onDislike,
}: Props) {
  const { theme } = useTheme();
  const isUser = sender === 'user';

  return (
    <View style={[styles.wrapper, isUser ? styles.userWrapper : styles.botWrapper]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: theme.primary }]
            : [styles.botBubble, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }],
        ]}>
        {isLoading ? (
          <Text style={[styles.loadingDots, { color: theme.textMuted }]}>
            ●  ●  ●
          </Text>
        ) : (
          <Text style={[styles.text, { color: isUser ? '#fff' : theme.text }]}>
            {formatText(content)}
          </Text>
        )}
      </View>
      {!isUser && !isLoading && (onLike || onDislike) && (
        <View style={styles.actions}>
          {onLike && (
            <TouchableOpacity onPress={onLike} hitSlop={8}>
              <Text style={[styles.actionIcon, { color: theme.textMuted }]}>👍</Text>
            </TouchableOpacity>
          )}
          {onDislike && (
            <TouchableOpacity onPress={onDislike} hitSlop={8}>
              <Text style={[styles.actionIcon, { color: theme.textMuted }]}>👎</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  userWrapper: {
    alignItems: 'flex-end',
  },
  botWrapper: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  userBubble: {
    borderBottomRightRadius: borderRadius.sm,
  },
  botBubble: {
    borderBottomLeftRadius: borderRadius.sm,
    borderWidth: 1,
  },
  text: {
    ...typography.body,
  },
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  bulletLine: {
    paddingLeft: spacing.sm,
  },
  loadingDots: {
    ...typography.body,
    letterSpacing: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingLeft: spacing.xs,
  },
  actionIcon: {
    fontSize: 16,
  },
});
