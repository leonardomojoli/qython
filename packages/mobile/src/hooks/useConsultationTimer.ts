import { useState, useEffect, useRef, useCallback } from 'react';

interface UseConsultationTimerOptions {
  autoStart?: boolean;
  inactivityTimeout?: number; // ms, default 5 * 60 * 1000
}

interface UseConsultationTimerReturn {
  seconds: number;
  formattedTime: string; // HH:MM:SS
  isRunning: boolean;
  isPaused: boolean;
  statusColor: 'green' | 'yellow' | 'red';
  durationMinutes: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  trackActivity: () => void; // call on user touch/input to reset inactivity
}

const DEFAULT_INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

function padZero(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${padZero(hours)}:${padZero(minutes)}:${padZero(secs)}`;
}

function getStatusColor(totalSeconds: number): 'green' | 'yellow' | 'red' {
  if (totalSeconds >= 2400) return 'red';
  if (totalSeconds >= 1200) return 'yellow';
  return 'green';
}

export function useConsultationTimer(
  options: UseConsultationTimerOptions = {},
): UseConsultationTimerReturn {
  const { autoStart = false, inactivityTimeout = DEFAULT_INACTIVITY_TIMEOUT } = options;

  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [isPaused, setIsPaused] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const clearTickInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current !== null) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const startInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      setIsRunning(false);
      setIsPaused(true);
      clearTickInterval();
    }, inactivityTimeout);
  }, [inactivityTimeout, clearInactivityTimer, clearTickInterval]);

  const startTicking = useCallback(() => {
    clearTickInterval();
    intervalRef.current = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
  }, [clearTickInterval]);

  const start = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
    lastActivityRef.current = Date.now();
    startTicking();
    startInactivityTimer();
  }, [startTicking, startInactivityTimer]);

  const pause = useCallback(() => {
    setIsRunning(false);
    setIsPaused(true);
    clearTickInterval();
    clearInactivityTimer();
  }, [clearTickInterval, clearInactivityTimer]);

  const resume = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
    lastActivityRef.current = Date.now();
    startTicking();
    startInactivityTimer();
  }, [startTicking, startInactivityTimer]);

  const reset = useCallback(() => {
    setSeconds(0);
    setIsRunning(false);
    setIsPaused(false);
    clearTickInterval();
    clearInactivityTimer();
  }, [clearTickInterval, clearInactivityTimer]);

  const trackActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (isRunning) {
      startInactivityTimer();
    }
  }, [isRunning, startInactivityTimer]);

  // Auto-start on mount if requested
  useEffect(() => {
    if (autoStart) {
      startTicking();
      startInactivityTimer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTickInterval();
      clearInactivityTimer();
    };
  }, [clearTickInterval, clearInactivityTimer]);

  return {
    seconds,
    formattedTime: formatTime(seconds),
    isRunning,
    isPaused,
    statusColor: getStatusColor(seconds),
    durationMinutes: Math.ceil(seconds / 60),
    start,
    pause,
    resume,
    reset,
    trackActivity,
  };
}
