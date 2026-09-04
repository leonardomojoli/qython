import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { launchCamera, launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, borderRadius } from '../../theme/spacing';

export interface AttachedFile {
  uri: string;
  type: string;
  name: string;
}

interface Props {
  onSend: (message: string, files: AttachedFile[]) => void;
  disabled?: boolean;
}

export interface InputBarHandle {
  setText: (text: string) => void;
}

const MAX_FILES = 5;
const MAX_IMAGES = 3;
const MAX_SIZE_MB = 20;

const InputBar = forwardRef<InputBarHandle, Props>(({ onSend, disabled }, ref) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const inputRef = useRef<TextInput>(null);

  // Permite que o empty-state (pílulas) pré-preencha o input e abra o teclado.
  useImperativeHandle(ref, () => ({
    setText: (value: string) => {
      setText(value);
      inputRef.current?.focus();
    },
  }), []);

  const imageCount = files.filter((f) => f.type.startsWith('image/')).length;

  const handlePickImage = (source: 'camera' | 'gallery') => {
    if (files.length >= MAX_FILES) {
      Alert.alert('', t('maxFilesReached', 'Máximo de 5 arquivos'));
      return;
    }
    if (imageCount >= MAX_IMAGES) {
      Alert.alert('', t('maxImagesReached', 'Máximo de 3 imagens'));
      return;
    }

    const options = {
      mediaType: 'photo' as const,
      quality: 0.7 as const,
      maxWidth: 800,
      maxHeight: 800,
    };

    const callback = (response: ImagePickerResponse) => {
      if (response.didCancel || response.errorCode) {
        return;
      }
      const asset = response.assets?.[0];
      if (!asset?.uri) {
        return;
      }
      const fileSizeMB = (asset.fileSize || 0) / (1024 * 1024);
      const totalSize = files.reduce((sum, f) => sum, 0) + fileSizeMB;
      if (totalSize > MAX_SIZE_MB) {
        Alert.alert('', t('maxSizeReached', 'Tamanho máximo de 20MB excedido'));
        return;
      }
      setFiles((prev) => [
        ...prev,
        {
          uri: asset.uri!,
          type: asset.type || 'image/jpeg',
          name: asset.fileName || `image_${Date.now()}.jpg`,
        },
      ]);
    };

    if (source === 'camera') {
      launchCamera(options, callback);
    } else {
      launchImageLibrary(options, callback);
    }
  };

  const showImagePicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t('cancel', 'Cancelar'), t('camera', 'Câmera'), t('gallery', 'Galeria')],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handlePickImage('camera');
          } else if (buttonIndex === 2) {
            handlePickImage('gallery');
          }
        },
      );
    } else {
      Alert.alert(
        t('addImage', 'Adicionar imagem'),
        '',
        [
          { text: t('camera', 'Câmera'), onPress: () => handlePickImage('camera') },
          { text: t('gallery', 'Galeria'), onPress: () => handlePickImage('gallery') },
          { text: t('cancel', 'Cancelar'), style: 'cancel' },
        ],
      );
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) {
      return;
    }
    onSend(trimmed, files);
    setText('');
    setFiles([]);
  };

  const canSend = (text.trim().length > 0 || files.length > 0) && !disabled;

  return (
    <View style={[styles.container, { backgroundColor: theme.background, borderTopColor: theme.surfaceBorder }]}>
      {files.length > 0 && (
        <ScrollView
          horizontal
          style={styles.filePreview}
          showsHorizontalScrollIndicator={false}>
          {files.map((file, index) => (
            <View key={index} style={styles.thumbnailContainer}>
              <Image source={{ uri: file.uri }} style={styles.thumbnail} />
              <TouchableOpacity
                style={[styles.removeButton, { backgroundColor: theme.error }]}
                onPress={() => removeFile(index)}>
                <View style={styles.removeIcon}>
                  <View style={[styles.removeLine, { backgroundColor: '#fff' }]} />
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={styles.inputRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={showImagePicker}
          disabled={disabled}>
          <View style={[styles.cameraIcon, { borderColor: theme.textMuted }]}>
            <View style={[styles.cameraLens, { backgroundColor: theme.textMuted }]} />
          </View>
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              backgroundColor: theme.surface,
              borderColor: theme.surfaceBorder,
              color: theme.text,
            },
          ]}
          value={text}
          onChangeText={setText}
          placeholder={t('typeMessage', 'Digite sua mensagem...')}
          placeholderTextColor={theme.textMuted}
          multiline
          maxLength={10000}
          editable={!disabled}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: canSend ? theme.primary : theme.surface },
          ]}
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.7}>
          <View style={styles.sendArrow}>
            <View
              style={[
                styles.arrowLine,
                { backgroundColor: canSend ? '#fff' : theme.textMuted },
              ]}
            />
            <View
              style={[
                styles.arrowHead,
                { borderLeftColor: canSend ? '#fff' : theme.textMuted },
              ]}
            />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default InputBar;

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  filePreview: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  thumbnailContainer: {
    marginRight: spacing.sm,
    position: 'relative',
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
  },
  removeButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeIcon: {
    width: 10,
    height: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeLine: {
    width: 8,
    height: 2,
    borderRadius: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  actionButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIcon: {
    width: 24,
    height: 20,
    borderWidth: 1.5,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraLens: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 120,
    fontSize: 15,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendArrow: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowLine: {
    width: 2,
    height: 12,
    borderRadius: 1,
  },
  arrowHead: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});
