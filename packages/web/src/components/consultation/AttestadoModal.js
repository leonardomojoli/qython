// frontend/src/components/consultation/AttestadoModal.js

import React, { useState } from 'react';
import styles from './AttestadoModal.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faFileMedical,
    faBriefcaseMedical,
    faCalendarCheck,
    faUserPlus,
    faTimes,
    faFilePdf
} from '@fortawesome/free-solid-svg-icons';
import { createDocument, getDocumentPdf } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import PatientPickerModal from './PatientPickerModal';

function AttestadoModal({ isEmbedded = false }) {
    const { t } = useTranslation();
    const { addNotification } = useNotification();

    // Sub-tabs: 'sick_leave', 'attendance', 'fitness'
    const [activeDocType, setActiveDocType] = useState('sick_leave');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [isPatientPickerOpen, setIsPatientPickerOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form fields for each document type
    const [formData, setFormData] = useState({
        // Atestado (sick_leave)
        cid: '',
        days: '',
        startDate: new Date().toISOString().split('T')[0],
        description: '',
        // Declaração de Comparecimento (attendance)
        attendanceDate: new Date().toISOString().split('T')[0],
        attendanceTime: '',
        duration: '',
        // Aptidão Física (fitness)
        purpose: '',
        validUntil: '',
    });

    const docTabs = [
        { id: 'sick_leave', icon: faBriefcaseMedical, label: t('sickLeave', 'Atestado') },
        { id: 'attendance', icon: faCalendarCheck, label: t('attendance', 'Comparecimento') },
        { id: 'fitness', icon: faFileMedical, label: t('fitness', 'Aptidão') },
    ];

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePatientSelect = (patient) => {
        setSelectedPatient(patient);
        setIsPatientPickerOpen(false);
    };

    const handleClearPatient = () => {
        setSelectedPatient(null);
    };

    const buildContent = () => {
        switch (activeDocType) {
            case 'sick_leave':
                return {
                    cid: formData.cid,
                    days: formData.days,
                    start_date: formData.startDate,
                    description: formData.description,
                };
            case 'attendance':
                return {
                    date: formData.attendanceDate,
                    time: formData.attendanceTime,
                    duration: formData.duration,
                };
            case 'fitness':
                return {
                    purpose: formData.purpose,
                    valid_until: formData.validUntil,
                };
            default:
                return {};
        }
    };

    const validateForm = () => {
        if (!selectedPatient) {
            addNotification(t('selectPatientFirst', 'Selecione um paciente primeiro'), 'warning');
            return false;
        }

        switch (activeDocType) {
            case 'sick_leave':
                if (!formData.days) {
                    addNotification(t('daysRequired', 'Informe a quantidade de dias'), 'warning');
                    return false;
                }
                break;
        }
        return true;
    };

    const handleGenerate = async () => {
        if (!validateForm()) return;

        setIsSubmitting(true);
        try {
            const documentData = {
                patient_id: selectedPatient.id,
                document_type: activeDocType,
                content: buildContent(),
            };

            const createdDoc = await createDocument(documentData);
            addNotification(t('documentCreatedSuccess', 'Documento criado com sucesso!'), 'success');

            // Trigger PDF download
            try {
                const pdfBlob = await getDocumentPdf(createdDoc.id);
                const url = window.URL.createObjectURL(pdfBlob);
                const link = document.createElement('a');
                link.href = url;
                const typeLabels = {
                    sick_leave: 'Atestado',
                    fitness: 'AptidaoFisica',
                    attendance: 'Comparecimento',
                };
                link.download = `${typeLabels[activeDocType]}_${selectedPatient.full_name.replace(/\s/g, '_')}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (pdfError) {
                console.error('Error downloading PDF:', pdfError);
                addNotification(t('pdfDownloadError', 'Erro ao baixar PDF'), 'error');
            }

            // Reset form
            setFormData({
                cid: '',
                days: '',
                startDate: new Date().toISOString().split('T')[0],
                description: '',
                attendanceDate: new Date().toISOString().split('T')[0],
                attendanceTime: '',
                duration: '',
                purpose: '',
                validUntil: '',
            });
            setSelectedPatient(null);

        } catch (error) {
            console.error('Error creating document:', error);
            addNotification(t('documentCreateError', 'Erro ao criar documento'), 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderFormFields = () => {
        switch (activeDocType) {
            case 'sick_leave':
                return (
                    <>
                        <div className={styles.row}>
                            <div className={styles.col}>
                                <label htmlFor="cid" className={styles.label}>{t('cid', 'CID-10')} <span className={styles.optional}>({t('optional', 'opcional')})</span></label>
                                <input
                                    id="cid"
                                    name="cid"
                                    type="text"
                                    className={styles.input}
                                    value={formData.cid}
                                    onChange={handleInputChange}
                                    placeholder="Ex: J11.1"
                                />
                            </div>
                            <div className={styles.col}>
                                <label htmlFor="days" className={styles.label}>{t('daysOfLeave', 'Dias de Afastamento')} *</label>
                                <input
                                    id="days"
                                    name="days"
                                    type="number"
                                    className={styles.input}
                                    value={formData.days}
                                    onChange={handleInputChange}
                                    placeholder="Ex: 3"
                                    min="1"
                                />
                            </div>
                        </div>
                        <div className={styles.row}>
                            <div className={styles.col}>
                                <label htmlFor="startDate" className={styles.label}>{t('startDate', 'Data de Início')}</label>
                                <input
                                    id="startDate"
                                    name="startDate"
                                    type="date"
                                    className={styles.input}
                                    value={formData.startDate}
                                    onChange={handleInputChange}
                                />
                            </div>
                        </div>
                        <div className={styles.row}>
                            <div className={styles.col}>
                                <label htmlFor="description" className={styles.label}>{t('observations', 'Observações')}</label>
                                <textarea
                                    id="description"
                                    name="description"
                                    className={styles.textarea}
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    placeholder={t('observationsPlaceholder', 'Observações adicionais...')}
                                    rows={3}
                                />
                            </div>
                        </div>
                    </>
                );

            case 'attendance':
                return (
                    <>
                        <div className={styles.row}>
                            <div className={styles.col}>
                                <label htmlFor="attendanceDate" className={styles.label}>{t('date', 'Data')}</label>
                                <input
                                    id="attendanceDate"
                                    name="attendanceDate"
                                    type="date"
                                    className={styles.input}
                                    value={formData.attendanceDate}
                                    onChange={handleInputChange}
                                />
                            </div>
                            <div className={styles.col}>
                                <label htmlFor="attendanceTime" className={styles.label}>{t('time', 'Horário')}</label>
                                <input
                                    id="attendanceTime"
                                    name="attendanceTime"
                                    type="time"
                                    className={styles.input}
                                    value={formData.attendanceTime}
                                    onChange={handleInputChange}
                                />
                            </div>
                        </div>
                        <div className={styles.row}>
                            <div className={styles.col}>
                                <label htmlFor="duration" className={styles.label}>{t('attendanceDuration', 'Duração do Atendimento')}</label>
                                <input
                                    id="duration"
                                    name="duration"
                                    type="text"
                                    className={styles.input}
                                    value={formData.duration}
                                    onChange={handleInputChange}
                                    placeholder="Ex: 30 minutos"
                                />
                            </div>
                        </div>
                    </>
                );

            case 'fitness':
                return (
                    <>
                        <div className={styles.row}>
                            <div className={styles.col}>
                                <label htmlFor="purpose" className={styles.label}>{t('fitnessPurpose', 'Finalidade da Aptidão')}</label>
                                <input
                                    id="purpose"
                                    name="purpose"
                                    type="text"
                                    className={styles.input}
                                    value={formData.purpose}
                                    onChange={handleInputChange}
                                    placeholder="Ex: prática de atividades físicas, trabalho..."
                                />
                            </div>
                        </div>
                        <div className={styles.row}>
                            <div className={styles.col}>
                                <label htmlFor="validUntil" className={styles.label}>{t('validUntil', 'Válido até')}</label>
                                <input
                                    id="validUntil"
                                    name="validUntil"
                                    type="date"
                                    className={styles.input}
                                    value={formData.validUntil}
                                    onChange={handleInputChange}
                                />
                            </div>
                        </div>
                    </>
                );

            default:
                return null;
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>
                    <FontAwesomeIcon icon={faFileMedical} />
                    {t('medicalDocuments', 'Documentos Médicos')}
                </h2>
            </div>

            {/* Sub-tabs for document types */}
            <div className={styles.docTabs}>
                {docTabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`${styles.docTab} ${activeDocType === tab.id ? styles.docTabActive : ''}`}
                        onClick={() => setActiveDocType(tab.id)}
                    >
                        <FontAwesomeIcon icon={tab.icon} className={styles.docTabIcon} />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Patient Selector */}
            <div className={styles.section}>
                <label htmlFor="patient-selector" className={styles.label}>{t('patient', 'Paciente')} *</label>
                <div className={styles.patientRow}>
                    {selectedPatient ? (
                        <div className={styles.selectedPatient}>
                            <div className={styles.patientInfo}>
                                <span className={styles.patientName}>{selectedPatient.full_name}</span>
                                {selectedPatient.birth_date && (
                                    <span className={styles.patientMeta}>
                                        {new Date(selectedPatient.birth_date).toLocaleDateString()}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                id="patient-selector"
                                className={styles.clearPatientBtn}
                                onClick={handleClearPatient}
                                title={t('clearPatient', 'Limpar seleção')}
                            >
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            id="patient-selector"
                            className={styles.selectPatientBtn}
                            onClick={() => setIsPatientPickerOpen(true)}
                        >
                            <FontAwesomeIcon icon={faUserPlus} />
                            <span>{t('selectOrCreatePatient', 'Selecionar Paciente')}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Dynamic Form Fields */}
            <div className={styles.formContent}>
                {renderFormFields()}
            </div>

            {/* Footer with Generate Button */}
            <div className={styles.footer}>
                <button
                    className={styles.generateButton}
                    onClick={handleGenerate}
                    disabled={isSubmitting || !selectedPatient}
                >
                    <FontAwesomeIcon icon={faFilePdf} />
                    {isSubmitting ? t('generating', 'Gerando...') : t('generateDocument', 'Gerar Documento')}
                </button>
            </div>

            {/* Patient Picker Modal */}
            <PatientPickerModal
                isOpen={isPatientPickerOpen}
                onClose={() => setIsPatientPickerOpen(false)}
                onSelect={handlePatientSelect}
            />
        </div>
    );
}

export default AttestadoModal;
