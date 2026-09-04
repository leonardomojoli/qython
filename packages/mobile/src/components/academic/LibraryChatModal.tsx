import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { sendLibraryChat, submitChatFeedback } from '../../services/academic';
import type { Library, ChatMessage as ChatMessageType } from '../../types/academic';
import ChatMessage from './ChatMessage';

interface Props {
  visible: boolean;
  library: Library;
  onClose: () => void;
}

const SUGGESTIONS_PT = [
  'Qual é o resumo geral dos documentos?',
  'Quais são os principais conceitos abordados?',
  'Explique os pontos mais importantes',
];

export default function LibraryChatModal({ visible, library, onClose }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userMsg: ChatMessageType = { sender: 'user', content: text.trim() };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput('');
      setLoading(true);

      try {
        const history = updatedMessages.map((m) => ({
          sender: m.sender,
          content: m.content,
        }));
        const response = await sendLibraryChat(library.id, text.trim(), history);
        const botMsg: ChatMessageType = { sender: 'bot', content: response.response };
        setMessages((prev) => [...prev, botMsg]);
      } catch {
        const errorMsg: ChatMessageType = {
          sender: 'bot',
          content: t('errorSendingMessage', 'Erro ao enviar mensagem. Tente novamente.'),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, library.id, t],
  );

  const handleLike = (msgIndex: number) => {
    const likedMsg = messages[msgIndex];
    const userPrompt = msgIndex > 0 ? messages[msgIndex - 1].content : '';
    submitChatFeedback({
      feedbackType: 'like',
      contentId: `lib_${library.id}_msg_${msgIndex}`,
      originalContent: likedMsg.content,
      userPrompt,
      conversationContext: messages.slice(0, msgIndex + 1),
    }).catch(() => {});
    Alert.alert('', t('feedbackSentSuccess', 'Feedback enviado!'));
  };

  const handleDislike = (msgIndex: number) => {
    const dislikedMsg = messages[msgIndex];
    const userPrompt = msgIndex > 0 ? messages[msgIndex - 1].content : '';
    submitChatFeedback({
      feedbackType: 'dislike',
      contentId: `lib_${library.id}_msg_${msgIndex}`,
      originalContent: dislikedMsg.content,
      userPrompt,
      conversationContext: messages.slice(0, msgIndex + 1),
    }).catch(() => {});
    Alert.alert('', t('feedbackSentSuccess', 'Feedback enviado!'));
  };

  const handleClose = () => {
    setMessages([]);
    setInput('');
    onClose();
  };

  const allMessages = loading
    ? [...messages, { sender: 'bot' as const, content: '' }]
    : messages;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
              {t('chatWithLibrary', { name: library.name, defaultValue: `Conversando com ${library.name}` })}
            </Text>
            <Text style={[styles.badge, { color: theme.primary }]}>
              {t('libraryModeLabel', 'Modo Biblioteca')}
            </Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={[styles.closeBtnText, { color: theme.textMuted }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Messages */}
        {messages.length === 0 && !loading ? (
          <View style={styles.welcome}>
            <Text style={styles.welcomeIcon}>📚</Text>
            <Text style={[styles.welcomeTitle, { color: theme.text }]}>
              {t('libraryWelcomeTitle', 'Converse com seus documentos')}
            </Text>
            <Text style={[styles.welcomeDesc, { color: theme.textMuted }]}>
              {t('libraryWelcomeDesc')}
            </Text>
            <Text style={[styles.suggestLabel, { color: theme.textMuted }]}>
              {t('trySuggestions', 'Experimente perguntar:')}
            </Text>
            <View style={styles.suggestions}>
              {[
                t('librarySuggestion1', SUGGESTIONS_PT[0]),
                t('librarySuggestion2', SUGGESTIONS_PT[1]),
                t('librarySuggestion3', SUGGESTIONS_PT[2]),
              ].map((suggestion, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.chip, { borderColor: theme.surfaceBorder }]}
                  onPress={() => sendMessage(suggestion)}>
                  <Text style={[styles.chipText, { color: theme.text }]}>
                    {suggestion}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={allMessages}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            renderItem={({ item, index }) => {
              const isLoadingMsg = loading && index === allMessages.length - 1 && item.sender === 'bot' && !item.content;
              const realIndex = index;
              return (
                <ChatMessage
                  sender={item.sender}
                  content={item.content}
                  isLoading={isLoadingMsg}
                  onLike={
                    item.sender === 'bot' && !isLoadingMsg
                      ? () => handleLike(realIndex)
                      : undefined
                  }
                  onDislike={
                    item.sender === 'bot' && !isLoadingMsg
                      ? () => handleDislike(realIndex)
                      : undefined
                  }
                />
              );
            }}
          />
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { borderTopColor: theme.surfaceBorder }]}>
          <TextInput
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
            ]}
            value={input}
            onChangeText={setInput}
            placeholder={t('askAboutYourDocs', 'Faça perguntas aos seus documentos...')}
            placeholderTextColor={theme.textMuted}
            editable={!loading}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: input.trim() && !loading ? theme.primary : theme.surface },
            ]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || loading}>
            <Text
              style={[
                styles.sendBtnText,
                { color: input.trim() && !loading ? '#fff' : theme.textMuted },
              ]}>
              ➤
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    ...typography.h3,
  },
  badge: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  closeBtn: {
    padding: spacing.sm,
  },
  closeBtnText: {
    fontSize: 20,
    fontWeight: '600',
  },
  welcome: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  welcomeIcon: {
    fontSize: 48,
    marginBottom: spacing.base,
  },
  welcomeTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  welcomeDesc: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  suggestLabel: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  suggestions: {
    width: '100%',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  chipText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  messagesList: {
    paddingVertical: spacing.base,
    flexGrow: 1,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnText: {
    fontSize: 20,
  },
});
