import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNetwork } from '../../contexts/NetworkContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useUser } from '../../contexts/UserContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { useDebounce } from '../../hooks/useDebounce';
import { searchMedicationsOffline } from '../../services/offlineSearchService';
import { searchMedications } from '../../services/pharmacy';
import { COUNTRIES, THERAPEUTIC_CLASSES, CONTROLLED_TYPES, PAGE_SIZE } from '../../types/pharmacy';
import type { Medication } from '../../types/pharmacy';
import SearchBar from '../../components/pharmacy/SearchBar';
import CountryPicker from '../../components/pharmacy/CountryPicker';
import FilterPicker, { type FilterOption } from '../../components/pharmacy/FilterPicker';
import MedicationCard from '../../components/pharmacy/MedicationCard';
import MedicationDetailModal from '../../components/pharmacy/MedicationDetailModal';
import EmptyState from '../../components/pharmacy/EmptyState';

export default function MedicationSearchTab() {
  const { t, i18n } = useTranslation();
  const { isInternetReachable } = useNetwork();
  const isOffline = !isInternetReachable;
  const { theme } = useTheme();
  const { user } = useUser();

  const defaultCountry = COUNTRIES.find((c) => c.code === user?.country)?.code || 'br';

  const [query, setQuery] = useState('');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry);
  const [govProgramOnly, setGovProgramOnly] = useState(false);
  const [therapeuticClass, setTherapeuticClass] = useState('');
  const [controlledType, setControlledType] = useState('');
  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);

  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [showControlledPicker, setShowControlledPicker] = useState(false);

  const debouncedQuery = useDebounce(query, 400);

  const doSearch = useCallback(
    async (
      searchQuery: string,
      gpOnly: boolean,
      thClass: string,
      ctrlType: string,
      country: string,
    ) => {
      setLoading(true);
      try {
        if (isOffline) {
          const params: any = {};
          if (searchQuery) params.search = searchQuery;
          if (gpOnly) params.has_gov_program = true;
          if (thClass) params.therapeutic_class = thClass;
          if (ctrlType) params.controlled_type = ctrlType;
          if (country) params.country = country;
          const results = searchMedicationsOffline(params);
          setMedications(results);
          setHasMore(false);
          setHasSearched(true);
        } else {
          const params: any = { limit: PAGE_SIZE, offset: 0 };
          if (searchQuery) params.search = searchQuery;
          if (gpOnly) params.has_gov_program = true;
          if (thClass) params.therapeutic_class = thClass;
          if (ctrlType) params.controlled_type = ctrlType;
          if (country) params.country = country;
          // Normalize i18n language ("pt-BR" → "pt") so the backend
          // matches its 2-letter MedicationTranslation locales.
          const lang = (i18n.language || 'pt').split('-')[0];
          params.lang = lang;
          const data = await searchMedications(params);
          setMedications(data || []);
          setHasMore((data || []).length >= PAGE_SIZE);
          setHasSearched(true);
        }
      } catch {
        Alert.alert('', t('noMedicationsFound'));
      } finally {
        setLoading(false);
      }
    },
    [isOffline, t],
  );

  useEffect(() => {
    doSearch(debouncedQuery, govProgramOnly, therapeuticClass, controlledType, selectedCountry);
  }, [debouncedQuery, govProgramOnly, therapeuticClass, controlledType, selectedCountry, doSearch]);

  const handleLoadMore = useCallback(async () => {
    if (isOffline) return;
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params: any = { limit: PAGE_SIZE, offset: medications.length };
      if (query) params.search = query;
      if (govProgramOnly) params.has_gov_program = true;
      if (therapeuticClass) params.therapeutic_class = therapeuticClass;
      if (controlledType) params.controlled_type = controlledType;
      if (selectedCountry) params.country = selectedCountry;
      params.lang = (i18n.language || 'pt').split('-')[0];
      const data = await searchMedications(params);
      const newData = data || [];
      setMedications((prev) => [...prev, ...newData]);
      setHasMore(newData.length >= PAGE_SIZE);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [
    isOffline,
    loadingMore,
    hasMore,
    medications.length,
    query,
    govProgramOnly,
    therapeuticClass,
    controlledType,
    selectedCountry,
  ]);

  const selectedCountryObj = COUNTRIES.find((c) => c.code === selectedCountry);

  const classOptions: FilterOption[] = THERAPEUTIC_CLASSES.map((c) => ({
    value: c,
    label: c,
  }));
  const controlledOptions: FilterOption[] = CONTROLLED_TYPES.map((c) => ({
    value: c,
    label: c.toUpperCase(),
  }));

  const renderItem = useCallback(
    ({ item }: { item: Medication }) => (
      <MedicationCard
        medication={item}
        selectedCountry={selectedCountry}
        onPress={() => setSelectedMed(item)}
      />
    ),
    [selectedCountry],
  );

  const renderFooter = () => {
    if (isOffline) return null;
    if (!loadingMore) return null;
    return (
      <ActivityIndicator
        style={styles.footerLoader}
        size="small"
        color={theme.primary}
      />
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    if (!hasSearched) {
      return <EmptyState icon="🔍" message={t('searchMedicationsHint')} />;
    }
    return <EmptyState icon="💊" message={t('noMedicationsFound')} />;
  };

  return (
    <View style={styles.container}>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('searchMedications')}
      />

      {/* Filters row */}
      <View style={styles.filtersRow}>
        <TouchableOpacity
          style={[styles.filterChip, { borderColor: theme.surfaceBorder }]}
          onPress={() => setShowCountryPicker(true)}>
          <Text style={[styles.filterChipText, { color: theme.text }]}>
            {selectedCountryObj?.flag} {t(selectedCountryObj?.labelKey || 'brazil')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            { borderColor: therapeuticClass ? theme.primary : theme.surfaceBorder },
          ]}
          onPress={() => setShowClassPicker(true)}>
          <Text
            style={[
              styles.filterChipText,
              { color: therapeuticClass ? theme.primary : theme.textMuted },
            ]}
            numberOfLines={1}>
            {therapeuticClass || t('therapeuticClass')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            { borderColor: controlledType ? theme.primary : theme.surfaceBorder },
          ]}
          onPress={() => setShowControlledPicker(true)}>
          <Text
            style={[
              styles.filterChipText,
              { color: controlledType ? theme.primary : theme.textMuted },
            ]}>
            {controlledType ? controlledType.toUpperCase() : t('controlledMedication')}
          </Text>
        </TouchableOpacity>

        <View style={styles.gpToggle}>
          <Text style={[styles.gpLabel, { color: theme.textMuted }]}>
            {t('govProgramFilter')}
          </Text>
          <Switch
            value={govProgramOnly}
            onValueChange={setGovProgramOnly}
            trackColor={{ false: theme.surface, true: theme.primary + '50' }}
            thumbColor={govProgramOnly ? theme.primary : theme.textMuted}
          />
        </View>
      </View>

      {isOffline && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeText}>{t('offlineDataBadge', 'offline')}</Text>
        </View>
      )}

      {loading && !hasSearched ? (
        <ActivityIndicator style={styles.loader} size="large" color={theme.primary} />
      ) : (
        <FlatList
          data={medications}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.list,
            medications.length === 0 && styles.emptyList,
          ]}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={isOffline ? undefined : handleLoadMore}
          onEndReachedThreshold={0.3}
        />
      )}

      <MedicationDetailModal
        medication={selectedMed}
        selectedCountry={selectedCountry}
        onClose={() => setSelectedMed(null)}
      />

      <CountryPicker
        visible={showCountryPicker}
        selectedCode={selectedCountry}
        onSelect={setSelectedCountry}
        onClose={() => setShowCountryPicker(false)}
      />

      <FilterPicker
        visible={showClassPicker}
        title={t('therapeuticClass')}
        options={classOptions}
        selectedValue={therapeuticClass}
        onSelect={setTherapeuticClass}
        onClose={() => setShowClassPicker(false)}
      />

      <FilterPicker
        visible={showControlledPicker}
        title={t('controlledMedication')}
        options={controlledOptions}
        selectedValue={controlledType}
        onSelect={setControlledType}
        onClose={() => setShowControlledPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  filterChipText: {
    ...typography.caption,
    fontWeight: '500',
    maxWidth: 120,
  },
  gpToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: 'auto',
  },
  gpLabel: {
    ...typography.caption,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  list: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  emptyList: {
    flex: 1,
  },
  footerLoader: {
    paddingVertical: spacing.base,
  },
  offlineBadge: {
    alignSelf: 'flex-start',
    marginLeft: spacing.base,
    backgroundColor: '#F59E0B20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  offlineBadgeText: {
    ...typography.caption,
    color: '#F59E0B',
    fontWeight: '600',
    fontSize: 11,
  },
});
