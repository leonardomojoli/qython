import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useUser } from '../../contexts/UserContext';
import { spacing, borderRadius } from '../../theme/spacing';
import LatreoVerifyButton from '../common/LatreoVerifyButton';

// Seção de verificação no Perfil (paridade com o web) — ponto de entrada permanente além do
// banner. Mostra o estado e oferece o mesmo fluxo Latreo via LatreoVerifyButton.
export default function VerificationSection() {
  const { user } = useUser();
  const { t } = useTranslation();
  const { theme } = useTheme();
  if (!user || user.is_admin) return null;

  const vs = user.verification_status;

  if (vs === 'verified') {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <Text style={[styles.title, { color: '#4caf50' }]}>✓ {t('verificationVerifiedTitle', 'Identidade verificada')}</Text>
        <Text style={[styles.desc, { color: theme.textMuted }]}>
          {t('verificationVerifiedDesc', 'Seu registro médico está confirmado. Acesso completo liberado.')}
          {user.verification_tier ? ` · ${user.verification_tier}` : ''}
        </Text>
      </View>
    );
  }

  const granted = !!user.access_granted;
  const isRejected = vs === 'rejected';
  const desc = granted
    ? t('verificationGrantedDesc', 'Seu acesso já está liberado. Verificar adiciona o selo verificado ao seu perfil.')
    : isRejected
      ? t('latreoRejectedDesc', 'Não foi possível confirmar seu registro. Tente novamente.')
      : t('verificationPendingDesc', 'Verifique sua identidade médica (rápido: CRM + UF) para liberar copiloto, materiais e consultas.');

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
      <Text style={[styles.title, { color: isRejected ? '#ff7043' : theme.text }]}>
        {t('verificationSectionTitle', 'Verificação de identidade médica')}
      </Text>
      <Text style={[styles.desc, { color: theme.textMuted }]}>{desc}</Text>
      <LatreoVerifyButton style={[styles.cta, { backgroundColor: theme.primary }]} textStyle={styles.ctaText} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  title: { fontSize: 16, fontWeight: '700' },
  desc: { fontSize: 13, lineHeight: 19 },
  cta: { alignSelf: 'flex-start', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18, marginTop: spacing.xs },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
