// frontend/src/components/pharmacy/InteractionChecker.js
import React, { useState, useCallback } from 'react';
import styles from './InteractionChecker.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faTimes, faSearch, faExclamationTriangle,
  faExclamationCircle, faInfoCircle, faCheckCircle, faBan
} from '@fortawesome/free-solid-svg-icons';
import { searchMedications, checkDrugInteractions } from '../../api';

const SEVERITY_CONFIG = {
  contraindicated: { icon: faBan, color: '#e74c3c', label: 'interactionContraindicated' },
  severe: { icon: faExclamationTriangle, color: '#e67e22', label: 'interactionSevere' },
  moderate: { icon: faExclamationCircle, color: '#f1c40f', label: 'interactionModerate' },
  mild: { icon: faInfoCircle, color: '#3498db', label: 'interactionMild' },
};

function InteractionChecker() {
  const { t, i18n } = useTranslation();
  const [selectedMeds, setSelectedMeds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [interactions, setInteractions] = useState(null);
  const [checking, setChecking] = useState(false);
  const [searchTimeout, setSearchTimeoutState] = useState(null);

  const handleSearch = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const params = { search: query, limit: 10 };
      if (i18n.language !== 'pt') params.lang = i18n.language;
      const data = await searchMedications(params);
      // Deduplicate by active_principle for interaction checking
      const seen = new Set();
      const unique = (data || []).filter(m => {
        const key = m.active_principle?.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setSearchResults(unique);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeoutState(setTimeout(() => handleSearch(val), 300));
  };

  const addMedication = (med) => {
    const principle = med.active_principle?.toLowerCase();
    if (selectedMeds.some(m => m.active_principle?.toLowerCase() === principle)) return;
    setSelectedMeds(prev => [...prev, med]);
    setSearchQuery('');
    setSearchResults([]);
    setInteractions(null);
  };

  const removeMedication = (index) => {
    setSelectedMeds(prev => prev.filter((_, i) => i !== index));
    setInteractions(null);
  };

  const handleCheckInteractions = async () => {
    if (selectedMeds.length < 2) return;
    setChecking(true);
    try {
      const principles = selectedMeds.map(m => m.active_principle);
      const data = await checkDrugInteractions(principles);
      setInteractions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setChecking(false);
    }
  };

  const renderSeverityCard = (interaction, index) => {
    const config = SEVERITY_CONFIG[interaction.severity] || SEVERITY_CONFIG.mild;
    return (
      <div
        key={index}
        className={styles.interactionCard}
        style={{ borderLeftColor: config.color }}
      >
        <div className={styles.interactionHeader}>
          <FontAwesomeIcon icon={config.icon} style={{ color: config.color }} />
          <span className={styles.severityLabel} style={{ color: config.color }}>
            {t(config.label)}
          </span>
          <span className={styles.interactionPair}>
            {interaction.active_principle_a} + {interaction.active_principle_b}
          </span>
        </div>
        <p className={styles.interactionDesc}>{interaction.description}</p>
        {interaction.mechanism && (
          <div className={styles.interactionDetail}>
            <span className={styles.detailLabel}>{t('interactionMechanism')}:</span>
            <span>{interaction.mechanism}</span>
          </div>
        )}
        {interaction.clinical_management && (
          <div className={styles.interactionDetail}>
            <span className={styles.detailLabel}>{t('interactionManagement')}:</span>
            <span>{interaction.clinical_management}</span>
          </div>
        )}
        {interaction.evidence_level && (
          <div className={styles.interactionMeta}>
            {interaction.source && <span>{interaction.source}</span>}
            <span>{interaction.evidence_level}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* Selected medications */}
      <div className={styles.selectedMeds}>
        {selectedMeds.map((med, index) => (
          <div key={index} className={styles.selectedPill}>
            <span className={styles.pillName}>{med.name}</span>
            <span className={styles.pillPrinciple}>({med.active_principle})</span>
            <button
              className={styles.pillRemove}
              onClick={() => removeMedication(index)}
              aria-label={t('remove')}
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        ))}
      </div>

      {/* Search to add */}
      <div className={styles.addSection}>
        <div className={styles.searchWrapper}>
          <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('addMedication')}
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>

        {searchResults.length > 0 && (
          <div className={styles.dropdown}>
            {searchResults.map(med => (
              <button
                key={med.id}
                className={styles.dropdownItem}
                onClick={() => addMedication(med)}
              >
                <span className={styles.dropdownName}>{med.name}</span>
                <span className={styles.dropdownPrinciple}>{med.active_principle}</span>
                {med.farmacia_popular && (
                  <span className={styles.fpBadge}>FP</span>
                )}
              </button>
            ))}
          </div>
        )}

        {searching && <div className={styles.searchingHint}>{t('loading')}...</div>}
      </div>

      {/* Check button */}
      <button
        className={styles.checkButton}
        onClick={handleCheckInteractions}
        disabled={selectedMeds.length < 2 || checking}
      >
        {checking ? t('loading') + '...' : t('checkInteractionsButton')}
      </button>

      {/* Results */}
      {interactions && (
        <div className={styles.results}>
          {interactions.interactions && interactions.interactions.length > 0 ? (
            <>
              <h4 className={styles.resultsTitle}>
                {interactions.interactions.length} {t('interactionsFound')}
              </h4>
              {interactions.interactions.map((inter, i) => renderSeverityCard(inter, i))}
            </>
          ) : (
            <div className={styles.noInteractions}>
              <FontAwesomeIcon icon={faCheckCircle} className={styles.noInteractionsIcon} />
              <p>{t('noInteractionsFound')}</p>
            </div>
          )}
        </div>
      )}

      {!interactions && selectedMeds.length === 0 && (
        <div className={styles.hint}>
          <FontAwesomeIcon icon={faPlus} className={styles.hintIcon} />
          <p>{t('interactionCheckerHint')}</p>
        </div>
      )}
    </div>
  );
}

export default InteractionChecker;
