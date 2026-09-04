import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import { getAuthToken } from '../services/auth';
import { setForegroundHandler } from '../services/notifications';
import ToastOverlay from '../components/common/NotificationToast';
import { WS_BASE_URL } from '../config/env';

const WS_BACKOFF_DELAYS = [1000, 2000, 5000, 10000, 30000];
const WS_PING_INTERVAL = 30000;

interface Toast {
  id: number;
  title: string;
  body: string;
  type: 'success' | 'error' | 'warning' | 'info';
  data?: Record<string, string>;
}

interface NotificationContextValue {
  unreadCount: number;
  showToast: (title: string, body: string, type: Toast['type'], data?: Record<string, string>) => void;
  refreshUnreadCount: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  showToast: () => {},
  refreshUnreadCount: async () => {},
});

let toastId = 0;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = useCallback((title: string, body: string, type: Toast['type'], data?: Record<string, string>) => {
    const id = ++toastId;
    setToasts((prev) => {
      const updated = prev.length >= 2 ? prev.slice(1) : prev;
      return [...updated, { id, title, body, type, data }];
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data.unread_count);
    } catch {
      // Silent fail
    }
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectAttemptRef = useRef(0);
  const wsReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsPingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsConnectedRef = useRef(false);

  const cleanupWs = useCallback(() => {
    if (wsPingIntervalRef.current) clearInterval(wsPingIntervalRef.current);
    if (wsReconnectTimeoutRef.current) clearTimeout(wsReconnectTimeoutRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    wsConnectedRef.current = false;
  }, []);

  const connectWs = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;

    cleanupWs();

    const url = `${WS_BASE_URL}/api/notifications/ws?token=${token}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      wsConnectedRef.current = true;
      wsReconnectAttemptRef.current = 0;
      wsPingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, WS_PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      if (event.data === 'pong') return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_notification') {
          const n = data.notification;
          const toastType = n.type?.includes('failed') || n.type?.includes('rejected')
            ? 'error'
            : n.type?.includes('expiring')
              ? 'warning'
              : 'success';
          showToast(n.title, n.body, toastType as Toast['type'], n.data);
          setUnreadCount((prev) => prev + 1);
        } else if (data.type === 'unread_count') {
          setUnreadCount(data.unread_count);
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      wsConnectedRef.current = false;
      if (wsPingIntervalRef.current) clearInterval(wsPingIntervalRef.current);
      const delay = WS_BACKOFF_DELAYS[Math.min(wsReconnectAttemptRef.current, WS_BACKOFF_DELAYS.length - 1)];
      wsReconnectAttemptRef.current += 1;
      wsReconnectTimeoutRef.current = setTimeout(connectWs, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }, [cleanupWs, showToast]);

  useEffect(() => {
    connectWs();
    return cleanupWs;
  }, [connectWs, cleanupWs]);

  // Poll unread count every 60s as fallback
  useEffect(() => {
    refreshUnreadCount();
    intervalRef.current = setInterval(refreshUnreadCount, 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshUnreadCount]);

  // Register foreground notification handler
  useEffect(() => {
    setForegroundHandler((title: string, body: string, data?: Record<string, string>) => {
      // Map notification type to toast type
      const type = data?.type?.includes('failed') || data?.type?.includes('rejected')
        ? 'error'
        : data?.type?.includes('expiring')
          ? 'warning'
          : 'success';
      showToast(title, body, type, data);
      refreshUnreadCount();
    });
  }, [showToast, refreshUnreadCount]);

  return (
    <NotificationContext.Provider value={{ unreadCount, showToast, refreshUnreadCount }}>
      <ToastOverlay toasts={toasts} onDismiss={dismissToast} />
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
