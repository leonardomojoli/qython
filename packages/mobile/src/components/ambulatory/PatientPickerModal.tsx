import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { useDebounce } from '../../hooks/useDebounce';
import { getPatients } from '../../services/ambulatory';
import SearchBar from '../pharmacy/SearchBar';
import PatientFormModal from './PatientFormModal';
import type { Patient } from '../../types/ambulatory';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (patient: Patient) => void;
}

export default function PatientPickerModal({ visible, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const fetchPatients = useCallback(async (query?: string) => {
    setLoading(true);
    try {
      const data = await getPatients(query || undefined);
      setPatients(data);
    } catch {
      Alert.alert('', t('errorLoadingPatients', 'Erro ao carregar pacientes'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (visible) {
      fetchPatients(debouncedSearch);
    }
  }, [visible, debouncedSearch, fetchPatients]);

  const handlePatientCreated = (patient: Patient) => {
    setPatients((prev) => [patient, ...prev]);
    setCreateVisible(false);
    onSelect(patient);
  };

  const renderItem = ({ item }: { item: Patient }) => (
    <TouchableOpacity
      style={[styles.item, { borderBottomColor: theme.surfaceBorder }]}
      onPress={() => onSelect(item)}
      activeOpacity={0.7}>
      <Text style={[styles.itemName, { color: theme.text }]}>{item.full_name}</Text>
      {item.phone && (
        <Text style={[styles.itemPhone, { color: theme.textMuted }]}>{item.phone}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.headerButton, { color: theme.textMuted }]}>
                {t('cancel', 'Cancelar')}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              {t('selectPatient', 'Selecionar Paciente')}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={t('searchPatientPlaceholder', 'Buscar paciente...')}
          />

          {/* New patient button */}
          <TouchableOpacity
            style={[styles.newButton, { borderColor: theme.primary }]}
            onPress={() => setCreateVisible(true)}>
            <Text style={[styles.newButtonText, { color: theme.primary }]}>
              + {t('registerNewPatient', 'Cadastrar Novo Paciente')}
            </Text>
          </TouchableOpacity>

          {loading ? (
            <ActivityIndicator
              size="large"
              color={theme.primary}
              style={styles.loader}
            />
          ) : (
            <FlatList
              data={patients}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderItem}
              contentContainerStyle={patients.length === 0 ? styles.emptyContainer : undefined}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  {t('noPatientsFound', 'Nenhum paciente encontrado')}
                </Text>
              }
            />
          )}
        </View>
      </Modal>

      <PatientFormModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onSaved={handlePatientCreated}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  headerButton: {
    ...typography.body,
  },
  headerSpacer: {
    width: 60,
  },
  newButton: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    borderStyle: 'dashed',
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  newButtonText: {
    ...typography.buttonSmall,
  },
  loader: {
    marginTop: spacing.xl,
  },
  item: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
  },
  itemName: {
    ...typography.body,
    fontWeight: '500',
  },
  itemPhone: {
    ...typography.caption,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
