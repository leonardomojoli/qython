// frontend/src/components/user/SecuritySection.js
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changePassword } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import styles from './Profile.module.css';

const SecuritySection = () => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addNotification(t('passwordsDoNotMatch'), 'error');
      return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      addNotification(t('passwordMinLength'), 'error');
      return;
    }
    setIsLoading(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      addNotification(t('passwordChangedSuccess'), 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      addNotification(error.message || t('errorChangingPassword'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="profile-section">
      <h3 className={styles['tab-section-title']}>{t('security')}</h3>
      <form onSubmit={handleSubmit}>
        <div className={styles.infoRow}>
          <label className={styles.infoLabel} htmlFor="currentPassword">{t('currentPassword')}</label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={styles.infoInput}
            required
            autoComplete="current-password"
          />
        </div>
        <div className={styles.infoRow}>
          <label className={styles.infoLabel} htmlFor="newPassword">{t('newPassword')}</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={styles.infoInput}
            required
            autoComplete="new-password"
          />
        </div>
        <div className={styles.infoRow}>
          <label className={styles.infoLabel} htmlFor="confirmPassword">{t('confirmNewPassword')}</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={styles.infoInput}
            required
            autoComplete="new-password"
          />
        </div>
        <div className={styles.editControls}>
          <button type="submit" className={`${styles['button-base']} ${styles['button-primary']}`} disabled={isLoading}>
            {isLoading ? t('saving') : t('changePassword')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SecuritySection;