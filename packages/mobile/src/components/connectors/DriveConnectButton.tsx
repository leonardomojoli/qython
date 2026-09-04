import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Pressable, Text, AppState, ActivityIndicator, Linking, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getConnectDriveUrl } from '../../services/connectors';

interface Props {
  onReturn?: () => void; // chamado quando o usuário volta do browser (refetch do status)
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  label?: string;
}

// O Google bloqueia OAuth dentro de WebView (disallowed_useragent), então a tela de
// consentimento abre no BROWSER do sistema (Custom Tabs no Android / Safari no iOS) via
// Linking — que o Google aceita. Como o app não tem deep link, detectamos a volta do
// usuário pelo AppState 'active' e refazemos o status (onReturn). A página de callback
// mostra "Tudo pronto! Feche esta janela"; o usuário volta ao app e a UI atualiza.
export default function DriveConnectButton({ onReturn, style, textStyle, label }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const waitingRef = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && waitingRef.current) {
        waitingRef.current = false;
        setLoading(false);
        if (typeof onReturn === 'function') onReturn();
      }
    });
    return () => sub.remove();
  }, [onReturn]);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    try {
      const url = await getConnectDriveUrl();
      if (!url) throw new Error('no auth url');
      waitingRef.current = true;
      await Linking.openURL(url);
    } catch (e) {
      waitingRef.current = false;
      setLoading(false);
    }
  }, []);

  return (
    <Pressable onPress={handleConnect} disabled={loading} style={style}>
      {loading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <Text style={textStyle}>{label || t('cloudConnectCta', 'Conectar Google Drive')}</Text>
      )}
    </Pressable>
  );
}
