// frontend/src/components/user/Profile.js

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api, getUserInfo, generateAvatar as apiGenerateAvatar, getUserAchievements, uploadDoctorLogo, deleteDoctorLogo, updateTrainingDataPreference } from '../../api';
import styles from './Profile.module.css';
import { useUser } from '../../contexts/UserContext';
import { useNotification } from '../../contexts/NotificationContext';
import { useTranslation } from 'react-i18next';

// Importar os novos componentes
import ProfileHeader from './ProfileHeader';
import PersonalInformationSection from './PersonalInformationSection';
import GeneralSettingsSection from './GeneralSettingsSection';
import BillingSection from '../billing/BillingSection';
import ConnectorsSection from '../connectors/ConnectorsSection';
import SecuritySection from './SecuritySection';
import AvatarGeneratorModal from './AvatarGeneratorModal';
import ComprehensiveStatistics from './ComprehensiveStatistics';
import ErrorBoundary from '../shared/ErrorBoundary';
import VerificationSection from './VerificationSection';
import ConfirmationModal from '../shared/ConfirmationModal';
import PrivacySection from './PrivacySection';
import defaultAvatar from '../../assets/default-profile.png';
import { useLanguage } from '../../contexts/LanguageContext';
import { resetQythonTour } from '../shared/QythonTour';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRoute, faCertificate, faImage, faStamp, faUpload, faTrash, faShieldAlt } from '@fortawesome/free-solid-svg-icons';

import { WEB_URL as BASE_URL } from '../../config';

