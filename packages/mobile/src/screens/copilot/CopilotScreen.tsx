import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useUser } from '../../contexts/UserContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { WEB_BASE_URL } from '../../config/env';
import {
  sendMessage,
  getSessionMessages,
  submitFeedback,
  type ChatMessage,
  type ChatResponse,
  type ConsultationContext,
} from '../../services/copilot';
import MessageBubble from '../../components/copilot/MessageBubble';
import InputBar, { type AttachedFile, type InputBarHandle } from '../../components/copilot/InputBar';
import CopilotEmptyState from '../../components/copilot/CopilotEmptyState';
import SessionDrawer from '../../components/copilot/SessionDrawer';
import LibraryPickerModal from '../../components/copilot/LibraryPickerModal';
import ConsultationPickerModal from '../../components/copilot/ConsultationPickerModal';
import PatientPickerModal from '../../components/ambulatory/PatientPickerModal';
import type { Library } from '../../types/academic';
import type { Patient } from '../../types/ambulatory';

export default function CopilotScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [lastBotMessageId, setLastBotMessageId] = useState<number | null>(null);

  // Context state
  const [selectedLibrary, setSelectedLibrary] = useState<Library | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedConsultation, setSelectedConsultation] = useState<ConsultationContext | null>(null);
  const [libraryPickerVisible, setLibraryPickerVisible] = useState(false);
  const [patientPickerVisible, setPatientPickerVisible] = useState(false);
  const [consultationPickerVisible, setConsultationPickerVisible] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<InputBarHandle>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(
    async (text: string, files: AttachedFile[], isRegeneration = false) => {
      // Add user message optimistically (unless regeneration)
      if (!isRegeneration) {
        const userMessage: ChatMessage = {
          id: Date.now(),
          role: 'user',
          content: text,
          files: files.map((f) => f.name),
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMessage]);
      }
      setLoading(true);
      scrollToBottom();

      // Setup abort controller
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Build patient context string if patient is selected
      const patientContext = selectedPatient
        ? `Paciente: ${selectedPatient.full_name}${selectedPatient.birth_date ? `, nascimento: ${selectedPatient.birth_date}` : ''}${selectedPatient.gender ? `, sexo: ${selectedPatient.gender}` : ''}${selectedPatient.allergies?.length ? `, alergias: ${selectedPatient.allergies.join(', ')}` : ''}${selectedPatient.chronic_conditions?.length ? `, condições crônicas: ${selectedPatient.chronic_conditions.join(', ')}` : ''}${selectedPatient.current_medications?.length ? `, medicações atuais: ${selectedPatient.current_medications.join(', ')}` : ''}`
        : undefined;

      try {
        const response: ChatResponse = await sendMessage({
          message: text,
          sessionId: sessionId || undefined,
          files: files.length > 0 ? files : undefined,
          libraryId: selectedLibrary?.id,
          patientContext,
          consultationContext: selectedConsultation || undefined,
        });

        if (controller.signal.aborted) return;

        if (!sessionId && response.session_id) {
          setSessionId(response.session_id);
        }

        setMessages((prev) => [...prev, response.message]);
        setLastBotMessageId(response.message.id);
        scrollToBottom();
      } catch (error: any) {
        if (controller.signal.aborted) return;
        const errorMsg =
          error.response?.data?.detail ||
          t('errorSendingMessage', 'Erro ao enviar mensagem');
        Alert.alert('', errorMsg);
        if (!isRegeneration) {
          // Remove optimistic user message on error
          setMessages((prev) => prev.slice(0, -1));
        }
      } finally {
        abortControllerRef.current = null;
        setLoading(false);
      }
    },
    [sessionId, selectedLibrary, selectedPatient, scrollToBottom, t],
  );

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
    }
  }, []);

  const handleEditMessage = useCallback(
    (messageId: number, newText: string) => {
      // Find the message and truncate history after it
      const idx = messages.findIndex(m => m.id === messageId);
      if (idx === -1) return;
      // Keep messages up to and including the edited user message
      const truncated = messages.slice(0, idx);
      // Update the edited message content
      const editedMsg = { ...messages[idx], content: newText };
      setMessages([...truncated, editedMsg]);
      // Regenerate bot response
      handleSend(newText, [], true);
    },
    [messages, handleSend],
  );

  const handleRegenerate = useCallback(
    (botMessageId: number) => {
      // Find the bot message and the preceding user message
      const botIdx = messages.findIndex(m => m.id === botMessageId);
      if (botIdx < 1) return;
      const userMsg = messages[botIdx - 1];
      if (userMsg.role !== 'user') return;
      // Remove the bot message
      setMessages(prev => prev.slice(0, botIdx));
      // Regenerate
      handleSend(userMsg.content, [], true);
    },
    [messages, handleSend],
  );

  const handleShareConversation = useCallback(
    async (upToMessageId: number, format: 'txt' | 'md') => {
      const msgIdx = messages.findIndex(m => m.id === upToMessageId);
      if (msgIdx === -1) return;
      const slice = messages.slice(0, msgIdx + 1);

      let text: string;
      const footer = `\n---\nGenerated by Qython\n${WEB_BASE_URL}\n${new Date().toLocaleString()}`;

      if (format === 'md') {
        const lines = slice.map(m => {
          const role = m.role === 'user' ? `**${t('you', 'Você')}:**` : `**Quíron:**`;
          return `${role}\n\n${m.content}`;
        });
        text = `# ${t('copilotConversation', 'Conversa com Copiloto')}\n\n${lines.join('\n\n---\n\n')}${footer}`;
      } else {
        const lines = slice.map(m => {
          const role = m.role === 'user' ? t('you', 'Você') : 'Quíron';
          return `${role}:\n${m.content}`;
        });
        text = `${t('copilotConversation', 'Conversa com Copiloto')}\n\n${lines.join('\n\n')}${footer}`;
      }

      try {
        await Share.share({ title: t('copilotConversation', 'Conversa com Copiloto'), message: text });
      } catch {}
    },
    [messages, t],
  );

  const handleSelectSession = useCallback(async (id: number) => {
    setSessionId(id);
    setMessages([]);
    setLoading(true);
    try {
      const sessionMessages = await getSessionMessages(id);
      setMessages(sessionMessages);
      setLastBotMessageId(null);
    } catch {
      Alert.alert('', t('errorLoadingMessages', 'Erro ao carregar mensagens'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleNewSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setLastBotMessageId(null);
  }, []);

  const handleFeedback = useCallback(
    async (messageId: number, feedback: 'like' | 'dislike') => {
      if (!sessionId) {
        return;
      }
      try {
        await submitFeedback({ messageId, feedback, sessionId });
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)),
        );
      } catch {
        // Silent fail for feedback
      }
    },
    [sessionId],
  );

  const handleSelectLibrary = useCallback((library: Library | null) => {
    setSelectedLibrary(library);
  }, []);

  const handleSelectPatient = useCallback((patient: Patient) => {
    setSelectedPatient(patient);
    setPatientPickerVisible(false);
  }, []);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble
        message={item}
        isTyping={item.id === lastBotMessageId}
        onFeedback={handleFeedback}
        onEdit={!loading ? handleEditMessage : undefined}
        onRegenerate={!loading ? handleRegenerate : undefined}
        onShareConversation={handleShareConversation}
      />
    ),
    [lastBotMessageId, handleFeedback, handleEditMessage, handleRegenerate, loading, handleShareConversation],
  );

  const renderEmpty = () => {
    if (loading) {
      return null;
    }
    return (
      <CopilotEmptyState
        onPick={(opener) => inputRef.current?.setText(opener)}
        name={user?.full_name}
        treatment={user?.treatment}
      />
    );
  };

  const hasContext = selectedLibrary !== null || selectedPatient !== null || selectedConsultation !== null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        {/* Decorative gradient accent line on the bottom edge */}
        <LinearGradient
          colors={['transparent', theme.primary + '60', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerAccent}
          pointerEvents="none"
        />
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setShowSessions(true)}>
          <Text style={[styles.headerIcon, { color: theme.text }]}>{'\u2630'}</Text>
        </TouchableOpacity>

        {/* Library picker button */}
        <TouchableOpacity
          style={[
            styles.contextButton,
            selectedLibrary && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
            !selectedLibrary && { borderColor: theme.surfaceBorder },
          ]}
          onPress={() => setLibraryPickerVisible(true)}
          activeOpacity={0.7}>
          <Text style={styles.contextButtonIcon}>{'\uD83D\uDCDA'}</Text>
          {selectedLibrary && (
            <Text
              style={[styles.contextButtonLabel, { color: theme.primary }]}
              numberOfLines={1}>
              {selectedLibrary.name}
            </Text>
          )}
        </TouchableOpacity>

        {/* Patient picker button */}
        <TouchableOpacity
          style={[
            styles.contextButton,
            selectedPatient && { backgroundColor: theme.secondary + '20', borderColor: theme.secondary },
            !selectedPatient && { borderColor: theme.surfaceBorder },
          ]}
          onPress={() => setPatientPickerVisible(true)}
          activeOpacity={0.7}>
          <Text style={styles.contextButtonIcon}>{'\uD83D\uDC64'}</Text>
          {selectedPatient && (
            <Text
              style={[styles.contextButtonLabel, { color: theme.secondary }]}
              numberOfLines={1}>
              {selectedPatient.full_name.split(' ')[0]}
            </Text>
          )}
        </TouchableOpacity>

        {/* Consultation picker button */}
        <TouchableOpacity
          style={[
            styles.contextButton,
            selectedConsultation && { backgroundColor: theme.success + '20', borderColor: theme.success },
            !selectedConsultation && { borderColor: theme.surfaceBorder },
          ]}
          onPress={() => setConsultationPickerVisible(true)}
          activeOpacity={0.7}>
          <Text style={styles.contextButtonIcon}>{'\u{1FA7A}'}</Text>
          {selectedConsultation && (
            <Text
              style={[styles.contextButtonLabel, { color: theme.success }]}
              numberOfLines={1}>
              {selectedConsultation.specialty}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {t('copilot', 'Copiloto')}
        </Text>
      </View>

      {/* Context chips */}
      {hasContext && (
        <View style={[styles.contextChipsRow, { borderBottomColor: theme.surfaceBorder }]}>
          {selectedLibrary && (
            <View style={[styles.contextChip, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '40' }]}>
              <Text style={[styles.contextChipText, { color: theme.primary }]} numberOfLines={1}>
                {'\uD83D\uDCDA'} {selectedLibrary.name}
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedLibrary(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.contextChipRemove, { color: theme.primary }]}>
                  {'\u2715'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {selectedPatient && (
            <View style={[styles.contextChip, { backgroundColor: theme.secondary + '15', borderColor: theme.secondary + '40' }]}>
              <Text style={[styles.contextChipText, { color: theme.secondary }]} numberOfLines={1}>
                {'\uD83D\uDC64'} {selectedPatient.full_name}
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedPatient(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.contextChipRemove, { color: theme.secondary }]}>
                  {'\u2715'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {selectedConsultation && (
            <View style={[styles.contextChip, { backgroundColor: theme.success + '15', borderColor: theme.success + '40' }]}>
              <Text style={[styles.contextChipText, { color: theme.success }]} numberOfLines={1}>
                {'\u{1FA7A}'} {selectedConsultation.specialty}
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedConsultation(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.contextChipRemove, { color: theme.success }]}>
                  {'\u2715'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          styles.messageList,
          messages.length === 0 && styles.emptyList,
        ]}
        ListEmptyComponent={renderEmpty}
        onContentSizeChange={scrollToBottom}
      />

      {/* Loading indicator with stop button */}
      {loading && messages.length > 0 && (
        <View style={styles.typingIndicator}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.typingText, { color: theme.textMuted }]}>
            {t('thinking', 'Pensando...')}
          </Text>
          <TouchableOpacity
            style={[styles.stopButton, { borderColor: theme.error }]}
            onPress={handleStopGeneration}
            activeOpacity={0.7}>
            <View style={[styles.stopIcon, { backgroundColor: theme.error }]} />
            <Text style={[styles.stopText, { color: theme.error }]}>
              {t('stop', 'Parar')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <InputBar ref={inputRef} onSend={handleSend} disabled={loading} />
      <View style={{ height: insets.bottom }} />

      {/* Session Drawer */}
      <SessionDrawer
        visible={showSessions}
        currentSessionId={sessionId}
        onClose={() => setShowSessions(false)}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
      />

      {/* Library Picker Modal */}
      <LibraryPickerModal
        visible={libraryPickerVisible}
        onClose={() => setLibraryPickerVisible(false)}
        onSelect={handleSelectLibrary}
        selectedLibraryId={selectedLibrary?.id ?? null}
      />

      {/* Patient Picker Modal */}
      <PatientPickerModal
        visible={patientPickerVisible}
        onClose={() => setPatientPickerVisible(false)}
        onSelect={handleSelectPatient}
      />

      {/* Consultation Picker Modal */}
      <ConsultationPickerModal
        visible={consultationPickerVisible}
        onClose={() => setConsultationPickerVisible(false)}
        onSelect={setSelectedConsultation}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  headerAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    ...typography.h3,
    flex: 1,
    textAlign: 'center',
  },
  contextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginHorizontal: 2,
    maxWidth: 100,
  },
  contextButtonIcon: {
    fontSize: 14,
  },
  contextButtonLabel: {
    ...typography.caption,
    fontWeight: '500',
    marginLeft: 4,
    flexShrink: 1,
  },
  reasoningToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reasoningLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  contextChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    borderBottomWidth: 1,
  },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    maxWidth: '48%',
  },
  contextChipText: {
    ...typography.caption,
    fontWeight: '500',
    flexShrink: 1,
  },
  contextChipRemove: {
    fontSize: 12,
    marginLeft: spacing.xs,
    fontWeight: '600',
  },
  messageList: {
    paddingVertical: spacing.sm,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    ...typography.h2,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 24,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  typingText: {
    ...typography.bodySmall,
    flex: 1,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  stopIcon: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  stopText: {
    ...typography.caption,
    fontWeight: '600',
  },
});
