// frontend/src/components/consultation/PatientPickerModal.js
import React, { useState, useEffect, useCallback } from 'react';
import { getPatients, createPatient, updatePatient, deletePatient, previewHistoryImport } from '../../api';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../contexts/UserContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSearch, faUserPlus, faTimes, faUser, faExclamationTriangle,
    faPhone, faEnvelope, faPills, faHeartPulse, faGlobe, faMapMarkerAlt, faPencil, faTrash,
    faFileImport, faSpinner, faChevronDown, faChevronUp
} from '@fortawesome/free-solid-svg-icons';
import { getCountryConfig, getCountryList, formatDocument, formatPhone } from '../../utils/countryConfig';
import PatientHistoryPanel from './PatientHistoryPanel';
import styles from './PatientPickerModal.module.css';

/**
 * Formata array de itens para exibição em tooltip
 * Os termos já vêm normalizados do backend (ex: "pressão alta" → "HAS")
 */
const formatTooltip = (items, label) => {
    if (!items || items.length === 0) return '';
    return `${label}: ${items.join(', ')}`;
};

function PatientPickerModal({ isOpen, onClose, onSelect }) {
    const { t } = useTranslation();
    const { user } = useUser();
    const [patients, setPatients] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [showNewPatientForm, setShowNewPatientForm] = useState(false);
    const [editingPatient, setEditingPatient] = useState(null);
    const [isEditMode, setIsEditMode] = useState(false);

    // Default country is doctor's country or 'br'
    const defaultCountry = user?.country || 'br';
    const [patientCountry, setPatientCountry] = useState(defaultCountry);
    const countryConfig = getCountryConfig(patientCountry);
    const countryList = getCountryList();

    const [newPatient, setNewPatient] = useState({
        full_name: '',
        phone: '',
        email: '',
        birth_date: '',
        gender: '',
        country: defaultCountry,
        document_id: '',
        address: '',
        allergies: '',
        chronic_conditions: '',
        current_medications: '',
        notes: ''
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [deletingPatientId, setDeletingPatientId] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [showHistoryPanel, setShowHistoryPanel] = useState(false);
    const [historyPatient, setHistoryPatient] = useState(null);

    // Smart history import states
    const [showImportSection, setShowImportSection] = useState(false);
    const [rawHistoryText, setRawHistoryText] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [parsedHistoryData, setParsedHistoryData] = useState(null);
    const [importSuccess, setImportSuccess] = useState(false);

    const fetchPatients = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getPatients(searchTerm || null);
            setPatients(data || []);
        } catch (err) {
            console.error('Error fetching patients:', err);
        } finally {
            setLoading(false);
        }
    }, [searchTerm]);

    // Reset form when modal closes to ensure clean state on next open
    useEffect(() => {
        if (!isOpen) {
            setShowNewPatientForm(false);
            setIsEditMode(false);
            setEditingPatient(null);
            setPatientCountry(defaultCountry);
            setNewPatient({
                full_name: '',
                phone: '',
                email: '',
                birth_date: '',
                gender: '',
                country: defaultCountry,
                document_id: '',
                address: '',
                allergies: '',
                chronic_conditions: '',
                current_medications: '',
                notes: ''
            });
            setError(null);
            setSearchTerm('');
            setShowHistoryPanel(false);
            setHistoryPatient(null);
            setShowImportSection(false);
            setRawHistoryText('');
            setIsParsing(false);
            setParsedHistoryData(null);
            setImportSuccess(false);
        }
    }, [isOpen, defaultCountry]);

    useEffect(() => {
        if (isOpen) {
            fetchPatients();
        }
    }, [isOpen, fetchPatients]);

    const handleSearch = (e) => {
        setSearchTerm(e.target.value);
    };

    const handleSelectPatient = (patient) => {
        onSelect(patient);
        // Reset form state before closing to ensure clean state on next open
        resetForm();
        onClose();
    };

    const handleNewPatientChange = (field, value) => {
        setNewPatient(prev => ({ ...prev, [field]: value }));
        setError(null);
    };

    const handleCountryChange = (countryCode) => {
        setPatientCountry(countryCode);
        setNewPatient(prev => ({ ...prev, country: countryCode, document_id: '' }));
    };

    const handleEditPatient = (patient) => {
        setEditingPatient(patient);
        setIsEditMode(true);
        setPatientCountry(patient.country || defaultCountry);
        setNewPatient({
            full_name: patient.full_name || '',
            phone: patient.phone || '',
            email: patient.email || '',
            birth_date: patient.birth_date || '',
            gender: patient.gender || '',
            country: patient.country || defaultCountry,
            document_id: patient.document_id || '',
            address: patient.address || '',
            allergies: patient.allergies?.join(', ') || '',
            chronic_conditions: patient.chronic_conditions?.join(', ') || '',
            current_medications: patient.current_medications?.join(', ') || '',
            notes: patient.notes || ''
        });
        setShowNewPatientForm(true);
    };

    const resetForm = () => {
        setShowNewPatientForm(false);
        setIsEditMode(false);
        setEditingPatient(null);
        setPatientCountry(defaultCountry);
        setNewPatient({
            full_name: '',
            phone: '',
            email: '',
            birth_date: '',
            gender: '',
            country: defaultCountry,
            document_id: '',
            address: '',
            allergies: '',
            chronic_conditions: '',
            current_medications: '',
            notes: ''
        });
        setError(null);
        setShowHistoryPanel(false);
        setHistoryPatient(null);
        setShowImportSection(false);
        setRawHistoryText('');
        setIsParsing(false);
        setParsedHistoryData(null);
        setImportSuccess(false);
    };

    const handleDeletePatient = async (patientId) => {
        if (confirmDeleteId !== patientId) {
            setConfirmDeleteId(patientId);
            return;
        }
        setDeletingPatientId(patientId);
        try {
            await deletePatient(patientId);
            setConfirmDeleteId(null);
            await fetchPatients();
        } catch (err) {
            setError(err.message || t('errorDeletingPatient'));
        } finally {
            setDeletingPatientId(null);
        }
    };

    const handleSubmitPatient = async (e) => {
        e.preventDefault();
        if (!newPatient.full_name.trim()) {
            setError(t('patientNameRequired'));
            return;
        }

        setSaving(true);
        try {
            // Parse comma-separated values into arrays
            const patientData = {
                full_name: newPatient.full_name.trim(),
                phone: newPatient.phone || null,
                email: newPatient.email || null,
                birth_date: newPatient.birth_date || null,
                gender: newPatient.gender || null,
                country: newPatient.country || null,
                document_id: newPatient.document_id || null,
                address: newPatient.address || null,
                allergies: newPatient.allergies ? newPatient.allergies.split(',').map(s => s.trim()) : null,
                chronic_conditions: newPatient.chronic_conditions ? newPatient.chronic_conditions.split(',').map(s => s.trim()) : null,
                current_medications: newPatient.current_medications ? newPatient.current_medications.split(',').map(s => s.trim()) : null,
                notes: newPatient.notes || null,
                clinical_history: rawHistoryText || null,
                clinical_history_parsed: parsedHistoryData || null
            };

            let result;
            if (isEditMode && editingPatient) {
                result = await updatePatient(editingPatient.id, patientData);
            } else {
                result = await createPatient(patientData);
            }

            await fetchPatients();
            handleSelectPatient(result);
        } catch (err) {
            setError(err.message || t(isEditMode ? 'errorUpdatingPatient' : 'errorCreatingPatient'));
        } finally {
            setSaving(false);
        }
    };

    const handleOrganizeHistory = async () => {
        if (!rawHistoryText || rawHistoryText.length < 20) return;

        setIsParsing(true);
        setImportSuccess(false);
        setError(null);

        try {
            const result = await previewHistoryImport(rawHistoryText);
            if (!result) return;

            const { parsedHistory, extractedFields } = result;

            // Store parsed consultations for submission
            if (parsedHistory) {
                setParsedHistoryData(parsedHistory);
            }

            // Auto-fill form fields from extracted patient data
            if (extractedFields) {
                setNewPatient(prev => ({
                    ...prev,
                    full_name: extractedFields.full_name || prev.full_name,
                    gender: extractedFields.gender || prev.gender,
                    birth_date: extractedFields.birth_date || prev.birth_date,
                    document_id: extractedFields.document_id ? formatDocument(extractedFields.document_id, patientCountry) : prev.document_id,
                    allergies: extractedFields.allergies?.length > 0
                        ? extractedFields.allergies.join(', ')
                        : prev.allergies,
                    chronic_conditions: extractedFields.chronic_conditions?.length > 0
                        ? extractedFields.chronic_conditions.join(', ')
                        : prev.chronic_conditions,
                    current_medications: extractedFields.current_medications?.length > 0
                        ? extractedFields.current_medications.join(', ')
                        : prev.current_medications
                }));
            }

            const numConsultations = parsedHistory?.length || 0;
            setImportSuccess(numConsultations > 0 ? numConsultations : true);
        } catch (err) {
            setError(err.message || t('errorProcessingHistory'));
        } finally {
            setIsParsing(false);
        }
    };

    const handleImportHistoryEdit = () => {
        // In edit mode, open the full history panel
        if (isEditMode && editingPatient) {
            setHistoryPatient(editingPatient);
            setShowHistoryPanel(true);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3>{showNewPatientForm ? (isEditMode ? t('editPatient') : t('registerNewPatient')) : t('selectPatient')}</h3>
                    <button className={styles.closeButton} onClick={onClose}>
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </div>

                {!showNewPatientForm ? (
                    <>
                        {/* Search */}
                        <div className={styles.searchContainer}>
                            <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
                            <input
                                type="text"
                                id="patient-search"
                                name="patient-search"
                                placeholder={t('searchPatientPlaceholder')}
                                value={searchTerm}
                                onChange={handleSearch}
                                className={styles.searchInput}
                            />
                        </div>

                        {/* Patient List */}
                        <div className={styles.patientList}>
                            {loading ? (
                                <div className={styles.loading}>{t('loading')}...</div>
                            ) : patients.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <FontAwesomeIcon icon={faUser} className={styles.emptyIcon} />
                                    <p>{searchTerm ? t('noPatientFound') : t('noPatientsRegistered')}</p>
                                </div>
                            ) : (
                                patients.map(patient => (
                                    <div
                                        key={patient.id}
                                        className={styles.patientCard}
                                        onClick={() => { setConfirmDeleteId(null); handleSelectPatient(patient); }}
                                    >
                                        <div className={styles.patientInfo}>
                                            <span className={styles.patientName}>{patient.full_name}</span>
                                            {patient.phone && (
                                                <span className={styles.patientDetail}>
                                                    <FontAwesomeIcon icon={faPhone} /> {patient.phone}
                                                </span>
                                            )}
                                            {patient.email && (
                                                <span className={styles.patientDetail}>
                                                    <FontAwesomeIcon icon={faEnvelope} /> {patient.email}
                                                </span>
                                            )}
                                        </div>
                                        <div className={styles.patientActions}>
                                            {/* Badges só aparecem se o backend retornou termos normalizados (não null) */}
                                            {(patient.allergies?.length > 0 || patient.chronic_conditions?.length > 0) && (
                                                <div className={styles.patientAlerts}>
                                                    {patient.allergies?.length > 0 && (
                                                        <span
                                                            className={styles.alertBadge}
                                                            title={formatTooltip(patient.allergies, t('allergies'))}
                                                        >
                                                            <FontAwesomeIcon icon={faExclamationTriangle} />
                                                        </span>
                                                    )}
                                                    {patient.chronic_conditions?.length > 0 && (
                                                        <span
                                                            className={styles.conditionBadge}
                                                            title={formatTooltip(patient.chronic_conditions, t('chronicConditions'))}
                                                        >
                                                            <FontAwesomeIcon icon={faHeartPulse} />
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            <button
                                                className={styles.editButton}
                                                onClick={(e) => { e.stopPropagation(); handleEditPatient(patient); }}
                                                title={t('editPatient')}
                                            >
                                                <FontAwesomeIcon icon={faPencil} />
                                            </button>
                                            <button
                                                className={`${styles.deleteButton} ${confirmDeleteId === patient.id ? styles.deleteConfirm : ''}`}
                                                onClick={(e) => { e.stopPropagation(); handleDeletePatient(patient.id); }}
                                                title={confirmDeleteId === patient.id ? t('clickToConfirmDelete') : t('deletePatient')}
                                                disabled={deletingPatientId === patient.id}
                                            >
                                                <FontAwesomeIcon icon={faTrash} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* New Patient Button */}
                        <button
                            className={styles.newPatientButton}
                            onClick={() => setShowNewPatientForm(true)}
                        >
                            <FontAwesomeIcon icon={faUserPlus} /> {t('registerNewPatient')}
                        </button>
                    </>
                ) : (
                    /* New Patient Form */
                    <form onSubmit={handleSubmitPatient} className={styles.newPatientForm} autoComplete="off">
                        {/* Smart History Import Section - FIRST thing in form (create mode only) */}
                        {!isEditMode && (
                            <div className={styles.importSection}>
                                <button
                                    type="button"
                                    onClick={() => setShowImportSection(!showImportSection)}
                                    className={styles.importToggleButton}
                                >
                                    <FontAwesomeIcon icon={faFileImport} />
                                    {t('importClinicalHistory')}
                                    <FontAwesomeIcon icon={showImportSection ? faChevronUp : faChevronDown} className={styles.importChevron} />
                                </button>

                                {showImportSection && (
                                    <div className={styles.importContent}>
                                        <p className={styles.importHelper}>{t('pasteHistoryHelper')}</p>
                                        <textarea
                                            className={styles.importTextarea}
                                            rows={6}
                                            value={rawHistoryText}
                                            onChange={(e) => setRawHistoryText(e.target.value)}
                                            placeholder={t('pasteHistoryPlaceholder')}
                                            disabled={isParsing}
                                        />
                                        <button
                                            type="button"
                                            className={styles.organizeButton}
                                            onClick={handleOrganizeHistory}
                                            disabled={isParsing || rawHistoryText.length < 20}
                                        >
                                            {isParsing ? (
                                                <><FontAwesomeIcon icon={faSpinner} spin /> {t('organizing')}...</>
                                            ) : (
                                                <><FontAwesomeIcon icon={faFileImport} /> {t('organizeWithAI')}</>
                                            )}
                                        </button>
                                        {importSuccess && (
                                            <div className={styles.importSuccess}>
                                                {typeof importSuccess === 'number'
                                                    ? `${importSuccess} ${t('consultationsOrganized')}. ${t('importSuccessMessage')}`
                                                    : t('importSuccessMessage')
                                                }
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label htmlFor="patient-full-name">{t('fullName')} *</label>
                                <input
                                    type="text"
                                    id="patient-full-name"
                                    name="patient_full_name_field"
                                    autoComplete="off"
                                    value={newPatient.full_name}
                                    onChange={(e) => handleNewPatientChange('full_name', e.target.value)}
                                    placeholder={t('patientFullNamePlaceholder')}
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="patient-country">
                                    <FontAwesomeIcon icon={faGlobe} /> {t('nationality')}
                                </label>
                                <select
                                    id="patient-country"
                                    name="country"
                                    value={patientCountry}
                                    onChange={(e) => handleCountryChange(e.target.value)}
                                >
                                    {countryList.map(country => (
                                        <option key={country.code} value={country.code}>
                                            {country.flag} {country.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="patient-document">{countryConfig.document.name}</label>
                                <input
                                    type="text"
                                    id="patient-document"
                                    name="patient_document_field"
                                    autoComplete="off"
                                    value={newPatient.document_id}
                                    onChange={(e) => handleNewPatientChange('document_id', formatDocument(e.target.value, patientCountry))}
                                    placeholder={countryConfig.document.placeholder}
                                    maxLength={countryConfig.document.maxLength}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="patient-phone">{t('phone')}</label>
                                <input
                                    type="tel"
                                    id="patient-phone"
                                    name="patient_phone_field"
                                    autoComplete="off"
                                    value={newPatient.phone}
                                    onChange={(e) => handleNewPatientChange('phone', formatPhone(e.target.value, patientCountry))}
                                    placeholder={countryConfig.phone.placeholder}
                                    maxLength={countryConfig.phone.maxLength}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="patient-email">{t('email')}</label>
                                <input
                                    type="email"
                                    id="patient-email"
                                    name="patient_email_field"
                                    autoComplete="off"
                                    value={newPatient.email}
                                    onChange={(e) => handleNewPatientChange('email', e.target.value)}
                                    placeholder="patient@email.com"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="patient-birth-date">{t('birthDate')}</label>
                                <input
                                    type="date"
                                    id="patient-birth-date"
                                    name="birth_date"
                                    value={newPatient.birth_date}
                                    onChange={(e) => handleNewPatientChange('birth_date', e.target.value)}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="patient-gender">{t('gender')}</label>
                                <select
                                    id="patient-gender"
                                    name="gender"
                                    value={newPatient.gender}
                                    onChange={(e) => handleNewPatientChange('gender', e.target.value)}
                                >
                                    <option value="">{t('selectGender')}</option>
                                    <option value="male">{t('male')}</option>
                                    <option value="female">{t('female')}</option>
                                    <option value="other">{t('genderOther')}</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="patient-address">
                                    <FontAwesomeIcon icon={faMapMarkerAlt} /> {t('address')}
                                </label>
                                <input
                                    type="text"
                                    id="patient-address"
                                    name="patient_address_field"
                                    autoComplete="off"
                                    value={newPatient.address}
                                    onChange={(e) => handleNewPatientChange('address', e.target.value)}
                                    placeholder={t('addressPlaceholder')}
                                />
                            </div>
                        </div>

                        <div className={styles.clinicalSection}>
                            <h4><FontAwesomeIcon icon={faExclamationTriangle} /> {t('clinicalAlerts')}</h4>
                            <p className={styles.clinicalHelperText}>{t('clinicalFieldsAiHelper')}</p>
                            <div className={styles.formGroup}>
                                <label htmlFor="patient-allergies">{t('allergies')}</label>
                                <input
                                    type="text"
                                    id="patient-allergies"
                                    name="patient_allergies_field"
                                    autoComplete="off"
                                    value={newPatient.allergies}
                                    onChange={(e) => handleNewPatientChange('allergies', e.target.value)}
                                    placeholder={t('allergiesPlaceholder')}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="patient-chronic-conditions">{t('chronicConditions')}</label>
                                <input
                                    type="text"
                                    id="patient-chronic-conditions"
                                    name="patient_conditions_field"
                                    autoComplete="off"
                                    value={newPatient.chronic_conditions}
                                    onChange={(e) => handleNewPatientChange('chronic_conditions', e.target.value)}
                                    placeholder={t('chronicConditionsPlaceholder')}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="patient-current-medications">{t('currentMedications')}</label>
                                <input
                                    type="text"
                                    id="patient-current-medications"
                                    name="patient_medications_field"
                                    autoComplete="off"
                                    value={newPatient.current_medications}
                                    onChange={(e) => handleNewPatientChange('current_medications', e.target.value)}
                                    placeholder={t('currentMedicationsPlaceholder')}
                                />
                            </div>
                            {/* In edit mode, show button to open full history panel */}
                            {isEditMode && editingPatient && (
                                <button
                                    type="button"
                                    className={styles.importHistoryButton}
                                    onClick={handleImportHistoryEdit}
                                    disabled={saving}
                                >
                                    <FontAwesomeIcon icon={faFileImport} />
                                    {t('importClinicalHistory')}
                                </button>
                            )}
                        </div>

                        {error && <div className={styles.errorMessage}>{error}</div>}

                        <div className={styles.formActions}>
                            <button
                                type="button"
                                className={styles.cancelButton}
                                onClick={resetForm}
                            >
                                {t('cancel')}
                            </button>
                            <button
                                type="submit"
                                className={styles.saveButton}
                                disabled={saving}
                            >
                                {saving ? t('saving') : (isEditMode ? t('saveChanges') : t('registerAndSelect'))}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* Patient History Panel - same modal used in ConsultationForm */}
            <PatientHistoryPanel
                isOpen={showHistoryPanel}
                onClose={() => setShowHistoryPanel(false)}
                patient={historyPatient}
                onHistoryUpdated={() => {}}
            />
        </div>
    );
}

export default PatientPickerModal;
