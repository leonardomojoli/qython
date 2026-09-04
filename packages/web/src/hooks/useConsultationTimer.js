// frontend/src/hooks/useConsultationTimer.js
import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for tracking consultation duration
 * - Auto-starts when enabled
 * - Pauses after inactivity
 * - Provides formatted time display
 */
export function useConsultationTimer(options = {}) {
    const {
        autoStart = false,
        inactivityTimeout = 5 * 60 * 1000, // 5 minutes
        onDurationChange = null,
    } = options;

    const [isRunning, setIsRunning] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    const intervalRef = useRef(null);
    const lastActivityRef = useRef(Date.now());
    const inactivityCheckRef = useRef(null);
    // Refs for state values to avoid stale closures in interval callbacks
    const isPausedRef = useRef(isPaused);
    const isRunningRef = useRef(isRunning);

    // Format seconds to MM:SS or HH:MM:SS
    const formatTime = useCallback((totalSeconds) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, []);

    // Get duration in minutes for saving
    const getDurationMinutes = useCallback(() => {
        return Math.ceil(elapsedSeconds / 60);
    }, [elapsedSeconds]);

    // Get status color based on duration
    const getStatusColor = useCallback(() => {
        const minutes = elapsedSeconds / 60;
        if (minutes >= 40) return 'danger'; // Red
        if (minutes >= 20) return 'warning'; // Yellow
        return 'normal'; // Default
    }, [elapsedSeconds]);

    // Record user activity
    const recordActivity = useCallback(() => {
        lastActivityRef.current = Date.now();
        if (isPaused && isRunning) {
            setIsPaused(false);
        }
    }, [isPaused, isRunning]);

    // Start the timer
    const start = useCallback(() => {
        if (!isRunning) {
            setIsRunning(true);
            setIsPaused(false);
            lastActivityRef.current = Date.now();
        }
    }, [isRunning]);

    // Pause the timer
    const pause = useCallback(() => {
        setIsPaused(true);
    }, []);

    // Resume the timer
    const resume = useCallback(() => {
        setIsPaused(false);
        lastActivityRef.current = Date.now();
    }, []);

    // Stop and reset the timer
    const reset = useCallback(() => {
        setIsRunning(false);
        setIsPaused(false);
        setElapsedSeconds(0);
    }, []);

    // Stop timer without reset (for saving)
    const stop = useCallback(() => {
        setIsRunning(false);
        setIsPaused(false);
        return getDurationMinutes();
    }, [getDurationMinutes]);

    // Keep refs in sync with state to avoid stale closures
    useEffect(() => {
        isPausedRef.current = isPaused;
    }, [isPaused]);

    useEffect(() => {
        isRunningRef.current = isRunning;
    }, [isRunning]);

    // Timer interval effect
    useEffect(() => {
        if (isRunning && !isPaused) {
            intervalRef.current = setInterval(() => {
                // Double-check refs to ensure timer should still be counting
                // This prevents race conditions where state changed but interval hasn't been cleared yet
                if (!isRunningRef.current || isPausedRef.current) {
                    return;
                }
                setElapsedSeconds(prev => {
                    const newValue = prev + 1;
                    if (onDurationChange) {
                        onDurationChange(newValue);
                    }
                    return newValue;
                });
            }, 1000);
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isRunning, isPaused, onDurationChange]);

    // Inactivity detection effect
    useEffect(() => {
        if (isRunning && !isPaused && inactivityTimeout > 0) {
            inactivityCheckRef.current = setInterval(() => {
                const timeSinceActivity = Date.now() - lastActivityRef.current;
                if (timeSinceActivity >= inactivityTimeout) {
                    setIsPaused(true);
                }
            }, 10000); // Check every 10 seconds
        } else {
            if (inactivityCheckRef.current) {
                clearInterval(inactivityCheckRef.current);
                inactivityCheckRef.current = null;
            }
        }

        return () => {
            if (inactivityCheckRef.current) {
                clearInterval(inactivityCheckRef.current);
            }
        };
    }, [isRunning, isPaused, inactivityTimeout]);

    // Auto-start effect
    useEffect(() => {
        if (autoStart && !isRunning) {
            start();
        }
    }, [autoStart, isRunning, start]);

    // Track user activity on document
    useEffect(() => {
        if (isRunning) {
            const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
            events.forEach(event => {
                document.addEventListener(event, recordActivity, { passive: true });
            });

            return () => {
                events.forEach(event => {
                    document.removeEventListener(event, recordActivity);
                });
            };
        }
    }, [isRunning, recordActivity]);

    return {
        isRunning,
        isPaused,
        elapsedSeconds,
        formattedTime: formatTime(elapsedSeconds),
        durationMinutes: getDurationMinutes(),
        statusColor: getStatusColor(),
        start,
        pause,
        resume,
        reset,
        stop,
        recordActivity,
    };
}

export default useConsultationTimer;
