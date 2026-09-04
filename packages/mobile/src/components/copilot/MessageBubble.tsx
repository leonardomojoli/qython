import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, Share } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Clipboard from '@react-native-clipboard/clipboard';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { ChatMessage } from '../../services/copilot';
import MarkdownRenderer from './MarkdownRenderer';
import SourcesSection from './SourcesSection';
import FeedbackButtons from './FeedbackButtons';

interface Props {
  message: ChatMessage;
  isTyping?: boolean;
  onFeedback: (messageId: number, feedback: 'like' | 'dislike') => void;
  onEdit?: (messageId: number, newText: string) => void;
  onRegenerate?: (botMessageId: number) => void;
  onShareConversation?: (upToMessageId: number, format: 'txt' | 'md') => void;
}

export default function MessageBubble({ message, isTyping, onFeedback, onEdit, onRegenerate, onShareConversation }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isUser = message.role === 'user';

  // Typing animation state
  const [displayedContent, setDisplayedContent] = useState(
    isTyping ? '' : message.content,
  );
  const [typingComplete, setTypingComplete] = useState(!isTyping);

  useEffect(() => {
    if (!isTyping || !message.content) {
      setDisplayedContent(message.content);
      setTypingComplete(true);
      return;
    }

    let index = 0;
    const charsPerTick = 8;
    const tickMs = 20;

    const interval = setInterval(() => {
      index += charsPerTick;
      if (index >= message.content.length) {
        setDisplayedContent(message.content);
        setTypingComplete(true);
        clearInterval(interval);
      } else {
        setDisplayedContent(message.content.slice(0, index));
      }
    }, tickMs);

    return () => clearInterval(interval);
  }, [isTyping, message.content]);

  const handleCopy = () => {
    try {
      Clipboard.setString(message.content);
      Alert.alert('', t('messageCopied', 'Mensagem copiada'));
    } catch {
      // Clipboard not available
    }
  };

  const handleShareSingle = async () => {
    try {
      await Share.share({ message: message.content });
    } catch {}
  };

  const handleShareFormatPicker = (scope: 'single' | 'conversation') => {
    if (scope === 'single') {
      handleShareSingle();
      return;
    }
    // Conversation scope — pick format
    Alert.alert(
      t('shareFormat', 'Formato'),
      '',
      [
        {
          text: t('shareAsTxtLabel', 'Texto Simples (.txt)'),
          onPress: () => onShareConversation?.(message.id, 'txt'),
        },
        {
          text: t('shareAsMdLabel', 'Markdown (.md)'),
          onPress: () => onShareConversation?.(message.id, 'md'),
        },
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
      ],
    );
  };

  const handleShare = () => {
    if (!onShareConversation) {
      handleShareSingle();
      return;
    }
    Alert.alert(
      t('share', 'Compartilhar'),
      '',
      [
        {
          text: t('shareOnlyThisResponse', 'Apenas esta mensagem'),
          onPress: () => handleShareFormatPicker('single'),
        },
        {
          text: t('shareConversationUntilHere', 'Conversa até aqui'),
          onPress: () => handleShareFormatPicker('conversation'),
        },
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
      ],
    );
  };

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const editInputRef = useRef<TextInput>(null);

  const handleStartEdit = () => {
    if (!onEdit) return;
    setEditText(message.content);
    setIsEditing(true);
    setTimeout(() => editInputRef.current?.focus(), 100);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(message.content);
  };

  const handleSubmitEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.content) {
      handleCancelEdit();
      return;
    }
    setIsEditing(false);
    onEdit?.(message.id, trimmed);
  };

  const handleLongPress = () => {
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: t('copyMessage', 'Copiar'), onPress: handleCopy },
      { text: t('shareMessage', 'Compartilhar'), onPress: handleShare },
    ];
    if (isUser && onEdit) {
      options.push({ text: t('editMessage', 'Editar'), onPress: handleStartEdit });
    }
    if (!isUser && onRegenerate) {
      options.push({ text: t('regenerateResponse', 'Regenerar'), onPress: () => onRegenerate(message.id) });
    }
    options.push({ text: t('cancel', 'Cancelar'), style: 'cancel' });
    Alert.alert('', '', options);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onLongPress={handleLongPress}
      delayLongPress={500}>
      <View
        style={[
          styles.container,
          isUser ? styles.userContainer : styles.botContainer,
        ]}>
        <View
          style={[
            styles.bubble,
            isUser
              ? styles.userBubble
              : [
                  styles.botBubble,
                  {
                    backgroundColor: theme.surface,
                    shadowColor: theme.primary,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 8,
                    elevation: 2,
                  },
                ],
          ]}>
          {isUser && (
            <LinearGradient
              colors={[theme.primary + '38', theme.primary + '18'] as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
          )}
          {isUser ? (
            isEditing ? (
              <View style={styles.editContainer}>
                <TextInput
                  ref={editInputRef}
                  style={[styles.editInput, { color: theme.text, borderColor: theme.primary }]}
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                  autoFocus
                />
                <View style={styles.editActions}>
                  <TouchableOpacity onPress={handleCancelEdit} style={styles.editCancelBtn}>
                    <Text style={[styles.editCancelText, { color: theme.textMuted }]}>
                      {t('cancel', 'Cancelar')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSubmitEdit}
                    style={[styles.editSubmitBtn, { backgroundColor: theme.primary }]}>
                    <Text style={styles.editSubmitText}>
                      {t('send', 'Enviar')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={[styles.userText, { color: theme.text }]}>
                {message.content}
              </Text>
            )
          ) : (
            <>
              <MarkdownRenderer content={displayedContent} sources={message.sources} />
              {typingComplete && message.sources && (
                <SourcesSection sources={message.sources} />
              )}
              {typingComplete && message.reasoning && (
                <View style={[styles.reasoning, { borderTopColor: theme.surfaceBorder }]}>
                  <Text style={[styles.reasoningLabel, { color: theme.textMuted }]}>
                    {t('clinicalReasoning', 'Raciocinio clinico')}
                  </Text>
                  <Text style={[styles.reasoningText, { color: theme.textSecondary }]}>
                    {message.reasoning}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Action buttons for user messages */}
        {isUser && !isEditing && onEdit && (
          <View style={[styles.actionsRow, { justifyContent: 'flex-end' }]}>
            <View style={styles.messageActions}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.surface }]}
                onPress={handleStartEdit}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={[styles.actionIcon, { color: theme.textMuted }]}>
                  {'\u270F'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Action buttons for bot messages */}
        {!isUser && typingComplete && (
          <View style={styles.actionsRow}>
            <FeedbackButtons
              messageId={message.id}
              currentFeedback={message.feedback || null}
              onFeedback={onFeedback}
            />
            <View style={styles.messageActions}>
              {onRegenerate && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: theme.surface }]}
                  onPress={() => onRegenerate(message.id)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={[styles.actionIcon, { color: theme.textMuted }]}>
                    {'\u21BB'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.surface }]}
                onPress={handleCopy}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={[styles.actionIcon, { color: theme.textMuted }]}>
                  {'\uD83D\uDCCB'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.surface }]}
                onPress={handleShare}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={[styles.actionIcon, { color: theme.textMuted }]}>
                  {'\uD83D\uDD17'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  botContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    overflow: 'hidden',
  },
  userBubble: {
    borderBottomRightRadius: borderRadius.sm,
  },
  botBubble: {
    borderBottomLeftRadius: borderRadius.sm,
  },
  userText: {
    ...typography.body,
  },
  reasoning: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  reasoningLabel: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  reasoningText: {
    ...typography.bodySmall,
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: '85%',
    width: '100%',
  },
  messageActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 13,
  },
  editContainer: {
    width: '100%',
  },
  editInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  editCancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  editCancelText: {
    ...typography.buttonSmall,
  },
  editSubmitBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  editSubmitText: {
    ...typography.buttonSmall,
    color: '#fff',
  },
});
