import { useState, useCallback, useEffect } from 'react';
import { useNetwork } from '../contexts/NetworkContext';
import { searchMedications } from '../services/pharmacy';
import { searchMedicationsOffline } from '../services/offlineSearchService';
import { setObject, getObject, STORAGE_KEYS } from '../services/storage';
import { getMetadata } from '../services/syncService';
import type { Medication } from '../types/pharmacy';

interface UseOfflineMedicationsParams {
  search?: string;
  country?: string;
  therapeutic_class?: string;
  controlled_type?: string;
  has_gov_program?: boolean;
  item_type?: 'medication' | 'supply';
  limit?: number;
  offset?: number;
}

interface UseOfflineMedicationsResult {
  medications: Medication[];
  loading: boolean;
  isOffline: boolean;
  lastSync: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
}

export function useOfflineMedications(
  params: UseOfflineMedicationsParams,
): UseOfflineMedicationsResult {
  const { isInternetReachable } = useNetwork();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const isOffline = !isInternetReachable;

  const search = useCallback(async () => {
    setLoading(true);
    try {
      if (isOffline) {
        const results = searchMedicationsOffline({
          search: params.search,
          country: params.country,
          therapeutic_class: params.therapeutic_class,
          controlled_type: params.controlled_type,
          has_gov_program: params.has_gov_program,
          item_type: params.item_type,
        });
        setMedications(results);
        setHasMore(false); // Local data doesn't paginate
      } else {
        const apiParams: any = {
          limit: params.limit || 50,
          offset: 0,
        };
        if (params.search) apiParams.search = params.search;
        if (params.country) apiParams.country = params.country;
        if (params.therapeutic_class) apiParams.therapeutic_class = params.therapeutic_class;
        if (params.controlled_type) apiParams.controlled_type = params.controlled_type;
        if (params.has_gov_program) apiParams.has_gov_program = true;
        if (params.item_type) apiParams.item_type = params.item_type;

        const data = await searchMedications(apiParams);
        setMedications(data || []);
        setHasMore((data || []).length >= (params.limit || 50));
      }
    } catch {
      // API failed, try cache
      const results = searchMedicationsOffline({
        search: params.search,
        country: params.country,
        therapeutic_class: params.therapeutic_class,
        controlled_type: params.controlled_type,
        has_gov_program: params.has_gov_program,
        item_type: params.item_type,
      });
      setMedications(results);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [
    isOffline,
    params.search,
    params.country,
    params.therapeutic_class,
    params.controlled_type,
    params.has_gov_program,
    params.item_type,
    params.limit,
  ]);

  useEffect(() => {
    search();
  }, [search]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || isOffline) return;
    setLoadingMore(true);
    try {
      const apiParams: any = {
        limit: params.limit || 50,
        offset: medications.length,
      };
      if (params.search) apiParams.search = params.search;
      if (params.country) apiParams.country = params.country;
      if (params.therapeutic_class) apiParams.therapeutic_class = params.therapeutic_class;
      if (params.controlled_type) apiParams.controlled_type = params.controlled_type;
      if (params.has_gov_program) apiParams.has_gov_program = true;
      if (params.item_type) apiParams.item_type = params.item_type;

      const data = await searchMedications(apiParams);
      const newData = data || [];
      setMedications((prev) => [...prev, ...newData]);
      setHasMore(newData.length >= (params.limit || 50));
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [
    loadingMore,
    hasMore,
    isOffline,
    medications.length,
    params,
  ]);

  const metadata = getMetadata();

  return {
    medications,
    loading,
    isOffline,
    lastSync: metadata.lastMedicationsSync,
    hasMore,
    loadMore,
    loadingMore,
  };
}
