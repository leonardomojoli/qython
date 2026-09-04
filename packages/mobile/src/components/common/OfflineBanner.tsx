import React, { useEffect, useRef, useState } from 'react';
import { Animated, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNetwork } from '../../contexts/NetworkContext';
import { getObject, STORAGE_KEYS } from '../../services/storage';
import { SyncMetadata } from '../../types/offline';

export default function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetwork();
  const { t } = useTranslation();
  const slideAnim = useRef(new Animated.Value(-50)).current;
  const [expanded, setExpanded] = useState(false);
  const isOffline = !isConnected || !isInternetReachable;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOffline ? 0 : -50,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOffline, slideAnim]);

  if (!isOffline) return null;

  const metadata = getObject<SyncMetadata>(STORAGE_KEYS.SYNC_METADATA);
  const lastSync = metadata?.lastMedicationsSync || metadata?.lastUserDataSync;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity
        style={styles.banner}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <Text style={styles.text}>{t('offlineBanner')}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.details}>
          <Text style={styles.detailText}>
            {t('offlineLastSync')}: {lastSync ? new Date(lastSync).toLocaleString() : t('offlineNeverSynced')}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  banner: {
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  text: {
    color: '#000',
    fontSize: 13,
    fontWeight: '600',
  },
  details: {
    backgroundColor: '#D97706',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  detailText: {
    color: '#000',
    fontSize: 12,
  },
});
