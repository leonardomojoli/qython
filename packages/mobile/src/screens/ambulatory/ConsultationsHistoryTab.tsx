import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { getAllConsultations, deleteConsultations } from '../../services/ambulatory';
import SearchBar from '../../components/pharmacy/SearchBar';
import EmptyState from '../../components/pharmacy/EmptyState';
import ConsultationCard from '../../components/ambulatory/ConsultationCard';
import ConsultationDetailModal from '../../components/ambulatory/ConsultationDetailModal';
import { useNetwork } from '../../contexts/NetworkContext';
import { getConsultationsOffline } from '../../services/offlineSearchService';
import type { Consultation } from '../../types/ambulatory';

export default function ConsultationsHistoryTab() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { isInternetReachable } = useNetwork();
  const isOffline = !isInternetReachable;
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedConsultation, setSelectedConsultation] =
    useState<Consultation | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // Multi-select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const fetchConsultations = useCallback(async () => {
    try {
      if (isOffline) {
        const data = getConsultationsOffline();
        setConsultations(data);
      } else {
        const data = await getAllConsultations();
        setConsultations(data);
      }
    } catch {
      const data = getConsultationsOffline();
      setConsultations(data);
    }
  }, [t, isOffline]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchConsultations();
      setLoading(false);
    })();
  }, [fetchConsultations]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchConsultations();
    setRefreshing(false);
  };

  const filtered = search.trim()
    ? consultations.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.specialty.toLowerCase().includes(q) ||
          (c.patient_name?.toLowerCase().includes(q) ?? false) ||
          (c.summary?.toLowerCase().includes(q) ?? false) ||
          c.raw_notes.toLowerCase().includes(q)
        );
      })
    : consultations;

  // ─── Selection handlers ──────────────────────────────────
  const handleLongPress = (consultation: Consultation) => {
    setSelectionMode(true);
    setSelectedIds(new Set([consultation.id]));
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      t('deleteConsultation', 'Excluir Consulta'),
      t(
        'bulkDeleteConfirm',
        `Deseja excluir ${selectedIds.size} consulta(s)?`,
      ),
      [
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
        {
          text: t('delete', 'Excluir'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteConsultations(Array.from(selectedIds));
              setConsultations((prev) =>
                prev.filter((c) => !selectedIds.has(c.id)),
              );
              handleCancelSelection();
            } catch {
              Alert.alert(
                '',
                t('errorDeletingConsultation', 'Erro ao excluir consulta'),
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  // ─── Share ───────────────────────────────────────────────
  const handleShare = async (consultation: Consultation) => {
    try {
      const RNShare = (await import('react-native-share')).default;
      const text = [
        `${t('specialty', 'Especialidade')}: ${consultation.specialty}`,
        consultation.patient_name
          ? `${t('patient', 'Paciente')}: ${consultation.patient_name}`
          : '',
        '',
        consultation.improved_notes || consultation.raw_notes,
        consultation.summary ? `\n${t('summary', 'Resumo')}:\n${consultation.summary}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      await RNShare.open({ message: text });
    } catch {}
  };

  const handleConsultationPress = (consultation: Consultation) => {
    if (selectionMode) {
      handleToggleSelect(consultation.id);
    } else {
      setSelectedConsultation(consultation);
      setDetailVisible(true);
    }
  };

  const handleDeleted = (id: number) => {
    setConsultations((prev) => prev.filter((c) => c.id !== id));
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder={t('searchConsultations', 'Buscar consultas...')}
      />

      {/* Selection toolbar */}
      {selectionMode && (
        <View
          style={[
            styles.selectionBar,
            { backgroundColor: theme.surface, borderBottomColor: theme.surfaceBorder },
          ]}>
          <TouchableOpacity onPress={handleSelectAll}>
            <Text style={[styles.selectAllText, { color: theme.primary }]}>
              {selectedIds.size === filtered.length
                ? t('deselectAll', 'Desmarcar Todos')
                : t('selectAll', 'Selecionar Todos')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.selectedCount, { color: theme.textMuted }]}>
            {selectedIds.size} {t('selected', 'selecionado(s)')}
          </Text>
          <View style={styles.selectionActions}>
            {deleting ? (
              <ActivityIndicator size="small" color={theme.danger} />
            ) : (
              <TouchableOpacity onPress={handleBulkDelete}>
                <Text style={[styles.deleteText, { color: theme.danger }]}>
                  {t('delete', 'Excluir')}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelSelection}>
              <Text style={[styles.cancelText, { color: theme.textMuted }]}>
                {t('cancel', 'Cancelar')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.cardRow}>
            {selectionMode && (
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => handleToggleSelect(item.id)}>
                <Text style={{ color: theme.primary, fontSize: 20 }}>
                  {selectedIds.has(item.id) ? '\u2611' : '\u2610'}
                </Text>
              </TouchableOpacity>
            )}
            <View style={styles.cardContent}>
              <ConsultationCard
                consultation={item}
                onPress={handleConsultationPress}
                onLongPress={() => handleLongPress(item)}
              />
            </View>
            {(item as any)._isLocal && (
              <Text style={styles.localIcon}>{'\u2601'}</Text>
            )}
          </View>
        )}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={
          filtered.length === 0 ? styles.emptyContainer : styles.listContent
        }
        ListEmptyComponent={
          <EmptyState
            icon={'\u{1F4CB}'}
            message={t(
              'noConsultationsFound',
              'Nenhuma consulta encontrada',
            )}
          />
        }
      />

      <ConsultationDetailModal
        visible={detailVisible}
        consultation={selectedConsultation}
        onClose={() => setDetailVisible(false)}
        onDeleted={handleDeleted}
        onShare={handleShare}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    flex: 1,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  selectAllText: {
    ...typography.buttonSmall,
  },
  selectedCount: {
    ...typography.caption,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  deleteText: {
    ...typography.buttonSmall,
  },
  cancelButton: {
    paddingLeft: spacing.sm,
  },
  cancelText: {
    ...typography.buttonSmall,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    paddingLeft: spacing.base,
    paddingRight: spacing.xs,
  },
  cardContent: {
    flex: 1,
  },
  localIcon: {
    fontSize: 16,
    color: '#F59E0B',
    paddingRight: spacing.base,
  },
});
