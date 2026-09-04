import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Image,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useUser } from '../../contexts/UserContext';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { updateTrainingDataPreference } from '../../services/auth';
import { uploadDoctorLogo, deleteDoctorLogo } from '../../services/profile';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import i18n from '../../i18n';
import { Alert } from 'react-native';
import { resetQythonTour } from '../../components/common/QythonTour';

const LANGUAGES = [
  { code: 'pt', label: 'Portugues' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Espanol' },
];

interface Props {
  onLogout: () => void;
}

export default function SettingsTab({ onLogout }: Props) {
  const { t } = useTranslation();
  const { mode, theme, toggleTheme } = useTheme();
  const { user, refreshUser } = useUser();
  const navigation = useNavigation<any>();
  const sync = useSyncStatus();

  const [trainingDataEnabled, setTrainingDataEnabled] = useState(
    user?.training_data_enabled ?? false,
  );

  useEffect(() => {
    if (user) {
      setTrainingDataEnabled(user.training_data_enabled ?? false);
    }
  }, [user]);

  const handleToggleTrainingData = async (value: boolean) => {
    setTrainingDataEnabled(value);
    try {
      await updateTrainingDataPreference(!value);
      await refreshUser();
    } catch {
      setTrainingDataEnabled(!value);
      Alert.alert('', t('error', 'Erro'));
    }
  };

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  const handleLogout = () => {
    Alert.alert(
      t('logout', 'Sair'),
      t('logoutConfirm', 'Tem certeza que deseja sair?'),
      [
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
        {
          text: t('logout', 'Sair'),
          style: 'destructive',
          onPress: onLogout,
        },
      ],
    );
  };

  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleUploadLogo = () => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 0.9, maxWidth: 512, maxHeight: 512 },
      async (response) => {
        if (response.didCancel || response.errorCode) return;
        const asset = response.assets?.[0];
        if (!asset?.uri) return;
        const sizeMB = (asset.fileSize || 0) / (1024 * 1024);
        if (sizeMB > 5) {
          Alert.alert('', t('fileTooLarge', 'Arquivo muito grande. Maximo 5MB.'));
          return;
        }
        setUploadingLogo(true);
        try {
          await uploadDoctorLogo(asset.uri, asset.type || 'image/png', asset.fileName || 'logo.png');
          await refreshUser();
          Alert.alert('', t('logoUploaded', 'Logo atualizado com sucesso!'));
        } catch {
          Alert.alert('', t('uploadError', 'Erro ao enviar logo.'));
        } finally {
          setUploadingLogo(false);
        }
      },
    );
  };

  const handleRemoveLogo = () => {
    Alert.alert(
      t('removeLogo', 'Remover Logo'),
      t('removeLogoConfirm', 'O logo padrao do Qython sera usado.'),
      [
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
        {
          text: t('remove', 'Remover'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoctorLogo();
              await refreshUser();
              Alert.alert('', t('logoRemoved', 'Logo removido.'));
            } catch {
              Alert.alert('', t('error', 'Erro'));
            }
          },
        },
      ],
    );
  };

  const currentLang = i18n.language;
  const doctorLogoUrl = (user as any)?.doctor_logo_url;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      {/* Training Data Toggle */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <View style={styles.cardRow}>
          <View style={styles.trainingDataLabel}>
            <Text style={[styles.cardLabel, { color: theme.text }]}>
              {t('trainingDataTitle', 'Dados para Treinamento de IA')}
            </Text>
            <Text style={[styles.trainingDataDesc, { color: theme.textMuted }]}>
              {t('trainingDataDescription', 'Permitir uso anonimizado de interacoes para melhorar os modelos de IA')}
            </Text>
          </View>
          <Switch
            value={trainingDataEnabled}
            onValueChange={handleToggleTrainingData}
            trackColor={{ false: theme.surfaceBorder, true: theme.primary + '50' }}
            thumbColor={trainingDataEnabled ? theme.primary : '#ccc'}
          />
        </View>
      </View>

      {/* Theme Toggle */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <View style={styles.cardRow}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>
            {t('darkMode', 'Modo escuro')}
          </Text>
          <Switch
            value={mode === 'dark'}
            onValueChange={toggleTheme}
            trackColor={{ false: theme.surfaceBorder, true: theme.primary + '50' }}
            thumbColor={mode === 'dark' ? theme.primary : '#ccc'}
          />
        </View>
      </View>

      {/* Language Selector */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {t('language', 'Idioma')}
        </Text>
        <View style={styles.languageRow}>
          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.langButton,
                {
                  backgroundColor: currentLang === lang.code ? theme.primary + '20' : 'transparent',
                  borderColor: currentLang === lang.code ? theme.primary : theme.surfaceBorder,
                },
              ]}
              onPress={() => handleLanguageChange(lang.code)}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.langLabel,
                  { color: currentLang === lang.code ? theme.primary : theme.text },
                ]}>
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Sync & Offline */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}
        onPress={() => navigation.navigate('SyncSettings')}
        activeOpacity={0.7}>
        <View style={styles.cardRow}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>
            {t('offlineSyncSettings', 'Sincronizacao e dados offline')}
          </Text>
          <View style={styles.syncBadgeRow}>
            {sync.pendingQueueCount > 0 && (
              <View style={styles.syncBadge}>
                <Text style={styles.syncBadgeText}>{sync.pendingQueueCount}</Text>
              </View>
            )}
            <Text style={[styles.chevron, { color: theme.textMuted }]}>{'>'}</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Doctor Logo */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {t('doctorLogo', 'Logo para Documentos')}
        </Text>
        <Text style={[styles.trainingDataDesc, { color: theme.textMuted, marginBottom: spacing.md }]}>
          {t('doctorLogoHelper', 'Aparece no cabecalho de receitas, atestados e pedidos de exames.')}
        </Text>
        <View style={styles.logoRow}>
          {doctorLogoUrl ? (
            <Image source={{ uri: doctorLogoUrl }} style={styles.logoPreview} resizeMode="contain" />
          ) : (
            <View style={[styles.logoPlaceholder, { borderColor: theme.surfaceBorder }]}>
              <Text style={[styles.logoPlaceholderText, { color: theme.textMuted }]}>
                {t('noLogo', 'Sem logo')}
              </Text>
            </View>
          )}
          <View style={styles.logoActions}>
            <TouchableOpacity
              style={[styles.logoBtn, { backgroundColor: theme.primary }]}
              onPress={handleUploadLogo}
              disabled={uploadingLogo}>
              {uploadingLogo ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.logoBtnText}>{t('uploadLogo', 'Upload')}</Text>
              )}
            </TouchableOpacity>
            {doctorLogoUrl && (
              <TouchableOpacity
                style={[styles.logoBtn, { backgroundColor: theme.error }]}
                onPress={handleRemoveLogo}>
                <Text style={styles.logoBtnText}>{t('removeLogo', 'Remover')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Reset Tours */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}
        onPress={async () => {
          await Promise.all([
            resetQythonTour('copilot'),
            resetQythonTour('consultation'),
            resetQythonTour('academic'),
            resetQythonTour('pharmacy'),
            resetQythonTour('profile'),
          ]);
          Alert.alert('', t('toursReset', 'Tutoriais resetados. Serao exibidos novamente.'));
        }}
        activeOpacity={0.7}>
        <View style={styles.cardRow}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>
            {t('resetTours', 'Resetar tutoriais')}
          </Text>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>{'\u21BB'}</Text>
        </View>
      </TouchableOpacity>

      {/* About */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <TouchableOpacity
          style={styles.cardRow}
          activeOpacity={0.7}
          onPress={() => Linking.openURL('https://qython.ai').catch(() => {})}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>
            {t('aboutQython', 'Sobre o Qython')}
          </Text>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>{'›'}</Text>
        </TouchableOpacity>
      </View>

      {/* Legal */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <TouchableOpacity
          style={styles.cardRow}
          activeOpacity={0.7}
          onPress={() => Linking.openURL('https://qython.ai/privacy-policy').catch(() => {})}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>
            {t('privacyPolicyTitle', 'Política de Privacidade')}
          </Text>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>{'›'}</Text>
        </TouchableOpacity>
        <View style={[styles.legalDivider, { borderTopColor: theme.surfaceBorder }]} />
        <TouchableOpacity
          style={styles.cardRow}
          activeOpacity={0.7}
          onPress={() => Linking.openURL('https://qython.ai/terms-of-use').catch(() => {})}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>
            {t('termsOfUse', 'Termos de Uso')}
          </Text>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>{'›'}</Text>
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={[styles.logoutButton, { borderColor: theme.error }]}
        onPress={handleLogout}
        activeOpacity={0.7}>
        <Text style={[styles.logoutText, { color: theme.error }]}>
          {t('logout', 'Sair')}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.version, { color: theme.textMuted }]}>
        Qython v1.0.0
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 36,
  },
  cardLabel: {
    ...typography.body,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  trainingDataLabel: {
    flex: 1,
    marginRight: spacing.md,
  },
  trainingDataDesc: {
    ...typography.caption,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  languageRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  langButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  langLabel: {
    ...typography.buttonSmall,
  },
  chevron: {
    fontSize: 24,
    fontWeight: '300',
  },
  legalDivider: {
    borderTopWidth: 1,
    marginVertical: spacing.xs,
  },
  syncBadgeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  syncBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F59E0B',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 6,
  },
  syncBadgeText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700' as const,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoPreview: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPlaceholderText: {
    ...typography.caption,
    textAlign: 'center',
  },
  logoActions: {
    gap: spacing.sm,
  },
  logoBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    minWidth: 100,
  },
  logoBtnText: {
    ...typography.buttonSmall,
    color: '#fff',
  },
  logoutButton: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  logoutText: {
    ...typography.button,
  },
  version: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
