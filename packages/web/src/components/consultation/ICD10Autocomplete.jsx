// frontend/src/components/consultation/ICD10Autocomplete.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faTimes, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import styles from './ICD10Autocomplete.module.css';

import { API_URL as API_BASE_URL } from '../../config';

/**
 * ICD10Autocomplete - Search and select ICD-10 codes with auto-complete
 * Supports multiple selection with chips display
 */
function ICD10Autocomplete({
    selectedCodes = [],
    onSelect,
    onRemove,
    specialty = '',
    maxSelections = 10,
    disabled = false
}) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const inputRef = useRef(null);
    const dropdownRef = useRef(null);
    const debounceRef = useRef(null);

    // Debounced search
    const searchCodes = useCallback(async (searchQuery) => {
        if (searchQuery.length < 2) {
            setResults([]);
            return;
        }

        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                q: searchQuery,
                limit: '10',
                ...(specialty && { specialty })
            });

            const response = await fetch(`${API_BASE_URL}/icd10/search?${params}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                // Filter out already selected codes
                const filtered = data.filter(
                    item => !selectedCodes.some(s => s.code === item.code)
                );
                setResults(filtered);
            }
        } catch (error) {
            console.error('ICD-10 search error:', error);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, [specialty, selectedCodes]);

    // Handle input changes with debounce
    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (query.length >= 2) {
            debounceRef.current = setTimeout(() => {
                searchCodes(query);
            }, 300);
        } else {
            setResults([]);
        }

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [query, searchCodes]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target) &&
                !inputRef.current?.contains(event.target)
            ) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (item) => {
        if (selectedCodes.length >= maxSelections) {
            return;
        }
        onSelect(item);
        setQuery('');
        setResults([]);
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e) => {
        if (!isOpen || results.length === 0) {
            if (e.key === 'ArrowDown' && results.length > 0) {
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < results.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev > 0 ? prev - 1 : results.length - 1
                );
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && results[highlightedIndex]) {
                    handleSelect(results[highlightedIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setHighlightedIndex(-1);
                break;
            default:
                break;
        }
    };

    return (
        <div className={styles.container}>
            {/* Selected codes as chips */}
            {selectedCodes.length > 0 && (
                <div className={styles.chipsContainer}>
                    {selectedCodes.map((item) => (
                        <div key={item.code} className={styles.chip}>
                            <span className={styles.chipCode}>{item.code}</span>
                            <span className={styles.chipDesc}>{item.description}</span>
                            <button
                                type="button"
                                className={styles.chipRemove}
                                onClick={() => onRemove(item.code)}
                                disabled={disabled}
                                aria-label={`Remove ${item.code}`}
                            >
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Search input */}
            <div className={styles.inputWrapper}>
                <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
                <input
                    ref={inputRef}
                    type="text"
                    className={styles.input}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => query.length >= 2 && setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('searchICD10')}
                    disabled={disabled || selectedCodes.length >= maxSelections}
                    autoComplete="off"
                />
                {isLoading && (
                    <FontAwesomeIcon icon={faSpinner} spin className={styles.loadingIcon} />
                )}
            </div>

            {/* Dropdown results */}
            {isOpen && results.length > 0 && (
                <div ref={dropdownRef} className={styles.dropdown}>
                    {results.map((item, index) => (
                        <button
                            key={item.code}
                            type="button"
                            className={`${styles.dropdownItem} ${index === highlightedIndex ? styles.highlighted : ''}`}
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                        >
                            <span className={styles.itemCode}>{item.code}</span>
                            <span className={styles.itemDesc}>{item.description}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* No results message */}
            {isOpen && query.length >= 2 && !isLoading && results.length === 0 && (
                <div className={styles.noResults}>
                    {t('noICD10Results')}
                </div>
            )}
        </div>
    );
}

export default ICD10Autocomplete;
