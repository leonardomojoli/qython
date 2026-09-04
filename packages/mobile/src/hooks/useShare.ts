import { useState, useCallback } from 'react';
import { Platform, Alert, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { getAuthToken } from '../services/auth';

export function useShare() {
  const { t } = useTranslation();
  const [sharing, setSharing] = useState(false);

  const sharePdf = useCallback(
    async (endpoint: string, filename: string) => {
      if (sharing) return;
      setSharing(true);
      let filePath: string | null = null;

      try {
        const ReactNativeBlobUtil = (await import('react-native-blob-util'))
          .default;
        const authToken = await getAuthToken();
        const baseUrl = api.defaults.baseURL || '';
        const url = `${baseUrl}${endpoint}`;

        const res = await ReactNativeBlobUtil.config({
          fileCache: true,
          appendExt: 'pdf',
        }).fetch('GET', url, {
          Authorization: `Bearer ${authToken}`,
        });

        filePath = res.path();

        const RNShare = (await import('react-native-share')).default;
        await RNShare.open({
          url: Platform.OS === 'android' ? `file://${filePath}` : filePath,
          type: 'application/pdf',
          filename,
        });
      } catch (error: any) {
        if (error?.message !== 'User did not share') {
          Alert.alert('', t('shareError'));
        }
      } finally {
        if (filePath) {
          try {
            const ReactNativeBlobUtil = (await import('react-native-blob-util'))
              .default;
            await ReactNativeBlobUtil.fs.unlink(filePath);
          } catch {}
        }
        setSharing(false);
      }
    },
    [sharing, t],
  );

  const shareText = useCallback(
    async (text: string, title?: string) => {
      try {
        await Share.share({ message: text, title });
      } catch (error: any) {
        if (error?.message !== 'User did not share') {
          Alert.alert('', t('shareError'));
        }
      }
    },
    [t],
  );

  return { sharePdf, shareText, sharing };
}
