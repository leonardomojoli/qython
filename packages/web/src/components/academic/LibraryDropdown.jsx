// frontend/src/components/academic/LibraryDropdown.js
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import styles from './LibraryDropdown.module.css';

function LibraryDropdown({ libraries, value, onChange, disabled }) {
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

  const handleSelect = (library) => {
    onChange(library);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled) setIsOpen(!isOpen);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const selectedLibrary = libraries.find(lib => lib.id === value?.id);

  return (
    <div className={styles.dropdownContainer} ref={dropdownRef}>
      <button
        type="button"
        className={`${styles.dropdownTrigger} ${isOpen ? styles.open : ''} ${disabled ? styles.disabled : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
      >
        <span className={selectedLibrary ? styles.selectedValue : styles.placeholder}>
          {selectedLibrary ? selectedLibrary.name : t('selectLibraryAsBase')}
        </span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`${styles.arrow} ${isOpen ? styles.arrowOpen : ''}`}
        />
      </button>

      {isOpen && !disabled && (
        <ul className={styles.dropdownMenu} role="listbox">
          <li
            className={`${styles.dropdownItem} ${!value ? styles.selected : ''}`}
            onClick={() => handleSelect(null)}
            role="option"
            aria-selected={!value}
          >
            {t('selectLibraryAsBase')}
          </li>
          {libraries.map((library) => (
            <li
              key={library.id}
              className={`${styles.dropdownItem} ${value?.id === library.id ? styles.selected : ''}`}
              onClick={() => handleSelect(library)}
              role="option"
              aria-selected={value?.id === library.id}
            >
              {library.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LibraryDropdown;
