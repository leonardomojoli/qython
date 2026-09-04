import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { SPECIALTIES } from '../../types/ambulatory';
import SearchBar from '../pharmacy/SearchBar';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (specialty: string) => void;
}

export default function SpecialtyPicker({ visible, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!filter.trim()) return SPECIALTIES;
    const lower = filter.toLowerCase();
    return SPECIALTIES.filter((s) => s.toLowerCase().includes(lower));
  }, [filter]);

  const handleSelect = (specialty: string) => {
    setFilter('');
    onSelect(specialty);
    onClose();
  };

  return (
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
            {t('specialty', 'Especialidade')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <SearchBar
          value={filter}
          onChangeText={setFilter}
          placeholder={t('searchSpecialty', 'Buscar especialidade...')}
        />

        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.item, { borderBottomColor: theme.surfaceBorder }]}
              onPress={() => handleSelect(item)}
              activeOpacity={0.7}>
              <Text style={[styles.itemText, { color: theme.text }]}>{item}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {t('noResults', 'Nenhum resultado')}
            </Text>
          }
        />
      </View>
    </Modal>
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
  item: {
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
  },
  itemText: {
    ...typography.body,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
