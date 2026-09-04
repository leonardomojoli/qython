import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNetwork } from '../../contexts/NetworkContext';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { useDebounce } from '../../hooks/useDebounce';
import { searchMedicationsOffline, checkInteractionsOffline } from '../../services/offlineSearchService';
import { searchMedications, checkDrugInteractions } from '../../services/pharmacy';
import type { Medication, DrugInteraction, InteractionCheckResult } from '../../types/pharmacy';
import SearchBar from '../../components/pharmacy/SearchBar';
import MedicationPill from '../../components/pharmacy/MedicationPill';
import InteractionResultCard from '../../components/pharmacy/InteractionResultCard';
import EmptyState from '../../components/pharmacy/EmptyState';
import GradientButton from '../../components/shared/GradientButton';

export default function InteractionCheckerTab() {
  const { t, i18n } = useTranslation();
  const { isInternetReachable } = useNetwork();
  const isOffline = !isInternetReachable;
  const { theme } = useTheme();

  const [selectedMeds, setSelectedMeds] = useState<Medication[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Medication[]>([]);
  const [searching, setSearching] = useState(false);
  const [interactions, setInteractions] = useState<InteractionCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (!text || text.length < 2) {
        setSearchResults([]);
        return;
      }
      searchTimeoutRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          if (isOffline) {
            const results = searchMedicationsOffline({ search: text });
            const seen = new Set<string>();
            const unique = results.filter((m) => {
              const key = m.active_principle?.toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            }).slice(0, 10);
            setSearchResults(unique);
          } else {
            const params: any = { search: text, limit: 10 };
            params.lang = (i18n.language || 'pt').split('-')[0];
            const data = await searchMedications(params);
            // Deduplicate by active_principle
            const seen = new Set<string>();
            const unique = (data || []).filter((m) => {
              const key = m.active_principle?.toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            setSearchResults(unique);
          }
        } catch {
          // silent
        } finally {
          setSearching(false);
        }
      }, 300);
    },
    [isOffline],
  );

  const addMedication = useCallback(
    (med: Medication) => {
      const principle = med.active_principle?.toLowerCase();
      if (selectedMeds.some((m) => m.active_principle?.toLowerCase() === principle)) return;
      setSelectedMeds((prev) => [...prev, med]);
      setSearchQuery('');
      setSearchResults([]);
      setInteractions(null);
    },
    [selectedMeds],
  );

  const removeMedication = useCallback((index: number) => {
    setSelectedMeds((prev) => prev.filter((_, i) => i !== index));
    setInteractions(null);
  }, []);

  const handleCheck = useCallback(async () => {
    if (selectedMeds.length < 2) return;
    setChecking(true);
    try {
      const principles = selectedMeds.map((m) => m.active_principle);
      if (isOffline) {
        const results = checkInteractionsOffline(principles);
        setInteractions({ interactions: results });
      } else {
        const data = await checkDrugInteractions(principles);
        setInteractions(data);
      }
    } catch {
      Alert.alert('', t('noInteractionsFound'));
    } finally {
      setChecking(false);
    }
  }, [isOffline, selectedMeds, t]);

  const renderSearchResult = ({ item }: { item: Medication }) => (
    <TouchableOpacity
      style={[styles.resultItem, { borderColor: theme.surfaceBorder }]}
      onPress={() => addMedication(item)}
      activeOpacity={0.7}>
      <Text style={[styles.resultName, { color: theme.text }]} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[styles.resultPrinciple, { color: theme.textSecondary }]} numberOfLines={1}>
        {item.active_principle}
      </Text>
    </TouchableOpacity>
  );

  const renderInteraction = ({ item }: { item: DrugInteraction }) => (
    <InteractionResultCard interaction={item} />
  );

  const hasInteractions = interactions?.interactions && interactions.interactions.length > 0;

  return (
    <View style={styles.container}>
      {/* Selected medications pills */}
      {selectedMeds.length > 0 && (
        <View style={styles.pillsContainer}>
          {selectedMeds.map((med, index) => (
            <MedicationPill
              key={`${med.id}-${index}`}
              name={med.name}
              activePrinciple={med.active_principle}
              onRemove={() => removeMedication(index)}
            />
          ))}
        </View>
      )}

      {/* Search */}
      <SearchBar
        value={searchQuery}
        onChangeText={handleSearchChange}
        placeholder={t('addMedication')}
      />

      {/* Search results dropdown */}
      {searchResults.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          <FlatList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            style={styles.dropdownList}
          />
        </View>
      )}

      {searching && (
        <ActivityIndicator style={styles.searchingIndicator} size="small" color={theme.primary} />
      )}

      {/* Check button */}
      <View style={styles.checkButtonWrapper}>
        <GradientButton
          label={t('checkInteractionsButton')}
          onPress={handleCheck}
          loading={checking}
          disabled={selectedMeds.length < 2}
        />
      </View>

      {/* Results */}
      {interactions && hasInteractions && (
        <View style={styles.resultsContainer}>
          <Text style={[styles.resultsTitle, { color: theme.text }]}>
            {interactions.interactions.length} {t('interactionsFound')}
          </Text>
          <FlatList
            data={interactions.interactions}
            renderItem={renderInteraction}
            keyExtractor={(_, index) => String(index)}
            contentContainerStyle={styles.resultsList}
          />
        </View>
      )}

      {interactions && !hasInteractions && (
        <EmptyState icon="✅" message={t('noInteractionsFound')} />
      )}

      {!interactions && selectedMeds.length === 0 && (
        <EmptyState icon="➕" message={t('interactionCheckerHint')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
  dropdown: {
    marginHorizontal: spacing.base,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
    maxHeight: 200,
  },
  dropdownList: {
    maxHeight: 200,
  },
  resultItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  resultName: {
    ...typography.bodySmall,
    fontWeight: '500',
  },
  resultPrinciple: {
    ...typography.caption,
    marginTop: 2,
  },
  searchingIndicator: {
    marginTop: spacing.sm,
  },
  checkButtonWrapper: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  resultsContainer: {
    flex: 1,
    paddingTop: spacing.md,
  },
  resultsTitle: {
    ...typography.body,
    fontWeight: '600',
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  resultsList: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xxl,
  },
});
