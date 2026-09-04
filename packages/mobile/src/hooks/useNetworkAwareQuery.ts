import { useState, useEffect, useCallback } from 'react';
import { useNetwork } from '../contexts/NetworkContext';
import { setObject, getObject } from '../services/storage';

interface UseNetworkAwareQueryOptions<T> {
  cacheKey: string;
  fetchFn: () => Promise<T>;
  enabled?: boolean;
}

interface UseNetworkAwareQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isFromCache: boolean;
  refetch: () => Promise<void>;
}

export function useNetworkAwareQuery<T>({
  cacheKey,
  fetchFn,
  enabled = true,
}: UseNetworkAwareQueryOptions<T>): UseNetworkAwareQueryResult<T> {
  const { isInternetReachable } = useNetwork();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  const fetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);

    if (isInternetReachable) {
      try {
        const result = await fetchFn();
        setData(result);
        setIsFromCache(false);
        setObject(cacheKey, result);
      } catch (err: any) {
        // API failed, try cache
        const cached = getObject<T>(cacheKey);
        if (cached) {
          setData(cached);
          setIsFromCache(true);
        } else {
          setError(err.message || 'Request failed');
        }
      }
    } else {
      // Offline, use cache
      const cached = getObject<T>(cacheKey);
      if (cached) {
        setData(cached);
        setIsFromCache(true);
      } else {
        setError('offline_no_cache');
      }
    }

    setLoading(false);
  }, [enabled, isInternetReachable, fetchFn, cacheKey]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, isFromCache, refetch: fetch };
}
