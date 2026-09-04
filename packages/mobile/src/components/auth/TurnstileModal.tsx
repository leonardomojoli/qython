import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { CLOUDFLARE_TURNSTILE_SITE_KEY, TURNSTILE_ORIGIN } from '../../config/env';

interface Props {
  visible: boolean;
  onClose: () => void;
  onToken: (token: string) => void;
}

// Self-contained Turnstile challenge. Rendered with baseUrl = TURNSTILE_ORIGIN so
// the widget sees an allowed document origin (qython.ai). The token is posted back
// to RN; the backend validates it server-side with the secret key.
function buildHtml(siteKey: string): string {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:transparent}</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit" async defer></script>
</head><body>
<div id="cf"></div>
<script>
  function post(m){ try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){} }
  window.onTurnstileLoad = function(){
    window.turnstile.render('#cf', {
      sitekey: ${JSON.stringify(siteKey)},
      callback: function(token){ post({ type: 'token', token: token }); },
      'error-callback': function(){ post({ type: 'error' }); },
      'expired-callback': function(){ post({ type: 'expired' }); }
    });
  };
</script>
</body></html>`;
}

export default function TurnstileModal({ visible, onClose, onToken }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'token' && msg.token) {
        onToken(msg.token);
      }
      // 'error' / 'expired': keep the modal open so the user can retry or cancel.
    } catch (e) {
      // ignore non-JSON
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.box, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
            <Text style={[styles.title, { color: theme.text }]}>
              {t('securityCheck', 'Verificação de segurança')}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={[styles.close, { color: theme.primary }]}>{t('cancel', 'Cancelar')}</Text>
            </Pressable>
          </View>
          <View style={styles.webWrap}>
            {loading && (
              <ActivityIndicator style={StyleSheet.absoluteFill} color={theme.primary} />
            )}
            <WebView
              source={{ html: buildHtml(CLOUDFLARE_TURNSTILE_SITE_KEY), baseUrl: TURNSTILE_ORIGIN }}
              style={styles.webview}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
              onMessage={handleMessage}
              onLoadEnd={() => setLoading(false)}
              scrollEnabled={false}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  box: {
    width: '100%',
    maxWidth: 360,
    height: 300,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  title: { ...typography.h3 },
  close: { ...typography.button },
  webWrap: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
