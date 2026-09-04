import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useUser } from '../../contexts/UserContext';
import { checkWaitlist, joinWaitlist } from '../../services/billing';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ComingSoonModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { user } = useUser();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isAlreadyOnWaitlist, setIsAlreadyOnWaitlist] = useState(false);
  const [isCheckingWaitlist, setIsCheckingWaitlist] = useState(false);

  useEffect(() => {
    if (visible && user?.email) {
      setIsCheckingWaitlist(true);
      checkWaitlist(user.email)
        .then((res) => {
          if (res.is_on_waitlist) {
            setIsAlreadyOnWaitlist(true);
          }
        })
        .catch(() => {})
        .finally(() => setIsCheckingWaitlist(false));
    }
  }, [visible, user?.email]);

  useEffect(() => {
    if (!visible) {
      setIsSubmitted(false);
      setIsAlreadyOnWaitlist(false);
    }
  }, [visible]);

  const handleJoinWaitlist = async () => {
    if (!user?.email) return;
    setIsSubmitting(true);
    try {
      await joinWaitlist(user.email);
      setIsSubmitted(true);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setIsSubmitted(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const showSuccess = isSubmitted || isAlreadyOnWaitlist;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          {isCheckingWaitlist ? (
            <ActivityIndicator size="large" color={theme.primary} />
          ) : showSuccess ? (
            <>
              <Text style={styles.icon}>{'✅'}</Text>
              <Text style={[styles.title, { color: theme.text }]}>
                {isAlreadyOnWaitlist && !isSubmitted
                  ? t('youAreOnWaitlist')
                  : t('thankYou')}
              </Text>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                {isAlreadyOnWaitlist && !isSubmitted
                  ? t('alreadyOnWaitlistMessage')
                  : t('waitlistSuccess')}
              </Text>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: theme.primary }]}
                onPress={onClose}
                activeOpacity={0.8}>
                <Text style={styles.buttonText}>{t('close', 'Fechar')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.icon}>{'🚀'}</Text>
              <Text style={[styles.title, { color: theme.text }]}>
                {t('comingSoonTitle')}
              </Text>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                {t('comingSoonMessageLoggedIn')}
              </Text>

              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: theme.primary },
                  isSubmitting && styles.buttonDisabled,
                ]}
                onPress={handleJoinWaitlist}
                disabled={isSubmitting}
                activeOpacity={0.8}>
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {t('notifyMeWhenReady')}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                <Text style={[styles.cancelText, { color: theme.textMuted }]}>
                  {t('maybeLater')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  container: {
    width: '100%',
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: spacing.base,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  button: {
    width: '100%',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...typography.button,
    color: '#ffffff',
  },
  cancelText: {
    ...typography.body,
    marginTop: spacing.base,
    paddingVertical: spacing.sm,
  },
});
