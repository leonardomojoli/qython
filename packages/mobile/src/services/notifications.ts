import { Platform, PermissionsAndroid } from 'react-native';
import api from './api';
import { isFirebaseConfigured } from './firebase';

// Modular API of @react-native-firebase/messaging (v22+): the module exports
// functions that take the Messaging instance; there is no default export.
type MessagingApi = { api: any; instance: any };
let messagingModule: MessagingApi | null = null;

let _foregroundHandler: ((title: string, body: string, data?: Record<string, string>) => void) | null = null;

export function setForegroundHandler(handler: (title: string, body: string, data?: Record<string, string>) => void) {
  _foregroundHandler = handler;
}

async function getMessaging(): Promise<MessagingApi | null> {
  // Without google-services.json there is no Firebase app and every
  // messaging() call throws; push is just unavailable in that build.
  if (!isFirebaseConfigured()) {
    return null;
  }
  if (!messagingModule) {
    try {
      const api = require('@react-native-firebase/messaging');
      messagingModule = { api, instance: api.getMessaging() };
    } catch {
      console.warn('[Notifications] @react-native-firebase/messaging not available');
      return null;
    }
  }
  return messagingModule;
}

export async function requestPermission(): Promise<boolean> {
  try {
    // Checked first so a build without push doesn't ask for the permission.
    const messaging = await getMessaging();
    if (!messaging) {
      return false;
    }

    // Android 13+ requires POST_NOTIFICATIONS permission
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        return false;
      }
    }

    const { api, instance } = messaging;
    const authStatus = await api.requestPermission(instance);
    return (
      authStatus === api.AuthorizationStatus.AUTHORIZED ||
      authStatus === api.AuthorizationStatus.PROVISIONAL
    );
  } catch (error) {
    console.warn('[Notifications] Permission request failed:', error);
    return false;
  }
}

export async function registerToken(): Promise<void> {
  try {
    const messaging = await getMessaging();
    if (!messaging) {
      return;
    }

    const token = await messaging.api.getToken(messaging.instance);
    if (token) {
      await api.post('/user/push-token', `token=${encodeURIComponent(token)}&platform=${Platform.OS}`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    }
  } catch (error) {
    console.warn('[Notifications] Token registration failed:', error);
  }
}

export function setupListeners() {
  getMessaging().then((messaging) => {
    if (!messaging) {
      return;
    }

    const { api, instance } = messaging;

    // Foreground messages
    api.onMessage(instance, async (remoteMessage: any) => {
      const title = remoteMessage.notification?.title || '';
      const body = remoteMessage.notification?.body || '';
      const data = remoteMessage.data;
      if (_foregroundHandler) {
        _foregroundHandler(title, body, data);
      }
    });

    // Notification opened from background state
    api.onNotificationOpenedApp(instance, (remoteMessage: any) => {
      const route = remoteMessage.data?.route;
      if (route) {
        console.log('[Notifications] Opened from background, route:', route);
      }
    });

    // Background/quit message handler
    api.setBackgroundMessageHandler(instance, async (remoteMessage: any) => {
      console.log('[Notifications] Background message:', remoteMessage.notification?.title);
    });

    // Token refresh listener
    api.onTokenRefresh(instance, async (newToken: string) => {
      try {
        await api.post('/user/push-token', `token=${encodeURIComponent(newToken)}&platform=${Platform.OS}`, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } catch (error) {
        console.warn('[Notifications] Token refresh registration failed:', error);
      }
    });
  });
}

export async function getInitialNotification(): Promise<{ route?: string } | null> {
  const messaging = await getMessaging();
  if (!messaging) return null;

  try {
    const remoteMessage = await messaging.api.getInitialNotification(messaging.instance);
    if (remoteMessage?.data?.route) {
      return { route: remoteMessage.data.route };
    }
  } catch {
    // Silent fail
  }
  return null;
}
