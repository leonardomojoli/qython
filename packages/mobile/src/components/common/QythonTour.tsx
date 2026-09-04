import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  LayoutRectangle,
  findNodeHandle,
  UIManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface TourStep {
  id: string;
  titleKey: string;
  titleDefault: string;
  descKey: string;
  descDefault: string;
  /** Ref of the target component to highlight. If null, shows centered modal. */
  targetRef?: React.RefObject<any>;
  position?: 'top' | 'bottom' | 'center';
  /** Optional callback when entering this step (e.g. switch tabs) */
  onEnter?: () => void;
}

interface Props {
  tourId: string;
  steps: TourStep[];
  /** If true, tour starts automatically on mount (if not completed) */
  autoStart?: boolean;
  /** External control: set to true to start */
  visible?: boolean;
  onComplete?: () => void;
  onDismiss?: () => void;
}

export default function QythonTour({
  tourId,
  steps,
  autoStart = true,
  visible: externalVisible,
  onComplete,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<LayoutRectangle | null>(null);
  const storageKey = `qython_tour_${tourId}_completed`;

  useEffect(() => {
    if (externalVisible !== undefined) {
      setActive(externalVisible);
      if (externalVisible) setCurrentStep(0);
      return;
    }
    if (!autoStart) return;
    (async () => {
      const completed = await AsyncStorage.getItem(storageKey);
      if (!completed) {
        setActive(true);
        setCurrentStep(0);
      }
    })();
  }, [autoStart, externalVisible, storageKey]);

  const measureTarget = useCallback(() => {
    const step = steps[currentStep];
    if (!step?.targetRef?.current) {
      setTargetRect(null);
      return;
    }
    const handle = findNodeHandle(step.targetRef.current);
    if (handle) {
      UIManager.measure(handle, (_x, _y, width, height, pageX, pageY) => {
        if (width > 0 && height > 0) {
          setTargetRect({ x: pageX, y: pageY, width, height });
        } else {
          setTargetRect(null);
        }
      });
    } else {
      setTargetRect(null);
    }
  }, [currentStep, steps]);

  useEffect(() => {
    if (!active) return;
    const step = steps[currentStep];
    step?.onEnter?.();
    // Delay measurement to allow layout
    const timer = setTimeout(measureTarget, 300);
    return () => clearTimeout(timer);
  }, [active, currentStep, steps, measureTarget]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleFinish = async () => {
    setActive(false);
    await AsyncStorage.setItem(storageKey, 'true');
    onComplete?.();
  };

  const handleDismiss = async () => {
    setActive(false);
    await AsyncStorage.setItem(storageKey, 'true');
    onDismiss?.();
  };

  if (!active || steps.length === 0) return null;

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;
  const isCentered = !targetRect;

  // Tooltip position
  const tooltipPosition = step.position || (targetRect && targetRect.y > SCREEN_HEIGHT / 2 ? 'top' : 'bottom');

  const tooltipStyle: any = { maxWidth: SCREEN_WIDTH - spacing.xl * 2 };
  if (isCentered) {
    tooltipStyle.alignSelf = 'center';
    tooltipStyle.marginTop = SCREEN_HEIGHT * 0.3;
  } else if (tooltipPosition === 'top') {
    tooltipStyle.position = 'absolute';
    tooltipStyle.bottom = SCREEN_HEIGHT - (targetRect?.y || 0) + spacing.md;
    tooltipStyle.left = spacing.lg;
    tooltipStyle.right = spacing.lg;
  } else {
    tooltipStyle.position = 'absolute';
    tooltipStyle.top = (targetRect?.y || 0) + (targetRect?.height || 0) + spacing.md;
    tooltipStyle.left = spacing.lg;
    tooltipStyle.right = spacing.lg;
  }

  return (
    <Modal visible={active} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        {/* Spotlight highlight area */}
        {targetRect && (
          <View
            style={[
              styles.spotlight,
              {
                top: targetRect.y - 4,
                left: targetRect.x - 4,
                width: targetRect.width + 8,
                height: targetRect.height + 8,
                borderColor: theme.primary,
              },
            ]}
          />
        )}

        {/* Tooltip */}
        <View style={[styles.tooltip, tooltipStyle, { backgroundColor: theme.surface }]}>
          {/* Progress */}
          <Text style={[styles.progress, { color: theme.textMuted }]}>
            {currentStep + 1} {t('tourOf', 'de')} {steps.length}
          </Text>

          <Text style={[styles.tooltipTitle, { color: theme.text }]}>
            {t(step.titleKey, step.titleDefault)}
          </Text>
          <Text style={[styles.tooltipDesc, { color: theme.textSecondary }]}>
            {t(step.descKey, step.descDefault)}
          </Text>

          {/* Navigation */}
          <View style={styles.navRow}>
            <TouchableOpacity onPress={handleDismiss} activeOpacity={0.7}>
              <Text style={[styles.skipText, { color: theme.textMuted }]}>
                {t('tourSkip', 'Pular')}
              </Text>
            </TouchableOpacity>
            <View style={styles.navButtons}>
              {!isFirst && (
                <TouchableOpacity
                  style={[styles.navBtn, { borderColor: theme.surfaceBorder }]}
                  onPress={handlePrev}
                  activeOpacity={0.7}>
                  <Text style={[styles.navBtnText, { color: theme.text }]}>
                    {t('tourPrev', 'Anterior')}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.navBtn, styles.navBtnPrimary, { backgroundColor: theme.primary }]}
                onPress={handleNext}
                activeOpacity={0.7}>
                <Text style={[styles.navBtnText, { color: '#fff' }]}>
                  {isLast ? t('tourFinish', 'Concluir') : t('tourNext', 'Proximo')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Reset a specific tour so it shows again */
export async function resetQythonTour(tourId: string): Promise<void> {
  await AsyncStorage.removeItem(`qython_tour_${tourId}_completed`);
}

/** Check if a tour has been completed */
export async function isTourCompleted(tourId: string): Promise<boolean> {
  const val = await AsyncStorage.getItem(`qython_tour_${tourId}_completed`);
  return val === 'true';
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  spotlight: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  tooltip: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  progress: {
    ...typography.caption,
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.xs,
  },
  tooltipTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  tooltipDesc: {
    ...typography.body,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipText: {
    ...typography.bodySmall,
  },
  navButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  navBtn: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  navBtnPrimary: {
    borderWidth: 0,
  },
  navBtnText: {
    ...typography.buttonSmall,
  },
});
