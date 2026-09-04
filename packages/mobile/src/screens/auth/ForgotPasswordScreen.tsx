import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { requestPasswordReset } from '../../services/auth';
import type { AuthScreenProps } from '../../navigation/types';

type Props = AuthScreenProps<'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendReset = async () => {
    if (!email.trim()) {
      Alert.alert('', t('fillAllRequired', 'Preencha todos os campos obrigatórios.'));
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      Alert.alert('', t('resetEmailSent', 'Email enviado! Verifique sua caixa de entrada.'), [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: any) {
      const message =
        error.response?.data?.detail ||
        t('resetPasswordError', 'Erro ao enviar email de recuperação.');
      Alert.alert('', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.logoContainer}>
          <Text style={[styles.logoText, { color: theme.primary }]}>
            Qython
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>
            {t('forgotPasswordTitle', 'Recuperar Senha')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('forgotPasswordSubtitle', 'Insira seu email para receber o link de recuperação')}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              Email
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.surfaceBorder,
                  color: theme.text,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              placeholder={t('emailPlaceholder', 'seu@email.com')}
              placeholderTextColor={theme.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: theme.primary },
              loading && styles.buttonDisabled,
            ]}
            onPress={handleSendReset}
            disabled={loading}
            activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>
                {t('sendResetLink', 'Enviar link de recuperação')}
              </Text>
            )}
          </TouchableOpacity>

          {/* Back to Login Link */}
          <View style={styles.linkContainer}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={[styles.linkAction, { color: theme.primary }]}>
                {t('backToLogin', 'Voltar ao login')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textMuted }]}>
            qython.ai
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoText: {
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -1,
  },
  title: {
    ...typography.h2,
    marginTop: spacing.md,
  },
  subtitle: {
    ...typography.bodySmall,
    marginTop: spacing.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  form: {
    gap: spacing.base,
  },
  inputGroup: {
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
  },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  sendButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    ...typography.button,
    color: '#ffffff',
  },
  linkContainer: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  linkAction: {
    ...typography.button,
  },
  footer: {
    position: 'absolute',
    bottom: spacing.xl,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    ...typography.caption,
  },
});
