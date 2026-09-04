import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { getPatients, deletePatient } from '../../services/ambulatory';
import { useDebounce } from '../../hooks/useDebounce';
import SearchBar from '../../components/pharmacy/SearchBar';
import EmptyState from '../../components/pharmacy/EmptyState';
import PatientCard from '../../components/ambulatory/PatientCard';
import PatientFormModal from '../../components/ambulatory/PatientFormModal';
import PatientDetailModal from '../../components/ambulatory/PatientDetailModal';
import { useNetwork } from '../../contexts/NetworkContext';
import { searchPatientsOffline } from '../../services/offlineSearchService';
import { createPatientOfflineAware, type LocalPatient } from '../../services/offlineMutations';
import type { Patient } from '../../types/ambulatory';

export default function PatientsTab() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { isInternetReachable } = useNetwork();
  const isOffline = !isInternetReachable;
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const fetchPatients = useCallback(async (query?: string) => {
    try {
      if (isOffline) {
        const data = searchPatientsOffline(query);
        setPatients(data);
      } else {
        const data = await getPatients(query || undefined);
        setPatients(data);
      }
    } catch {
      // Try offline as fallback
      const data = searchPatientsOffline(query);
      setPatients(data);
    }
  }, [t, isOffline]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchPatients(debouncedSearch);
    setLoading(false);
  }, [fetchPatients, debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPatients(debouncedSearch);
    setRefreshing(false);
  };

  const handlePatientPress = (patient: Patient) => {
    setSelectedPatient(patient);
    setDetailVisible(true);
  };

  const handlePatientLongPress = (patient: Patient) => {
    if (String(patient.id).startsWith('temp_')) return;
    Alert.alert(
      t('deletePatient', 'Excluir Paciente'),
      t('deletePatientConfirm', 'Tem certeza que deseja excluir este paciente?'),
      [
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
        {
          text: t('delete', 'Excluir'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePatient(patient.id);
              setPatients((prev) => prev.filter((p) => p.id !== patient.id));
            } catch {
              Alert.alert('', t('errorDeletingPatient', 'Erro ao excluir paciente'));
            }
          },
        },
      ],
    );
  };

  const handlePatientSaved = (patient: Patient) => {
    setPatients((prev) => {
      const idx = prev.findIndex((p) => p.id === patient.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = patient;
        return updated;
      }
      return [patient, ...prev];
    });
  };

  const handlePatientUpdated = (patient: Patient) => {
    handlePatientSaved(patient);
    setSelectedPatient(patient);
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
        placeholder={t('searchPatientPlaceholder', 'Buscar paciente...')}
      />

      <FlatList
        data={patients}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.patientRow}>
            <PatientCard
              patient={item}
              onPress={handlePatientPress}
              onLongPress={handlePatientLongPress}
            />
            {(item as any)._isLocal && (
              <View style={styles.localBadge}>
                <Text style={styles.localBadgeText}>{'\u2601'}</Text>
              </View>
            )}
          </View>
        )}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={patients.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon="\u{1F465}"
            message={t('noPatientsFound', 'Nenhum paciente encontrado')}
          />
        }
      />

      {/* FAB — primary-tinted luminous shadow */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: theme.primary,
            shadowColor: theme.primary,
            shadowOpacity: 0.55,
          },
        ]}
        onPress={() => setFormVisible(true)}
        activeOpacity={0.85}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <PatientFormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSaved={handlePatientSaved}
      />

      <PatientDetailModal
        visible={detailVisible}
        patient={selectedPatient}
        onClose={() => setDetailVisible(false)}
        onPatientUpdated={handlePatientUpdated}
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
    paddingBottom: spacing.xxl + spacing.xl,
  },
  emptyContainer: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: spacing.base,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    // shadowColor + shadowOpacity injected inline (theme-aware)
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '400',
    marginTop: -2,
  },
  patientRow: {
    position: 'relative' as const,
  },
  localBadge: {
    position: 'absolute' as const,
    top: spacing.sm,
    right: spacing.base,
  },
  localBadgeText: {
    fontSize: 16,
    color: '#F59E0B',
  },
});
