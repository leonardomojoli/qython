// frontend/src/contexts/LanguageContext.js

import React, { createContext, useContext, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const { i18n } = useTranslation();

  const changeLanguage = useCallback((langCode) => {
    // A função agora SEMPRE salva no localStorage.
    // A lógica de salvar no backend será feita em outro lugar.
    i18n.changeLanguage(langCode);
    localStorage.setItem('i18nextLng', langCode);
  }, [i18n]);

  const loadUserLanguage = useCallback((langCode) => {
    if (langCode && i18n.language !== langCode) {
      i18n.changeLanguage(langCode);
    }
  }, [i18n]);

  return (
    <LanguageContext.Provider value={{ changeLanguage, loadUserLanguage, currentLanguage: i18n.language }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);