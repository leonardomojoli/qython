import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useUser } from '../../contexts/UserContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNotification } from '../../contexts/NotificationContext';
import { useTranslation } from 'react-i18next';
import { api, SESSION_EXPIRED_EVENT, checkTokenValidity } from '../../api';

// Interval for periodic token validation (5 minutes)
const TOKEN_CHECK_INTERVAL = 5 * 60 * 1000;

function SessionManager({ setIsLoggedIn, onInitialCheckComplete }) {
  const { setUser } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const { addNotification } = useNotification();
  const { t } = useTranslation();
  const workspaceRoutes = ['/consultation-manager', '/chat', '/material-producer', '/profile', '/copilot', '/academic'];
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const logoutInProgressRef = useRef(false);

  // Centralized logout handler
  const handleSessionExpired = useCallback(() => {
    // Prevent multiple simultaneous logout attempts
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;

    import.meta.env.DEV && console.log('[SessionManager] Handling session expiration...');

    // Clear auth data
    localStorage.removeItem('authToken');
    setIsLoggedIn(false);
    setUser(null);

    // Show friendly notification
    addNotification(t('sessionExpiredMessage'), 'info');

    // Redirect to login if on protected route
    const currentPath = window.location.pathname;
    const isProtectedRoute = workspaceRoutes.some(route => currentPath.startsWith(route));
    if (isProtectedRoute) {
      navigate('/login', { replace: true });
    }

    // Reset the flag after a delay
    setTimeout(() => {
      logoutInProgressRef.current = false;
    }, 3000);
  }, [setIsLoggedIn, setUser, addNotification, navigate, t, workspaceRoutes]);

  // Listen for global session expired events (from API interceptor)
  useEffect(() => {
    const handleGlobalSessionExpired = () => {
      import.meta.env.DEV && console.log('[SessionManager] Received session expired event');
      handleSessionExpired();
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleGlobalSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleGlobalSessionExpired);
    };
  }, [handleSessionExpired]);

  // Periodic token validation (every 5 minutes when tab is active)
  useEffect(() => {
    if (!initialCheckDone) return;

    const token = localStorage.getItem('authToken');
    if (!token) return;

    let intervalId;

    const validateToken = async () => {
      // Only check if document is visible (tab is active)
      if (document.hidden) return;

      const isValid = await checkTokenValidity();
      if (!isValid) {
        import.meta.env.DEV && console.log('[SessionManager] Periodic check: token invalid');
        handleSessionExpired();
      }
    };

    // Start periodic checks
    intervalId = setInterval(validateToken, TOKEN_CHECK_INTERVAL);

    // Also check when tab becomes visible again
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        validateToken();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [initialCheckDone, handleSessionExpired]);

  // Initial login status check
  useEffect(() => {
    if (initialCheckDone) {
      return;
    }

    const checkLoginStatus = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        setIsLoggedIn(false);
        setUser(null);
        if (workspaceRoutes.includes(location.pathname)) {
          navigate('/login', { replace: true });
        }
        setInitialCheckDone(true);
        if (onInitialCheckComplete) onInitialCheckComplete();
        return;
      }

      try {
        const userData = await api.get('/user/info');
        setUser(userData.data);
        setIsLoggedIn(true);
      } catch (error) {
        import.meta.env.DEV && console.error('Falha na verificação da sessão com token:', error.message);
        // Use the centralized handler
        handleSessionExpired();
      } finally {
        setInitialCheckDone(true);
        if (onInitialCheckComplete) onInitialCheckComplete();
      }
    };

    checkLoginStatus();

  }, [initialCheckDone, setUser, setIsLoggedIn, navigate, onInitialCheckComplete, location.pathname, handleSessionExpired, workspaceRoutes]);

  return null;
}

export default SessionManager;
