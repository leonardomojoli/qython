import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing } from '../../theme/spacing';
import { getPrescriptions } from '../../services/pharmacy';
import type { Prescription } from '../../types/pharmacy';
import PrescriptionCard from '../../components/pharmacy/PrescriptionCard';
import EmptyState from '../../components/pharmacy/EmptyState';

export default function MyPrescriptionsTab() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrescriptions = useCallback(async () => {
    try {
      const data = await getPrescriptions();
      setPrescriptions(data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrescriptions();
  }, [fetchPrescriptions]);

  const renderItem = useCallback(
    ({ item }: { item: Prescription }) => <PrescriptionCard prescription={item} />,
    [],
  );

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={prescriptions}
      renderItem={renderItem}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={[
        styles.list,
        prescriptions.length === 0 && styles.emptyList,
      ]}
      ListEmptyComponent={
        <EmptyState
          icon="📋"
          message={t('noPrescriptionsYet') + '\n' + t('createInAmbulatory')}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  emptyList: {
    flex: 1,
  },
});
