import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { getLibraries } from '../../services/academic';
import type { Library } from '../../types/academic';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (library: Library | null) => void;
  selectedLibraryId: number | null;
}

export default function LibraryPickerModal({
  visible,
  onClose,
  onSelect,
  selectedLibraryId,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchLibraries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLibraries();
      setLibraries(data);
    } catch {
      Alert.alert('', t('errorLoadingLibraries', 'Erro ao carregar bibliotecas'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (visible) {
      fetchLibraries();
      setSearch('');
    }
  }, [visible, fetchLibraries]);

  const filtered = libraries.filter((lib) =>
    lib.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = (library: Library | null) => {
    onSelect(library);
    onClose();
  };

  const renderItem = ({ item }: { item: Library }) => {
    const isSelected = item.id === selectedLibraryId;

    return (
      <TouchableOpacity
        style={[
          styles.item,
          {
            backgroundColor: isSelected ? theme.primary + '20' : 'transparent',
            borderColor: isSelected ? theme.primary : theme.surfaceBorder,
          },
        ]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}>
        <View style={styles.itemContent}>
          <Text
            style={[
              styles.itemName,
              { color: isSelected ? theme.primary : theme.text },
            ]}
            numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.itemCount, { color: theme.textMuted }]}>
            {item.document_count} {item.document_count === 1 ? 'doc' : 'docs'}
          </Text>
        </View>
        {isSelected && (
          <Text style={[styles.checkmark, { color: theme.primary }]}>
            {'\u2713'}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.drawer, { backgroundColor: theme.background }]}>
          <TouchableOpacity activeOpacity={1}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
              <Text style={[styles.title, { color: theme.text }]}>
                {t('selectLibrary', 'Selecionar Biblioteca')}
              </Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={[styles.closeButton, { color: theme.textMuted }]}>
                  {'\u2715'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <TextInput
                style={[
                  styles.searchInput,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.surfaceBorder,
                    color: theme.text,
                  },
                ]}
                value={search}
                onChangeText={setSearch}
                placeholder={t('searchLibrary', 'Buscar biblioteca...')}
                placeholderTextColor={theme.textMuted}
                autoCorrect={false}
              />
            </View>

            {/* "No library" option */}
            <TouchableOpacity
              style={[
                styles.item,
                {
                  backgroundColor: selectedLibraryId === null ? theme.primary + '20' : 'transparent',
                  borderColor: selectedLibraryId === null ? theme.primary : theme.surfaceBorder,
                },
              ]}
              onPress={() => handleSelect(null)}
              activeOpacity={0.7}>
              <View style={styles.itemContent}>
                <Text
                  style={[
                    styles.itemName,
                    { color: selectedLibraryId === null ? theme.primary : theme.text },
                  ]}>
                  {t('noLibraryOption', 'Nenhuma (chat geral)')}
                </Text>
                <Text style={[styles.itemCount, { color: theme.textMuted }]}>
                  {t('generalChatDesc', 'Sem contexto RAG')}
                </Text>
              </View>
              {selectedLibraryId === null && (
                <Text style={[styles.checkmark, { color: theme.primary }]}>
                  {'\u2713'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Library list */}
            {loading ? (
              <ActivityIndicator style={styles.loader} color={theme.primary} />
            ) : (
              <FlatList
                data={filtered}
                renderItem={renderItem}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                  <Text style={[styles.empty, { color: theme.textMuted }]}>
                    {t('noLibrariesFound', 'Nenhuma biblioteca encontrada')}
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
  closeButton: {
    fontSize: 18,
    padding: spacing.xs,
  },
  searchContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  list: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
  },
  itemContent: {
    flex: 1,
  },
  itemName: {
    ...typography.body,
    fontWeight: '500',
  },
  itemCount: {
    ...typography.caption,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: spacing.sm,
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
