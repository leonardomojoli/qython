// frontend/src/components/consultation/ConsultationTimer.js
import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faPause, faPlay } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import styles from './ConsultationTimer.module.css';

/**
 * ConsultationTimer - Displays elapsed time with pause/resume controls
 * Shows color indicators: normal (green), warning (yellow at 20min), danger (red at 40min)
 */
function ConsultationTimer({
    formattedTime,
    isRunning,
    isPaused,
    statusColor,
    onPause,
    onResume,
    minimized = true
}) {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(!minimized);

    const handleToggle = () => {
        setIsExpanded(!isExpanded);
    };

    const handlePauseResume = (e) => {
        e.stopPropagation();
        if (isPaused) {
            onResume();
        } else {
            onPause();
        }
    };

    if (!isRunning && !isPaused) {
        return null; // Don't show if timer hasn't started
    }

    return (
        <div
            className={`${styles.timerContainer} ${styles[statusColor]} ${isPaused ? styles.paused : ''}`}
            onClick={handleToggle}
            title={t('consultationDuration')}
        >
            <FontAwesomeIcon icon={faClock} className={styles.clockIcon} />

            {isExpanded && (
                <>
                    <span className={styles.time}>{formattedTime}</span>
                    <button
                        className={styles.pauseButton}
                        onClick={handlePauseResume}
                        title={isPaused ? t('resumeTimer') : t('pauseTimer')}
                    >
                        <FontAwesomeIcon icon={isPaused ? faPlay : faPause} />
                    </button>
                </>
            )}

            {isPaused && (
                <span className={styles.pausedIndicator}>{t('paused')}</span>
            )}
        </div>
    );
}

export default ConsultationTimer;
