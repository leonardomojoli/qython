// frontend/src/components/shared/LanguageSelector.js

import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import './LanguageSelector.css';

const languages = [
  { code: 'pt', name: 'Português', flagClass: 'fi fi-br' },
  { code: 'en', name: 'English', flagClass: 'fi fi-us' },
  { code: 'es', name: 'Español', flagClass: 'fi fi-es' },
];

const LanguageSelector = () => {
  const { changeLanguage, currentLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const activeLanguage = languages.find(lang => currentLanguage.startsWith(lang.code)) || languages[0];

  const handleLanguageChange = (langCode) => {
    changeLanguage(langCode);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="language-selector" ref={dropdownRef}>
      <button className="language-selector-button" onClick={() => setIsOpen(!isOpen)}>
        <span className={`${activeLanguage.flagClass} current-flag-icon`}></span>
      </button>
      {isOpen && (
        <ul className="language-dropdown">
          {languages.map((lang) => (
            <li key={lang.code} onClick={() => handleLanguageChange(lang.code)}>
              <span className={`${lang.flagClass} flag-icon`}></span>
              <span>{lang.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LanguageSelector;
