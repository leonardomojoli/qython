import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useNotifications } from '../../contexts/NotificationContext';
import api from '../../services/api';

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  is_read: boolean;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  material_ready: '🎵',
  material_failed: '⚠️',
  dracma_expiring: '💰',
  kyc_verified: '✅',
  kyc_rejected: '❌',
  waitlist_activated: '🎉',
  arena_season_started: '🏟️',
  arena_season_ended: '🏁',
  system_announcement: '📢',
};

const TYPE_COLORS: Record<string, string> = {
  material_ready: '#10B981',
  material_failed: '#EF4444',
  dracma_expiring: '#F59E0B',
  kyc_verified: '#10B981',
  kyc_rejected: '#EF4444',
  arena_season_started: '#8B5CF6',
  system_announcement: '#3B82F6',
};

function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Agora';
  if (diffMin < 60) return `${diffMin}min`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
}

export default function NotificationCenterScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { refreshUnreadCount } = useNotifications();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications?limit=50');
      setNotifications(res.data.notifications);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/mark-read', { notification_ids: null });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      refreshUnreadCount();
    } catch {
      // Silent fail
    }
  };

  const handlePress = async (notification: Notification) => {
    if (!notification.is_read) {
      try {
        await api.post('/notifications/mark-read', { notification_ids: [notification.id] });
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
        );
        refreshUnreadCount();
      } catch {
        // Silent fail
      }
    }
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const color = TYPE_COLORS[item.type] || '#8B5CF6';
    return (
      <TouchableOpacity
        style={[
          styles.item,
          { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
          !item.is_read && { borderLeftColor: color, borderLeftWidth: 3 },
        ]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <Text style={styles.icon}>{TYPE_ICONS[item.type] || '🔔'}</Text>
        <View style={styles.itemContent}>
          <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.itemBody, { color: theme.textMuted }]} numberOfLines={2}>
            {item.body}
          </Text>
        </View>
        <Text style={[styles.itemTime, { color: theme.textMuted }]}>{timeAgo(item.created_at)}</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {notifications.some((n) => !n.is_read) && (
        <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllRead}>
          <Text style={[styles.markAllText, { color: theme.primary }]}>
            {t('notificationsMarkAllRead', 'Marcar todas como lidas')}
          </Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {t('notificationsEmpty', 'Nenhuma notificação')}
            </Text>
          </View>
        }
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : undefined}
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
  emptyContainer: {
    flex: 1,
  },
  emptyText: {
    fontSize: 15,
  },
  markAllBtn: {
    padding: 12,
    alignItems: 'center',
  },
  markAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  icon: {
    fontSize: 22,
    marginTop: 2,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemBody: {
    fontSize: 13,
  },
  itemTime: {
    fontSize: 11,
    marginTop: 2,
  },
});
