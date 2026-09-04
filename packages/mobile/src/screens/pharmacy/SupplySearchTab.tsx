import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Text,
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
import { COUNTRIES, SUPPLY_CATEGORIES, PAGE_SIZE } from '../../types/pharmacy';
import type { Medication } from '../../types/pharmacy';
import SearchBar from '../../components/pharmacy/SearchBar';
import CountryPicker from '../../components/pharmacy/CountryPicker';
import FilterPicker, { type FilterOption } from '../../components/pharmacy/FilterPicker';
import SupplyCard from '../../components/pharmacy/SupplyCard';
import SupplyDetailModal from '../../components/pharmacy/SupplyDetailModal';
import EmptyState from '../../components/pharmacy/EmptyState';

export default function SupplySearchTab() {
  const { t, i18n } = useTranslation();
  const { isInternetReachable } = useNetwork();
  const isOffline = !isInternetReachable;
  const { theme } = useTheme();
  const { user } = useUser();

  const defaultCountry = COUNTRIES.find((c) => c.code === user?.country)?.code || 'br';

  const [query, setQuery] = useState('');
  const [supplies, setSupplies] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry);
  const [govProgramOnly, setGovProgramOnly] = useState(false);
  const [category, setCategory] = useState('');
  const [selectedItem, setSelectedItem] = useState<Medication | null>(null);

  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const debouncedQuery = useDebounce(query, 400);

  const doSearch = useCallback(
    async (searchQuery: string, gpOnly: boolean, cat: string, country: string) => {
      setLoading(true);
      try {
        if (isOffline) {
          const params: any = { item_type: 'supply' };
          if (searchQuery) params.search = searchQuery;
          if (gpOnly) params.has_gov_program = true;
          if (cat) params.therapeutic_class = cat;
          if (country) params.country = country;
          const results = searchMedicationsOffline(params);
          setSupplies(results);
          setHasMore(false);
          setHasSearched(true);
        } else {
          const params: any = { limit: PAGE_SIZE, offset: 0, item_type: 'supply' };
          if (searchQuery) params.search = searchQuery;
          if (gpOnly) params.has_gov_program = true;
          if (cat) params.therapeutic_class = cat;
          if (country) params.country = country;
          params.lang = (i18n.language || 'pt').split('-')[0];
          const data = await searchMedications(params);
          setSupplies(data || []);
          setHasMore((data || []).length >= PAGE_SIZE);
          setHasSearched(true);
        }
      } catch {
        Alert.alert('', t('noSuppliesFound'));
      } finally {
        setLoading(false);
      }
    },
    [isOffline, t],
  );

  useEffect(() => {
    doSearch(debouncedQuery, govProgramOnly, category, selectedCountry);
  }, [debouncedQuery, govProgramOnly, category, selectedCountry, doSearch]);

  const handleLoadMore = useCallback(async () => {
    if (isOffline) return;
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params: any = {
        limit: PAGE_SIZE,
        offset: supplies.length,
        item_type: 'supply',
      };
      if (query) params.search = query;
      if (govProgramOnly) params.has_gov_program = true;
      if (category) params.therapeutic_class = category;
      if (selectedCountry) params.country = selectedCountry;
      params.lang = (i18n.language || 'pt').split('-')[0];
      const data = await searchMedications(params);
      const newData = data || [];
      setSupplies((prev) => [...prev, ...newData]);
      setHasMore(newData.length >= PAGE_SIZE);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [isOffline, loadingMore, hasMore, supplies.length, query, govProgramOnly, category, selectedCountry]);

  const selectedCountryObj = COUNTRIES.find((c) => c.code === selectedCountry);

  const categoryOptions: FilterOption[] = SUPPLY_CATEGORIES.map((c) => ({
    value: c.value,
    label: t(c.labelKey),
  }));

  const renderItem = useCallback(
    ({ item }: { item: Medication }) => (
      <SupplyCard
        supply={item}
        selectedCountry={selectedCountry}
        onPress={() => setSelectedItem(item)}
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
      return <EmptyState icon="🔍" message={t('searchSuppliesHint')} />;
    }
    return <EmptyState icon="🏥" message={t('noSuppliesFound')} />;
  };

  return (
    <View style={styles.container}>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('searchSupplies')}
      />

      {/* Filters */}
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
            { borderColor: category ? theme.primary : theme.surfaceBorder },
          ]}
          onPress={() => setShowCategoryPicker(true)}>
          <Text
            style={[
              styles.filterChipText,
              { color: category ? theme.primary : theme.textMuted },
            ]}
            numberOfLines={1}>
            {category || t('supplyCategory')}
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
          data={supplies}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.list,
            supplies.length === 0 && styles.emptyList,
          ]}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={isOffline ? undefined : handleLoadMore}
          onEndReachedThreshold={0.3}
        />
      )}

      <SupplyDetailModal
        supply={selectedItem}
        selectedCountry={selectedCountry}
        onClose={() => setSelectedItem(null)}
      />

      <CountryPicker
        visible={showCountryPicker}
        selectedCode={selectedCountry}
        onSelect={setSelectedCountry}
        onClose={() => setShowCountryPicker(false)}
      />

      <FilterPicker
        visible={showCategoryPicker}
        title={t('supplyCategory')}
        options={categoryOptions}
        selectedValue={category}
        onSelect={setCategory}
        onClose={() => setShowCategoryPicker(false)}
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
    maxWidth: 130,
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
