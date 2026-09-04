import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Pressable,
  TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

export interface PhoneVerifyResult {
  // Firebase ID token — carries the verified `phone_number` claim that the
  // backend re-validates server-side (firebase_service.verify_phone_token).
  token: string;
  phoneNumber: string; // E.164
}

interface Props {
  visible: boolean;
  phoneNumber: string;
  onClose: () => void;
  onVerified: (result: PhoneVerifyResult) => void;
}

// Normalize to E.164. If the user didn't type a country code, assume Brazil (+55),
// mirroring the web PhoneVerificationModal.
function toE164(raw: string): string {
  let c = (raw || '').replace(/[^\d+]/g, '');
  if (!c.startsWith('+')) {
    c = c.replace(/^0+/, '');
    c = '+55' + c;
  }
  return c;
}

export default function PhoneVerificationModal({ visible, phoneNumber, onClose, onVerified }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [step, setStep] = useState<'send' | 'code'>('send');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setStep('send');
      setCode('');
      setConfirmation(null);
      setError(null);
      setLoading(false);
    }
  }, [visible]);

  const sendCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = require('@react-native-firebase/auth').default;
      const conf = await auth().signInWithPhoneNumber(toE164(phoneNumber));
      setConfirmation(conf);
      setStep('code');
    } catch (e: any) {
      const c = e?.code || '';
      if (c === 'auth/invalid-phone-number') {
        setError(t('phoneInvalid', 'Número inválido. Use o formato +55 11 99999-9999.'));
      } else if (c === 'auth/too-many-requests') {
        setError(t('phoneTooMany', 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'));
      } else {
        setError(t('phoneSendError', 'Não foi possível enviar o SMS. Tente novamente.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const confirmCode = async () => {
    if (code.length < 6 || !confirmation) return;
    setLoading(true);
    setError(null);
    try {
      const auth = require('@react-native-firebase/auth').default;
      await confirmation.confirm(code);
      const token = await auth().currentUser?.getIdToken(true);
      // We only needed the signed token as proof of ownership — drop the Firebase
      // session so it doesn't collide with Google sign-in state on the device.
      try {
        await auth().signOut();
      } catch {
        // ignore
      }
      if (!token) throw new Error('no-token');
      onVerified({ token, phoneNumber: toE164(phoneNumber) });
      onClose();
    } catch (e: any) {
      const c = e?.code || '';
      if (c === 'auth/invalid-verification-code') {
        setError(t('phoneCodeWrong', 'Código incorreto. Verifique e tente de novo.'));
      } else if (c === 'auth/code-expired') {
        setError(t('phoneCodeExpired', 'Código expirado. Solicite um novo.'));
      } else {
        setError(t('phoneVerifyError', 'Erro na verificação. Tente novamente.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t('phoneModalTitle', 'Verificar telefone')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{toE164(phoneNumber)}</Text>

          {step === 'send' ? (
            <>
              <Text style={[styles.help, { color: theme.textMuted }]}>
                {t('phoneModalHelp', 'Enviaremos um código por SMS para confirmar seu número.')}
              </Text>
              <Pressable
                onPress={sendCode}
                disabled={loading}
                style={[styles.btn, { backgroundColor: theme.primary }]}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>{t('phoneSendCode', 'Enviar código SMS')}</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                style={[
                  styles.codeInput,
                  { color: theme.text, backgroundColor: theme.background, borderColor: theme.surfaceBorder },
                ]}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
              <Pressable
                onPress={confirmCode}
                disabled={loading || code.length < 6}
                style={[styles.btn, { backgroundColor: theme.primary, opacity: code.length < 6 ? 0.6 : 1 }]}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>{t('phoneConfirmCode', 'Confirmar código')}</Text>
                )}
              </Pressable>
            </>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable onPress={onClose} disabled={loading} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>{t('cancel', 'Cancelar')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  card: { borderRadius: borderRadius.md, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  title: { ...typography.h3 },
  subtitle: { ...typography.body, marginTop: -4 },
  help: { ...typography.bodySmall },
  btn: { borderRadius: borderRadius.md, paddingVertical: spacing.md, alignItems: 'center' },
  btnText: { ...typography.button, color: '#fff', fontWeight: '700' },
  codeInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
  },
  errorText: { color: '#ff5252', ...typography.bodySmall, textAlign: 'center' },
  cancelBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: { ...typography.button },
});
