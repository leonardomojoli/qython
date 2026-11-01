// frontend/src/components/ConsultationDetailModal.js
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp, faCopy, faShareNodes, faFilePdf, faFileLines, faCheck, faFileCode } from '@fortawesome/free-solid-svg-icons';
import { handleShareAsTxt, handleShareAsPdf, convertMarkdownToPlainText, handleShareAsMarkdown } from '../shared/ShareComponent';
import { useNotification } from '../../contexts/NotificationContext';
import styles from './ConsultationDetailModal.module.css';

// Componente para uma seção retrátil
const CollapsibleSection = ({ title, content, isExpanded, onToggle, onCopy, onShare, shareMenu, setShareMenu, sectionKey, addNotification, t, i18n, actionSuccess, setActionSuccess }) => {
  const shareMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (shareMenuRef.current && !shareMenuRef.current.contains(event.target) && !event.target.closest(`[data-share-button='${sectionKey}']`)) {
        setShareMenu({ open: false, target: null });
      }
    }
    if (shareMenu.open && shareMenu.target === sectionKey) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [shareMenu, sectionKey, setShareMenu]);
  
  const handleShareAction = async (shareFn) => {
    setShareMenu({ open: false, target: null });
    const success = await shareFn();
    if (success) {
      setActionSuccess({ target: sectionKey, type: 'share' });
      setTimeout(() => setActionSuccess({ target: null, type: null }), 2000);
    }
  };

  return (
    <div className={styles.notesSection}>
      <div className={styles.sectionHeader} onClick={onToggle}>
        <h4>{title}</h4>
        <div className={styles.headerActions} onClick={(e) => e.stopPropagation()}>
          <button onClick={onCopy} title={t('copy')}>
            {actionSuccess.target === sectionKey && actionSuccess.type === 'copy' ? <FontAwesomeIcon icon={faCheck} className={styles.successIcon} /> : <FontAwesomeIcon icon={faCopy} />}
          </button>
          <div style={{ position: 'relative' }}>
             <button onClick={onShare} title={t('share')} data-share-button={sectionKey}>
                {actionSuccess.target === sectionKey && actionSuccess.type === 'share' ? <FontAwesomeIcon icon={faCheck} className={styles.successIcon} /> : <FontAwesomeIcon icon={faShareNodes} />}
             </button>
             {shareMenu.open && shareMenu.target === sectionKey && (
                <div ref={shareMenuRef} className={styles.shareMenu}>
                  <button
                    onClick={() => handleShareAction(() => handleShareAsTxt(content, title, t, addNotification))}
                    title={t('shareAsTxtTooltip')}
                  >
                    <FontAwesomeIcon icon={faFileLines} /> {t('shareAsTxtLabel')}
                  </button>
                  <button
                    onClick={() => handleShareAction(() => handleShareAsPdf(content, addNotification, i18n))}
                    title={t('shareAsPdfTooltip')}
                  >
                    <FontAwesomeIcon icon={faFilePdf} /> {t('shareAsPdfLabel')}
                  </button>
                  <button
                    onClick={() => handleShareAction(() => handleShareAsMarkdown(content, title, t, addNotification))}
                    title={t('shareAsMdTooltip')}
                  >
                    <FontAwesomeIcon icon={faFileCode} /> {t('shareAsMdLabel')}
                  </button>
                </div>
             )}
          </div>
          <button onClick={onToggle} title={isExpanded ? t('collapse') : t('expand')}>
            <FontAwesomeIcon icon={isExpanded ? faChevronUp : faChevronDown} />
          </button>
        </div>
      </div>
      <div className={`${styles.collapsibleContent} ${isExpanded ? styles.expanded : ''}`}>
        <div className={styles.markdownContent}>
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
            {content || `*${t('notAvailable')}*`}
            </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};


