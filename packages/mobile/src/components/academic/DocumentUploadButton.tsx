import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { pick } from 'react-native-document-picker';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { uploadDocument } from '../../services/academic';

interface Props {
  libraryId: number;
  onUploadComplete: () => void;
}

export default function DocumentUploadButton({ libraryId, onUploadComplete }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handlePick = async () => {
    try {
      const results = await pick({
        allowMultiSelection: true,
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain',
          'text/markdown',
          'text/csv',
          'text/html',
          'audio/mpeg',
          'audio/wav',
          'audio/mp4',
          'audio/x-m4a',
          'audio/aac',
          'video/mp4',
          'video/x-msvideo',
          'video/quicktime',
        ],
      });

      setUploading(true);

      for (const file of results) {
        setProgress(0);
        try {
          await uploadDocument(
            libraryId,
            {
              uri: file.uri,
              name: file.name || 'document',
              type: file.type || 'application/pdf',
            },
            (pct) => setProgress(pct),
          );
        } catch {
          Alert.alert('', t('errorUploadingDocument', 'Erro ao enviar o documento.'));
        }
      }

      onUploadComplete();
    } catch (err: unknown) {
      // User cancelled picker — ignore
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'DOCUMENT_PICKER_CANCELED') {
        return;
      }
      Alert.alert('', t('errorUploadingDocument', 'Erro ao enviar o documento.'));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.primary }]}
      onPress={handlePick}
      disabled={uploading}
      activeOpacity={0.8}>
      {uploading ? (
        <View style={styles.uploadingRow}>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.buttonText}>{progress}%</Text>
        </View>
      ) : (
        <Text style={styles.buttonText}>
          {t('uploadDocument', 'Enviar Documento')}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    margin: spacing.base,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  buttonText: {
    ...typography.button,
    color: '#fff',
  },
});
