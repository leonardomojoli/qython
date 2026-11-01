// frontend/src/components/pharmacy/SupplySearch.js
import React, { useState, useCallback, useRef, useEffect } from 'react';
import styles from './SupplySearch.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faFilter, faMedkit, faCheck, faTimes, faInfoCircle, faThumbsUp, faThumbsDown, faChevronDown } from '@fortawesome/free-solid-svg-icons';
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

const SUPPLY_CATEGORIES = [
  { value: 'Insumo para Diabetes', labelKey: 'supplyCategories_diabetes' },
  { value: 'Insumo para Ostomia', labelKey: 'supplyCategories_ostomy' },
  { value: 'Material de Curativo', labelKey: 'supplyCategories_wound' },
  { value: 'OPM — Mobilidade', labelKey: 'supplyCategories_mobility' },
  { value: 'OPM — Órteses e Próteses', labelKey: 'supplyCategories_prosthetics' },
  { value: 'Sondas e Cateteres', labelKey: 'supplyCategories_catheters' },
  { value: 'Nutrição', labelKey: 'supplyCategories_nutrition' },
  { value: 'Higiene', labelKey: 'supplyCategories_hygiene' },
  { value: 'Monitoramento', labelKey: 'supplyCategories_monitoring' },
  { value: 'Cuidados Respiratórios', labelKey: 'supplyCategories_respiratory' },
  { value: 'Curativos Avançados', labelKey: 'supplyCategories_advancedWound' },
  { value: 'Ortopedia', labelKey: 'supplyCategories_orthopedics' },
  { value: 'Nutrição Enteral', labelKey: 'supplyCategories_enteralNutrition' },
  { value: 'Higiene e Conforto', labelKey: 'supplyCategories_comfort' },
  { value: 'Administração', labelKey: 'supplyCategories_administration' },
  { value: 'Outros Dispositivos', labelKey: 'supplyCategories_other' },
];

const COUNTRIES = [
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
  { code: 'pt', flag: '\u{1F1F5}\u{1F1F9}', labelKey: 'portugal' },
  { code: 'es', flag: '\u{1F1EA}\u{1F1F8}', labelKey: 'spain' },
  { code: 'it', flag: '\u{1F1EE}\u{1F1F9}', labelKey: 'italy' },
  { code: 'de', flag: '\u{1F1E9}\u{1F1EA}', labelKey: 'germany' },
  { code: 'fr', flag: '\u{1F1EB}\u{1F1F7}', labelKey: 'france' },
  { code: 'ch', flag: '\u{1F1E8}\u{1F1ED}', labelKey: 'switzerland' },
  { code: 'gb', flag: '\u{1F1EC}\u{1F1E7}', labelKey: 'unitedKingdom' },
  { code: 'us', flag: '\u{1F1FA}\u{1F1F8}', labelKey: 'unitedStates' },
  { code: 'ca', flag: '\u{1F1E8}\u{1F1E6}', labelKey: 'canada' },
  { code: 'au', flag: '\u{1F1E6}\u{1F1FA}', labelKey: 'australia' },
];

