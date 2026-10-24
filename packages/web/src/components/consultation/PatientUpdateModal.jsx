import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faCheck, faPlus, faMinus, faExchangeAlt, faPen } from '@fortawesome/free-solid-svg-icons';
import styles from './PatientUpdateModal.module.css';

const CATEGORY_ORDER = ['medications', 'chronic_conditions', 'allergies'];
const DEMOGRAPHIC_PREFIX = 'demographics.';

const ACTION_CONFIG = {
  add: { badge: styles.badgeAdd, icon: faPlus },
  remove: { badge: styles.badgeRemove, icon: faMinus },
  modify: { badge: styles.badgeModify, icon: faExchangeAlt },
  update: { badge: styles.badgeUpdate, icon: faPen },
};

function PatientUpdateModal({ changes, onApply, onSkip }) {
  const { t } = useTranslation();
  const [checkedItems, setCheckedItems] = useState(() =>
    new Set(changes.map((_, i) => i))
  );

  const allChecked = checkedItems.size === changes.length;

  const toggleItem = (index) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) {
      setCheckedItems(new Set());
    } else {
      setCheckedItems(new Set(changes.map((_, i) => i)));
    }
  };

  const handleApply = () => {
    const accepted = changes.filter((_, i) => checkedItems.has(i));
    const rejected = changes.filter((_, i) => !checkedItems.has(i));
    onApply(accepted, rejected);
  };

  // Group changes by category
  const grouped = useMemo(() => {
    const groups = {};
    changes.forEach((change, idx) => {
      const cat = change.category.startsWith(DEMOGRAPHIC_PREFIX) ? 'demographics' : change.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ ...change, _idx: idx });
    });
    // Sort groups by defined order
    const ordered = [];
    for (const cat of CATEGORY_ORDER) {
      if (groups[cat]) ordered.push([cat, groups[cat]]);
    }
    if (groups['demographics']) ordered.push(['demographics', groups['demographics']]);
    return ordered;
  }, [changes]);

  const getCategoryLabel = (cat) => {
    const labels = {
      medications: t('medications', 'Medicamentos'),
      chronic_conditions: t('chronicConditions', 'Condições Crônicas'),
      allergies: t('allergies', 'Alergias'),
      demographics: t('contactInfo', 'Dados Cadastrais'),
    };
    return labels[cat] || cat;
  };

  const getActionLabel = (action) => {
    const labels = {
      add: t('changeAdd', 'Adicionar'),
      remove: t('changeRemove', 'Remover'),
      modify: t('changeModify', 'Alterar'),
      update: t('changeUpdate', 'Atualizar'),
    };
    return labels[action] || action;
  };

  const selectedCount = checkedItems.size;

  return (
    <div className={styles.overlay} onClick={onSkip}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h3>{t('patientUpdatesDetected', 'Atualizações detectadas no cadastro')}</h3>
            <p className={styles.subtitle}>
              {t('patientUpdatesDescription', 'Com base nesta consulta, identificamos possíveis atualizações para o cadastro do paciente:')}
            </p>
          </div>
          <button className={styles.closeButton} onClick={onSkip}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className={styles.selectAllRow}>
          <button className={styles.selectAllButton} onClick={toggleAll}>
            {allChecked
              ? t('deselectAll', 'Desmarcar todos')
              : t('selectAll', 'Selecionar todos')}
          </button>
        </div>

        <div className={styles.changesList}>
          {grouped.map(([category, items]) => (
            <div key={category} className={styles.categoryGroup}>
              <div className={styles.categoryLabel}>{getCategoryLabel(category)}</div>
              {items.map((change) => {
                const isChecked = checkedItems.has(change._idx);
                const config = ACTION_CONFIG[change.action] || ACTION_CONFIG.update;
                return (
                  <div
                    key={change._idx}
                    className={`${styles.changeItem} ${!isChecked ? styles.unchecked : ''}`}
                    onClick={() => toggleItem(change._idx)}
                  >
                    <div className={`${styles.checkbox} ${isChecked ? styles.checked : ''}`}>
                      {isChecked && <FontAwesomeIcon icon={faCheck} />}
                    </div>
                    <div className={styles.changeContent}>
                      <div className={styles.changeHeader}>
                        <span className={`${styles.actionBadge} ${config.badge}`}>
                          {getActionLabel(change.action)}
                        </span>
                        {change.action === 'modify' && change.old_value ? (
                          <span className={styles.changeValue}>
                            <span className={styles.oldValue}>{change.old_value}</span>
                            <span className={styles.arrow}>&rarr;</span>
                            {change.value}
                          </span>
                        ) : change.action === 'update' && change.old_value ? (
                          <span className={styles.changeValue}>
                            <span className={styles.oldValue}>{change.old_value}</span>
                            <span className={styles.arrow}>&rarr;</span>
                            {change.value}
                          </span>
                        ) : (
                          <span className={styles.changeValue}>{change.value}</span>
                        )}
                      </div>
                      {change.reasoning && (
                        <div className={styles.reasoning}>{change.reasoning}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <button className={styles.skipButton} onClick={onSkip}>
            {t('skipAll', 'Pular')}
          </button>
          <button
            className={styles.applyButton}
            onClick={handleApply}
            disabled={selectedCount === 0}
          >
            {t('applySelected', 'Aplicar selecionados')} ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
}

export default PatientUpdateModal;
