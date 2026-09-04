import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

type SyncStatus = 'synced' | 'syncing' | 'pending';

interface Props {
  status: SyncStatus;
  pendingCount?: number;
}

export default function SyncStatusBadge({ status, pendingCount = 0 }: Props) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status === 'syncing') {
      const anim = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      anim.start();
      return () => anim.stop();
    } else {
      rotation.setValue(0);
    }
  }, [status, rotation]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const colors = {
    synced: '#10B981',
    syncing: '#8B5CF6',
    pending: '#F59E0B',
  };

  return (
    <View style={[styles.badge, { backgroundColor: colors[status] + '20' }]}>
      {status === 'syncing' ? (
        <Animated.Text style={[styles.icon, { transform: [{ rotate: spin }] }]}>
          ↻
        </Animated.Text>
      ) : status === 'synced' ? (
        <Text style={[styles.icon, { color: colors.synced }]}>✓</Text>
      ) : (
        <Text style={[styles.countText, { color: colors.pending }]}>{pendingCount}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  countText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
});
