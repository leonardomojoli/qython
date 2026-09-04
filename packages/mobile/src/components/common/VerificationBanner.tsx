import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../contexts/UserContext';
import { hasPlatformAccess } from '../../utils/access';
import LatreoVerifyButton from './LatreoVerifyButton';

// Dispensar é POR SESSÃO do app: flag em memória (reseta no restart) — some o banner até o
// usuário reabrir o app. A verificação continua acessível pela seção do Perfil.
let _dismissedThisSession = false;

// Banner global de verificação/acesso (paridade com o web). Por cima das telas principais
// quando o usuário NÃO tem acesso (nem Latreo-verificado, nem acesso concedido).
export default function VerificationBanner() {
  const { user } = useUser();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(_dismissedThisSession);

  if (dismissed || !user || hasPlatformAccess(user) || user.verification_status === 'rejected') {
    return null;
  }

  const dismiss = () => {
    _dismissedThisSession = true;
    setDismissed(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.text} numberOfLines={2}>
        {t('verifyBannerPrompt', 'Conclua sua verificação para liberar as funções de IA.')}
      </Text>
      <LatreoVerifyButton style={styles.button} textStyle={styles.buttonText} />
      <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={t('dismiss', 'Dispensar')}>
        <Text style={styles.close}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#F59E0B',
    paddingBottom: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  text: { flex: 1, color: '#000', fontSize: 13, fontWeight: '600' },
  button: { backgroundColor: '#121212', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  close: { color: '#000', fontSize: 16, fontWeight: '700', paddingHorizontal: 2, opacity: 0.7 },
});
