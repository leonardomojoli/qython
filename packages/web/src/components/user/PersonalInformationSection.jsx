// frontend/src/components/user/PersonalInformationSection.js
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../contexts/UserContext';
import { updateUserProfile } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import styles from '../user/Profile.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit } from '@fortawesome/free-solid-svg-icons';
import ProfileUpdateRequestModal from './ProfileUpdateRequestModal';

const PersonalInformationSection = () => {
  const { t } = useTranslation();
  const { user, setUser, fetchUserInfo } = useUser();
  const { addNotification } = useNotification();

  const [isEditing, setIsEditing] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateRequestType, setUpdateRequestType] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    treatment: '',
    email: '',
    phone_number: '',
    occupation: '', // Adicionar outros campos conforme necessário
    university: '',
    period: '',
    matricula: '',
    identifier_type: '',
    identifier_number: ''
  });

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || '',
        treatment: user.treatment || '',
        email: user.email || '',
        phone_number: user.phone_number || '',
        occupation: user.occupation || '',
        university: user.university || '',
        period: user.period || '',
        matricula: user.matricula || '',
        identifier_type: user.identifier_type || '',
        identifier_number: user.identifier_number || '',
      });
    }
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveChanges = async () => {
    try {
      // Apenas envia campos que foram alterados e são relevantes para o backend
      const dataToUpdate = {};
      if (formData.full_name !== user.full_name) dataToUpdate.full_name = formData.full_name;
      if (formData.treatment !== (user.treatment || '')) dataToUpdate.treatment = formData.treatment;
      if (formData.email !== user.email) dataToUpdate.email = formData.email;
      if (formData.phone_number !== user.phone_number) dataToUpdate.phone_number = formData.phone_number;
      // Adicionar lógica para outros campos se eles forem editáveis
      // Ex: occupation, university, etc. Se esses não são editáveis aqui, não os inclua.

      if (Object.keys(dataToUpdate).length === 0) {
        addNotification(t('noChangesToSave'), 'info');
        setIsEditing(false);
        return;
      }

      const updatedUser = await updateUserProfile(dataToUpdate);
      setUser(updatedUser); // Atualiza o contexto global do usuário
      addNotification(t('profileUpdatedSuccess'), 'success');
      setIsEditing(false);
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      addNotification(error.message || t('errorUpdatingProfile'), 'error');
    }
  };

  const openUpdateModal = (type) => {
    setUpdateRequestType(type);
    setIsUpdateModalOpen(true);
  };

  const handleRequestCreated = () => {
    // Refresh user info after a request is created/approved
    if (fetchUserInfo) fetchUserInfo();
  };

  const renderInfoField = (label, value, fieldName, type = "text", readOnly = !isEditing, placeholder = "", updateType = null) => (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}:</span>
      {isEditing && !readOnly ? (
        <input
          type={type}
          name={fieldName}
          value={formData[fieldName]}
          onChange={handleInputChange}
          className={styles.infoInput}
          placeholder={placeholder}
        />
      ) : (
        <div className={styles.infoValueContainer}>
          <span className={styles.infoValue}>{value || '-'}</span>
          {updateType && (
            <button
              onClick={() => openUpdateModal(updateType)}
              className={styles.updateFieldButton}
              title={t('requestUpdate', 'Solicitar atualização')}
            >
              <FontAwesomeIcon icon={faEdit} />
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (!user) return <p>{t('loadingUserInformation')}</p>;

  return (
    <div className="profile-section"> {/* Esta classe deve corresponder à .tabContent em Profile.module.css */}
      <h3 className={styles['tab-section-title']}>{t('personalInformation')}</h3>

      <div className={styles.personalInfoContainer}>
        {renderInfoField(t('fullName'), user.full_name, 'full_name', "text", !isEditing, t('fullNamePlaceholder'))}
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>{t('treatment', 'Tratamento')}:</span>
          {isEditing ? (
            <select
              name="treatment"
              value={formData.treatment}
              onChange={handleInputChange}
              className={styles.infoInput}
            >
              <option value="">{t('treatmentNone', 'Nenhum')}</option>
              <option value="Dr.">{t('treatmentDr', 'Dr.')}</option>
              <option value="Dra.">{t('treatmentDra', 'Dra.')}</option>
            </select>
          ) : (
            <div className={styles.infoValueContainer}>
              <span className={styles.infoValue}>{user.treatment || '-'}</span>
            </div>
          )}
        </div>
        {renderInfoField(t('email'), user.email, 'email', "email", !isEditing, t('emailPlaceholder'))}
        {renderInfoField(t('phone'), user.phone_number, 'phone_number', "tel", !isEditing, t('phonePlaceholder'))}
        {renderInfoField(t('occupation'), user.occupation, 'occupation', "text", true)} {/* Ocupação não editável aqui */}

        {user.occupation === 'Estudante de Medicina' && (
          <>
            {renderInfoField(t('university'), user.university, 'university', "text", true, "", 'university_change')}
            {renderInfoField(t('period'), user.period, 'period', "text", true, "", 'period_change')}
            {renderInfoField(t('enrollment'), user.matricula, 'matricula', "text", true)}
          </>
        )}
        {user.occupation === 'Médico' && (
          <>
            {renderInfoField(t('identifier'), `${user.identifier_type || ''} ${user.identifier_number || ''}`.trim(), 'identifier', "text", true)}
          </>
        )}

        {/* Button for students to upgrade to doctor */}
        {user.occupation === 'Estudante de Medicina' && (
          <div className={styles.upgradeSection}>
            <button
              onClick={() => openUpdateModal('occupation_upgrade')}
              className={`${styles['button-base']} ${styles['button-upgrade']}`}
            >
              {t('upgradeToDoctor', 'Se formou? Atualize para Médico')}
            </button>
          </div>
        )}
      </div>

      <div className={styles.editControls}>
        {isEditing ? (
          <>
            <button onClick={handleSaveChanges} className={`${styles['button-base']} ${styles['button-primary']}`}>
              {t('saveChanges')}
            </button>
            <button onClick={() => {
              setIsEditing(false);
              // Reseta o formData para os valores originais do usuário ao cancelar
              if (user) {
                setFormData({
                  full_name: user.full_name || '',
                  treatment: user.treatment || '',
                  email: user.email || '',
                  phone_number: user.phone_number || '',
                  occupation: user.occupation || '',
                  university: user.university || '',
                  period: user.period || '',
                  matricula: user.matricula || '',
                  identifier_type: user.identifier_type || '',
                  identifier_number: user.identifier_number || '',
                });
              }
            }} className={`${styles['button-base']} ${styles['button-neutral']}`}>
              {t('cancel')}
            </button>
          </>
        ) : (
          <button onClick={() => setIsEditing(true)} className={`${styles['button-base']} ${styles['button-secondary']}`}>
            {t('editInformation')}
          </button>
        )}
      </div>

      {/* Profile Update Request Modal */}
      <ProfileUpdateRequestModal
        isOpen={isUpdateModalOpen}
        onClose={() => {
          setIsUpdateModalOpen(false);
          setUpdateRequestType(null);
        }}
        user={user}
        requestType={updateRequestType}
        onRequestCreated={handleRequestCreated}
      />
    </div>
  );
};

export default PersonalInformationSection;
