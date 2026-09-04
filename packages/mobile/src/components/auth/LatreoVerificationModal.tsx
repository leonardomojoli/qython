import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Pressable,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { API_BASE_URL } from '../../config/env';
import { getAuthToken } from '../../services/auth';

export interface LatreoResult {
  session_id: string | null;
  tier: string | null;
  status?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onVerified: (result: LatreoResult) => void;
  locale?: string;
  // "doctor" (default) or "student". Student sessions verify the academic
  // enrollment (institutional email or matrícula + selfie) inside the embed.
  kind?: 'doctor' | 'student';
}

// The hosted Latreo page posts the result to window.parent. Inside a WebView the
// page is the top frame (parent === self), so the message lands on `window`; we
// forward it to React Native via the injected bridge.
const INJECTED_JS = `
(function() {
  function fwd(d){ try { window.ReactNativeWebView.postMessage(typeof d === 'string' ? d : JSON.stringify(d)); } catch(e){} }
  window.addEventListener('message', function(e){
    if (e && e.data && typeof e.data === 'object' && typeof e.data.type === 'string' &&
        /^lastreo\.verify\.(complete|error)$/.test(e.data.type)) {
      fwd(e.data);
    }
  });
  true;
})();
`;

export default function LatreoVerificationModal({ visible, onClose, onVerified, locale, kind = 'doctor' }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!visible) {
      setEmbedUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setEmbedUrl(null);
      setError(null);
      // The WebView's getUserMedia (selfie for basic tier) needs the OS camera
      // permission held by the app. Bronze (CFM/CNES) works without it.
      if (Platform.OS === 'android') {
        try {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        } catch (e) {
          // proceed — bronze tier needs no camera
        }
      }
      try {
        const token = await getAuthToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const resp = await fetch(`${API_BASE_URL}/verification/lastreo/session`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ locale: locale || null, kind }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.embed_url) throw new Error('session');
        if (!cancelled) setEmbedUrl(data.embed_url);
      } catch (e) {
        if (!cancelled) {
          setError(t('latreoVerifyError', 'Não foi possível iniciar a verificação. Tente novamente.'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, locale, kind, attempt, t]);

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'lastreo.verify.complete') {
        onVerified({ session_id: data.session_id || null, tier: data.tier || null, status: data.status });
        onClose();
      } else if (data.type === 'lastreo.verify.error') {
        setError(t('latreoVerifyError', 'Não foi possível iniciar a verificação. Tente novamente.'));
      }
    } catch (e) {
      // non-JSON message — ignore
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {t('latreoVerifyButton', 'Verificar identidade médica')}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={[styles.close, { color: theme.primary }]}>{t('cancel', 'Cancelar')}</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
            <Pressable
              onPress={() => { setError(null); setAttempt((a) => a + 1); }}
              style={[styles.retry, { backgroundColor: theme.primary }]}>
              <Text style={styles.retryText}>{t('tryAgain', 'Tentar novamente')}</Text>
            </Pressable>
          </View>
        ) : embedUrl ? (
          <WebView
            source={{ uri: embedUrl }}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            onMessage={handleMessage}
            injectedJavaScript={INJECTED_JS}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            startInLoadingState
            {...(Platform.OS === 'ios' ? { mediaCapturePermissionGrantType: 'grant' as const } : {})}
          />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              {t('latreoVerifyPreparing', 'Preparando sua verificação segura...')}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  title: { ...typography.h3, flex: 1, marginRight: spacing.md },
  close: { ...typography.button },
  webview: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  loadingText: { ...typography.bodySmall, textAlign: 'center' },
  errorText: { ...typography.body, textAlign: 'center' },
  retry: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  retryText: { ...typography.button, color: '#ffffff', fontWeight: '700' },
});