function SupplySearch() {
  const { t, i18n } = useTranslation();
  const { addNotification } = useNotification();
  const { user } = useUser();
  const [query, setQuery] = useState('');
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [govProgramOnly, setGovProgramOnly] = useState(false);
  const [therapeuticClass, setTherapeuticClass] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [feedbackSent, setFeedbackSent] = useState({});
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [currentFeedbackItem, setCurrentFeedbackItem] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const debounceRef = useRef(null);
  const PAGE_SIZE = 50;

  const defaultCountry = COUNTRIES.find(c => c.code === user?.country)?.code || 'br';
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry);

  const doSearch = useCallback(async (searchQuery, gpOnly, thClass, country) => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: 0, item_type: 'supply' };
      if (searchQuery) params.search = searchQuery;
      if (gpOnly) params.has_gov_program = true;
      if (thClass) params.therapeutic_class = thClass;
      if (country) params.country = country;
      if (i18n.language !== 'pt') params.lang = i18n.language;
      const data = await searchMedications(params);
      setSupplies(data || []);
      setHasMore((data || []).length >= PAGE_SIZE);
      setHasSearched(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [i18n.language]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const params = { limit: PAGE_SIZE, offset: supplies.length, item_type: 'supply' };
      if (query) params.search = query;
      if (govProgramOnly) params.has_gov_program = true;
      if (therapeuticClass) params.therapeutic_class = therapeuticClass;
      if (selectedCountry) params.country = selectedCountry;
      if (i18n.language !== 'pt') params.lang = i18n.language;
      const data = await searchMedications(params);
      const newData = data || [];
      setSupplies(prev => [...prev, ...newData]);
      setHasMore(newData.length >= PAGE_SIZE);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  }, [supplies.length, query, govProgramOnly, therapeuticClass, selectedCountry]);

  useEffect(() => {
    doSearch('', false, '', selectedCountry);
  }, [doSearch, selectedCountry]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') setSelectedItem(null);
    };
    if (selectedItem) {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [selectedItem]);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(val, govProgramOnly, therapeuticClass, selectedCountry);
    }, 400);
  };

  const handleGovProgramToggle = () => {
    const newVal = !govProgramOnly;
    setGovProgramOnly(newVal);
    doSearch(query, newVal, therapeuticClass, selectedCountry);
  };

  const handleCountryChange = (code) => {
    setSelectedCountry(code);
    doSearch(query, govProgramOnly, therapeuticClass, code);
  };

  const handleCategoryChange = (val) => {
    setTherapeuticClass(val);
    doSearch(query, govProgramOnly, val, selectedCountry);
  };

  const buildContent = (item) => {
    const parts = [item.name];
    if (item.presentation) parts.push(`Apresentação: ${item.presentation}`);
    if (item.therapeutic_class) parts.push(`Categoria: ${item.therapeutic_class}`);
    if (item.common_indications) parts.push(`Indicações: ${item.common_indications}`);
    return parts.join(' | ');
  };

  const handleLike = async (item) => {
    try {
      await submitFeedback({
        feedback_type: 'like',
        content_type: 'medication_detail',
        content_id: String(item.id),
        original_content: buildContent(item),
        feedback_text: '',
        contact_permission: false,
      });
      setFeedbackSent(prev => ({ ...prev, [item.id]: 'like' }));
      addNotification(t('feedbackSentSuccess'), 'success');
    } catch (error) {
      console.error('Failed to submit supply like:', error);
      addNotification(t('feedbackSentError'), 'error');
    }
  };

  const handleDislike = (item) => {
    setCurrentFeedbackItem(item);
    setIsFeedbackModalOpen(true);
  };

  const handleFeedbackSubmit = async (comment, contactPermission) => {
    if (!currentFeedbackItem) return;
    try {
      await submitFeedback({
        feedback_type: 'dislike',
        content_type: 'medication_detail',
        content_id: String(currentFeedbackItem.id),
        original_content: buildContent(currentFeedbackItem),
        feedback_text: comment,
        contact_permission: contactPermission,
      });
      setFeedbackSent(prev => ({ ...prev, [currentFeedbackItem.id]: 'dislike' }));
      addNotification(t('feedbackSentSuccess'), 'success');
    } catch (error) {
      console.error('Failed to submit supply dislike:', error);
      addNotification(t('feedbackSentError'), 'error');
    } finally {
      setIsFeedbackModalOpen(false);
      setCurrentFeedbackItem(null);
    }
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

  const renderBadge = (item, compact = false) => {
    const programs = item.government_programs || [];
    if (programs.length > 0) {
      return programs.map(prog => {
        const displayName = compact ? getShortName(prog.name) : prog.name;
        return (
          <span key={prog.code} className={`${styles.badge} ${getBadgeStyle(prog)}`}>
            {prog.all_items_free
              ? `${t('govProgramFreeLabel')} - ${displayName}`
              : `${t('govProgramSubsidyLabel')} - ${displayName}`
            }
          </span>
        );
      });
    }
    if (selectedCountry === 'br' && item.farmacia_popular) {
      return (
        <span className={`${styles.badge} ${styles.badgeFree}`}>
          {t('govProgramFreeBr')}
        </span>
      );
    }
    return null;
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
            placeholder={t('searchSupplies')}
            value={query}
            onChange={handleQueryChange}
          />
        </div>

        <button
          className={`${styles.fpToggle} ${govProgramOnly ? styles.fpToggleActive : ''}`}
          onClick={handleGovProgramToggle}
          title={t('availableOnSUS')}
        >
          <FontAwesomeIcon icon={govProgramOnly ? faCheck : faMedkit} />
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
          options={SUPPLY_CATEGORIES.map(c => ({ value: c.value, label: t(c.labelKey) }))}
          value={therapeuticClass}
          onChange={handleCategoryChange}
          placeholder={t('supplyCategory')}
        />
      </div>

      {/* Results */}
      {loading && <div className={styles.loading}>{t('loading')}...</div>}

      {!loading && hasSearched && supplies.length === 0 && (
        <div className={styles.emptyState}>
          <FontAwesomeIcon icon={faMedkit} className={styles.emptyIcon} />
          <p>{t('noSuppliesFound')}</p>
        </div>
      )}

      {!loading && supplies.length > 0 && (
        <>
          <div className={styles.resultsGrid}>
            {supplies.map(item => (
              <div
                key={item.id}
                className={styles.medCard}
                onClick={() => setSelectedItem(item)}
              >
                <div className={styles.medCardHeader}>
                  <h4 className={styles.medName}>{item.name}</h4>
                  <div className={styles.badges}>
                    {renderBadge(item, true)}
                    {item.requires_prescription && (
                      <span className={styles.lmeBadge}>{t('requiresLME')}</span>
                    )}
                  </div>
                </div>
                <p className={styles.medPrinciple}>{item.therapeutic_class}</p>
                <p className={styles.medPresentation}>{item.presentation}</p>
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
          <p>{t('searchSuppliesHint')}</p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedItem && (
        <div className={styles.modalOverlay} onClick={() => setSelectedItem(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>{selectedItem.name}</h3>
                <p className={styles.modalSubtitle}>{selectedItem.therapeutic_class}</p>
              </div>
              <div className={styles.modalHeaderRight}>
                <div className={`${styles.badges} ${styles.badgesRow}`}>
                  {renderBadge(selectedItem)}
                  {selectedItem.requires_prescription && (
                    <span className={styles.lmeBadge}>{t('requiresLME')}</span>
                  )}
                </div>
                <button className={styles.modalClose} onClick={() => setSelectedItem(null)}>
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            </div>

            <div className={styles.modalBody}>
              {selectedItem.presentation && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t('presentation')}:</span>
                  <span>{selectedItem.presentation}</span>
                </div>
              )}
              {selectedItem.common_brands && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t('commonBrands')}:</span>
                  <span className={styles.brandsText}>{selectedItem.common_brands}</span>
                </div>
              )}
              {selectedItem.therapeutic_class && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t('supplyCategory')}:</span>
                  <span>{selectedItem.therapeutic_class}</span>
                </div>
              )}
              {selectedItem.common_indications && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t('commonIndications')}:</span>
                  <span>{selectedItem.common_indications}</span>
                </div>
              )}

              {selectedItem.government_programs?.some(p => p.code === 'ceaf') && (
                <div className={styles.ceafInfo}>
                  <FontAwesomeIcon icon={faInfoCircle} />
                  <div>
                    <strong>{t('requiresLME')}</strong>
                    <p>{t('lmeDescription')}</p>
                  </div>
                </div>
              )}

              {selectedItem.requires_prescription && !selectedItem.government_programs?.some(p => p.code === 'ceaf') && (
                <div className={styles.detailRow}>
                  <FontAwesomeIcon icon={faCheck} className={styles.rxIcon} />
                  <span>{t('requiresPrescription')}</span>
                </div>
              )}

              {/* Feedback buttons */}
              <div className={styles.feedbackSection}>
                <span className={styles.feedbackLabel}>{t('medDataCorrect')}</span>
                <div className={styles.feedbackButtons}>
                  <button
                    className={`${styles.feedbackBtn} ${feedbackSent[selectedItem.id] === 'like' ? styles.feedbackBtnActive : ''}`}
                    onClick={() => handleLike(selectedItem)}
                    disabled={!!feedbackSent[selectedItem.id]}
                    title={t('like')}
                  >
                    <FontAwesomeIcon icon={faThumbsUp} />
                  </button>
                  <button
                    className={`${styles.feedbackBtn} ${styles.feedbackBtnDislike} ${feedbackSent[selectedItem.id] === 'dislike' ? styles.feedbackBtnActive : ''}`}
                    onClick={() => handleDislike(selectedItem)}
                    disabled={!!feedbackSent[selectedItem.id]}
                    title={t('dislike')}
                  >
                    <FontAwesomeIcon icon={faThumbsDown} />
                  </button>
                </div>
                {feedbackSent[selectedItem.id] && (
                  <span className={styles.feedbackThanks}>{t('medFeedbackThanks')}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => { setIsFeedbackModalOpen(false); setCurrentFeedbackItem(null); }}
        onSubmit={handleFeedbackSubmit}
      />
    </div>
  );
}

export default SupplySearch;
