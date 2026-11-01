import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styles from './AvatarGeneratorModal.module.css';
import { api } from '../../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faMagicWandSparkles, faClockRotateLeft, faCamera, faSpinner, faCrown } from '@fortawesome/free-solid-svg-icons';
import ConfirmationModal from '../shared/ConfirmationModal';
import UpgradeModal from '../shared/UpgradeModal';

const AvatarGeneratorModal = ({
  isOpen,
  onClose,
  prompt,
  setPrompt,
  handleGenerateAvatar,
  isGenerating,
  tempAvatar,
  setTempAvatar,
  handleSaveAvatar,
  handleDiscardAvatar,
  avatarHistory,
  handleRemoveAvatar, // Para deleção da aba settings (não usado aqui)
  deleteAvatarDirectly, // Função para deletar diretamente após confirmação local
  addNotification,
  refreshUser // Para atualizar após upload
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('upload');
  const [isUploading, setIsUploading] = useState(false);
  const [presets, setPresets] = useState([]);
  const fileInputRef = useRef(null);
  const [avatarToDelete, setAvatarToDelete] = useState(null);
  const [avatarToDeleteIsPreset, setAvatarToDeleteIsPreset] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [avatarLimits, setAvatarLimits] = useState(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  // Fetch presets on mount
  useEffect(() => {
    if (isOpen && presets.length === 0) {
      const fetchPresets = async () => {
        try {
          const response = await api.get('/user/avatar-presets');
          const allPresets = Object.values(response.data.presets || {}).flat().map(p => p.url);
          setPresets(allPresets);
        } catch (error) {
          console.error('Failed to load presets', error);
        }
      };
      fetchPresets();
    }
  }, [isOpen, presets.length]);

  // Fetch avatar history limits
  useEffect(() => {
    if (isOpen) {
      const fetchLimits = async () => {
        try {
          const response = await api.get('/user/avatar-history/limits');
          setAvatarLimits(response.data);
        } catch (error) {
          console.error('Failed to load avatar limits', error);
        }
      };
      fetchLimits();
    }
  }, [isOpen, avatarHistory]);

  // Combined history without duplicates (presets + user history)
  const combinedHistory = useMemo(() => {
    const seen = new Set();
    const combined = [];
    // Add presets first
    presets.forEach(url => {
      if (!seen.has(url)) {
        seen.add(url);
        combined.push({ url, isPreset: true });
      }
    });
    // Add user history
    (avatarHistory || []).forEach(url => {
      if (!seen.has(url)) {
        seen.add(url);
        combined.push({ url, isPreset: false });
      }
    });
    return combined;
  }, [presets, avatarHistory]);

  // Handle file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      addNotification(t('invalidFileType') || 'Formato inválido. Use JPG, PNG, GIF ou WebP.', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB
      addNotification(t('fileTooLarge') || 'Arquivo muito grande. Máximo 5MB.', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/user/upload-profile-picture', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      addNotification(t('uploadSuccess') || 'Foto enviada com sucesso!', 'success');
      if (refreshUser) refreshUser();
      onClose();
    } catch (error) {
      addNotification(error.response?.data?.detail || t('uploadError') || 'Erro ao enviar foto', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Handlers para confirmação de deleção
  const openDeleteConfirmation = (avatarUrl, isPreset) => {
    setAvatarToDelete(avatarUrl);
    setAvatarToDeleteIsPreset(isPreset);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (avatarToDelete) {
      if (avatarToDeleteIsPreset) {
        // Para presets, apenas remove do estado local
        setPresets(prev => prev.filter(url => url !== avatarToDelete));
      } else if (deleteAvatarDirectly) {
        // Para avatares gerados, deleta do servidor
        await deleteAvatarDirectly(avatarToDelete);
      }
    }
    setIsDeleteModalOpen(false);
    setAvatarToDelete(null);
    setAvatarToDeleteIsPreset(false);
  };

  const cancelDelete = () => {
    setIsDeleteModalOpen(false);
    setAvatarToDelete(null);
    setAvatarToDeleteIsPreset(false);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose} aria-label="Fechar">
          ×
        </button>

        <h2 className={styles.modalTitle}>{t('changeAvatar') || 'Alterar Avatar'}</h2>

        {/* TABS */}
        <div className={styles.modalTabs}>
          <button
            className={`${styles.modalTab} ${activeTab === 'upload' ? styles.active : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <FontAwesomeIcon icon={faUpload} />
            <span>{t('upload') || 'Upload'}</span>
          </button>
          <button
            className={`${styles.modalTab} ${activeTab === 'generate' ? styles.active : ''}`}
            onClick={() => setActiveTab('generate')}
          >
            <FontAwesomeIcon icon={faMagicWandSparkles} />
            <span>{t('generateAI') || 'IA'}</span>
          </button>
          <button
            className={`${styles.modalTab} ${activeTab === 'history' ? styles.active : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <FontAwesomeIcon icon={faClockRotateLeft} />
            <span>{t('history') || 'Histórico'}</span>
          </button>
        </div>

        <div className={styles.tabContent}>

          {/* TAB: UPLOAD */}
          {activeTab === 'upload' && (
            <div className={styles.uploadContainer}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/jpeg,image/png,image/gif,image/webp"
                style={{ display: 'none' }}
              />
              <div
                className={styles.uploadDropzone}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <FontAwesomeIcon icon={faSpinner} spin className={styles.uploadIcon} />
                ) : (
                  <FontAwesomeIcon icon={faCamera} className={styles.uploadIcon} />
                )}
                <p className={styles.uploadText}>
                  {isUploading
                    ? (t('uploading') || 'Enviando...')
                    : (t('clickToUpload') || 'Clique para enviar uma foto')
                  }
                </p>
                <span className={styles.uploadHint}>JPG, PNG, GIF ou WebP • Máx. 5MB</span>
              </div>
            </div>
          )}

          {/* TAB: GENERATE */}
          {activeTab === 'generate' && (
            <div className={styles.generateContainer}>
              <p className={styles.generateHint}>
                {t('aiAvatarHint') || 'Descreva o avatar que você deseja criar com IA'}
              </p>
              <div className={styles.promptRow}>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t('enterPromptToGenerateAvatar') || 'Ex: médico futurista em estilo cyberpunk'}
                  className={styles.promptInput}
                  disabled={isGenerating}
                />
                <button
                  onClick={handleGenerateAvatar}
                  className={styles.generateButton}
                  disabled={isGenerating || !prompt.trim()}
                >
                  {isGenerating ? (
                    <FontAwesomeIcon icon={faSpinner} spin />
                  ) : (
                    <FontAwesomeIcon icon={faMagicWandSparkles} />
                  )}
                </button>
              </div>

              {/* Preview do avatar gerado */}
              {tempAvatar && (
                <div className={styles.previewContainer}>
                  <img src={tempAvatar} alt="Preview" className={styles.previewImage} />
                  <div className={styles.previewActions}>
                    <button onClick={handleSaveAvatar} className={styles.saveButton}>
                      {t('save') || 'Salvar'}
                    </button>
                    <button onClick={handleDiscardAvatar} className={styles.discardButton}>
                      {t('discard') || 'Descartar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: HISTORY */}
          {activeTab === 'history' && (
            <div className={styles.historyContainer}>
              {/* Avatar usage counter */}
              {avatarLimits && (
                <div className={styles.usageCounter}>
                  <div className={styles.usageInfo}>
                    <span className={styles.usageText}>
                      {avatarLimits.used}/{avatarLimits.max} {t('avatarSlots') || 'slots'}
                    </span>
                    <div className={styles.usageBarTrack}>
                      <div
                        className={`${styles.usageBarFill} ${avatarLimits.used >= avatarLimits.max ? styles.usageBarFull : avatarLimits.used >= avatarLimits.max * 0.8 ? styles.usageBarWarning : ''}`}
                        style={{ width: `${Math.min((avatarLimits.used / avatarLimits.max) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  {avatarLimits.plan === 'free' && (
                    <button
                      className={styles.upgradeChip}
                      onClick={() => setIsUpgradeModalOpen(true)}
                    >
                      <FontAwesomeIcon icon={faCrown} />
                      {t('getMore') || 'Obter mais'}
                    </button>
                  )}
                </div>
              )}

              {/* Upgrade banner when at limit */}
              {avatarLimits && avatarLimits.used >= avatarLimits.max && avatarLimits.plan === 'free' && (
                <div className={styles.upgradeBanner} onClick={() => setIsUpgradeModalOpen(true)}>
                  <FontAwesomeIcon icon={faCrown} className={styles.upgradeBannerIcon} />
                  <div>
                    <strong>{t('avatarLimitReached') || 'Galeria cheia'}</strong>
                    <p>{t('upgradeForMoreAvatars') || 'Faça upgrade para salvar até 50 avatares'}</p>
                  </div>
                </div>
              )}

              {combinedHistory.length > 0 ? (
                <div className={styles.historyGrid}>
                  {combinedHistory.map((item, index) => (
                    <div key={`${item.isPreset ? 'preset' : 'history'}-${index}`} className={styles.historyItem}>
                      <img
                        src={item.url}
                        alt={`Avatar ${index + 1}`}
                        className={styles.historyImage}
                        onClick={() => setTempAvatar(item.url)}
                      />
                      <button
                        className={styles.removeButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          openDeleteConfirmation(item.url, item.isPreset);
                        }}
                        title={t('remove') || 'Remover'}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyMessage}>{t('noAvatarHistory') || 'Nenhum avatar no histórico'}</p>
              )}

              {/* Preview após selecionar do histórico */}
              {tempAvatar && activeTab === 'history' && (
                <div className={styles.previewContainer}>
                  <img src={tempAvatar} alt="Preview" className={styles.previewImage} />
                  <div className={styles.previewActions}>
                    <button onClick={handleSaveAvatar} className={styles.saveButton}>
                      {t('setAsProfile') || 'Definir como Perfil'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        title="Excluir Avatar"
        message="Tem certeza que deseja excluir este avatar do histórico? Esta ação não pode ser desfeita."
        confirmButtonText="Excluir"
        cancelButtonText="Cancelar"
      />

      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        onUpgrade={() => {
          setIsUpgradeModalOpen(false);
          onClose();
          navigate('/pricing');
        }}
        feature="avatar_history"
        message={t('avatarUpgradeMessage') || `Seu plano atual permite ${avatarLimits?.max || 5} avatares. Faça upgrade para expandir sua galeria.`}
      />
    </div>
  );
};

export default AvatarGeneratorModal;
