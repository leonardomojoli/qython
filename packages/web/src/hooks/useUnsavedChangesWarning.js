// frontend/src/hooks/useUnsavedChangesWarning.js
import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Hook to warn users when they try to navigate away with unsaved changes.
 * Works with BrowserRouter (doesn't require data router).
 *
 * @param {boolean} hasUnsavedChanges - Whether there are unsaved changes
 * @param {string} message - The warning message to display
 * @param {boolean} skipBeforeUnload - If true, skip the browser's beforeunload warning (useful when autosave is enabled)
 */
export function useUnsavedChangesWarning(hasUnsavedChanges, message = 'Você tem alterações não salvas. Deseja sair sem salvar?', skipBeforeUnload = false) {
  const location = useLocation();
  const navigate = useNavigate();
  const [blockerState, setBlockerState] = useState({ state: 'unblocked' });
  const pendingNavigationRef = useRef(null);
  const isBlockingRef = useRef(false);

  // Handle browser/tab close
  // Note: When autosave is enabled (skipBeforeUnload=true), we don't show the browser warning
  // because the content will be automatically restored from localStorage
  useEffect(() => {
    if (skipBeforeUnload) return;

    const handleBeforeUnload = (event) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = message;
        return message;
      }
    };

    if (hasUnsavedChanges) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges, message, skipBeforeUnload]);

  // Intercept link clicks to show warning
  useEffect(() => {
    if (!hasUnsavedChanges) {
      isBlockingRef.current = false;
      return;
    }

    isBlockingRef.current = true;

    const handleClick = (event) => {
      // Only handle left clicks
      if (event.button !== 0) return;

      // Find if click was on a link or inside a link
      let target = event.target;
      while (target && target.tagName !== 'A') {
        target = target.parentElement;
      }

      if (!target || !target.href) return;

      // Check if it's an internal link
      const url = new URL(target.href, window.location.origin);
      if (url.origin !== window.location.origin) return;

      // Check if it's navigating to a different path
      if (url.pathname === location.pathname) return;

      // Prevent default navigation and show blocker
      event.preventDefault();
      event.stopPropagation();

      pendingNavigationRef.current = url.pathname;
      setBlockerState({ state: 'blocked' });
    };

    // Use capture phase to intercept before React Router handles it
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [hasUnsavedChanges, location.pathname]);

  // Proceed with navigation
  const proceed = useCallback(() => {
    const pendingPath = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    isBlockingRef.current = false;
    setBlockerState({ state: 'unblocked' });

    if (pendingPath) {
      // Small delay to ensure state is updated
      setTimeout(() => {
        navigate(pendingPath);
      }, 0);
    }
  }, [navigate]);

  // Reset/cancel navigation
  const reset = useCallback(() => {
    pendingNavigationRef.current = null;
    setBlockerState({ state: 'unblocked' });
  }, []);

  return {
    state: blockerState.state,
    proceed,
    reset,
  };
}

export default useUnsavedChangesWarning;