// Componente para a aba de Conquistas (pode ser movido para seu próprio arquivo)
const AchievementsSection = ({ achievements }) => {
  const { t } = useTranslation();
  return (
    <div className="profile-section">
      <h3 className={styles['tab-section-title']}>{t('achievements')}</h3>
      {achievements.length > 0 ? (
        <div className={styles.achievementsGrid}>
          {achievements.map(ach => (
            <div key={ach.id} className={styles.achievementBadge} title={`${ach.badge_code}\n${new Date(ach.achieved_at).toLocaleDateString()}`}>
              {/* Adicione um ícone de badge aqui */}
              <span>{ach.badge_code}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.noHistoryMessage}>{t('noAchievementsYet')}</p>
      )}
    </div>
  );
};

// Componente para a aba de Estatísticas (pode ser movido para seu próprio arquivo)
function Profile({ isSidebarOpen }) {
  const { t } = useTranslation();
  const { user, setUser, refreshUser } = useUser();
  const { addNotification } = useNotification();
  const { changeLanguage, currentLanguage } = useLanguage();

  const handleLanguageSelectChange = (e) => {
    const newLang = e.target.value;
    changeLanguage(newLang);
  };

  // Nova estrutura de abas
  const [activeTab, setActiveTab] = useState('perfil');

  // Estados para os dados
  const [achievements, setAchievements] = useState([]);
  const [preview, setPreview] = useState(defaultAvatar);

  // Estados do Modal de Avatar
  const [avatarGeneratorOpen, setAvatarGeneratorOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [tempAvatar, setTemporaryAvatar] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [avatarHistory, setAvatarHistory] = useState([]);
  const [presets, setPresets] = useState([]); // Presets para combinar com histórico
  const [avatarToDelete, setAvatarToDelete] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Training Data Opt-Out state
  const [trainingDataOptOut, setTrainingDataOptOut] = useState(user?.training_data_opt_out || false);
  const [isUpdatingTrainingPref, setIsUpdatingTrainingPref] = useState(false);

  // Doctor Logo states
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  // Carregamento inicial dos dados
  useEffect(() => {
    const fetchProfileData = async () => {
      if (user?.id) {
        try {
          const [achievementsData, avatarHistoryData, presetsData] = await Promise.all([
            getUserAchievements(),
            api.get('/user/avatar-history'),
            api.get('/user/avatar-presets')
          ]);
          setAchievements(achievementsData);
          setAvatarHistory(avatarHistoryData.data);
          // Flatten presets into array of URLs
          const allPresets = Object.values(presetsData.data.presets || {}).flat().map(p => p.url);
          setPresets(allPresets);
        } catch (error) {
          console.error('Erro ao carregar dados do perfil:', error);
          addNotification(t('errorLoadingProfileData'), 'error');
        }
      }
    };
    fetchProfileData();
  }, [user, addNotification, t]);

  // Atualiza a preview da imagem de perfil
  useEffect(() => {
    if (user?.profile_picture) {
      let pictureUrl;
      if (user.profile_picture.startsWith('http')) {
        pictureUrl = user.profile_picture;
      } else if (user.profile_picture.includes('presets')) {
        // Se for um preset, usa o caminho relativo direto (assumindo que começa com / ou images/)
        pictureUrl = user.profile_picture.startsWith('/') ? user.profile_picture : `/${user.profile_picture}`;
      } else {
        pictureUrl = `${BASE_URL}/static/uploads/profile_pictures/${user.profile_picture}`;
      }
      setPreview(pictureUrl);
    } else {
      setPreview(defaultAvatar);
    }
  }, [user?.profile_picture]);

  // Sync training data opt-out state when user data changes
  useEffect(() => {
    if (user) {
      setTrainingDataOptOut(user.training_data_opt_out || false);
    }
  }, [user?.training_data_opt_out]);

  // Training data preference toggle handler
  const handleTrainingDataToggle = async () => {
    const newOptOut = !trainingDataOptOut;
    setIsUpdatingTrainingPref(true);
    try {
      await updateTrainingDataPreference(newOptOut);
      setTrainingDataOptOut(newOptOut);
      addNotification(
        newOptOut ? t('trainingDataOptOutEnabled') : t('trainingDataOptOutDisabled'),
        'success'
      );
    } catch (err) {
      addNotification(err.message || t('errorUpdatingPreference'), 'error');
    } finally {
      setIsUpdatingTrainingPref(false);
    }
  };

  // Funções do Modal de Avatar (movidas para cá)
  const handleGenerateAvatar = async () => {
    if (!prompt) return addNotification(t('enterPromptToGenerateAvatar'), 'error');
    setIsGenerating(true);
    try {
      const response = await apiGenerateAvatar(prompt, true);
      setTemporaryAvatar(response.temp_avatar_url);
      addNotification(t('avatarGeneratedSuccess'), 'success');
    } catch (err) {
      addNotification(err.message || t('errorGeneratingAvatar'), 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAvatar = async () => {
    if (!tempAvatar) {
      addNotification(t('noAvatarSelected'), 'error');
      return;
    }

    // Send the full URL or filename depending on type
    let filename;
    if (tempAvatar.includes('/presets/') || tempAvatar.includes('/images/avatars/')) {
      // It's a preset - send full URL to backend
      filename = tempAvatar;
    } else {
      // It's a generated avatar - extract just the filename
      filename = tempAvatar.split('/').pop();
    }

    try {
      await api.post('/user/save-avatar', { filename });
      const userData = await getUserInfo();
      setUser(userData); // Atualiza o contexto global
      const historyData = await api.get('/user/avatar-history');
      setAvatarHistory(historyData.data);
      setTemporaryAvatar(null);
      setAvatarGeneratorOpen(false);
      addNotification(t('avatarSavedSuccess'), 'success');
    } catch (err) {
      addNotification(err.message || t('errorSavingAvatar'), 'error');
    }
  };

  const handleRemoveAvatar = (avatarUrl) => {
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      addNotification(t('errorRemovingAvatar'), 'error');
      return;
    }
    setAvatarToDelete(avatarUrl);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteAvatar = async () => {
    if (!avatarToDelete) return;

    const filename = avatarToDelete.split('/').pop();

    try {
      await api.post('/user/avatar-history/delete', { filename });
      setAvatarHistory(prev => prev.filter(url => url !== avatarToDelete));
      addNotification(t('avatarRemovedFromHistory'), 'success');
    } catch (err) {
      addNotification(err.message || t('errorRemovingAvatar'), 'error');
    } finally {
      setIsDeleteModalOpen(false);
      setAvatarToDelete(null);
    }
  };

  const cancelDeleteAvatar = () => {
    setIsDeleteModalOpen(false);
    setAvatarToDelete(null);
  };

  // Função para deletar avatar diretamente (usada pelo AvatarGeneratorModal após sua própria confirmação)
  const deleteAvatarDirectly = async (avatarUrl) => {
    if (!avatarUrl || typeof avatarUrl !== 'string') return false;
    const filename = avatarUrl.split('/').pop();
    try {
      await api.post('/user/avatar-history/delete', { filename });
      setAvatarHistory(prev => prev.filter(url => url !== avatarUrl));
      addNotification(t('avatarRemovedFromHistory'), 'success');
      return true;
    } catch (err) {
      addNotification(err.message || t('errorRemovingAvatar'), 'error');
      return false;
    }
  };

  // Doctor Logo handlers
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      addNotification(t('logoMaxSize'), 'error');
      return;
    }

    setIsUploadingLogo(true);
    try {
      const data = await uploadDoctorLogo(file);
      await refreshUser();
      addNotification(t('logoUploaded'), 'success');
    } catch (err) {
      addNotification(err?.response?.data?.detail || t('uploadError'), 'error');
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleLogoRemove = async () => {
    try {
      await deleteDoctorLogo();
      await refreshUser();
      addNotification(t('logoRemoved'), 'success');
    } catch (err) {
      addNotification(err?.response?.data?.detail || t('uploadError'), 'error');
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'perfil':
        return (
          <>
            <VerificationSection />
            <div data-tour="profile-personal-info">
              <PersonalInformationSection />
            </div>
          </>
        );
      case 'estatisticas':
        return (
          <div data-tour="profile-stats">
            <ErrorBoundary>
              <ComprehensiveStatistics />
            </ErrorBoundary>
          </div>
        );
      case 'faturamento':
        // Wrap BillingSection directly to better control tour highlight area
        return (
          <div data-tour="profile-billing" style={{ display: 'inline-block', width: '100%' }}>
            <BillingSection user={user} balance={user?.dracmas} />
          </div>
        );
      case 'configuracoes':
        return (
          <>
            <div className={styles.settingsBlock}>
              <ConnectorsSection />
            </div>
            <div className={styles.settingsBlock}>
              <GeneralSettingsSection />
            </div>
            <div className={styles.settingsBlock}>
              <SecuritySection />
            </div>

            {/* Doctor Logo Section */}
            <div className={styles.settingsBlock}>
              <h4 className={styles.sectionHeader}>
                <FontAwesomeIcon icon={faStamp} className={styles.sectionIcon} />
                {t('doctorLogo')}
              </h4>
              <p className={styles.sectionDescription}>
                {t('doctorLogoHelper')}
              </p>

              <div className={styles.logoSection}>
                <div className={styles.logoPreview}>
                  {user?.doctor_logo ? (
                    <img
                      src={`${BASE_URL}/static/uploads/doctor_logos/${user.doctor_logo}`}
                      alt="Logo"
                      className={styles.logoImage}
                    />
                  ) : (
                    <div className={styles.logoPlaceholder}>
                      <FontAwesomeIcon icon={faStamp} />
                      <span>Logo</span>
                    </div>
                  )}
                </div>

                <div className={styles.logoActions}>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={handleLogoUpload}
                    style={{ display: 'none' }}
                  />
                  <button
                    className={styles.logoUploadButton}
                    onClick={() => logoInputRef.current?.click()}
                    disabled={isUploadingLogo}
                  >
                    <FontAwesomeIcon icon={faUpload} />
                    {isUploadingLogo ? t('uploading') : t('uploadLogo')}
                  </button>
                  {user?.doctor_logo && (
                    <button
                      className={styles.logoRemoveButton}
                      onClick={handleLogoRemove}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                      {t('removeLogo')}
                    </button>
                  )}
                  <span className={styles.logoHint}>{t('logoMaxSize')}</span>
                </div>
              </div>
            </div>

            {/* Privacy & LGPD Section */}
            <PrivacySection />

            {/* Avatar History Section - Presets + User History */}
            {(presets.length > 0 || avatarHistory.length > 0) && (
              <div className={styles.settingsBlock}>
                <h4 className={styles.sectionHeader}>
                  <FontAwesomeIcon icon={faImage} className={styles.sectionIcon} />
                  {t('avatarHistory')}
                </h4>
                <p className={styles.sectionDescription}>
                  {t('avatarHistoryDescription')}
                </p>
                <div className={styles.avatarHistoryGrid}>
                  {/* Render presets first */}
                  {presets.map((presetUrl, idx) => (
                    <div key={`preset-${idx}`} className={styles.avatarItem}>
                      <img
                        src={presetUrl}
                        alt={`Preset ${idx + 1}`}
                        className={`${styles.avatarImage} ${preview === presetUrl ? styles.avatarImageSelected : ''}`}
                        onClick={async () => {
                          try {
                            await api.post('/user/save-avatar', { filename: presetUrl });
                            const userData = await getUserInfo();
                            setUser(userData);
                            addNotification(t('avatarSetAsProfile'), 'success');
                          } catch (err) {
                            addNotification(t('errorSettingAvatar'), 'error');
                          }
                        }}
                        title={t('clickToSetAsProfile')}
                      />
                      <button
                        className={styles.avatarRemoveButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPresets(prev => prev.filter((_, i) => i !== idx));
                        }}
                        title={t('remove')}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {/* Render user history */}
                  {avatarHistory.map((avatarUrl, idx) => (
                    <div key={`history-${idx}`} className={styles.avatarItem}>
                      <img
                        src={avatarUrl}
                        alt={`Avatar ${idx + 1}`}
                        className={`${styles.avatarImage} ${preview === avatarUrl ? styles.avatarImageSelected : ''}`}
                        onClick={async () => {
                          try {
                            const filename = avatarUrl.split('/').pop();
                            await api.post('/user/save-avatar', { filename });
                            const userData = await getUserInfo();
                            setUser(userData);
                            addNotification(t('avatarSetAsProfile'), 'success');
                          } catch (err) {
                            addNotification(t('errorSettingAvatar'), 'error');
                          }
                        }}
                        title={t('clickToSetAsProfile')}
                      />
                      <button
                        className={styles.avatarRemoveButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveAvatar(avatarUrl);
                        }}
                        title={t('remove')}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tour & Onboarding Section */}
            <div className={styles.settingsBlock}>
              <h4 style={{ color: '#fff', marginBottom: '15px', fontSize: '1rem' }}>
                <FontAwesomeIcon icon={faRoute} style={{ marginRight: '8px', color: '#03dac6' }} />
                Tour & Ajuda
              </h4>
              <button
                onClick={() => {
                  resetQythonTour();
                  addNotification('Tour resetado! Visite o dashboard para vê-lo novamente.', 'success');
                }}
                data-tour="profile-reset-tour"
                style={{
                  padding: '12px 20px',
                  background: 'rgba(3, 218, 198, 0.1)',
                  border: '1px solid #03dac6',
                  borderRadius: '8px',
                  color: '#03dac6',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
              >
                <FontAwesomeIcon icon={faRoute} />
                Rever Tour Inicial
              </button>
            </div>

            {/* Specialist Badge Section (Future Feature) */}
            {user?.occupation === 'Médico' && (
              <div className={styles.settingsBlock}>
                <h4 style={{ color: '#fff', marginBottom: '15px', fontSize: '1rem' }}>
                  <FontAwesomeIcon icon={faCertificate} style={{ marginRight: '8px', color: '#bb86fc' }} />
                  Verificação de Especialidade
                </h4>
                <div style={{
                  padding: '15px',
                  background: 'rgba(187, 134, 252, 0.1)',
                  border: '1px solid rgba(187, 134, 252, 0.3)',
                  borderRadius: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ color: '#fff', margin: 0, fontSize: '0.95rem' }}>Badge de Especialista Verificado</p>
                      <p style={{ color: '#888', margin: '5px 0 0', fontSize: '0.8rem' }}>
                        Verifique seu RQE para exibir um selo de especialista no seu perfil.
                      </p>
                    </div>
                    <span style={{
                      padding: '6px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '20px',
                      color: '#666',
                      fontSize: '0.75rem'
                    }}>
                      Em breve
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`${styles.profileContainer} ${!isSidebarOpen ? styles.adjustedForClosedSidebar : ''}`}>
      <div className={styles.centeredContainer}>

        <ProfileHeader
          user={user}
          preview={preview}
          onAvatarClick={() => setAvatarGeneratorOpen(true)}
        />

        <div className={styles.tabContainer} data-tour="profile-tabs">
          <button data-tour="profile-tab-perfil" className={activeTab === 'perfil' ? styles.activeTab : ''} onClick={() => setActiveTab('perfil')}>{t('profile')}</button>
          <button data-tour="profile-tab-estatisticas" className={activeTab === 'estatisticas' ? styles.activeTab : ''} onClick={() => setActiveTab('estatisticas')}>{t('usageStatistics')}</button>
          <button data-tour="profile-tab-faturamento" className={activeTab === 'faturamento' ? styles.activeTab : ''} onClick={() => setActiveTab('faturamento')}>{t('billing')}</button>
          <button data-tour="profile-tab-configuracoes" className={activeTab === 'configuracoes' ? styles.activeTab : ''} onClick={() => setActiveTab('configuracoes')}>{t('settings')}</button>
        </div>

        <div key={activeTab} className={styles.tabContent}>
          {renderContent()}
        </div>

        <AvatarGeneratorModal
          isOpen={avatarGeneratorOpen}
          onClose={() => setAvatarGeneratorOpen(false)}
          prompt={prompt}
          setPrompt={setPrompt}
          handleGenerateAvatar={handleGenerateAvatar}
          isGenerating={isGenerating}
          tempAvatar={tempAvatar}
          setTempAvatar={setTemporaryAvatar}
          handleSaveAvatar={handleSaveAvatar}
          handleDiscardAvatar={() => setTemporaryAvatar(null)}
          avatarHistory={avatarHistory}
          handleRemoveAvatar={handleRemoveAvatar}
          deleteAvatarDirectly={deleteAvatarDirectly}
          addNotification={addNotification}
          refreshUser={refreshUser}
        />

        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={cancelDeleteAvatar}
          onConfirm={confirmDeleteAvatar}
          title={t('deleteAvatarTitle') || 'Excluir Avatar'}
          message={t('deleteAvatarMessage') || 'Tem certeza que deseja excluir este avatar do histórico? Esta ação não pode ser desfeita.'}
          confirmButtonText={t('delete') || 'Excluir'}
          cancelButtonText={t('cancel') || 'Cancelar'}
        />
      </div>
    </div>
  );
}

export default Profile;
