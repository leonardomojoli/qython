// frontend/src/components/user/GeneralSettingsSection.js

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useUser } from '../../contexts/UserContext'; // Import useUser
import { useNotification } from '../../contexts/NotificationContext'; // Import useNotification
import ConsultaDefinitions from '../consultation/ConsultaDefinitions';
import styles from '../user/Profile.module.css';

const GeneralSettingsSection = () => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { currentLanguage, changeLanguage } = useLanguage();
  const { user, updatePreferences, autosaveEnabled } = useUser(); // Get autosave state
  const { addNotification } = useNotification(); // For feedback

  const handleThemeChange = (newThemeValue) => {
    setTheme(newThemeValue); // ThemeContext handles backend update
  };

  const handleLanguageChange = (e) => {
    changeLanguage(e.target.value); // LanguageContext handles backend update
  };

  const handleAutosaveChange = async (e) => {
    const newEnabled = e.target.checked;
    if (user) { // Only update if user is logged in
      try {
        await updatePreferences({ autosave_preference: newEnabled });
        addNotification(t('autosavePreferenceUpdated'), 'success');
      } catch (error) {
        console.error('Error updating autosave preference:', error);
        addNotification(t('errorUpdatingAutosave'), 'error');
        // Optionally revert UI checkbox state here if backend fails
      }
    }
  };

  return (
    <div className="profile-section"> {/* Ensure this class matches .tabContent for styling */}
      <h3 className={styles['tab-section-title']}>{t('generalSettings')}</h3>

      <div className={styles['settings-subsection']}>
        <h4>{t('layoutAppearance')}</h4>
        {/* ... theme options ... */}
        <div className={styles['theme-options']}>
          <label>
            <input
              type="radio"
              name="theme"
              value="light"
              checked={theme === 'light'}
              onChange={() => handleThemeChange('light')}
            />
            <span></span> {/* Adicionado para o estilo customizado */}
            {t('lightTheme')}
          </label>
          <label>
            <input
              type="radio"
              name="theme"
              value="dark"
              checked={theme === 'dark'}
              onChange={() => handleThemeChange('dark')}
            />
            <span></span> {/* Adicionado para o estilo customizado */}
            {t('darkTheme')}
          </label>
        </div>
      </div>

      <div className={styles['settings-subsection']}>
        <h4>{t('language')}</h4>
        {/* ... language select ... */}
        <select value={currentLanguage} onChange={handleLanguageChange}>
          <option value="pt">{t('portuguesePTBR')}</option>
          <option value="en">{t('englishUS')}</option>
          <option value="es">{t('spanishLA')}</option>
        </select>
      </div>

      {/* Subseção "Salvamento Automático" */}
      <div className={styles['settings-subsection']}>
        <h4>{t('automaticSaving')}</h4> {/* Add this key to translation files */}
        <div className={styles['theme-options']}> {/* Reuse theme-options for layout */}
          <label>
            <input
              type="checkbox"
              name="autosave"
              checked={autosaveEnabled}
              onChange={handleAutosaveChange}
              disabled={!user} // Disable if no user
            />
            <span></span> {/* For custom checkbox style */}
            {t('enableAutosave')} {/* Add this key to translation files */}
          </label>
        </div>
      </div>

      <ConsultaDefinitions />
    </div>
  );
};

export default GeneralSettingsSection;
