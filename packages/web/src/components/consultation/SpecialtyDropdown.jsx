// frontend/src/components/consultation/SpecialtyDropdown.js
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import styles from './SpecialtyDropdown.module.css';
import { SPECIALTIES } from '@qython/shared/src/ambulatory/specialties';

function SpecialtyDropdown({ value, onChange, id, dataTour }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (specialty) => {
    onChange(specialty);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(!isOpen);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className={styles.dropdownContainer} ref={dropdownRef}>
      <button
        type="button"
        id={id}
        data-tour={dataTour}
        className={`${styles.dropdownTrigger} ${isOpen ? styles.open : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={value ? styles.selectedValue : styles.placeholder}>
          {value ? t(value) : t('selectSpecialtyOption')}
        </span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`${styles.arrow} ${isOpen ? styles.arrowOpen : ''}`}
        />
      </button>

      {isOpen && (
        <ul className={styles.dropdownMenu} role="listbox">
          <li
            className={`${styles.dropdownItem} ${!value ? styles.selected : ''}`}
            onClick={() => handleSelect('')}
            role="option"
            aria-selected={!value}
          >
            {t('selectSpecialtyOption')}
          </li>
          {SPECIALTIES.map((specialty) => (
            <li
              key={specialty}
              className={`${styles.dropdownItem} ${value === specialty ? styles.selected : ''}`}
              onClick={() => handleSelect(specialty)}
              role="option"
              aria-selected={value === specialty}
            >
              {t(specialty)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SpecialtyDropdown;
