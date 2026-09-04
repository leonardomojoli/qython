import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { loginWithEmail, loginWithGoogle } from '../../services/auth';
import { useButtonPress } from '../../hooks/useButtonPress';
import type { AuthScreenProps } from '../../navigation/types';

const qythonLogo = require('../../assets/qython-imagotipo.png');

type Props = AuthScreenProps<'Login'> & {
  onLoginSuccess: () => void;
};

export default function LoginScreen({ navigation, onLoginSuccess }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Fade-in + slide-up entry animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const loginPress = useButtonPress();
  const googlePress = useButtonPress();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('', t('fillEmailAndPassword', 'Preencha email e senha.'));
      return;
    }

    setLoading(true);
    try {
      await loginWithEmail(email.trim(), password);
      onLoginSuccess();
    } catch (error: any) {
      const message =
        error.response?.data?.detail || t('loginError', 'Erro ao fazer login. Tente novamente.');
      Alert.alert('', message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      onLoginSuccess();
    } catch (error: any) {
      if (error.code === 'SIGN_IN_CANCELLED' || error.code === '12501') {
        return;
      }
      const message =
        error.response?.data?.detail || t('googleLoginError', 'Erro ao entrar com Google.');
      Alert.alert('', message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const isLoading = loading || googleLoading;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}>
        {/* Brand */}
        <View style={styles.logoContainer}>
          <Image source={qythonLogo} style={styles.logoImage} resizeMode="contain" />
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('clinicalIntelligence', 'Inteligência Clínica')}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              {t('emailOrUsername', 'Email')}
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
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              {t('password', 'Senha')}
            </Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[
                  styles.input,
                  styles.passwordInput,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.surfaceBorder,
                    color: theme.text,
                  },
                ]}
                value={password}
                onChangeText={setPassword}
                placeholder={t('passwordPlaceholder', 'Sua senha')}
                placeholderTextColor={theme.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!isLoading}
              />
              <Pressable
                style={styles.showPasswordButton}
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={8}>
                <Text style={{ color: theme.primary, fontSize: 14, fontWeight: '600' }}>
                  {showPassword ? t('hide', 'Ocultar') : t('show', 'Mostrar')}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Primary CTA — gradient + luminous shadow */}
          <Animated.View
            style={{
              transform: [
                { scale: loginPress.scale },
                {
                  translateY: loginPress.translateY.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 2],
                  }),
                },
              ],
              shadowColor: theme.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.45,
              shadowRadius: 12,
              elevation: 8,
              borderRadius: borderRadius.md,
            }}>
            <Pressable
              onPressIn={loginPress.onPressIn}
              onPressOut={loginPress.onPressOut}
              onPress={handleLogin}
              disabled={isLoading}>
              <LinearGradient
                colors={theme.primaryGradient as unknown as string[]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.loginButton, isLoading && styles.buttonDisabled]}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.loginButtonText}>
                    {t('loginButton', 'Entrar')}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: theme.surfaceBorder }]} />
            <Text style={[styles.dividerText, { color: theme.textMuted }]}>
              {t('or', 'ou')}
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.surfaceBorder }]} />
          </View>

          {/* Google Sign-In */}
          <Animated.View
            style={{
              transform: [
                { scale: googlePress.scale },
                {
                  translateY: googlePress.translateY.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 2],
                  }),
                },
              ],
            }}>
            <Pressable
              onPressIn={googlePress.onPressIn}
              onPressOut={googlePress.onPressOut}
              onPress={handleGoogleLogin}
              disabled={isLoading}
              style={[
                styles.googleButton,
                { borderColor: theme.surfaceBorder, backgroundColor: theme.surface },
              ]}>
              {googleLoading ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <>
                  <Text style={styles.googleLogo}>G</Text>
                  <Text style={[styles.googleButtonText, { color: theme.text }]}>
                    {t('loginWithGoogle', 'Entrar com Google')}
                  </Text>
                </>
              )}
            </Pressable>
          </Animated.View>

          {/* Forgot Password Link */}
          <Pressable
            style={styles.forgotPasswordLink}
            onPress={() => navigation.navigate('ForgotPassword')}
            hitSlop={8}>
            <Text style={[styles.linkAction, { color: theme.primary }]}>
              {t('forgotPassword', 'Esqueci minha senha')}
            </Text>
          </Pressable>

          {/* Register Link */}
          <View style={styles.linkContainer}>
            <Text style={[styles.linkText, { color: theme.textSecondary }]}>
              {t('noAccount', 'Não tem conta?')}{' '}
            </Text>
            <Pressable onPress={() => navigation.navigate('Register')} hitSlop={8}>
              <Text style={[styles.linkAction, { color: theme.primary }]}>
                {t('createAccountLink', 'Criar conta')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textMuted }]}>
            qython.ai
          </Text>
        </View>
      </Animated.View>
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
  logoImage: {
    width: 220,
    height: 72,
  },
  subtitle: {
    ...typography.bodySmall,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 3,
    fontWeight: '600',
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
    minHeight: 52,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 80,
  },
  showPasswordButton: {
    position: 'absolute',
    right: spacing.base,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  loginButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  loginButtonText: {
    ...typography.button,
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    ...typography.caption,
    marginHorizontal: spacing.md,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    minHeight: 52,
    gap: spacing.sm,
  },
  googleLogo: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleButtonText: {
    ...typography.button,
  },
  forgotPasswordLink: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  linkText: {
    ...typography.body,
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
