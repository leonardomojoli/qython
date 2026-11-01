// frontend/src/components/consultation/ConsultationList.js

import React, { useEffect, useState, useCallback } from 'react';
import { getAllConsultations, deleteConsultations as apiDeleteConsultations, ERROR_TYPES } from '../../api';
import axios from 'axios';
import styles from './ConsultationManager.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faList } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import ConsultationDetailModal from './ConsultationDetailModal';
import InlineLoading from '../shared/InlineLoading';

// Helper function to get preview text with fallback hierarchy
const getPreviewText = (consultation) => {
  if (consultation.summary) return consultation.summary;
  if (consultation.improved_notes) return consultation.improved_notes;
  return consultation.raw_notes || '';
};

// Helper function to strip markdown formatting for cleaner preview
const stripMarkdown = (text) => {
  if (!text) return '';
  return text
    .replace(/#{1,6}\s+(.+)/g, ' | $1: ') // Turn headers into labeled sections
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
    .replace(/[-*+]\s/g, '') // Remove list markers
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .replace(/^\s*\|\s*/, '') // Remove leading separator
    .replace(/:\s*\|/g, ' |') // Clean double separators
    .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
    .trim();
};

function ConsultationList() {
  const { t, i18n } = useTranslation();
  const [consultations, setConsultations] = useState([]);
  const [filteredConsultations, setFilteredConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState(null);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchConsultations = useCallback(async (controllerSignal) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllConsultations({ signal: controllerSignal });
      const sortedData = (data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setConsultations(sortedData);
      setFilteredConsultations(sortedData);
    } catch (err) {
      if (!axios.isCancel(err)) {
        console.error('Erro detalhado ao buscar consultas:', err);
        // Don't show error for session expired - will be handled globally
        if (err.type === ERROR_TYPES.SESSION_EXPIRED) {
          return;
        }
        // Show friendly message based on error type
        if (err.type === ERROR_TYPES.NETWORK_ERROR) {
          setError(t('networkErrorFriendly'));
        } else {
          setError(t('errorLoadingConsultationsFriendly'));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    fetchConsultations(controller.signal);
    return () => controller.abort();
  }, [fetchConsultations]);

  useEffect(() => {
    const lowercasedTerm = searchTerm.toLowerCase();
    const filtered = consultations.filter((consultation) =>
      Object.values(consultation).some((value) => {
        if (value === null || typeof value === 'undefined') return false;
        if (typeof value === 'boolean') {
          return (value ? "primeira" : "retorno").includes(lowercasedTerm);
        }
        if (value instanceof Date || (typeof value === 'string' && !isNaN(new Date(value).getTime()))) {
          return new Date(value).toLocaleString('pt-BR').toLowerCase().includes(lowercasedTerm);
        }
        return String(value).toLowerCase().includes(lowercasedTerm);
      })
    );
    setFilteredConsultations(filtered);
  }, [searchTerm, consultations]);

  const handleExpandClick = (consultation) => {
    setSelectedConsultation(consultation);
    setIsModalOpen(true);
  };

  const handleSelectRow = (id) => {
    setSelectedIds(prevSelectedIds => {
      const newSelectedIds = new Set(prevSelectedIds);
      if (newSelectedIds.has(id)) {
        newSelectedIds.delete(id);
      } else {
        newSelectedIds.add(id);
      }
      return newSelectedIds;
    });
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      const allVisibleIds = new Set(filteredConsultations.map(c => c.id));
      setSelectedIds(allVisibleIds);
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) {
      alert(t('noConsultationsSelectedForDeletion'));
      return;
    }
    if (window.confirm(t('confirmDeleteConsultations', { count: selectedIds.size }))) {
      setIsDeleting(true);
      try {
        await apiDeleteConsultations(Array.from(selectedIds));
        setConsultations(prev => prev.filter(c => !selectedIds.has(c.id)));
        setFilteredConsultations(prev => prev.filter(c => !selectedIds.has(c.id)));
        setSelectedIds(new Set());
        alert(t('consultationsDeletedSuccess'));
      } catch (err) {
        console.error('Erro ao excluir consultas:', err);
        alert(t('errorDeletingConsultations', { message: err.message || t('unknownError') }));
      } finally {
        setIsDeleting(false);
      }
    }
  };
  
  const isAllSelected = filteredConsultations.length > 0 && selectedIds.size === filteredConsultations.length;

  return (
    <div className={styles.listSectionCard}>
      <div className={styles.listHeader}>
        <h3 className={styles.cardTitle}>
          <FontAwesomeIcon
            icon={faList}
            style={{
              marginRight: '12px',
              color: '#64b5f6',
              filter: 'drop-shadow(0 0 8px rgba(100, 181, 246, 0.5))'
            }}
          />
          {t('savedConsultations')}
        </h3>
      </div>
      <input
        type="text"
        placeholder={t('searchConsultations')}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className={styles.searchInput}
      />
      {loading && <InlineLoading text={t('loadingConsultations')} />}
      {error && <p style={{ color: 'var(--notification-error-bg)' }}>{error}</p>}
      {!loading && !error && filteredConsultations.length === 0 && (
        <p>{t('noConsultationsFound')}</p>
      )}
      {!loading && !error && filteredConsultations.length > 0 && (
        <>
          {/* Actions Bar */}
          <div className={styles.cardGridHeader}>
            <div className={styles.cardGridHeaderLeft}>
              <label className={styles.selectAllLabel} htmlFor="selectAllCheckbox">
                <span className={styles.customCheckboxContainer}>
                  <input
                    type="checkbox"
                    id="selectAllCheckbox"
                    onChange={handleSelectAll}
                    checked={isAllSelected}
                    className={styles.hiddenCheckboxInput}
                  />
                  <span className={styles.customCheckboxStyled}></span>
                </span>
                <span className={styles.selectAllText}>{t('selectAll')}</span>
              </label>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className={styles.deleteSelectedButtonInline}
                  disabled={isDeleting}
                >
                  <FontAwesomeIcon icon={faTrash} />
                  <span>{isDeleting ? t('deleting') : t('deleteSelected', { count: selectedIds.size })}</span>
                </button>
              )}
            </div>
            <span className={styles.consultationCount}>
              {filteredConsultations.length} {filteredConsultations.length === 1 ? t('consultation') : t('consultations')}
            </span>
          </div>

          {/* Cards Grid */}
          <div className={styles.cardGrid}>
            {filteredConsultations.map((consultation) => {
              const previewText = stripMarkdown(getPreviewText(consultation));
              const displayPreview = previewText.length > 200
                ? previewText.substring(0, 200) + '...'
                : previewText || '—';

              return (
                <div
                  key={consultation.id}
                  className={`${styles.consultationCard} ${selectedIds.has(consultation.id) ? styles.selectedCard : ''}`}
                >
                  {/* Card Header */}
                  <div className={styles.consultationCardHeader}>
                    <label
                      className={styles.cardCheckboxLabel}
                      htmlFor={`selectRowCheckbox-${consultation.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        id={`selectRowCheckbox-${consultation.id}`}
                        checked={selectedIds.has(consultation.id)}
                        onChange={() => handleSelectRow(consultation.id)}
                        className={styles.hiddenCheckboxInput}
                      />
                      <span className={styles.customCheckboxStyled}></span>
                    </label>
                    <span className={styles.cardSpecialty}>{consultation.specialty}</span>
                    <span className={styles.cardTypeBadge}>
                      {consultation.is_first_consultation ? t('first') : t('return')}
                    </span>
                    <span className={styles.cardDate}>
                      {new Date(consultation.created_at).toLocaleDateString(i18n.language === 'en' ? 'en-US' : i18n.language === 'es' ? 'es-ES' : 'pt-BR')}
                    </span>
                  </div>

                  {/* Patient Info (if available) */}
                  {consultation.patient_name && (
                    <div className={styles.cardPatientRow}>
                      <span className={styles.cardPatientName}>{consultation.patient_name}</span>
                    </div>
                  )}

                  {/* Card Preview */}
                  <div className={styles.cardPreview}>
                    {displayPreview}
                  </div>

                  {/* Card Footer */}
                  <div className={styles.cardFooter}>
                    <button
                      className={styles.viewDetailsButton}
                      onClick={() => handleExpandClick(consultation)}
                    >
                      {t('viewDetails')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <ConsultationDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        consultation={selectedConsultation}
      />
    </div>
  );
}

export default ConsultationList;