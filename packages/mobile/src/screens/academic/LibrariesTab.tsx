import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, borderRadius } from '../../theme/spacing';
import { getLibraries, deleteLibrary } from '../../services/academic';
import type { Library } from '../../types/academic';
import LibraryCard from '../../components/academic/LibraryCard';
import CloudConnectBanner from '../../components/connectors/CloudConnectBanner';
import CreateLibraryModal from '../../components/academic/CreateLibraryModal';
import EmptyState from '../../components/pharmacy/EmptyState';
import SearchBar from '../../components/pharmacy/SearchBar';
import LibraryDetailScreen from './LibraryDetailScreen';

export default function LibrariesTab() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editingLibrary, setEditingLibrary] = useState<Library | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<Library | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLibraries = useCallback(async () => {
    try {
      const data = await getLibraries();
      setLibraries(data);
    } catch {
      Alert.alert('', t('errorLoadingLibraries', 'Erro ao carregar suas bibliotecas.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      fetchLibraries();
    }, [fetchLibraries]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLibraries();
  };

  const handleDelete = async (library: Library) => {
    try {
      await deleteLibrary(library.id);
      setLibraries((prev) => prev.filter((l) => l.id !== library.id));
    } catch {
      Alert.alert('', t('errorDeletingLibrary', 'Erro ao excluir a biblioteca.'));
    }
  };

  // If a library is selected, show its detail view
  if (selectedLibrary) {
    return (
      <LibraryDetailScreen
        library={selectedLibrary}
        onBack={() => {
          setSelectedLibrary(null);
          fetchLibraries();
        }}
        onLibraryUpdated={(updated) => {
          setSelectedLibrary(updated);
          setLibraries((prev) =>
            prev.map((l) => (l.id === updated.id ? updated : l)),
          );
        }}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const term = searchQuery.trim().toLowerCase();
  const filteredLibraries = term
    ? libraries.filter(
        (l) =>
          l.name.toLowerCase().includes(term) ||
          (l.description || '').toLowerCase().includes(term),
      )
    : libraries;

  return (
    <View style={styles.container}>
      {libraries.length > 0 && (
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('searchLibraries', 'Buscar bibliotecas...')}
        />
      )}
      <FlatList
        data={filteredLibraries}
        numColumns={2}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <LibraryCard
            library={item}
            onPress={() => setSelectedLibrary(item)}
            onDelete={() => handleDelete(item)}
            onEdit={() => setEditingLibrary(item)}
          />
        )}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListHeaderComponent={<CloudConnectBanner />}
        ListEmptyComponent={
          term && libraries.length > 0 ? (
            <EmptyState
              icon="🔍"
              message={t('noLibrariesMatch', 'Nenhuma biblioteca corresponde à busca.')}
            />
          ) : (
            <EmptyState
              icon="📚"
              message={t('noLibrariesFound', 'Nenhuma biblioteca encontrada. Crie a sua primeira biblioteca e aprenda com seus documentos.')}
            />
          )
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
        onPress={() => setCreateModalVisible(true)}
        activeOpacity={0.85}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <CreateLibraryModal
        visible={createModalVisible || !!editingLibrary}
        onClose={() => {
          setCreateModalVisible(false);
          setEditingLibrary(null);
        }}
        onCreated={(updated) => {
          setCreateModalVisible(false);
          setEditingLibrary(null);
          if (updated) {
            setLibraries((prev) =>
              prev.map((l) => (l.id === updated.id ? updated : l)),
            );
          } else {
            fetchLibraries();
          }
        }}
        editLibrary={editingLibrary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: spacing.sm,
    flexGrow: 1,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
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
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 30,
  },
});
