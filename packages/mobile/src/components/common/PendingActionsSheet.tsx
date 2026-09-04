import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { getAll, removeById, processQueue } from '../../services/offlineQueue';
import { useNetwork } from '../../contexts/NetworkContext';
import type { QueuedOperation } from '../../types/offline';

const TYPE_LABELS: Record<string, string> = {
  CREATE_PATIENT: 'createPatient',
  UPDATE_PATIENT: 'updatePatient',
  CREATE_CONSULTATION: 'createConsultation',
  CREATE_PRESCRIPTION: 'createPrescription',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export default function PendingActionsSheet({ visible, onClose, onSyncComplete }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { isInternetReachable } = useNetwork();
  const [operations, setOperations] = React.useState<QueuedOperation[]>([]);
  const [syncing, setSyncing] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setOperations(getAll());
    }
  }, [visible]);

  const handleRemove = (id: string) => {
    removeById(id);
    setOperations(getAll());
  };

  const handleSync = async () => {
    setSyncing(true);
    await processQueue();
    setSyncing(false);
    setOperations(getAll());
    onSyncComplete?.();
  };

  const renderItem = ({ item }: { item: QueuedOperation }) => {
    const typeKey = TYPE_LABELS[item.type] || item.type;
    const hasError = item.retryCount >= item.maxRetries;

    return (
      <View style={[styles.item, { borderColor: theme.surfaceBorder }]}>
        <View style={styles.itemContent}>
          <Text style={[styles.itemType, { color: theme.text }]}>
            {t(typeKey, item.type)}
          </Text>
          <Text style={[styles.itemTime, { color: theme.textMuted }]}>
            {new Date(item.createdAt).toLocaleString()}
          </Text>
          {hasError && (
            <Text style={[styles.itemError, { color: theme.error }]}>
              {item.error || t('offlineSyncFailed', 'Falha ao sincronizar')}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemove(item.id)}>
          <Text style={[styles.removeText, { color: theme.error }]}>X</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <SafeAreaView
          style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
            <Text style={[styles.title, { color: theme.text }]}>
              {t('offlinePendingActions', 'Acoes pendentes')}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.closeText, { color: theme.textMuted }]}>
                {t('close', 'Fechar')}
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={operations}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={operations.length === 0 ? styles.emptyContainer : undefined}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                {t('offlineNoPending', 'Nenhuma acao pendente')}
              </Text>
            }
          />

          {operations.length > 0 && (
            <TouchableOpacity
              style={[
                styles.syncButton,
                { backgroundColor: isInternetReachable ? theme.primary : theme.surfaceBorder },
              ]}
              onPress={handleSync}
              disabled={!isInternetReachable || syncing}
              activeOpacity={0.8}>
              <Text style={styles.syncButtonText}>
                {syncing ? t('offlineSyncing') : t('offlineSyncNow')}
              </Text>
            </TouchableOpacity>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  title: {
    ...typography.h3,
  },
  closeText: {
    ...typography.buttonSmall,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  itemContent: {
    flex: 1,
  },
  itemType: {
    ...typography.body,
    fontWeight: '500',
  },
  itemTime: {
    ...typography.caption,
    marginTop: 2,
  },
  itemError: {
    ...typography.caption,
    marginTop: 2,
  },
  removeButton: {
    padding: spacing.sm,
  },
  removeText: {
    ...typography.body,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
  syncButton: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  syncButtonText: {
    ...typography.button,
    color: '#fff',
  },
});
