// frontend/src/components/pharmacy/MedicationSearch.js
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './MedicationSearch.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faFilter, faPills, faCheck, faTimes, faExclamationTriangle, faThumbsUp, faThumbsDown, faChevronDown, faInfoCircle, faFilePrescription } from '@fortawesome/free-solid-svg-icons';
import { searchMedications, submitFeedback } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import { useUser } from '../../contexts/UserContext';
import FeedbackModal from '../shared/FeedbackModal';

function FilterDropdown({ options, value, onChange, placeholder, className }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find(o => o.value === value);
  const displayLabel = selected ? selected.label : placeholder;

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen); }
    else if (e.key === 'Escape') setIsOpen(false);
  };

  return (
    <div className={`${styles.filterDropdown} ${className || ''}`} ref={ref}>
      <button
        type="button"
        className={`${styles.filterTrigger} ${isOpen ? styles.filterTriggerOpen : ''} ${value ? styles.filterTriggerActive : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={value ? styles.filterSelectedValue : styles.filterPlaceholder}>
          {displayLabel}
        </span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`${styles.filterArrow} ${isOpen ? styles.filterArrowOpen : ''}`}
        />
      </button>
      {isOpen && (
        <ul className={styles.filterMenu} role="listbox">
          {placeholder && (
            <li
              className={`${styles.filterMenuItem} ${!value ? styles.filterMenuItemSelected : ''}`}
              onClick={() => handleSelect('')}
              role="option"
              aria-selected={!value}
            >
              {placeholder}
            </li>
          )}
          {options.map(o => (
            <li
              key={o.value}
              className={`${styles.filterMenuItem} ${value === o.value ? styles.filterMenuItemSelected : ''}`}
              onClick={() => handleSelect(o.value)}
              role="option"
              aria-selected={value === o.value}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const COUNTRIES = [
  // Latin America
  { code: 'br', flag: '\u{1F1E7}\u{1F1F7}', labelKey: 'brazil' },
  { code: 'uy', flag: '\u{1F1FA}\u{1F1FE}', labelKey: 'uruguay' },
  { code: 'ar', flag: '\u{1F1E6}\u{1F1F7}', labelKey: 'argentina' },
  { code: 'cl', flag: '\u{1F1E8}\u{1F1F1}', labelKey: 'chile' },
  { code: 'py', flag: '\u{1F1F5}\u{1F1FE}', labelKey: 'paraguay' },
  { code: 'bo', flag: '\u{1F1E7}\u{1F1F4}', labelKey: 'bolivia' },
  { code: 'co', flag: '\u{1F1E8}\u{1F1F4}', labelKey: 'colombia' },
  { code: 'mx', flag: '\u{1F1F2}\u{1F1FD}', labelKey: 'mexico' },
  { code: 'pe', flag: '\u{1F1F5}\u{1F1EA}', labelKey: 'peru' },
  { code: 'ec', flag: '\u{1F1EA}\u{1F1E8}', labelKey: 'ecuador' },
  // Europe
  { code: 'pt', flag: '\u{1F1F5}\u{1F1F9}', labelKey: 'portugal' },
  { code: 'es', flag: '\u{1F1EA}\u{1F1F8}', labelKey: 'spain' },
  { code: 'it', flag: '\u{1F1EE}\u{1F1F9}', labelKey: 'italy' },
  { code: 'de', flag: '\u{1F1E9}\u{1F1EA}', labelKey: 'germany' },
  { code: 'fr', flag: '\u{1F1EB}\u{1F1F7}', labelKey: 'france' },
  { code: 'ch', flag: '\u{1F1E8}\u{1F1ED}', labelKey: 'switzerland' },
  { code: 'gb', flag: '\u{1F1EC}\u{1F1E7}', labelKey: 'unitedKingdom' },
  // North America & Oceania
  { code: 'us', flag: '\u{1F1FA}\u{1F1F8}', labelKey: 'unitedStates' },
  { code: 'ca', flag: '\u{1F1E8}\u{1F1E6}', labelKey: 'canada' },
  { code: 'au', flag: '\u{1F1E6}\u{1F1FA}', labelKey: 'australia' },
];

function MedicationSearch() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const { user } = useUser();
  const [query, setQuery] = useState('');
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [govProgramOnly, setGovProgramOnly] = useState(false);
  const [therapeuticClass, setTherapeuticClass] = useState('');
  const [controlledType, setControlledType] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedMed, setSelectedMed] = useState(null);
  const [feedbackSent, setFeedbackSent] = useState({});
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [currentFeedbackMed, setCurrentFeedbackMed] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const debounceRef = useRef(null);
  const PAGE_SIZE = 50;

  const defaultCountry = COUNTRIES.find(c => c.code === user?.country)?.code || 'br';
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry);

  const doSearch = useCallback(async (searchQuery, gpOnly, thClass, ctrlType, country) => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: 0 };
      if (searchQuery) params.search = searchQuery;
      if (gpOnly) params.has_gov_program = true;
      if (thClass) params.therapeutic_class = thClass;
      if (ctrlType) params.controlled_type = ctrlType;
      if (country) params.country = country;
      if (i18n.language !== 'pt') params.lang = i18n.language;
      const data = await searchMedications(params);
      setMedications(data || []);
      setHasMore((data || []).length >= PAGE_SIZE);
      setHasSearched(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const params = { limit: PAGE_SIZE, offset: medications.length };
      if (query) params.search = query;
      if (govProgramOnly) params.has_gov_program = true;
      if (therapeuticClass) params.therapeutic_class = therapeuticClass;
      if (controlledType) params.controlled_type = controlledType;
      if (selectedCountry) params.country = selectedCountry;
      if (i18n.language !== 'pt') params.lang = i18n.language;
      const data = await searchMedications(params);
      const newData = data || [];
      setMedications(prev => [...prev, ...newData]);
      setHasMore(newData.length >= PAGE_SIZE);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  }, [medications.length, query, govProgramOnly, therapeuticClass, controlledType, selectedCountry]);

  useEffect(() => {
    doSearch('', false, '', '', selectedCountry);
  }, [doSearch, selectedCountry]);

  // Close modal on Escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') setSelectedMed(null);
    };
    if (selectedMed) {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [selectedMed]);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(val, govProgramOnly, therapeuticClass, controlledType, selectedCountry);
    }, 400);
  };

  const handleGovProgramToggle = () => {
    const newVal = !govProgramOnly;
    setGovProgramOnly(newVal);
    doSearch(query, newVal, therapeuticClass, controlledType, selectedCountry);
  };

  const handleCountryChange = (code) => {
    setSelectedCountry(code);
    doSearch(query, govProgramOnly, therapeuticClass, controlledType, code);
  };

  const handleClassChange = (val) => {
    setTherapeuticClass(val);
    doSearch(query, govProgramOnly, val, controlledType, selectedCountry);
  };

  const handleControlledChange = (val) => {
    setControlledType(val);
    doSearch(query, govProgramOnly, therapeuticClass, val, selectedCountry);
  };

  const buildMedContent = (med) => {
    const parts = [`${med.name} (${med.active_principle})`];
    if (med.presentation) parts.push(`Apresentação: ${med.presentation}`);
    if (med.therapeutic_class) parts.push(`Classe: ${med.therapeutic_class}`);
    if (med.usual_posology) parts.push(`Posologia: ${med.usual_posology}`);
    if (med.max_daily_dose) parts.push(`Dose máx: ${med.max_daily_dose}`);
    if (med.common_indications) parts.push(`Indicações: ${med.common_indications}`);
    if (med.pregnancy_category) parts.push(`Gestação: ${med.pregnancy_category}`);
    return parts.join(' | ');
  };

  const handleMedLike = async (med) => {
    try {
      await submitFeedback({
        feedback_type: 'like',
        content_type: 'medication_detail',
        content_id: String(med.id),
        original_content: buildMedContent(med),
        feedback_text: '',
        contact_permission: false,
      });
      setFeedbackSent(prev => ({ ...prev, [med.id]: 'like' }));
      addNotification(t('feedbackSentSuccess'), 'success');
    } catch (error) {
      console.error('Failed to submit medication like:', error);
      addNotification(t('feedbackSentError'), 'error');
    }
  };

  const handleMedDislike = (med) => {
    setCurrentFeedbackMed(med);
    setIsFeedbackModalOpen(true);
  };

  const handleFeedbackSubmit = async (comment, contactPermission) => {
    if (!currentFeedbackMed) return;
    try {
      await submitFeedback({
        feedback_type: 'dislike',
        content_type: 'medication_detail',
        content_id: String(currentFeedbackMed.id),
        original_content: buildMedContent(currentFeedbackMed),
        feedback_text: comment,
        contact_permission: contactPermission,
      });
      setFeedbackSent(prev => ({ ...prev, [currentFeedbackMed.id]: 'dislike' }));
      addNotification(t('feedbackSentSuccess'), 'success');
    } catch (error) {
      console.error('Failed to submit medication dislike:', error);
      addNotification(t('feedbackSentError'), 'error');
    } finally {
      setIsFeedbackModalOpen(false);
      setCurrentFeedbackMed(null);
    }
  };

  const handleTakeToRx = (med) => {
    navigate('/consultation-manager', {
      state: {
        activeTab: 'prescription',
        prefillMedication: {
          name: med.name,
          presentation: med.presentation,
          activePrinciple: med.active_principle,
        },
      },
    });
  };

  const getBadgeStyle = (prog) => {
    switch (prog.code) {
      case 'farmacia_popular': return styles.badgeFree;
      case 'cbaf':             return styles.badgeCbaf;
      case 'ceaf':             return styles.badgeCeaf;
      default:                 return prog.all_items_free ? styles.badgeFree : styles.badgeSubsidy;
    }
  };

  const getShortName = (name) => {
    const idx = name.indexOf(' - ');
    return idx > 0 ? name.substring(0, idx) : name;
  };

  const renderBadge = (med, compact = false) => {
    const programs = med.government_programs || [];

    // Dynamic badges from API government_programs (already filtered by selected country on backend)
    if (programs.length > 0) {
      return programs.map(prog => {
        const displayName = compact ? getShortName(prog.name) : prog.name;
        return (
          <span
            key={prog.code}
            className={`${styles.badge} ${getBadgeStyle(prog)}`}
          >
            {prog.all_items_free
              ? `${t('govProgramFreeLabel')} - ${displayName}`
              : `${t('govProgramSubsidyLabel')} - ${displayName}`
            }
          </span>
        );
      });
    }

    // Fallback: Farmácia Popular badge only when Brazil is selected
    if (selectedCountry === 'br' && med.farmacia_popular) {
      return (
        <span className={`${styles.badge} ${styles.badgeFree}`}>
          {t('govProgramFreeBr')}
        </span>
      );
    }

    return null;
  };

  const renderControlledBadge = (med) => {
    if (!med.controlled_type) return null;
    return (
      <span className={styles.controlledBadge}>
        {med.controlled_type.toUpperCase()}
      </span>
    );
  };

  return (
    <div className={styles.container}>
      {/* Search bar */}
      <div className={styles.searchRow}>
        <div className={styles.searchInputWrapper}>
          <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('searchMedications')}
            value={query}
            onChange={handleQueryChange}
          />
        </div>

        <button
          className={`${styles.fpToggle} ${govProgramOnly ? styles.fpToggleActive : ''}`}
          onClick={handleGovProgramToggle}
          title={t('governmentProgram')}
        >
          <FontAwesomeIcon icon={govProgramOnly ? faCheck : faPills} />
          <span>{t('govProgramFilter')}</span>
        </button>
      </div>

      {/* Filters */}
      <div className={styles.filtersRow}>
        <FontAwesomeIcon icon={faFilter} className={styles.filterIcon} />

        <FilterDropdown
          className={styles.countryFilter}
          options={COUNTRIES.map(c => ({ value: c.code, label: `${c.flag} ${t(c.labelKey)}` }))}
          value={selectedCountry}
          onChange={handleCountryChange}
        />

        <FilterDropdown
          options={[
            { value: 'Anti-hipertensivo', label: 'Anti-hipertensivo' },
            { value: 'Antidiabético', label: 'Antidiabético' },
            { value: 'Analgésico', label: 'Analgésico' },
            { value: 'Anti-inflamatório', label: 'Anti-inflamatório' },
            { value: 'Antibiótico', label: 'Antibiótico' },
            { value: 'Antidepressivo', label: 'Antidepressivo' },
            { value: 'Ansiolítico', label: 'Ansiolítico' },
            { value: 'Antipsicótico', label: 'Antipsicótico' },
            { value: 'Anticonvulsivante', label: 'Anticonvulsivante' },
            { value: 'Gastroprotetor', label: 'Gastroprotetor' },
            { value: 'Hipolipemiante', label: 'Hipolipemiante' },
            { value: 'Broncodilatador', label: 'Broncodilatador' },
            { value: 'Corticosteroide', label: 'Corticosteroide' },
            { value: 'Anticoagulante', label: 'Anticoagulante' },
            { value: 'Hormônio', label: 'Hormônio' },
            { value: 'Anti-histamínico', label: 'Anti-histamínico' },
            { value: 'Contraceptivo', label: 'Contraceptivo' },
          ]}
          value={therapeuticClass}
          onChange={handleClassChange}
          placeholder={t('therapeuticClass')}
        />

        <FilterDropdown
          options={[
            { value: 'c1', label: 'C1' },
            { value: 'c2', label: 'C2' },
            { value: 'b1', label: 'B1' },
            { value: 'b2', label: 'B2' },
          ]}
          value={controlledType}
          onChange={handleControlledChange}
          placeholder={t('controlledMedication')}
        />
      </div>

      {/* Results */}
      {loading && <div className={styles.loading}>{t('loading')}...</div>}

      {!loading && hasSearched && medications.length === 0 && (
        <div className={styles.emptyState}>
          <FontAwesomeIcon icon={faPills} className={styles.emptyIcon} />
          <p>{t('noMedicationsFound')}</p>
        </div>
      )}

      {!loading && medications.length > 0 && (
        <>
          <div className={styles.resultsGrid}>
            {medications.map(med => (
              <div
                key={med.id}
                className={styles.medCard}
                onClick={() => setSelectedMed(med)}
              >
                <div className={styles.medCardHeader}>
                  <h4 className={styles.medName}>{med.name}</h4>
                  <div className={styles.badges}>
                    {renderBadge(med, true)}
                    {renderControlledBadge(med)}
                  </div>
                </div>
                <p className={styles.medPrinciple}>{med.active_principle}</p>
                <p className={styles.medPresentation}>{med.presentation}</p>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className={styles.loadMoreWrapper}>
              <button
                className={styles.loadMoreBtn}
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? `${t('loading')}...` : t('loadMore')}
              </button>
            </div>
          )}
        </>
      )}

      {!hasSearched && !loading && (
        <div className={styles.emptyState}>
          <FontAwesomeIcon icon={faSearch} className={styles.emptyIcon} />
          <p>{t('searchMedicationsHint')}</p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedMed && (
        <div className={styles.modalOverlay} onClick={() => setSelectedMed(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>{selectedMed.name}</h3>
                <p className={styles.modalSubtitle}>{selectedMed.active_principle}</p>
              </div>
              <div className={styles.modalHeaderRight}>
                <div className={`${styles.badges} ${styles.badgesRow}`}>
                  {renderBadge(selectedMed)}
                  {renderControlledBadge(selectedMed)}
                </div>
                <button className={styles.modalClose} onClick={() => setSelectedMed(null)}>
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            </div>

            <div className={styles.modalBody}>
              {selectedMed.presentation && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t('presentation')}:</span>
                  <span>{selectedMed.presentation}</span>
                </div>
              )}
              {selectedMed.common_brands && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t('commonBrands')}:</span>
                  <span className={styles.brandsText}>{selectedMed.common_brands}</span>
                </div>
              )}
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t('therapeuticClass')}:</span>
                <span>{selectedMed.therapeutic_class || '-'}</span>
              </div>
              {selectedMed.administration_route && selectedMed.administration_route !== 'oral' && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t('administrationRoute')}:</span>
                  <span>{selectedMed.administration_route}</span>
                </div>
              )}
              {selectedMed.common_indications && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t('commonIndications')}:</span>
                  <span>{selectedMed.common_indications}</span>
                </div>
              )}
              {selectedMed.usual_posology && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t('usualPosology')}:</span>
                  <span>{selectedMed.usual_posology}</span>
                </div>
              )}
              {selectedMed.max_daily_dose && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t('maxDose')}:</span>
                  <span>{selectedMed.max_daily_dose}</span>
                </div>
              )}
              {selectedMed.pregnancy_category && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t('pregnancyCategory')}:</span>
                  <span className={styles.pregInfo}>
                    <span className={`${styles.pregBadge} ${styles[`preg${selectedMed.pregnancy_category}`] || ''}`}>
                      {selectedMed.pregnancy_category}
                    </span>
                    <span className={styles.pregDescription}>
                      {t(`pregnancyCat${selectedMed.pregnancy_category}`)}
                    </span>
                  </span>
                </div>
              )}

              {(selectedMed.renal_adjustment || selectedMed.hepatic_adjustment) && (
                <div className={styles.adjustmentRow}>
                  {selectedMed.renal_adjustment && (
                    <span className={styles.adjustmentBadge}>
                      <FontAwesomeIcon icon={faExclamationTriangle} />
                      {t('renalAdjustment')}
                    </span>
                  )}
                  {selectedMed.hepatic_adjustment && (
                    <span className={styles.adjustmentBadge}>
                      <FontAwesomeIcon icon={faExclamationTriangle} />
                      {t('hepaticAdjustment')}
                    </span>
                  )}
                </div>
              )}

              {selectedMed.requires_prescription && (
                <div className={styles.detailRow}>
                  <FontAwesomeIcon icon={faCheck} className={styles.rxIcon} />
                  <span>{t('requiresPrescription')}</span>
                </div>
              )}

              {selectedMed.government_programs?.some(p => p.code === 'ceaf') && (
                <div className={styles.ceafInfo}>
                  <FontAwesomeIcon icon={faInfoCircle} />
                  <div>
                    <strong>{t('ceafAuthRequired')}</strong>
                    <p>{t('ceafAuthDescription')}</p>
                  </div>
                </div>
              )}

              {/* Take to Prescription button */}
              <button
                className={styles.takeToRxBtn}
                onClick={() => handleTakeToRx(selectedMed)}
                title={t('takeToRxTooltip')}
              >
                <FontAwesomeIcon icon={faFilePrescription} />
                <span>{t('takeToRx')}</span>
              </button>

              {/* Feedback buttons */}
              <div className={styles.feedbackSection}>
                <span className={styles.feedbackLabel}>{t('medDataCorrect')}</span>
                <div className={styles.feedbackButtons}>
                  <button
                    className={`${styles.feedbackBtn} ${feedbackSent[selectedMed.id] === 'like' ? styles.feedbackBtnActive : ''}`}
                    onClick={() => handleMedLike(selectedMed)}
                    disabled={!!feedbackSent[selectedMed.id]}
                    title={t('like')}
                  >
                    <FontAwesomeIcon icon={faThumbsUp} />
                  </button>
                  <button
                    className={`${styles.feedbackBtn} ${styles.feedbackBtnDislike} ${feedbackSent[selectedMed.id] === 'dislike' ? styles.feedbackBtnActive : ''}`}
                    onClick={() => handleMedDislike(selectedMed)}
                    disabled={!!feedbackSent[selectedMed.id]}
                    title={t('dislike')}
                  >
                    <FontAwesomeIcon icon={faThumbsDown} />
                  </button>
                </div>
                {feedbackSent[selectedMed.id] && (
                  <span className={styles.feedbackThanks}>{t('medFeedbackThanks')}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => { setIsFeedbackModalOpen(false); setCurrentFeedbackMed(null); }}
        onSubmit={handleFeedbackSubmit}
      />
    </div>
  );
}

export default MedicationSearch;
