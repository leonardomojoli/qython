// frontend/src/components/copilot/ConsultationPickerModal.js
// Modal for selecting saved consultations or local drafts as context

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faTimes,
    faDatabase,
    faFloppyDisk,
    faStethoscope,
    faCalendarAlt,
    faSpinner,
    faFileAlt,
    faSearch,
    faUser
} from '@fortawesome/free-solid-svg-icons';
import { getAllConsultations } from '../../api';
import localStorageService from '../../utils/localStorageService';
import styles from './ConsultationPickerModal.module.css';

const ConsultationPickerModal = ({ isOpen, onClose, onSelect }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('saved'); // 'saved' or 'drafts'
    const [savedConsultations, setSavedConsultations] = useState([]);
    const [localDrafts, setLocalDrafts] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (isOpen) {
            loadConsultations();
            setSearchQuery('');
        }
    }, [isOpen]);

    const loadConsultations = async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Load saved consultations from API
            const response = await getAllConsultations();
            setSavedConsultations(response || []);
        } catch (err) {
            console.error('Failed to load consultations:', err);
            setError(t('errorLoadingConsultations'));
        }

        // Load local drafts from localStorage
        const drafts = localStorageService.getDraftConsultations();
        setLocalDrafts(drafts);

        setIsLoading(false);
    };

    const handleSelectConsultation = (consultation, isLocal = false) => {
        const contextData = {
            type: isLocal ? 'local_draft' : 'saved_consultation',
            id: isLocal ? consultation.key : consultation.id,
            specialty: consultation.specialty,
            patientName: isLocal ? null : consultation.patient_name,
            content: isLocal ? consultation.content : consultation.improved_notes || consultation.raw_notes,
            preview: isLocal ? consultation.preview : (consultation.improved_notes || consultation.raw_notes || '').substring(0, 80) + '...',
            date: isLocal ? new Date(consultation.createdAt).toLocaleDateString() : new Date(consultation.created_at).toLocaleDateString(),
        };
        onSelect(contextData);
        onClose();
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getSpecialtyLabel = (specialty) => {
        // Map specialty keys to display labels
        const specialtyMap = {
            'clinica_geral': t('clinicaGeral'),
            'cardiologia': t('cardiologia'),
            'neurologia': t('neurologia'),
            'ortopedia': t('ortopedia'),
            'pediatria': t('pediatria'),
            'ginecologia': t('ginecologia'),
            'dermatologia': t('dermatologia'),
            'oftalmologia': t('oftalmologia'),
            'psiquiatria': t('psiquiatria'),
        };
        return specialtyMap[specialty] || specialty || t('unknownSpecialty');
    };

    // Filter consultations by search query
    const filteredConsultations = savedConsultations.filter(c => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        const specialty = (c.specialty || '').toLowerCase();
        const patientName = (c.patient_name || '').toLowerCase();
        const content = (c.improved_notes || c.raw_notes || '').toLowerCase();
        return specialty.includes(query) || patientName.includes(query) || content.includes(query);
    });

    const filteredDrafts = localDrafts.filter(d => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        const specialty = (d.specialty || '').toLowerCase();
        const content = (d.content || d.preview || '').toLowerCase();
        return specialty.includes(query) || content.includes(query);
    });

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3 className={styles.title}>
                        <FontAwesomeIcon icon={faFileAlt} className={styles.titleIcon} />
                        {t('selectConsultation')}
                    </h3>
                    <button className={styles.closeButton} onClick={onClose}>
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </div>

                {/* Search Input */}
                <div className={styles.searchContainer}>
                    <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder={t('searchConsultations', 'Buscar por paciente, especialidade...')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'saved' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('saved')}
                    >
                        <FontAwesomeIcon icon={faDatabase} />
                        <span>{t('savedConsultations')}</span>
                        <span className={styles.badge}>{filteredConsultations.length}</span>
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'drafts' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('drafts')}
                    >
                        <FontAwesomeIcon icon={faFloppyDisk} />
                        <span>{t('localDrafts')}</span>
                        <span className={styles.badge}>{filteredDrafts.length}</span>
                    </button>
                </div>

                <div className={styles.content}>
                    {isLoading ? (
                        <div className={styles.loading}>
                            <FontAwesomeIcon icon={faSpinner} spin />
                            <span>{t('loading')}</span>
                        </div>
                    ) : error ? (
                        <div className={styles.error}>{error}</div>
                    ) : activeTab === 'saved' ? (
                        filteredConsultations.length === 0 ? (
                            <div className={styles.empty}>
                                <FontAwesomeIcon icon={faDatabase} className={styles.emptyIcon} />
                                <p>{searchQuery ? t('noResultsFound', 'Nenhum resultado encontrado') : t('noSavedConsultations')}</p>
                            </div>
                        ) : (
                            <ul className={styles.list}>
                                {filteredConsultations.map((consultation) => (
                                    <li
                                        key={consultation.id}
                                        className={styles.item}
                                        onClick={() => handleSelectConsultation(consultation, false)}
                                    >
                                        <div className={styles.itemHeader}>
                                            <span className={styles.specialty}>
                                                <FontAwesomeIcon icon={faStethoscope} />
                                                {getSpecialtyLabel(consultation.specialty)}
                                            </span>
                                            {consultation.patient_name && (
                                                <span className={styles.patientBadge}>
                                                    <FontAwesomeIcon icon={faUser} />
                                                    {consultation.patient_name}
                                                </span>
                                            )}
                                            <span className={styles.date}>
                                                <FontAwesomeIcon icon={faCalendarAlt} />
                                                {formatDate(consultation.created_at)}
                                            </span>
                                        </div>
                                        <p className={styles.preview}>
                                            {(consultation.improved_notes || consultation.raw_notes || '').substring(0, 120)}...
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )
                    ) : (
                        filteredDrafts.length === 0 ? (
                            <div className={styles.empty}>
                                <FontAwesomeIcon icon={faFloppyDisk} className={styles.emptyIcon} />
                                <p>{searchQuery ? t('noResultsFound', 'Nenhum resultado encontrado') : t('noLocalDrafts')}</p>
                            </div>
                        ) : (
                            <ul className={styles.list}>
                                {filteredDrafts.map((draft) => (
                                    <li
                                        key={draft.key}
                                        className={styles.item}
                                        onClick={() => handleSelectConsultation(draft, true)}
                                    >
                                        <div className={styles.itemHeader}>
                                            <span className={styles.specialty}>
                                                <FontAwesomeIcon icon={faStethoscope} />
                                                {getSpecialtyLabel(draft.specialty)}
                                            </span>
                                            <span className={styles.date}>
                                                <FontAwesomeIcon icon={faCalendarAlt} />
                                                {formatDate(draft.createdAt)}
                                            </span>
                                            <span className={styles.draftBadge}>{t('draft')}</span>
                                        </div>
                                        <p className={styles.preview}>{draft.preview}</p>
                                    </li>
                                ))}
                            </ul>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

export default ConsultationPickerModal;
