import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useUser } from '../../contexts/UserContext';
import api from '../../services/api';

// Onboarding focado (paridade com o /onboarding web — versão nativa: @username + pular).
// Ao concluir OU pular, marca onboarding_completed no backend e dá refreshUser(): o
// AuthedRoot então renderiza o app principal (sem navegação explícita).
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useUser();

  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  // Sugere um username a partir do e-mail (uma vez).
  useEffect(() => {
    if (user?.email && !username) {
      const suggested = user.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 20);
      setUsername(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  // Checa disponibilidade com debounce.
  useEffect(() => {
    if (username.length < 3) {
      setAvailable(null);
      return;
    }
    const tmo = setTimeout(async () => {
      setChecking(true);
      try {
        const resp = await api.get(`/user/check-username/${username}`);
        setAvailable(Boolean(resp.data?.available));
      } catch {
        setAvailable(null);
      } finally {
        setChecking(false);
      }
    }, 500);
    return () => clearTimeout(tmo);
  }, [username]);

  const complete = useCallback(async () => {
    try {
      await api.post('/user/onboarding/complete');
    } catch {
      // Não-fatal: o refreshUser abaixo reconcilia; pior caso, retenta no próximo acesso.
    }
    await refreshUser();
  }, [refreshUser]);

  const handleFinish = async () => {
    setSaving(true);
    if (username.length >= 3 && available) {
      try {
        await api.put('/user/update', { username: username.toLowerCase() });
      } catch {
        // ignora — segue pro complete
      }
    }
    await complete();
    setSaving(false);
  };

  const handleSkip = async () => {
    setSaving(true);
    await complete();
    setSaving(false);
  };

  const statusColor = checking ? theme.textMuted : available ? '#4caf50' : '#cf6679';
  const statusText = checking
    ? t('usernameRuleChecking', 'Verificando...')
    : available
      ? t('usernameRuleAvailable', 'Disponível!')
      : t('usernameTaken', 'Indisponível');

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24, backgroundColor: theme.background },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: theme.text }]}>
        {t('onboardingWelcomeTitle', 'Bem-vindo ao Qython')}
      </Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>
        {t('onboardingUsernameDesc', 'Escolha um @username — ele aparece em rankings e na comunidade.')}
      </Text>

      <View style={[styles.inputRow, { borderColor: theme.surfaceBorder }]}>
        <Text style={[styles.at, { color: theme.textMuted }]}>@</Text>
        <TextInput
          value={username}
          onChangeText={(v) => setUsername(v.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase().slice(0, 30))}
          placeholder="usuario.exemplo"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: theme.text }]}
        />
      </View>

      {username.length >= 3 && (
        <Text style={[styles.status, { color: statusColor }]}>{statusText}</Text>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}
        onPress={handleFinish}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>{t('onboardingFinish', 'Concluir')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} disabled={saving} activeOpacity={0.7}>
        <Text style={[styles.skipText, { color: theme.textMuted }]}>
          {t('onboardingSkip', 'Pular por enquanto')}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 15, marginBottom: 28, lineHeight: 21 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  at: { fontSize: 18, marginRight: 4 },
  input: { flex: 1, fontSize: 16, paddingVertical: 14 },
  status: { fontSize: 13, marginTop: 8, marginBottom: 4, fontWeight: '600' },
  primaryBtn: {
    marginTop: 28,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14, textDecorationLine: 'underline' },
});
