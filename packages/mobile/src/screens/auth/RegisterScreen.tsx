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
  ScrollView,
  Animated,
  Easing,
  Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { registerUser, loginWithGoogle } from '../../services/auth';
import { COUNTRIES } from '../../types/pharmacy';
import { SPECIALTIES } from '../../types/ambulatory';
import CountryPicker from '../../components/pharmacy/CountryPicker';
import LatreoVerificationModal, { type LatreoResult } from '../../components/auth/LatreoVerificationModal';
import PhoneVerificationModal, { type PhoneVerifyResult } from '../../components/auth/PhoneVerificationModal';
import TurnstileModal from '../../components/auth/TurnstileModal';
import { useButtonPress } from '../../hooks/useButtonPress';
import type { AuthScreenProps } from '../../navigation/types';

const qythonLogo = require('../../assets/qython-imagotipo.png');

type Props = AuthScreenProps<'Register'> & {
  onLoginSuccess: () => void;
};

export default function RegisterScreen({ navigation, onLoginSuccess }: Props) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [country, setCountry] = useState('br');
  const [occupation, setOccupation] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showOccupationPicker, setShowOccupationPicker] = useState(false);
  const [showSpecialtyPicker, setShowSpecialtyPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Latreo identity verification (doctor: CRM/CNES · student: vínculo acadêmico)
  const [showLatreoModal, setShowLatreoModal] = useState(false);
  const [latreoSessionId, setLatreoSessionId] = useState<string | null>(null);
  const [latreoTier, setLatreoTier] = useState<string | null>(null);
  const [latreoVerified, setLatreoVerified] = useState(false);
  const [showTurnstile, setShowTurnstile] = useState(false);
  // Phone verification (mandatory) — native Firebase SMS
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneToken, setPhoneToken] = useState<string | null>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  const selectedCountry = COUNTRIES.find((c) => c.code === country);
  const occupationOptions = [t('medicalStudent', 'Estudante de Medicina'), t('doctor', 'Médico')];
  const isDoctor = occupation === t('doctor', 'Médico');

  const handleLatreoVerified = ({ session_id, tier }: LatreoResult) => {
    setLatreoSessionId(session_id);
    setLatreoTier(tier);
    setLatreoVerified(!!tier);
  };

  const handlePhoneVerified = ({ token }: PhoneVerifyResult) => {
    setPhoneToken(token);
    setPhoneVerified(true);
  };

  // Fade-in + slide-up entry animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const registerPress = useButtonPress();
  const googlePress = useButtonPress();

  const handleRegister = async () => {
    if (!email.trim() || !fullName.trim() || !password.trim() || !passwordConfirm.trim()) {
      Alert.alert('', t('fillAllRequired', 'Preencha todos os campos obrigatórios.'));
      return;
    }

    if (password.length < 8) {
      Alert.alert('', t('passwordTooShort', 'A senha deve ter no mínimo 8 caracteres.'));
      return;
    }

    if (password !== passwordConfirm) {
      Alert.alert('', t('passwordsDoNotMatch', 'As senhas não coincidem.'));
      return;
    }

    if (!occupation) {
      Alert.alert('', t('selectOccupation', 'Selecione uma ocupação'));
      return;
    }

    if (!phoneNumber.trim() || !phoneVerified || !phoneToken) {
      Alert.alert('', t('phoneVerifyRequiredMobile', 'Verifique seu telefone por SMS para concluir o cadastro.'));
      return;
    }

    // Obtain an anti-bot token (Cloudflare Turnstile) before submitting.
    setShowTurnstile(true);
  };

  const submitRegistration = async (captchaToken: string) => {
    setShowTurnstile(false);
    setLoading(true);
    try {
      await registerUser({
        email: email.trim(),
        full_name: fullName.trim(),
        password,
        country,
        occupation,
        captcha_token: captchaToken,
        phone_number: phoneNumber.trim(),
        phone_verification_token: phoneToken as string,
        specialty: specialty || undefined,
        latreo_session_id: latreoSessionId || undefined,
        language: i18n.language ? i18n.language.split('-')[0] : 'pt',
      });
      onLoginSuccess();
    } catch (error: any) {
      const message =
        error.response?.data?.detail || t('registrationError', 'Erro ao criar conta. Tente novamente.');
      Alert.alert('', message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}>
          {/* Brand */}
          <View style={styles.logoContainer}>
            <Image source={qythonLogo} style={styles.logoImage} resizeMode="contain" />
            <Text style={[styles.title, { color: theme.text }]}>
              {t('registerTitle', 'Criar Conta')}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {t('registerSubtitle', 'Crie seu copiloto clínico')}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Full Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {t('fullName', 'Nome Completo')} *
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
                value={fullName}
                onChangeText={setFullName}
                placeholder={t('fullName', 'Nome Completo')}
                placeholderTextColor={theme.textMuted}
                autoCapitalize="words"
                editable={!isLoading}
              />
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Email *
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

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {t('password', 'Senha')} *
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

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {t('confirmPassword', 'Confirmar Senha')} *
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
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                placeholder={t('confirmPassword', 'Confirmar Senha')}
                placeholderTextColor={theme.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!isLoading}
              />
            </View>

            {/* Country Selector */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {t('selectCountry', 'País')}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.input,
                  styles.selectorButton,
                  {
                    backgroundColor: theme.surface,
                    borderColor: pressed ? theme.primary : theme.surfaceBorder,
                  },
                ]}
                onPress={() => setShowCountryPicker(true)}
                disabled={isLoading}>
                <Text style={[styles.selectorText, { color: theme.text }]}>
                  {selectedCountry ? `${selectedCountry.flag}  ${t(selectedCountry.labelKey)}` : t('selectCountry', 'País')}
                </Text>
              </Pressable>
            </View>

            {/* Occupation Selector */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {t('occupation', 'Ocupação')} *
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.input,
                  styles.selectorButton,
                  {
                    backgroundColor: theme.surface,
                    borderColor: pressed ? theme.primary : theme.surfaceBorder,
                  },
                ]}
                onPress={() => setShowOccupationPicker(!showOccupationPicker)}
                disabled={isLoading}>
                <Text
                  style={[
                    styles.selectorText,
                    { color: occupation ? theme.text : theme.textMuted },
                  ]}>
                  {occupation || t('selectOccupation', 'Selecione uma ocupação')}
                </Text>
              </Pressable>
              {showOccupationPicker && (
                <View
                  style={[
                    styles.specialtyList,
                    { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
                  ]}>
                  {occupationOptions.map((opt) => (
                    <Pressable
                      key={opt}
                      style={({ pressed }) => [
                        styles.specialtyItem,
                        { borderBottomColor: theme.surfaceBorder },
                        (occupation === opt || pressed) && { backgroundColor: theme.primary + '20' },
                      ]}
                      onPress={() => {
                        setOccupation(opt);
                        setShowOccupationPicker(false);
                        if (opt !== t('doctor', 'Médico')) {
                          setLatreoSessionId(null);
                          setLatreoTier(null);
                          setLatreoVerified(false);
                        }
                      }}>
                      <Text
                        style={[
                          styles.specialtyItemText,
                          { color: occupation === opt ? theme.primary : theme.text },
                        ]}>
                        {opt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Specialty Selector (optional) */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {t('specialty', 'Especialidade')}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.input,
                  styles.selectorButton,
                  {
                    backgroundColor: theme.surface,
                    borderColor: pressed ? theme.primary : theme.surfaceBorder,
                  },
                ]}
                onPress={() => setShowSpecialtyPicker(!showSpecialtyPicker)}
                disabled={isLoading}>
                <Text
                  style={[
                    styles.selectorText,
                    { color: specialty ? theme.text : theme.textMuted },
                  ]}>
                  {specialty || t('selectSpecialty', 'Selecione a Especialidade')}
                </Text>
              </Pressable>
              {showSpecialtyPicker && (
                <View
                  style={[
                    styles.specialtyList,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.surfaceBorder,
                    },
                  ]}>
                  <ScrollView style={styles.specialtyScroll} nestedScrollEnabled>
                    {SPECIALTIES.map((spec) => (
                      <Pressable
                        key={spec}
                        style={({ pressed }) => [
                          styles.specialtyItem,
                          { borderBottomColor: theme.surfaceBorder },
                          (specialty === spec || pressed) && { backgroundColor: theme.primary + '20' },
                        ]}
                        onPress={() => {
                          setSpecialty(spec === specialty ? '' : spec);
                          setShowSpecialtyPicker(false);
                        }}>
                        <Text
                          style={[
                            styles.specialtyItemText,
                            { color: specialty === spec ? theme.primary : theme.text },
                          ]}>
                          {spec}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Phone verification (mandatory) — native Firebase SMS. Number + code go
                to Firebase; we keep only the signed ID token as proof of ownership. */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {t('phone', 'Telefone')} *
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <TextInput
                  style={[
                    styles.input,
                    { flex: 1, color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
                  ]}
                  value={phoneNumber}
                  onChangeText={(v) => {
                    setPhoneNumber(v);
                    if (phoneVerified) {
                      setPhoneVerified(false);
                      setPhoneToken(null);
                    }
                  }}
                  placeholder={t('phonePlaceholder', '+55 11 99999-9999')}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="phone-pad"
                  editable={!isLoading && !phoneVerified}
                  autoComplete="tel"
                />
                <Pressable
                  onPress={() => setShowPhoneModal(true)}
                  disabled={isLoading || !phoneNumber.trim() || phoneVerified}
                  style={({ pressed }) => [
                    styles.input,
                    styles.selectorButton,
                    {
                      width: 'auto',
                      paddingHorizontal: spacing.base,
                      backgroundColor: phoneVerified ? theme.primary + '20' : theme.surface,
                      borderColor: pressed || phoneVerified ? theme.primary : theme.surfaceBorder,
                    },
                  ]}>
                  <Text style={[styles.selectorText, { color: phoneVerified ? theme.primary : theme.text }]}>
                    {phoneVerified ? '✓ ' + t('verifiedBtn', 'Verificado') : t('verify', 'Verificar')}
                  </Text>
                </Pressable>
              </View>
              {!phoneVerified && (
                <Text style={[styles.helpText, { color: theme.textMuted }]}>
                  {t('phoneVerifyRequired', 'Obrigatório: confirme seu número por SMS.')}
                </Text>
              )}
            </View>

            {/* Identity verification via Latreo — doctor (CRM/CNES) or student
                (vínculo acadêmico). Documents/selfie go straight to Latreo inside the
                WebView — never through Qython. Shown once an occupation is chosen. */}
            {!!occupation && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>
                  {isDoctor
                    ? t('latreoVerifyButton', 'Verificar identidade médica')
                    : t('latreoVerifyButtonStudent', 'Verificar vínculo acadêmico')}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.input,
                    styles.selectorButton,
                    {
                      backgroundColor: (latreoVerified || latreoSessionId) ? theme.primary + '20' : theme.surface,
                      borderColor: pressed
                        ? theme.primary
                        : (latreoVerified || latreoSessionId) ? theme.primary : theme.surfaceBorder,
                    },
                  ]}
                  onPress={() => setShowLatreoModal(true)}
                  disabled={isLoading || latreoVerified || !!latreoSessionId}>
                  <Text
                    style={[
                      styles.selectorText,
                      { color: (latreoVerified || latreoSessionId) ? theme.primary : theme.text },
                    ]}>
                    {latreoVerified
                      ? '✓ ' + t('latreoVerifiedBadge', 'Identidade verificada')
                      : latreoSessionId
                        ? '✓ ' + t('latreoSubmittedBadge', 'Verificação enviada · em análise')
                        : isDoctor
                          ? t('latreoVerifyButton', 'Verificar identidade médica')
                          : t('latreoVerifyButtonStudent', 'Verificar vínculo acadêmico')}
                  </Text>
                </Pressable>
                {!latreoVerified && !latreoSessionId && (
                  <Text style={[styles.helpText, { color: theme.textMuted }]}>
                    {t('latreoVerifyOptional', 'Opcional agora — você pode concluir depois pelo seu perfil.')}
                  </Text>
                )}
              </View>
            )}

            {/* Primary CTA — gradient + luminous shadow */}
            <Animated.View
              style={{
                transform: [
                  { scale: registerPress.scale },
                  {
                    translateY: registerPress.translateY.interpolate({
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
                marginTop: spacing.sm,
              }}>
              <Pressable
                onPressIn={registerPress.onPressIn}
                onPressOut={registerPress.onPressOut}
                onPress={handleRegister}
                disabled={isLoading}>
                <LinearGradient
                  colors={theme.primaryGradient as unknown as string[]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.registerButton, isLoading && styles.buttonDisabled]}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.registerButtonText}>
                      {t('createAccount', 'Crie sua conta')}
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

            {/* Google Sign-Up */}
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
                onPress={handleGoogleSignUp}
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
                      {t('signUpWithGoogle', 'Cadastrar com Google')}
                    </Text>
                  </>
                )}
              </Pressable>
            </Animated.View>

            {/* Login Link */}
            <View style={styles.linkContainer}>
              <Text style={[styles.linkText, { color: theme.textSecondary }]}>
                {t('alreadyHaveAccount', 'Já tem conta?')}{' '}
              </Text>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={[styles.linkAction, { color: theme.primary }]}>
                  {t('loginLink', 'Entrar')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Country Picker Modal */}
      <CountryPicker
        visible={showCountryPicker}
        selectedCode={country}
        onSelect={setCountry}
        onClose={() => setShowCountryPicker(false)}
      />

      {/* Latreo identity verification modal — doctor (CRM) or student (vínculo acadêmico) */}
      <LatreoVerificationModal
        visible={showLatreoModal}
        onClose={() => setShowLatreoModal(false)}
        onVerified={handleLatreoVerified}
        locale={i18n.language ? i18n.language.split('-')[0] : undefined}
        kind={isDoctor ? 'doctor' : 'student'}
      />

      {/* Phone verification (mandatory) — native Firebase SMS */}
      <PhoneVerificationModal
        visible={showPhoneModal}
        phoneNumber={phoneNumber}
        onClose={() => setShowPhoneModal(false)}
        onVerified={handlePhoneVerified}
      />

      {/* Anti-bot challenge (Cloudflare Turnstile) before registration submit */}
      <TurnstileModal
        visible={showTurnstile}
        onClose={() => setShowTurnstile(false)}
        onToken={submitRegistration}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoImage: {
    width: 180,
    height: 56,
  },
  title: {
    ...typography.h2,
    marginTop: spacing.md,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    ...typography.bodySmall,
    marginTop: spacing.xs,
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
  selectorButton: {
    justifyContent: 'center',
  },
  selectorText: {
    ...typography.body,
  },
  helpText: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  specialtyList: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  specialtyScroll: {
    maxHeight: 200,
  },
  specialtyItem: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  specialtyItemText: {
    ...typography.body,
  },
  registerButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  registerButtonText: {
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
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  linkText: {
    ...typography.body,
  },
  linkAction: {
    ...typography.button,
  },
});
