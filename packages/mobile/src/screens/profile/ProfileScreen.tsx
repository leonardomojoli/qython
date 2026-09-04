import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Alert,
  Modal,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useUser } from '../../contexts/UserContext';
import {
  logout,
  updateProfile,
  changePassword,
} from '../../services/auth';
import { typography } from '../../theme/typography';
import { alpha } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { COUNTRIES } from '../../types/pharmacy';
import SpecialtyPicker from '../../components/ambulatory/SpecialtyPicker';
import TabBar from '../../components/pharmacy/TabBar';
import AvatarGeneratorModal from '../../components/profile/AvatarGeneratorModal';
import AchievementsSection from '../../components/profile/AchievementsSection';
import StatisticsSection from '../../components/profile/StatisticsSection';
import VerificationSection from '../../components/profile/VerificationSection';
import PersonalTab from './PersonalTab';
import BillingTab from './BillingTab';
import SettingsTab from './SettingsTab';

interface Props {
  onLogout: () => void;
}

export default function ProfileScreen({ onLogout }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { user, refreshUser } = useUser();

  const [activeTab, setActiveTab] = useState('personal');

  // ─── Edit Profile state ───────────────────────────────────
  const [editName, setEditName] = useState(user?.full_name || '');
  const [editSpecialty, setEditSpecialty] = useState(user?.specialty || '');
  const [editTreatment, setEditTreatment] = useState(user?.treatment || '');
  const [editCountry, setEditCountry] = useState(user?.country || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [specialtyPickerVisible, setSpecialtyPickerVisible] = useState(false);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);

  // ─── Avatar generator state ──────────────────────────────
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  // ─── Change Password state ────────────────────────────────
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  useEffect(() => {
    if (user) {
      setEditName(user.full_name || '');
      setEditSpecialty(user.specialty || '');
      setEditTreatment(user.treatment || '');
      setEditCountry(user.country || '');
    }
  }, [user]);

  // ─── Handlers ─────────────────────────────────────────────

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateProfile({
        full_name: editName.trim(),
        specialty: editSpecialty || undefined,
        treatment: editTreatment,
        country: editCountry || undefined,
      });
      await refreshUser();
      Alert.alert('', t('profileUpdatedSuccess'));
    } catch {
      Alert.alert('', t('errorUpdatingProfile'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPwd.length < 8) {
      Alert.alert('', t('passwordTooShort'));
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert('', t('passwordsDoNotMatch'));
      return;
    }
    setChangingPwd(true);
    try {
      await changePassword(currentPwd, newPwd);
      Alert.alert('', t('passwordChangedSuccess'));
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch {
      Alert.alert('', t('errorChangingPassword'));
    } finally {
      setChangingPwd(false);
    }
  };

  const tabs = [
    { key: 'personal', label: t('profile', 'Perfil') },
    { key: 'stats', label: t('statsTab', 'Estatisticas') },
    { key: 'billing', label: t('billingTab', 'Faturamento') },
    { key: 'settings', label: t('settingsTab', 'Config') },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Avatar & Name Header */}
      <View style={styles.profileHeader}>
        <TouchableOpacity
          onPress={() => setAvatarModalVisible(true)}
          activeOpacity={0.85}
          style={[
            styles.avatarTouch,
            {
              shadowColor: theme.primary,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 16,
              elevation: 10,
            },
          ]}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                {
                  backgroundColor: alpha(theme.primary, 0.18),
                  borderColor: alpha(theme.primary, 0.35),
                },
              ]}>
              <Text style={[styles.avatarInitial, { color: theme.primary }]}>
                {user?.full_name?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View
            style={[
              styles.avatarEditBadge,
              {
                backgroundColor: theme.primary,
                borderColor: theme.background,
                shadowColor: theme.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.5,
                shadowRadius: 6,
                elevation: 6,
              },
            ]}>
            <Text style={styles.avatarEditIcon}>{'\u270F'}</Text>
          </View>
        </TouchableOpacity>
        <Text style={[styles.name, { color: theme.text }]}>
          {user?.full_name || '--'}
        </Text>
        <Text style={[styles.email, { color: theme.textSecondary }]}>
          {user?.email || '--'}
        </Text>
      </View>

      {/* TabBar */}
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      <View style={styles.tabContent}>
        {activeTab === 'personal' && <VerificationSection />}
        {activeTab === 'personal' && (
          <PersonalTab
            editName={editName}
            setEditName={setEditName}
            editSpecialty={editSpecialty}
            editTreatment={editTreatment}
            setEditTreatment={setEditTreatment}
            editCountry={editCountry}
            savingProfile={savingProfile}
            onSaveProfile={handleSaveProfile}
            onOpenSpecialtyPicker={() => setSpecialtyPickerVisible(true)}
            onOpenCountryPicker={() => setCountryPickerVisible(true)}
            currentPwd={currentPwd}
            setCurrentPwd={setCurrentPwd}
            newPwd={newPwd}
            setNewPwd={setNewPwd}
            confirmPwd={confirmPwd}
            setConfirmPwd={setConfirmPwd}
            changingPwd={changingPwd}
            onChangePassword={handleChangePassword}
          />
        )}
        {activeTab === 'stats' && (
          <>
            <AchievementsSection />
            <StatisticsSection />
          </>
        )}
        {activeTab === 'billing' && <BillingTab />}
        {activeTab === 'settings' && <SettingsTab onLogout={handleLogout} />}
      </View>

      {/* Pickers (mounted conditionally) */}
      <SpecialtyPicker
        visible={specialtyPickerVisible}
        onClose={() => setSpecialtyPickerVisible(false)}
        onSelect={(s) => setEditSpecialty(s)}
      />

      <CountryPicker
        visible={countryPickerVisible}
        onClose={() => setCountryPickerVisible(false)}
        onSelect={(code) => setEditCountry(code)}
      />

      {/* Avatar Generator Modal */}
      <AvatarGeneratorModal
        visible={avatarModalVisible}
        onClose={() => setAvatarModalVisible(false)}
        onAvatarChanged={() => {
          refreshUser();
          setAvatarModalVisible(false);
        }}
      />
    </View>
  );
}

// ─── Country Picker Modal ─────────────────────────────────────

function CountryPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (code: string) => void;
}) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const handleSelect = (code: string) => {
    onSelect(code);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[pickerStyles.container, { backgroundColor: theme.background }]}>
        <View style={[pickerStyles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[pickerStyles.headerButton, { color: theme.textMuted }]}>
              {t('cancel', 'Cancelar')}
            </Text>
          </TouchableOpacity>
          <Text style={[pickerStyles.headerTitle, { color: theme.text }]}>
            {t('country', 'Pais')}
          </Text>
          <View style={pickerStyles.headerSpacer} />
        </View>
        <FlatList
          data={COUNTRIES}
          keyExtractor={(item) => item.code}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[pickerStyles.item, { borderBottomColor: theme.surfaceBorder }]}
              onPress={() => handleSelect(item.code)}
              activeOpacity={0.7}>
              <Text style={[pickerStyles.itemText, { color: theme.text }]}>
                {item.flag} {t(item.labelKey)}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  headerButton: {
    ...typography.body,
  },
  headerSpacer: {
    width: 60,
  },
  item: {
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
  },
  itemText: {
    ...typography.body,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatarTouch: {
    borderRadius: 44,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
  },
  avatarEditIcon: {
    color: '#fff',
    fontSize: 12,
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  name: {
    ...typography.h2,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
  },
  email: {
    ...typography.bodySmall,
  },
  tabContent: {
    flex: 1,
  },
});
