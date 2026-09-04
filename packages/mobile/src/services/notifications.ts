import { Platform, PermissionsAndroid } from 'react-native';
import api from './api';

let messagingModule: any = null;

let _foregroundHandler: ((title: string, body: string, data?: Record<string, string>) => void) | null = null;

export function setForegroundHandler(handler: (title: string, body: string, data?: Record<string, string>) => void) {
  _foregroundHandler = handler;
}

async function getMessaging() {
  if (!messagingModule) {
    try {
      const firebase = require('@react-native-firebase/messaging');
      messagingModule = firebase.default;
    } catch {
      console.warn('[Notifications] @react-native-firebase/messaging not available');
      return null;
    }
  }
  return messagingModule;
}

export async function requestPermission(): Promise<boolean> {
  try {
    // Android 13+ requires POST_NOTIFICATIONS permission
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        return false;
      }
    }

    const messaging = await getMessaging();
    if (!messaging) {
      return false;
    }

    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === 1 || // AUTHORIZED
      authStatus === 2;   // PROVISIONAL
    return enabled;
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

    const token = await messaging().getToken();
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

    // Foreground messages
    messaging().onMessage(async (remoteMessage: any) => {
      const title = remoteMessage.notification?.title || '';
      const body = remoteMessage.notification?.body || '';
      const data = remoteMessage.data;
      if (_foregroundHandler) {
        _foregroundHandler(title, body, data);
      }
    });

    // Notification opened from background state
    messaging().onNotificationOpenedApp((remoteMessage: any) => {
      const route = remoteMessage.data?.route;
      if (route) {
        console.log('[Notifications] Opened from background, route:', route);
      }
    });

    // Background/quit message handler
    messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
      console.log('[Notifications] Background message:', remoteMessage.notification?.title);
    });

    // Token refresh listener
    messaging().onTokenRefresh(async (newToken: string) => {
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
    const remoteMessage = await messaging().getInitialNotification();
    if (remoteMessage?.data?.route) {
      return { route: remoteMessage.data.route };
    }
  } catch {
    // Silent fail
  }
  return null;
}