const ConsultationDetailModal = ({ isOpen, onClose, consultation }) => {
  const { t, i18n } = useTranslation();
  const { addNotification } = useNotification();
  const [expandedSections, setExpandedSections] = useState({
    original: true,
    improved: true,
    summary: true,
  });
  const [shareMenu, setShareMenu] = useState({ open: false, target: null });
  const [actionSuccess, setActionSuccess] = useState({ target: null, type: null });

  if (!isOpen || !consultation) {
    return null;
  }

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleCopy = (markdownText, sectionKey) => {
    if (!markdownText) return;
    const plainText = convertMarkdownToPlainText(markdownText);
    navigator.clipboard.writeText(plainText)
      .then(() => {
        setActionSuccess({ target: sectionKey, type: 'copy' });
        setTimeout(() => setActionSuccess({ target: null, type: null }), 2000);
      })
      .catch(err => {
        console.error("Erro ao copiar:", err);
        addNotification(t('errorCopying'), 'error');
      });
  };

  const handleShareClick = (e, target) => {
    e.stopPropagation();
    setShareMenu(prev => ({
      open: prev.target === target ? !prev.open : true,
      target: target,
    }));
  };

  const modalTitle = `${t('specialty')}: ${consultation.specialty} - ${new Date(consultation.created_at).toLocaleDateString(i18n.language === 'en' ? 'en-US' : i18n.language === 'es' ? 'es-ES' : 'pt-BR')}`;

  // Helper to calculate age from birth date
  const calculateAge = (birthDate) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  // Helper to translate gender
  const getGenderLabel = (gender) => {
    if (!gender) return null;
    const genderMap = {
      'male': t('male'),
      'female': t('female'),
      'other': t('other')
    };
    return genderMap[gender] || gender;
  };

  return ReactDOM.createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{modalTitle}</h3>
          <button onClick={onClose} className={styles.closeButton}>&times;</button>
        </div>
        <div className={styles.modalBody}>

          {/* Patient Info Section */}
          {consultation.patient && (
            <div className={styles.patientInfoSection}>
              <div className={styles.patientInfoHeader}>
                <span className={styles.patientInfoIcon}>👤</span>
                <span className={styles.patientInfoName}>{consultation.patient.full_name}</span>
                {consultation.patient.birth_date && (
                  <span className={styles.patientInfoAge}>
                    {calculateAge(consultation.patient.birth_date)} {t('yearsOld')}
                  </span>
                )}
                {consultation.patient.gender && (
                  <span className={styles.patientInfoGender}>
                    {getGenderLabel(consultation.patient.gender)}
                  </span>
                )}
              </div>

              {/* Clinical Alerts */}
              {(consultation.patient.allergies?.length > 0 ||
                consultation.patient.chronic_conditions?.length > 0 ||
                consultation.patient.current_medications?.length > 0) && (
                <div className={styles.patientInfoAlerts}>
                  {consultation.patient.allergies?.length > 0 && (
                    <div className={styles.alertItem}>
                      <span className={styles.alertLabel}>⚠️ {t('allergies')}:</span>
                      <span className={styles.alertValue}>{consultation.patient.allergies.join(', ')}</span>
                    </div>
                  )}
                  {consultation.patient.chronic_conditions?.length > 0 && (
                    <div className={styles.alertItem}>
                      <span className={styles.alertLabel}>🏥 {t('chronicConditions')}:</span>
                      <span className={styles.alertValue}>{consultation.patient.chronic_conditions.join(', ')}</span>
                    </div>
                  )}
                  {consultation.patient.current_medications?.length > 0 && (
                    <div className={styles.alertItem}>
                      <span className={styles.alertLabel}>💊 {t('currentMedications')}:</span>
                      <span className={styles.alertValue}>{consultation.patient.current_medications.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Show improved notes if available, otherwise show original (manual consultation) */}
          {consultation.improved_notes ? (
            <CollapsibleSection
              title={t('improvedConsultation')}
              content={consultation.improved_notes}
              isExpanded={expandedSections.improved}
              onToggle={() => toggleSection('improved')}
              onCopy={() => handleCopy(consultation.improved_notes, 'improved')}
              onShare={(e) => handleShareClick(e, 'improved')}
              shareMenu={shareMenu}
              setShareMenu={setShareMenu}
              sectionKey="improved"
              addNotification={addNotification}
              t={t}
              i18n={i18n}
              actionSuccess={actionSuccess}
              setActionSuccess={setActionSuccess}
            />
          ) : (
            <CollapsibleSection
              title={t('consultation')}
              content={consultation.raw_notes}
              isExpanded={expandedSections.original}
              onToggle={() => toggleSection('original')}
              onCopy={() => handleCopy(consultation.raw_notes, 'original')}
              onShare={(e) => handleShareClick(e, 'original')}
              shareMenu={shareMenu}
              setShareMenu={setShareMenu}
              sectionKey="original"
              addNotification={addNotification}
              t={t}
              i18n={i18n}
              actionSuccess={actionSuccess}
              setActionSuccess={setActionSuccess}
            />
          )}

          {/* Summary section - only show if exists */}
          {consultation.summary && (
            <CollapsibleSection
              title={t('summary')}
              content={consultation.summary}
              isExpanded={expandedSections.summary}
              onToggle={() => toggleSection('summary')}
              onCopy={() => handleCopy(consultation.summary, 'summary')}
              onShare={(e) => handleShareClick(e, 'summary')}
              shareMenu={shareMenu}
              setShareMenu={setShareMenu}
              sectionKey="summary"
              addNotification={addNotification}
              t={t}
              i18n={i18n}
              actionSuccess={actionSuccess}
              setActionSuccess={setActionSuccess}
            />
          )}
        </div>
      </div>
    </div>,
    document.getElementById('modal-portal')
  );
};

export default ConsultationDetailModal;