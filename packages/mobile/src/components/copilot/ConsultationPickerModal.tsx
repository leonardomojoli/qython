import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { getAllConsultations } from '../../services/ambulatory';
import type { Consultation } from '../../types/ambulatory';
import type { ConsultationContext } from '../../services/copilot';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (context: ConsultationContext) => void;
}

export default function ConsultationPickerModal({ visible, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchConsultations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllConsultations();
      setConsultations(data);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchConsultations();
      setSearch('');
    }
  }, [visible, fetchConsultations]);

  const filtered = search.trim()
    ? consultations.filter(c => {
        const q = search.toLowerCase();
        return (
          c.specialty.toLowerCase().includes(q) ||
          (c.patient_name?.toLowerCase().includes(q) ?? false) ||
          (c.improved_notes?.toLowerCase().includes(q) ?? false) ||
          c.raw_notes.toLowerCase().includes(q)
        );
      })
    : consultations;

  const handleSelect = (c: Consultation) => {
    const content = c.improved_notes || c.raw_notes;
    onSelect({
      type: 'saved_consultation',
      id: c.id,
      specialty: c.specialty,
      patientName: c.patient_name,
      content,
      preview: content.substring(0, 80) + (content.length > 80 ? '...' : ''),
      date: new Date(c.created_at).toLocaleDateString(),
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.headerBtn, { color: theme.textMuted }]}>
              {t('cancel', 'Cancelar')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {t('selectConsultation', 'Selecionar Consulta')}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder, color: theme.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder={t('searchConsultations', 'Buscar consultas...')}
            placeholderTextColor={theme.textMuted}
          />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={filtered.length === 0 ? styles.centered : styles.list}
            renderItem={({ item }) => {
              const date = new Date(item.created_at).toLocaleDateString();
              const preview = (item.improved_notes || item.raw_notes).substring(0, 100);
              return (
                <TouchableOpacity
                  style={[styles.item, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}>
                  <View style={styles.itemHeader}>
                    <Text style={[styles.itemSpecialty, { color: theme.primary }]}>
                      {item.specialty}
                    </Text>
                    <Text style={[styles.itemDate, { color: theme.textMuted }]}>{date}</Text>
                  </View>
                  {item.patient_name && (
                    <Text style={[styles.itemPatient, { color: theme.text }]}>
                      {item.patient_name}
                    </Text>
                  )}
                  <Text style={[styles.itemPreview, { color: theme.textSecondary }]} numberOfLines={2}>
                    {preview}
                  </Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                {t('noSavedConsultations', 'Nenhuma consulta salva encontrada.')}
              </Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: 1,
  },
  headerTitle: { ...typography.label, fontWeight: '600' },
  headerBtn: { ...typography.body },
  searchRow: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  searchInput: {
    ...typography.body, borderWidth: 1, borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl },
  item: {
    borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  itemSpecialty: { ...typography.buttonSmall, fontWeight: '600' },
  itemDate: { ...typography.caption },
  itemPatient: { ...typography.bodySmall, fontWeight: '500', marginBottom: spacing.xs },
  itemPreview: { ...typography.caption, lineHeight: 18 },
  emptyText: { ...typography.body, textAlign: 'center' },
});
