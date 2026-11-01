// frontend/src/components/shared/QythonTour.js
// Custom tour component - 100% controlled, supports multiple independent tours

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './QythonTour.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faChevronRight, faChevronLeft } from '@fortawesome/free-solid-svg-icons';

/**
 * QythonTour - Reusable guided tour component
 * 
 * @param {string} tourId - Unique identifier for this tour (used in localStorage)
 * @param {string} route - Route path where this tour should activate
 * @param {Array} steps - Array of step configurations
 * @param {Function} onStepChange - Optional callback when step changes (for tab navigation etc)
 * @param {Array} skipScrollSteps - Array of step IDs that should not trigger scroll
 */
const QythonTour = ({
    tourId,
    route,
    steps,
    onStepChange,
    skipScrollSteps = []
}) => {
    const { t } = useTranslation();
    const location = useLocation();
    const [isActive, setIsActive] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState(null);
    const popoverRef = useRef(null);
    const maskIdRef = useRef(`spotlight-mask-${tourId}`);

    // Check if tour should run
    useEffect(() => {
        const storageKey = `qython_tour_${tourId}_completed`;
        const hasSeenTour = localStorage.getItem(storageKey);

        if (location.pathname === route && !hasSeenTour) {
            const timer = setTimeout(() => {
                setIsActive(true);
                setCurrentStep(0);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [location.pathname, tourId, route]);

    // Handle step changes (for tab navigation etc)
    useEffect(() => {
        if (!isActive || !steps[currentStep]) return;

        const step = steps[currentStep];

        // Call optional callback for custom navigation logic
        if (onStepChange) {
            onStepChange(step, currentStep);
        }

        // Give DOM time to update after potential navigation
        const timer = setTimeout(() => {
            updateTargetPosition();
        }, 100);

        return () => clearTimeout(timer);
    }, [currentStep, isActive, onStepChange, steps]);

    // Update target element position
    const updateTargetPosition = useCallback(() => {
        if (!steps[currentStep]) return;

        const step = steps[currentStep];
        if (!step.target) {
            setTargetRect(null);
            return;
        }

        const element = document.querySelector(step.target);
        if (element) {
            // Skip scroll for specified steps
            const shouldSkipScroll = skipScrollSteps.includes(step.id);
            if (!shouldSkipScroll) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }

            // Wait for potential scroll to complete before getting position
            setTimeout(() => {
                const rect = element.getBoundingClientRect();
                setTargetRect({
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height
                });
            }, shouldSkipScroll ? 50 : 300);
        } else {
            setTargetRect(null);
        }
    }, [currentStep, steps, skipScrollSteps]);

    useEffect(() => {
        if (isActive) {
            updateTargetPosition();
            window.addEventListener('resize', updateTargetPosition);
            window.addEventListener('scroll', updateTargetPosition);
            return () => {
                window.removeEventListener('resize', updateTargetPosition);
                window.removeEventListener('scroll', updateTargetPosition);
            };
        }
    }, [isActive, currentStep, updateTargetPosition]);

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            handleClose();
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    const handleClose = () => {
        setIsActive(false);
        const storageKey = `qython_tour_${tourId}_completed`;
        localStorage.setItem(storageKey, 'true');
    };

    const getPopoverStyle = () => {
        const step = steps[currentStep];
        if (!step) return {};

        if (step.position === 'center' || !targetRect) {
            return {
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)'
            };
        }

        const padding = 16;
        const popoverWidth = 340;

        let style = {
            position: 'fixed',
            width: `${popoverWidth}px`
        };

        // Calculate horizontal position (centered on target)
        let left = targetRect.left + (targetRect.width / 2) - (popoverWidth / 2);

        // Keep within viewport
        if (left < padding) left = padding;
        if (left + popoverWidth > window.innerWidth - padding) {
            left = window.innerWidth - popoverWidth - padding;
        }
        style.left = `${left}px`;

        // Vertical position based on step.position
        if (step.position === 'bottom') {
            style.top = `${targetRect.top + targetRect.height + 16}px`;
        } else if (step.position === 'top') {
            style.bottom = `${window.innerHeight - targetRect.top + 16}px`;
        }

        return style;
    };

    if (!isActive || !steps[currentStep]) return null;

    const step = steps[currentStep];

    return createPortal(
        <div className={styles.tourOverlay}>
            {/* Dark overlay with spotlight cutout */}
            {targetRect && (
                <svg className={styles.spotlightSvg} width="100%" height="100%">
                    <defs>
                        <mask id={maskIdRef.current}>
                            <rect width="100%" height="100%" fill="white" />
                            <rect
                                x={targetRect.left - 8}
                                y={targetRect.top - 8}
                                width={targetRect.width + 16}
                                height={targetRect.height + 16}
                                rx="8"
                                fill="black"
                            />
                        </mask>
                    </defs>
                    <rect
                        width="100%"
                        height="100%"
                        fill="rgba(0, 0, 0, 0.75)"
                        mask={`url(#${maskIdRef.current})`}
                    />
                </svg>
            )}

            {/* Full overlay for centered modals */}
            {!targetRect && <div className={styles.fullOverlay} />}

            {/* Spotlight border glow */}
            {targetRect && (
                <div
                    className={styles.spotlightBorder}
                    style={{
                        top: targetRect.top - 8,
                        left: targetRect.left - 8,
                        width: targetRect.width + 16,
                        height: targetRect.height + 16
                    }}
                />
            )}

            {/* Popover */}
            <div
                ref={popoverRef}
                className={styles.popover}
                style={getPopoverStyle()}
            >
                {/* Close button */}
                <button className={styles.closeBtn} onClick={handleClose}>
                    <FontAwesomeIcon icon={faXmark} />
                </button>

                {/* Content */}
                <div className={styles.popoverContent}>
                    <h3 className={styles.title}>{t(step.titleKey)}</h3>
                    <p className={styles.description}>{t(step.descKey)}</p>
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <span className={styles.progress}>
                        {currentStep + 1} {t('tourOf')} {steps.length}
                    </span>
                    <div className={styles.buttons}>
                        {currentStep > 0 && (
                            <button className={styles.prevBtn} onClick={handlePrev}>
                                <FontAwesomeIcon icon={faChevronLeft} /> {t('tourPrev')}
                            </button>
                        )}
                        <button className={styles.nextBtn} onClick={handleNext}>
                            {currentStep === steps.length - 1 ? t('tourFinish') : (
                                <>{t('tourNext')} <FontAwesomeIcon icon={faChevronRight} /></>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default QythonTour;

// Export function to reset a specific tour or all tours
export const resetQythonTour = (tourId = null) => {
    if (tourId) {
        localStorage.removeItem(`qython_tour_${tourId}_completed`);
    } else {
        // Reset all tours
        const tourIds = ['consultation', 'copilot', 'academic', 'profile'];
        tourIds.forEach(id => localStorage.removeItem(`qython_tour_${id}_completed`));
    }
};
