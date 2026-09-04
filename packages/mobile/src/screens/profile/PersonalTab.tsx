import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Pressable,
  Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { COUNTRIES } from '../../types/pharmacy';
import { useButtonPress } from '../../hooks/useButtonPress';

interface Props {
  editName: string;
  setEditName: (v: string) => void;
  editSpecialty: string;
  editTreatment: string;
  setEditTreatment: (v: string) => void;
  editCountry: string;
  savingProfile: boolean;
  onSaveProfile: () => void;
  onOpenSpecialtyPicker: () => void;
  onOpenCountryPicker: () => void;
  currentPwd: string;
  setCurrentPwd: (v: string) => void;
  newPwd: string;
  setNewPwd: (v: string) => void;
  confirmPwd: string;
  setConfirmPwd: (v: string) => void;
  changingPwd: boolean;
  onChangePassword: () => void;
}

export default function PersonalTab({
  editName,
  setEditName,
  editSpecialty,
  editTreatment,
  setEditTreatment,
  editCountry,
  savingProfile,
  onSaveProfile,
  onOpenSpecialtyPicker,
  onOpenCountryPicker,
  currentPwd,
  setCurrentPwd,
  newPwd,
  setNewPwd,
  confirmPwd,
  setConfirmPwd,
  changingPwd,
  onChangePassword,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const savePress = useButtonPress();
  const changePwdPress = useButtonPress();

  const selectedCountry = COUNTRIES.find((c) => c.code === editCountry);

  const cardStyle = [
    styles.card,
    {
      backgroundColor: theme.surface,
      borderColor: theme.surfaceBorder,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {/* Edit Profile */}
      <View style={cardStyle}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {t('editProfile', 'Editar Perfil')}
        </Text>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            {t('fullName', 'Nome completo')}
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, borderColor: theme.surfaceBorder, color: theme.text }]}
            value={editName}
            onChangeText={setEditName}
            placeholder={t('fullName', 'Nome completo')}
            placeholderTextColor={theme.textMuted}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            {t('treatment', 'Tratamento')}
          </Text>
          <View style={styles.segment}>
            {[
              { value: '', label: t('treatmentNone', 'Nenhum') },
              { value: 'Dr.', label: t('treatmentDr', 'Dr.') },
              { value: 'Dra.', label: t('treatmentDra', 'Dra.') },
            ].map((opt) => {
              const selected = editTreatment === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value || 'none'}
                  style={[
                    styles.segmentOption,
                    {
                      backgroundColor: selected ? theme.primary : theme.background,
                      borderColor: selected ? theme.primary : theme.surfaceBorder,
                    },
                  ]}
                  onPress={() => setEditTreatment(opt.value)}
                  activeOpacity={0.7}>
                  <Text
                    style={[styles.segmentText, { color: selected ? '#fff' : theme.text }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            {t('specialty', 'Especialidade')}
          </Text>
          <TouchableOpacity
            style={[styles.input, styles.selectInput, { backgroundColor: theme.background, borderColor: theme.surfaceBorder }]}
            onPress={onOpenSpecialtyPicker}
            activeOpacity={0.7}>
            <Text style={[styles.selectText, { color: editSpecialty ? theme.text : theme.textMuted }]}>
              {editSpecialty || t('selectSpecialty', 'Selecionar especialidade')}
            </Text>
            <Text style={[styles.chevron, { color: theme.textMuted }]}>{'›'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            {t('country', 'Pais')}
          </Text>
          <TouchableOpacity
            style={[styles.input, styles.selectInput, { backgroundColor: theme.background, borderColor: theme.surfaceBorder }]}
            onPress={onOpenCountryPicker}
            activeOpacity={0.7}>
            <Text style={[styles.selectText, { color: editCountry ? theme.text : theme.textMuted }]}>
              {selectedCountry
                ? `${selectedCountry.flag} ${t(selectedCountry.labelKey)}`
                : t('selectCountry', 'Selecionar pais')}
            </Text>
            <Text style={[styles.chevron, { color: theme.textMuted }]}>{'›'}</Text>
          </TouchableOpacity>
        </View>

        <Animated.View
          style={{
            transform: [
              { scale: savePress.scale },
              {
                translateY: savePress.translateY.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 2],
                }),
              },
            ],
            shadowColor: theme.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 10,
            elevation: 6,
            borderRadius: borderRadius.md,
            marginTop: spacing.sm,
          }}>
          <Pressable
            onPressIn={savePress.onPressIn}
            onPressOut={savePress.onPressOut}
            onPress={onSaveProfile}
            disabled={savingProfile}>
            <LinearGradient
              colors={theme.primaryGradient as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.saveButton, savingProfile && styles.buttonDisabled]}>
              {savingProfile ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>{t('saveProfile', 'Salvar Perfil')}</Text>
              )}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>

      {/* Change Password */}
      <View style={cardStyle}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {t('changePassword', 'Alterar Senha')}
        </Text>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            {t('currentPassword', 'Senha Atual')}
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, borderColor: theme.surfaceBorder, color: theme.text }]}
            value={currentPwd}
            onChangeText={setCurrentPwd}
            placeholder={t('currentPassword', 'Senha Atual')}
            placeholderTextColor={theme.textMuted}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            {t('newPassword', 'Nova Senha')}
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, borderColor: theme.surfaceBorder, color: theme.text }]}
            value={newPwd}
            onChangeText={setNewPwd}
            placeholder={t('newPassword', 'Nova Senha')}
            placeholderTextColor={theme.textMuted}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            {t('confirmNewPassword', 'Confirmar Nova Senha')}
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, borderColor: theme.surfaceBorder, color: theme.text }]}
            value={confirmPwd}
            onChangeText={setConfirmPwd}
            placeholder={t('confirmNewPassword', 'Confirmar Nova Senha')}
            placeholderTextColor={theme.textMuted}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <Animated.View
          style={{
            transform: [
              { scale: changePwdPress.scale },
              {
                translateY: changePwdPress.translateY.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 2],
                }),
              },
            ],
            shadowColor: theme.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 10,
            elevation: 6,
            borderRadius: borderRadius.md,
            marginTop: spacing.sm,
          }}>
          <Pressable
            onPressIn={changePwdPress.onPressIn}
            onPressOut={changePwdPress.onPressOut}
            onPress={onChangePassword}
            disabled={changingPwd}>
            <LinearGradient
              colors={theme.primaryGradient as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.saveButton, changingPwd && styles.buttonDisabled]}>
              {changingPwd ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>{t('changePassword', 'Alterar Senha')}</Text>
              )}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
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
  sectionTitle: {
    ...typography.label,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
  },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segment: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  segmentText: {
    ...typography.body,
    fontWeight: '600',
  },
  selectText: {
    ...typography.body,
    flex: 1,
  },
  chevron: {
    fontSize: 24,
    fontWeight: '300',
  },
  saveButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  saveButtonText: {
    ...typography.button,
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
