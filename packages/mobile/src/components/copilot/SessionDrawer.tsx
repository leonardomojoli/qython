import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { getSessions, deleteSession, updateSessionTitle, type ChatSession } from '../../services/copilot';

interface Props {
  visible: boolean;
  currentSessionId: number | null;
  onClose: () => void;
  onSelectSession: (sessionId: number) => void;
  onNewSession: () => void;
}

export default function SessionDrawer({
  visible,
  currentSessionId,
  onClose,
  onSelectSession,
  onNewSession,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');
  const renameInputRef = useRef<TextInput>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSessions();
      setSessions(data);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadSessions();
    }
  }, [visible, loadSessions]);

  const handleLongPress = (session: ChatSession) => {
    Alert.alert(
      session.title || t('newChat', 'Novo chat'),
      '',
      [
        {
          text: t('rename', 'Renomear'),
          onPress: () => {
            setRenamingId(session.id);
            setRenameText(session.title || '');
            setTimeout(() => renameInputRef.current?.focus(), 100);
          },
        },
        {
          text: t('delete', 'Excluir'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('deleteSession', 'Excluir sessão'),
              t('deleteSessionConfirm', 'Tem certeza que deseja excluir esta sessão?'),
              [
                { text: t('cancel', 'Cancelar'), style: 'cancel' },
                {
                  text: t('delete', 'Excluir'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteSession(session.id);
                      setSessions((prev) => prev.filter((s) => s.id !== session.id));
                      if (session.id === currentSessionId) {
                        onNewSession();
                      }
                    } catch {
                      Alert.alert('', t('errorDeletingSession', 'Erro ao excluir sessão'));
                    }
                  },
                },
              ],
            );
          },
        },
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
      ],
    );
  };

  const handleRenameSubmit = async () => {
    if (!renamingId || !renameText.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await updateSessionTitle(renamingId, renameText.trim());
      setSessions((prev) =>
        prev.map((s) => (s.id === renamingId ? { ...s, title: renameText.trim() } : s)),
      );
    } catch {
      Alert.alert('', t('errorRenamingSession', 'Erro ao renomear sessão'));
    }
    setRenamingId(null);
  };

  const renderSession = ({ item }: { item: ChatSession }) => {
    const isActive = item.id === currentSessionId;
    const isRenaming = renamingId === item.id;

    return (
      <TouchableOpacity
        style={[
          styles.sessionItem,
          {
            backgroundColor: isActive ? theme.primary + '20' : 'transparent',
            borderColor: isActive ? theme.primary : theme.surfaceBorder,
          },
        ]}
        onPress={() => {
          if (isRenaming) return;
          onSelectSession(item.id);
          onClose();
        }}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}>
        {isRenaming ? (
          <TextInput
            ref={renameInputRef}
            style={[styles.renameInput, { color: theme.text, borderColor: theme.primary }]}
            value={renameText}
            onChangeText={setRenameText}
            onSubmitEditing={handleRenameSubmit}
            onBlur={handleRenameSubmit}
            returnKeyType="done"
            autoFocus
            selectTextOnFocus
          />
        ) : (
          <Text
            style={[styles.sessionTitle, { color: isActive ? theme.primary : theme.text }]}
            numberOfLines={2}>
            {item.title || t('newChat', 'Novo chat')}
          </Text>
        )}
        <Text style={[styles.sessionMeta, { color: theme.textMuted }]}>
          {item.message_count} {t('messages', 'mensagens')}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.drawer, { backgroundColor: theme.background }]}>
          <TouchableOpacity activeOpacity={1}>
            <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
              <Text style={[styles.title, { color: theme.text }]}>
                {t('chatSessions', 'Sessões')}
              </Text>
              <TouchableOpacity
                style={[styles.newButton, { backgroundColor: theme.primary }]}
                onPress={() => {
                  onNewSession();
                  onClose();
                }}>
                <Text style={styles.newButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator style={styles.loader} color={theme.primary} />
            ) : (
              <FlatList
                data={sessions}
                renderItem={renderSession}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                  <Text style={[styles.empty, { color: theme.textMuted }]}>
                    {t('noSessions', 'Nenhuma sessão')}
                  </Text>
                }
              />
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  drawer: {
    maxHeight: '70%',
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: 1,
  },
  title: {
    ...typography.h3,
  },
  newButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 22,
  },
  list: {
    padding: spacing.sm,
  },
  sessionItem: {
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  sessionTitle: {
    ...typography.body,
    fontWeight: '500',
  },
  sessionMeta: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  renameInput: {
    ...typography.body,
    fontWeight: '500',
    borderBottomWidth: 1,
    paddingVertical: 2,
    marginBottom: 2,
  },
  loader: {
    padding: spacing.xl,
  },
  empty: {
    ...typography.body,
    textAlign: 'center',
    padding: spacing.xl,
  },
});
