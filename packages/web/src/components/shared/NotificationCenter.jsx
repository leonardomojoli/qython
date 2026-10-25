import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import useWebSocket from '../../hooks/useWebSocket';
import styles from './NotificationCenter.module.css';

// Icons per notification type
const TYPE_ICONS = {
  material_ready: '\uD83C\uDFB5',
  material_failed: '\u26A0\uFE0F',
  dracma_expiring: '\uD83D\uDCB0',
  kyc_verified: '\u2705',
  kyc_rejected: '\u274C',
  waitlist_activated: '\uD83C\uDF89',
  arena_season_started: '\uD83C\uDFDF\uFE0F',
  arena_season_ended: '\uD83C\uDFC1',
  system_announcement: '\uD83D\uDCE2',
};

function timeAgo(dateString, t) {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return t('timeAgoJustNow', 'Agora');
  if (diffMin < 60) return t('timeAgoMinutes', '{{count}}min', { count: diffMin });
  if (diffHours < 24) return t('timeAgoHours', '{{count}}h', { count: diffHours });
  return t('timeAgoDays', '{{count}}d', { count: diffDays });
}

export default function NotificationCenter() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  // Poll unread count every 5min (fallback; WS is primary)
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data.unread_count);
    } catch {
      // Silent fail
    }
  }, []);

  const token = localStorage.getItem('authToken');

  const handleWSMessage = useCallback((data) => {
    if (data.type === 'new_notification') {
      setNotifications((prev) => [data.notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    } else if (data.type === 'unread_count') {
      setUnreadCount(data.unread_count);
    }
  }, []);

  useWebSocket({ token, onMessage: handleWSMessage });

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 300000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch full list when panel opens
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications?limit=30');
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unread_count);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/mark-read', { notification_ids: null });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // Silent fail
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      try {
        await api.post('/notifications/mark-read', { notification_ids: [notification.id] });
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Silent fail
      }
    }
    // Navigate if route data exists
    if (notification.data?.route) {
      window.location.href = notification.data.route;
      setIsOpen(false);
    }
  };

  return (
    <div className={styles.container} ref={panelRef}>
      <button
        className={styles.bellButton}
        onClick={() => setIsOpen(!isOpen)}
        title={t('notifications', 'Notificações')}
      >
        <FontAwesomeIcon icon={faBell} className={styles.bellIcon} />
        {unreadCount > 0 && (
          <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3>{t('notifications', 'Notificações')}</h3>
            {unreadCount > 0 && (
              <button className={styles.markAllBtn} onClick={handleMarkAllRead}>
                {t('notificationsMarkAllRead', 'Marcar todas como lidas')}
              </button>
            )}
          </div>

          <div className={styles.panelBody}>
            {loading && <div className={styles.loading}>...</div>}
            {!loading && notifications.length === 0 && (
              <div className={styles.empty}>
                {t('notificationsEmpty', 'Nenhuma notificação')}
              </div>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                className={`${styles.item} ${!n.is_read ? styles.unread : ''}`}
                onClick={() => handleNotificationClick(n)}
              >
                <span className={styles.itemIcon}>{TYPE_ICONS[n.type] || '\uD83D\uDD14'}</span>
                <div className={styles.itemContent}>
                  <span className={styles.itemTitle}>{n.title}</span>
                  <span className={styles.itemBody}>{n.body}</span>
                </div>
                <span className={styles.itemTime}>{timeAgo(n.created_at, t)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
