import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  generateAvatar,
  saveAvatar,
  uploadProfilePicture,
  getAvatarHistory,
  getAvatarLimits,
  getAvatarPresets,
  deleteAvatarFromHistory,
  type AvatarLimits,
} from '../../services/avatar';
import GradientButton from '../shared/GradientButton';

type Tab = 'upload' | 'generate' | 'history';

interface Props {
  visible: boolean;
  onClose: () => void;
  onAvatarChanged: () => void;
}

export default function AvatarGeneratorModal({ visible, onClose, onAvatarChanged }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const [activeTab, setActiveTab] = useState<Tab>('generate');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [tempAvatar, setTempAvatar] = useState<{ url: string; filename: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // History state
  const [history, setHistory] = useState<{ url: string; isPreset: boolean }[]>([]);
  const [limits, setLimits] = useState<AvatarLimits | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [historyUrls, presetUrls, limitsData] = await Promise.all([
        getAvatarHistory(),
        getAvatarPresets(),
        getAvatarLimits(),
      ]);
      setLimits(limitsData);

      const seen = new Set<string>();
      const combined: { url: string; isPreset: boolean }[] = [];
      presetUrls.forEach(url => {
        if (!seen.has(url)) { seen.add(url); combined.push({ url, isPreset: true }); }
      });
      historyUrls.forEach(url => {
        if (!seen.has(url)) { seen.add(url); combined.push({ url, isPreset: false }); }
      });
      setHistory(combined);
    } catch {
      // Silent fail
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchHistory();
    }
  }, [visible, fetchHistory]);

  const handleGenerate = async () => {
    if (!prompt.trim() || prompt.trim().length < 3) {
      Alert.alert('', t('promptTooShort', 'Descreva o avatar com pelo menos 3 caracteres.'));
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateAvatar(prompt.trim());
      setTempAvatar({ url: result.temp_avatar_url, filename: result.filename });
    } catch (error: any) {
      const msg = error.response?.data?.detail || t('errorGeneratingAvatar', 'Erro ao gerar avatar.');
      Alert.alert('', msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveGenerated = async () => {
    if (!tempAvatar) return;
    setIsSaving(true);
    try {
      await saveAvatar(tempAvatar.filename);
      setTempAvatar(null);
      setPrompt('');
      onAvatarChanged();
      fetchHistory();
      Alert.alert('', t('avatarSavedSuccess', 'Avatar salvo com sucesso!'));
    } catch (error: any) {
      const msg = error.response?.data?.detail || t('errorSavingAvatar', 'Erro ao salvar avatar.');
      Alert.alert('', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setTempAvatar(null);
  };

  const handleUpload = (source: 'camera' | 'gallery') => {
    const options = {
      mediaType: 'photo' as const,
      quality: 0.8 as const,
      maxWidth: 512,
      maxHeight: 512,
    };

    const callback = async (response: any) => {
      if (response.didCancel || response.errorCode) return;
      const asset = response.assets?.[0];
      if (!asset?.uri) return;

      const sizeMB = (asset.fileSize || 0) / (1024 * 1024);
      if (sizeMB > 5) {
        Alert.alert('', t('fileTooLarge', 'Arquivo muito grande. Maximo 5MB.'));
        return;
      }

      setIsUploading(true);
      try {
        await uploadProfilePicture(asset.uri, asset.type || 'image/jpeg', asset.fileName || 'profile.jpg');
        onAvatarChanged();
        Alert.alert('', t('uploadSuccess', 'Foto enviada com sucesso!'));
      } catch {
        Alert.alert('', t('uploadError', 'Erro ao enviar foto.'));
      } finally {
        setIsUploading(false);
      }
    };

    if (source === 'camera') {
      launchCamera(options, callback);
    } else {
      launchImageLibrary(options, callback);
    }
  };

  const handleSelectFromHistory = async (item: { url: string; isPreset: boolean }) => {
    // Extract filename from URL
    const parts = item.url.split('/');
    const filename = parts[parts.length - 1];

    setIsSaving(true);
    try {
      await saveAvatar(filename);
      onAvatarChanged();
      Alert.alert('', t('avatarSavedSuccess', 'Avatar salvo com sucesso!'));
    } catch (error: any) {
      const msg = error.response?.data?.detail || t('errorSavingAvatar', 'Erro ao salvar avatar.');
      Alert.alert('', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFromHistory = (item: { url: string; isPreset: boolean }) => {
    if (item.isPreset) return;
    const parts = item.url.split('/');
    const filename = parts[parts.length - 1];

    Alert.alert(
      t('removeAvatar', 'Remover avatar'),
      t('confirmRemoveAvatar', 'Tem certeza que deseja remover este avatar?'),
      [
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
        {
          text: t('remove', 'Remover'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAvatarFromHistory(filename);
              setHistory(prev => prev.filter(h => h.url !== item.url));
            } catch {
              Alert.alert('', t('errorDeletingAvatar', 'Erro ao remover avatar.'));
            }
          },
        },
      ],
    );
  };

  const renderTab = (key: Tab, label: string) => {
    const isActive = activeTab === key;
    return (
      <TouchableOpacity
        key={key}
        style={[
          styles.tab,
          { borderColor: isActive ? theme.primary : theme.surfaceBorder },
          isActive && { backgroundColor: `${theme.primary}15` },
        ]}
        onPress={() => setActiveTab(key)}>
        <Text style={[styles.tabText, { color: isActive ? theme.primary : theme.textMuted }]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeBtnText, { color: theme.primary }]}>
              {t('close', 'Fechar')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {t('changeAvatar', 'Alterar Avatar')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {renderTab('upload', t('upload', 'Upload'))}
          {renderTab('generate', `${t('generateAI', 'IA')} ✨`)}
          {renderTab('history', t('history', 'Historico'))}
        </View>

        {/* Tab Content */}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {activeTab === 'upload' && (
            <View style={styles.section}>
              <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
                {t('clickToUpload', 'Envie uma foto do seu dispositivo ou tire uma nova.')}
              </Text>
              <View style={styles.uploadActions}>
                <TouchableOpacity
                  style={[styles.uploadBtn, { borderColor: theme.primary, backgroundColor: `${theme.primary}10` }]}
                  onPress={() => handleUpload('gallery')}
                  disabled={isUploading}>
                  <Text style={styles.uploadIcon}>{'\uD83D\uDDBC'}</Text>
                  <Text style={[styles.uploadLabel, { color: theme.primary }]}>
                    {t('gallery', 'Galeria')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.uploadBtn, { borderColor: theme.secondary, backgroundColor: `${theme.secondary}10` }]}
                  onPress={() => handleUpload('camera')}
                  disabled={isUploading}>
                  <Text style={styles.uploadIcon}>{'\uD83D\uDCF7'}</Text>
                  <Text style={[styles.uploadLabel, { color: theme.secondary }]}>
                    {t('camera', 'Camera')}
                  </Text>
                </TouchableOpacity>
              </View>
              {isUploading && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <Text style={[styles.loadingText, { color: theme.textMuted }]}>
                    {t('uploading', 'Enviando...')}
                  </Text>
                </View>
              )}
            </View>
          )}

          {activeTab === 'generate' && (
            <View style={styles.section}>
              <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
                {t('aiAvatarHint', 'Descreva o avatar que voce deseja criar com IA')}
              </Text>
              <TextInput
                style={[styles.promptInput, { color: theme.text, borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
                value={prompt}
                onChangeText={setPrompt}
                placeholder={t('enterPromptToGenerateAvatar', 'Ex: medico futurista em estilo cyberpunk')}
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={500}
                editable={!isGenerating}
              />
              <View style={styles.generateBtnWrapper}>
                <GradientButton
                  label={`${t('generateAvatar', 'Gerar Avatar')} ✨`}
                  onPress={handleGenerate}
                  loading={isGenerating}
                  disabled={!prompt.trim()}
                />
              </View>

              {/* Preview */}
              {tempAvatar && (
                <View style={styles.previewSection}>
                  <Image source={{ uri: tempAvatar.url }} style={styles.previewImage} />
                  <View style={styles.previewActions}>
                    <TouchableOpacity
                      style={[styles.previewBtn, styles.discardBtn, { borderColor: theme.surfaceBorder }]}
                      onPress={handleDiscard}
                      disabled={isSaving}>
                      <Text style={[styles.previewBtnText, { color: theme.textMuted }]}>
                        {t('discard', 'Descartar')}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.saveBtnWrapper}>
                      <GradientButton
                        label={t('save', 'Salvar')}
                        onPress={handleSaveGenerated}
                        loading={isSaving}
                      />
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          {activeTab === 'history' && (
            <View style={styles.section}>
              {/* Limits bar */}
              {limits && (
                <View style={styles.limitsSection}>
                  <View style={styles.limitsHeader}>
                    <Text style={[styles.limitsText, { color: theme.textMuted }]}>
                      {limits.used}/{limits.max} {t('avatarSlots', 'slots')}
                    </Text>
                  </View>
                  <View style={[styles.limitsBar, { backgroundColor: theme.surfaceBorder }]}>
                    <View
                      style={[
                        styles.limitsFill,
                        {
                          width: `${Math.min((limits.used / limits.max) * 100, 100)}%`,
                          backgroundColor: limits.used >= limits.max ? theme.error : theme.primary,
                        },
                      ]}
                    />
                  </View>
                </View>
              )}

              {loadingHistory ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              ) : history.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  {t('noAvatarHistory', 'Nenhum avatar no historico.')}
                </Text>
              ) : (
                <View style={styles.historyGrid}>
                  {history.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.historyItem, { borderColor: theme.surfaceBorder }]}
                      onPress={() => handleSelectFromHistory(item)}
                      onLongPress={() => handleDeleteFromHistory(item)}
                      disabled={isSaving}>
                      <Image source={{ uri: item.url }} style={styles.historyImage} />
                      {item.isPreset && (
                        <View style={[styles.presetBadge, { backgroundColor: theme.primary }]}>
                          <Text style={styles.presetBadgeText}>{'\u2605'}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.base,
    borderBottomWidth: 1, justifyContent: 'space-between',
  },
  closeBtn: { paddingRight: spacing.sm },
  closeBtnText: { ...typography.buttonSmall },
  headerTitle: { ...typography.label, fontWeight: '600' },
  headerSpacer: { width: 60 },
  tabRow: {
    flexDirection: 'row', paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm, gap: spacing.sm,
  },
  tab: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.full,
    borderWidth: 1, alignItems: 'center',
  },
  tabText: { ...typography.buttonSmall },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  section: {},
  sectionHint: { ...typography.bodySmall, marginBottom: spacing.md, lineHeight: 22 },
  uploadActions: { flexDirection: 'row', gap: spacing.md },
  uploadBtn: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg, borderWidth: 1, borderStyle: 'dashed',
  },
  uploadIcon: { fontSize: 32, marginBottom: spacing.sm },
  uploadLabel: { ...typography.buttonSmall },
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, marginTop: spacing.md,
  },
  loadingText: { ...typography.bodySmall },
  promptInput: {
    ...typography.body, borderWidth: 1, borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    minHeight: 80, textAlignVertical: 'top', marginBottom: spacing.md,
  },
  generateBtnWrapper: { marginTop: spacing.xs },
  previewSection: { alignItems: 'center', marginTop: spacing.lg },
  previewImage: {
    width: 150, height: 150, borderRadius: 75, marginBottom: spacing.md,
    borderWidth: 3, borderColor: 'rgba(3, 218, 198, 0.5)',
  },
  previewActions: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  previewBtn: {
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: borderRadius.md, alignItems: 'center',
  },
  discardBtn: { borderWidth: 1 },
  saveBtnWrapper: { flex: 1, minWidth: 120 },
  previewBtnText: { ...typography.buttonSmall, fontWeight: '600' },
  limitsSection: { marginBottom: spacing.md },
  limitsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  limitsText: { ...typography.caption },
  limitsBar: { height: 4, borderRadius: 2 },
  limitsFill: { height: 4, borderRadius: 2 },
  emptyText: { ...typography.body, textAlign: 'center', marginTop: spacing.xl },
  historyGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  historyItem: {
    width: 72, height: 72, borderRadius: 36, overflow: 'hidden',
    borderWidth: 2,
  },
  historyImage: { width: '100%', height: '100%' },
  presetBadge: {
    position: 'absolute', top: -2, right: -2, width: 18, height: 18,
    borderRadius: 9, justifyContent: 'center', alignItems: 'center',
  },
  presetBadgeText: { color: '#fff', fontSize: 10 },
});
