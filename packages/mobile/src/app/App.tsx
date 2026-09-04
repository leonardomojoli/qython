import React, { useState, useEffect, useRef } from 'react';
import { AppState, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { NetworkProvider, useNetwork } from '../contexts/NetworkContext';
import { UserProvider } from '../contexts/UserContext';
import { configureGoogleSignIn } from '../services/firebase';
import { requestPermission, registerToken, setupListeners } from '../services/notifications';
import { NotificationProvider } from '../contexts/NotificationContext';
import { syncAll, syncAllIfStale } from '../services/syncService';
import { processQueue } from '../services/offlineQueue';
import Navigation from './Navigation';
import OfflineBanner from '../components/common/OfflineBanner';
import { isAuthenticated as checkAuth } from '../services/auth';

// Configure Google Sign-In once at startup
configureGoogleSignIn();

function AppContent() {
  const { mode, theme } = useTheme();
  const { isInternetReachable } = useNetwork();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const prevOnlineRef = useRef(isInternetReachable);

  useEffect(() => {
    checkAuth().then((result) => {
      setAuthenticated(result);
      setLoading(false);
    });
  }, []);

  // Setup push notifications after login
  useEffect(() => {
    if (authenticated) {
      (async () => {
        try {
          const granted = await requestPermission();
          if (granted) {
            await registerToken();
            setupListeners();
          }
        } catch {
          // Silent fail — push notifications are optional
        }
      })();
    }
  }, [authenticated]);

  // Sync offline data after authentication (non-blocking)
  useEffect(() => {
    if (authenticated) {
      syncAll().catch(() => {});
    }
  }, [authenticated]);

  // Sync when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && authenticated) {
        syncAllIfStale().catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [authenticated]);

  // Process offline queue when connectivity is restored
  useEffect(() => {
    if (isInternetReachable && !prevOnlineRef.current && authenticated) {
      processQueue().catch(() => {});
    }
    prevOnlineRef.current = isInternetReachable;
  }, [isInternetReachable, authenticated]);

  if (loading) {
    return null; // Splash screen would go here
  }

  const handleLoginSuccess = () => {
    setAuthenticated(true);
  };

  const handleLogout = () => {
    setAuthenticated(false);
  };

  return (
    <>
      <StatusBar
        barStyle={mode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      <NavigationContainer
        theme={{
          dark: mode === 'dark',
          colors: {
            primary: theme.primary,
            background: theme.background,
            card: theme.surface,
            text: theme.text,
            border: theme.surfaceBorder,
            notification: theme.primary,
          },
          fonts: {
            regular: { fontFamily: 'System', fontWeight: '400' },
            medium: { fontFamily: 'System', fontWeight: '500' },
            bold: { fontFamily: 'System', fontWeight: '700' },
            heavy: { fontFamily: 'System', fontWeight: '900' },
          },
        }}>
        {authenticated ? (
          <UserProvider>
            <NotificationProvider>
              <Navigation
                isAuthenticated={authenticated}
                onLoginSuccess={handleLoginSuccess}
                onLogout={handleLogout}
              />
            </NotificationProvider>
          </UserProvider>
        ) : (
          <Navigation
            isAuthenticated={authenticated}
            onLoginSuccess={handleLoginSuccess}
            onLogout={handleLogout}
          />
        )}
        <OfflineBanner />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider>
            <NetworkProvider>
              <AppContent />
            </NetworkProvider>
          </ThemeProvider>
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
