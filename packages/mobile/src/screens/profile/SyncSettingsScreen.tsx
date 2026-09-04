import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { clearAllSyncData, getCacheSize } from '../../services/storage';
import PendingActionsSheet from '../../components/common/PendingActionsSheet';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

export default function SyncSettingsScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const sync = useSyncStatus();
  const [pendingSheetVisible, setPendingSheetVisible] = useState(false);

  const handleClearCache = () => {
    Alert.alert(
      t('offlineClearCache'),
      t('offlineClearCacheConfirm', 'Isso ira remover todos os dados em cache. A proxima sincronizacao fara download completo.'),
      [
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
        {
          text: t('offlineClearCache'),
          style: 'destructive',
          onPress: () => {
            clearAllSyncData();
            sync.refresh();
          },
        },
      ],
    );
  };

  const cacheSize = getCacheSize();

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      {/* Sync Status */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {t('offlineSyncStatus', 'Status da sincronizacao')}
        </Text>

        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.textMuted }]}>
            {t('offlineMedications', 'Medicamentos')}
          </Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {sync.medicationsCount} | {formatDate(sync.lastMedicationsSync)}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.textMuted }]}>
            {t('offlineInteractions', 'Interacoes')}
          </Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {sync.interactionsCount} | {formatDate(sync.lastInteractionsSync)}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.textMuted }]}>
            {t('offlinePatients', 'Pacientes')}
          </Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {sync.patientsCount} | {formatDate(sync.lastUserDataSync)}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.textMuted }]}>
            {t('offlineConsultations', 'Consultas')}
          </Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {sync.consultationsCount} | {formatDate(sync.lastUserDataSync)}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.textMuted }]}>
            {t('offlineCacheSize', 'Tamanho do cache')}
          </Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {formatBytes(cacheSize)}
          </Text>
        </View>
      </View>

      {/* Pending Operations */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}
        onPress={() => setPendingSheetVisible(true)}
        activeOpacity={0.7}>
        <View style={styles.cardRow}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>
            {t('offlinePendingActions', 'Acoes pendentes')}
          </Text>
          <View style={styles.badgeRow}>
            {sync.pendingQueueCount > 0 && (
              <View style={[styles.badge, { backgroundColor: '#F59E0B' }]}>
                <Text style={styles.badgeText}>{sync.pendingQueueCount}</Text>
              </View>
            )}
            <Text style={[styles.chevron, { color: theme.textMuted }]}>{'>'}</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Actions */}
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: theme.primary }]}
        onPress={sync.triggerSync}
        disabled={sync.isSyncing}
        activeOpacity={0.8}>
        {sync.isSyncing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.actionButtonText}>{t('offlineSyncNow')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.dangerButton, { borderColor: theme.error }]}
        onPress={handleClearCache}
        activeOpacity={0.7}>
        <Text style={[styles.dangerButtonText, { color: theme.error }]}>
          {t('offlineClearCache')}
        </Text>
      </TouchableOpacity>

      <PendingActionsSheet
        visible={pendingSheetVisible}
        onClose={() => setPendingSheetVisible(false)}
        onSyncComplete={sync.refresh}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  label: {
    ...typography.caption,
    flex: 1,
  },
  value: {
    ...typography.caption,
    flex: 2,
    textAlign: 'right',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    ...typography.body,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 18,
    fontWeight: '300',
  },
  actionButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  actionButtonText: {
    ...typography.button,
    color: '#fff',
  },
  dangerButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  dangerButtonText: {
    ...typography.button,
  },
});
