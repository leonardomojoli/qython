// Parear o celular com o Qython do computador: escaneia o QR code da tela do computador (caminho
// recomendado, a impressão digital do certificado vem junto) ou digita endereço e código e confere a
// impressão digital com a tela do computador. Contrato em docs/PAREAMENTO.md.
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  PairingError,
  formatFingerprint,
  inspectManualAddress,
  isValidCode,
  normalizeCode,
  pairWithTarget,
  parsePairingQr,
  type PairingTarget,
} from '../../services/pairing';
import { hasNativeSecurity, scanQrCode } from '../../services/nativeSecurity';
import type { AuthScreenProps } from '../../navigation/types';

type Props = AuthScreenProps<'Pair'> & {
  onLoginSuccess: () => void;
};

export default function PairingScreen({ navigation, onLoginSuccess }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [manual, setManual] = useState(!hasNativeSecurity());
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pareamento digitado: o certificado lido do computador, à espera do "é o mesmo" do médico.
  const [pending, setPending] = useState<{ target: PairingTarget; fingerprint: string } | null>(null);

  const finish = async (target: PairingTarget) => {
    setBusy(true);
    setError(null);
    try {
      await pairWithTarget(target);
      onLoginSuccess();
    } catch (e: any) {
      setPending(null);
      setError(
        e instanceof PairingError
          ? e.message
          : t('pairFailed', 'Não foi possível parear. Tente de novo.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleScan = async () => {
    setError(null);
    let text: string | null;
    try {
      text = await scanQrCode();
    } catch (e: any) {
      if (e?.code === 'E_CANCELED') {
        return;
      }
      setError(
        t('scannerUnavailable', 'O leitor de QR code não está disponível neste aparelho. Digite o endereço e o código.'),
      );
      setManual(true);
      return;
    }
    const target = text ? parsePairingQr(text) : null;
    if (!target) {
      setError(t('notQythonQr', 'Este QR code não é do Qython. Use o que aparece em Perfil → Configurações → Conectar o celular, no computador.'));
      return;
    }
    await finish(target);
  };

  const handleInspect = async () => {
    setError(null);
    const normalized = normalizeCode(code);
    if (!isValidCode(normalized)) {
      setError(t('codeInvalid', 'O código tem 8 letras e números (ex.: ABCD-EFGH).'));
      return;
    }
    setBusy(true);
    try {
      const { address: found, fingerprint } = await inspectManualAddress(address);
      setPending({ target: { addresses: [found], fingerprint, code: normalized }, fingerprint });
    } catch (e: any) {
      setError(e instanceof PairingError ? e.message : t('pairFailed', 'Não foi possível parear. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surface, borderColor: theme.surfaceBorder, color: theme.text },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.text }]}>
          {t('pairTitle', 'Parear com o computador')}
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          {t(
            'pairIntro',
            'No computador, abra o Qython e vá em Perfil → Configurações → Conectar o celular. Ligue "Permitir o celular nesta rede" e clique em "Parear um celular". O celular precisa estar no mesmo Wi-Fi.',
          )}
        </Text>

        {pending ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              {t('pairFingerprintTitle', 'Confira no computador')}
            </Text>
            <Text style={[styles.fingerprint, { color: theme.text }]}>
              {formatFingerprint(pending.fingerprint)}
            </Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>
              {t(
                'pairFingerprintHelp',
                'Esta é a impressão digital do computador que respondeu. Ela deve ser IGUAL à mostrada na tela do computador, ao lado do código. Se for diferente, não continue: outro aparelho da rede pode estar se passando por ele.',
              )}
            </Text>
            <Pressable
              style={[styles.primary, { backgroundColor: theme.primary }, busy && styles.disabled]}
              disabled={busy}
              onPress={() => finish(pending.target)}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>{t('pairFingerprintOk', 'É a mesma, parear')}</Text>
              )}
            </Pressable>
            <Pressable style={styles.link} disabled={busy} onPress={() => setPending(null)}>
              <Text style={[styles.linkText, { color: theme.error }]}>
                {t('pairFingerprintNo', 'Não é a mesma')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {hasNativeSecurity() && (
              <Pressable
                style={[styles.primary, { backgroundColor: theme.primary }, busy && styles.disabled]}
                disabled={busy}
                onPress={handleScan}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>{t('pairScan', 'Escanear o QR code')}</Text>
                )}
              </Pressable>
            )}

            {manual ? (
              <View style={styles.form}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>
                  {t('pairAddress', 'Endereço do computador')}
                </Text>
                <TextInput
                  style={inputStyle}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="https://192.168.0.10:8443"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!busy}
                />
                <Text style={[styles.label, { color: theme.textSecondary }]}>
                  {t('pairCode', 'Código')}
                </Text>
                <TextInput
                  style={inputStyle}
                  value={code}
                  onChangeText={setCode}
                  placeholder="ABCD-EFGH"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!busy}
                />
                <Pressable
                  style={[styles.primary, { backgroundColor: theme.primary }, busy && styles.disabled]}
                  disabled={busy}
                  onPress={handleInspect}>
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>{t('pairContinue', 'Continuar')}</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.link} onPress={() => setManual(true)}>
                <Text style={[styles.linkText, { color: theme.primary }]}>
                  {t('pairManual', 'Digitar o endereço e o código')}
                </Text>
              </Pressable>
            )}
          </>
        )}

        {error && <Text style={[styles.error, { color: theme.error }]}>{error}</Text>}

        <Pressable style={styles.link} disabled={busy} onPress={() => navigation.goBack()}>
          <Text style={[styles.linkText, { color: theme.textSecondary }]}>{t('back', 'Voltar')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },
  title: { ...typography.h2 },
  body: { ...typography.body, lineHeight: 22 },
  label: { ...typography.caption, marginBottom: spacing.xs },
  form: { gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
  },
  card: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, gap: spacing.sm },
  fingerprint: { fontSize: 22, fontWeight: '700', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  primary: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  link: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { fontSize: 15, fontWeight: '600' },
  error: { ...typography.body },
});
