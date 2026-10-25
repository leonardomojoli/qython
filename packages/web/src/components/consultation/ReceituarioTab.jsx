// frontend/src/components/consultation/ReceituarioTab.js

import React, { useState } from 'react';
import styles from './ReceituarioTab.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faPills,
    faPlus,
    faTrash,
    faFilePdf,
    faUser,
    faFileAlt,
    faShare,
    faUserPlus,
    faTimes,
    faThumbsUp,
    faThumbsDown
} from '@fortawesome/free-solid-svg-icons';
import { createPrescription, getPrescriptionPdf, createDocument, getDocumentPdf, submitFeedback } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import PatientPickerModal from './PatientPickerModal';

function ReceituarioTab({ isEmbedded = false, defaultIcdCodes = [], prefillMedication = null }) {
    const { t } = useTranslation();
    const { addNotification } = useNotification();

    // Sub-tabs
    const [activeSubTab, setActiveSubTab] = useState('prescription');

    // Shared state
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [isPatientPickerOpen, setIsPatientPickerOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Feedback state (for report & referral)
    const [lastCreatedDoc, setLastCreatedDoc] = useState(null);
    const [feedbackSent, setFeedbackSent] = useState(false);

    // Prescription state
    const [prescriptionType, setPrescriptionType] = useState('simple');
    const [items, setItems] = useState([
        { medication: '', dosage: '', frequency: '', duration: '', quantity: '', instructions: '' }
    ]);
    const [notes, setNotes] = useState('');
    const [icdCodes, setIcdCodes] = useState(defaultIcdCodes);

    // Report/Referral state
    const [formData, setFormData] = useState({
        diagnosis: '',
        reportContent: '',
        specialty: '',
        reason: '',
        urgency: 'routine',
    });

    // Sync ICD codes
    React.useEffect(() => {
        if (defaultIcdCodes && defaultIcdCodes.length > 0) {
            setIcdCodes(defaultIcdCodes);
        }
    }, [defaultIcdCodes]);

    // Prefill medication from pharmacy navigation
    React.useEffect(() => {
        if (prefillMedication) {
            const medName = prefillMedication.name || '';
            const medDosage = prefillMedication.presentation || '';
            setItems([
                { medication: medName, dosage: medDosage, frequency: '', duration: '', quantity: '', instructions: '' }
            ]);
            setActiveSubTab('prescription');
        }
    }, [prefillMedication]);

    const subTabs = [
        { id: 'prescription', icon: faPills, label: t('prescriptionSubTab', 'Prescrição') },
        { id: 'report', icon: faFileAlt, label: t('report', 'Relatório') },
        { id: 'referral', icon: faShare, label: t('referral', 'Encaminhamento') },
    ];

    // Patient handlers
    const handlePatientSelect = (patient) => {
        setSelectedPatient(patient);
        setIsPatientPickerOpen(false);
    };

    const handleClearPatient = () => {
        setSelectedPatient(null);
    };

    // Prescription item handlers
    const addItem = () => {
        setItems([...items, { medication: '', dosage: '', frequency: '', duration: '', quantity: '', instructions: '' }]);
    };

    const removeItem = (index) => {
        if (items.length > 1) {
            const newItems = [...items];
            newItems.splice(index, 1);
            setItems(newItems);
        }
    };

    const updateItem = (index, field, value) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Feedback handler
    const handleFeedback = async (type) => {
        if (!lastCreatedDoc || feedbackSent) return;

        try {
            await submitFeedback({
                feedback_type: type,
                content_type: `medical_document_${lastCreatedDoc.type}`,
                original_content: JSON.stringify(lastCreatedDoc.content),
                content_id: String(lastCreatedDoc.id),
                training_data_id: lastCreatedDoc.training_data_id,
                feedback_text: '',
                contact_permission: false
            });

            addNotification(
                type === 'like'
                    ? t('feedbackThankYou', 'Obrigado pelo feedback!')
                    : t('feedbackNoted', 'Feedback registrado. Vamos melhorar!'),
                'success'
            );
            setFeedbackSent(true);
            setTimeout(() => setLastCreatedDoc(null), 3000);
        } catch (error) {
            console.error('Error submitting feedback:', error);
        }
    };

    // Save prescription
    const handleSavePrescription = async () => {
        if (!selectedPatient) {
            addNotification(t('selectPatientFirst', 'Selecione um paciente primeiro'), 'warning');
            return;
        }

        const validItems = items.filter(i => i.medication.trim() !== '');
        if (validItems.length === 0) {
            addNotification(t('addMedicationFirst', 'Adicione pelo menos um medicamento'), 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                patient_id: selectedPatient.id,
                prescription_type: prescriptionType,
                items: validItems,
                notes: notes
            };

            const newPrescription = await createPrescription(payload);
            addNotification(t('prescriptionCreatedSuccess', 'Prescrição criada com sucesso!'), 'success');

            try {
                addNotification(t('generatingPdf', 'Gerando PDF...'), 'info');
                const blob = await getPrescriptionPdf(newPrescription.id);
                const url = window.URL.createObjectURL(new Blob([blob]));
                const link = document.createElement('a');
                link.href = url;
                const dateStr = new Date().toISOString().split('T')[0];
                link.setAttribute('download', `receita_${selectedPatient.full_name}_${dateStr}.pdf`);
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            } catch (pdfError) {
                console.error("Erro ao baixar PDF:", pdfError);
                addNotification(t('prescriptionSavedPdfError', 'Receita salva, mas erro ao baixar PDF.'), 'warning');
            }

            setItems([{ medication: '', dosage: '', frequency: '', duration: '', quantity: '', instructions: '' }]);
            setNotes('');
        } catch (error) {
            console.error(error);
            addNotification(t('prescriptionCreateError', 'Erro ao criar prescrição'), 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Save report or referral
    const handleSaveDocument = async () => {
        if (!selectedPatient) {
            addNotification(t('selectPatientFirst', 'Selecione um paciente primeiro'), 'warning');
            return;
        }

        if (activeSubTab === 'referral' && !formData.specialty) {
            addNotification(t('specialtyRequired', 'Informe a especialidade'), 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            const content = activeSubTab === 'report'
                ? { diagnosis: formData.diagnosis, content: formData.reportContent }
                : { specialty: formData.specialty, reason: formData.reason, urgency: formData.urgency };

            const documentData = {
                patient_id: selectedPatient.id,
                document_type: activeSubTab,
                content,
            };

            const createdDoc = await createDocument(documentData);
            addNotification(t('documentCreatedSuccess', 'Documento criado com sucesso!'), 'success');

            try {
                const pdfBlob = await getDocumentPdf(createdDoc.id);
                const url = window.URL.createObjectURL(pdfBlob);
                const link = document.createElement('a');
                link.href = url;
                const typeLabels = { report: 'Relatorio', referral: 'Encaminhamento' };
                link.download = `${typeLabels[activeSubTab]}_${selectedPatient.full_name.replace(/\s/g, '_')}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (pdfError) {
                console.error('Error downloading PDF:', pdfError);
                addNotification(t('pdfDownloadError', 'Erro ao baixar PDF'), 'error');
            }

            setFormData({
                diagnosis: '',
                reportContent: '',
                specialty: '',
                reason: '',
                urgency: 'routine',
            });

            setLastCreatedDoc({ id: createdDoc.id, type: activeSubTab, content, training_data_id: createdDoc.training_data_id });
            setFeedbackSent(false);
        } catch (error) {
            console.error('Error creating document:', error);
            addNotification(t('documentCreateError', 'Erro ao criar documento'), 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGenerate = () => {
        if (activeSubTab === 'prescription') {
            handleSavePrescription();
        } else {
            handleSaveDocument();
        }
    };

    const renderPrescriptionForm = () => (
        <>
            {/* Prescription Type */}
            <div className={styles.row}>
                <div className={styles.col}>
                    <label htmlFor="prescription-type" className={styles.label}>{t('type', 'Tipo')}</label>
                    <select
                        id="prescription-type"
                        className={styles.select}
                        value={prescriptionType}
                        onChange={(e) => setPrescriptionType(e.target.value)}
                    >
                        <option value="simple">{t('simplePrescription', 'Receita Simples')}</option>
                        <option value="controlled_c1">{t('controlledC1', 'Controle Especial (C1)')}</option>
                        <option value="controlled_b1">{t('controlledB1', 'Notificação B (B1)')}</option>
                    </select>
                </div>
            </div>

            {/* ICD-10 Diagnosis Section */}
            {icdCodes && icdCodes.length > 0 && (
                <div className={styles.icdSection}>
                    <label className={styles.label}>
                        <FontAwesomeIcon icon={faPills} style={{ marginRight: '8px', opacity: 0.7 }} />
                        {t('diagnosisIcd10', 'Diagnóstico (CID-10)')}
                    </label>
                    <div className={styles.icdChips}>
                        {icdCodes.map((icd, idx) => (
                            <span key={icd.code || idx} className={styles.icdChip}>
                                <strong>{icd.code}</strong>: {icd.description}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Medications List */}
            <div className={styles.medicationsList}>
                {items.map((item, index) => (
                    <div key={index} className={styles.medicationItem}>
                        <div className={styles.itemHeader}>
                            <span className={styles.itemNumber}>{t('medication', 'Medicamento')} {index + 1}</span>
                            {items.length > 1 && (
                                <button
                                    className={styles.removeButton}
                                    onClick={() => removeItem(index)}
                                    aria-label="Remover medicamento"
                                >
                                    <FontAwesomeIcon icon={faTrash} />
                                </button>
                            )}
                        </div>

                        <div className={styles.medicationGrid}>
                            <input
                                className={styles.input}
                                placeholder={t('medicationPlaceholder', "Nome do medicamento (ex: Amoxicilina 875mg)")}
                                value={item.medication}
                                onChange={(e) => updateItem(index, 'medication', e.target.value)}
                                autoFocus={index === items.length - 1 && index > 0}
                                aria-label="Nome do medicamento"
                            />
                            <input
                                className={styles.input}
                                placeholder={t('quantity', "Qtd (ex: 2 cx)")}
                                value={item.quantity}
                                onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                                aria-label="Quantidade"
                            />
                            <input
                                className={styles.input}
                                placeholder={t('usage', "Uso (ex: Oral)")}
                                value={item.instructions}
                                onChange={(e) => updateItem(index, 'instructions', e.target.value)}
                                aria-label="Uso ou instruções"
                            />
                        </div>

                        <div className={styles.medicationGrid}>
                            <input
                                className={styles.input}
                                placeholder={t('dosage', "Posologia (ex: 1 comprimido)")}
                                value={item.dosage}
                                onChange={(e) => updateItem(index, 'dosage', e.target.value)}
                                aria-label="Posologia"
                            />
                            <input
                                className={styles.input}
                                placeholder={t('frequency', "Frequência (ex: 8/8h)")}
                                value={item.frequency}
                                onChange={(e) => updateItem(index, 'frequency', e.target.value)}
                                aria-label="Frequência"
                            />
                            <input
                                className={styles.input}
                                placeholder={t('duration', "Duração (ex: 7 dias)")}
                                value={item.duration}
                                onChange={(e) => updateItem(index, 'duration', e.target.value)}
                                aria-label="Duração"
                            />
                        </div>
                    </div>
                ))}
            </div>

            <button className={styles.addItemButton} onClick={addItem}>
                <FontAwesomeIcon icon={faPlus} /> {t('addMedication', 'Adicionar Medicamento')}
            </button>

            <div className={styles.row}>
                <div className={styles.col}>
                    <label htmlFor="prescription-notes" className={styles.label}>{t('notes', 'Observações')}</label>
                    <textarea
                        id="prescription-notes"
                        className={styles.textarea}
                        rows="3"
                        placeholder={t('notesPlaceholder', "Observações adicionais para a receita...")}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </div>
            </div>
        </>
    );

    const renderReportForm = () => (
        <>
            <div className={styles.row}>
                <div className={styles.col}>
                    <label htmlFor="diagnosis" className={styles.label}>{t('diagnosis', 'Diagnóstico')}</label>
                    <input
                        id="diagnosis"
                        name="diagnosis"
                        type="text"
                        className={styles.input}
                        value={formData.diagnosis}
                        onChange={handleInputChange}
                        placeholder={t('diagnosisPlaceholder', 'Diagnóstico principal...')}
                    />
                </div>
            </div>
            <div className={styles.row}>
                <div className={styles.col}>
                    <label htmlFor="reportContent" className={styles.label}>{t('reportContent', 'Conteúdo do Relatório')}</label>
                    <textarea
                        id="reportContent"
                        name="reportContent"
                        className={styles.textarea}
                        value={formData.reportContent}
                        onChange={handleInputChange}
                        placeholder={t('reportPlaceholder', 'Escreva o conteúdo do relatório médico...')}
                        rows={6}
                    />
                </div>
            </div>
        </>
    );

    const renderReferralForm = () => (
        <>
            <div className={styles.row}>
                <div className={styles.col}>
                    <label htmlFor="specialty" className={styles.label}>{t('referralSpecialty', 'Especialidade')} *</label>
                    <input
                        id="specialty"
                        name="specialty"
                        type="text"
                        className={styles.input}
                        value={formData.specialty}
                        onChange={handleInputChange}
                        placeholder="Ex: Cardiologia, Ortopedia..."
                    />
                </div>
                <div className={styles.col}>
                    <label htmlFor="urgency" className={styles.label}>{t('urgency', 'Prioridade')}</label>
                    <select
                        id="urgency"
                        name="urgency"
                        className={styles.select}
                        value={formData.urgency}
                        onChange={handleInputChange}
                    >
                        <option value="routine">{t('routine', 'Rotina')}</option>
                        <option value="urgent">{t('urgent', 'Urgente')}</option>
                        <option value="emergency">{t('emergency', 'Emergência')}</option>
                    </select>
                </div>
            </div>
            <div className={styles.row}>
                <div className={styles.col}>
                    <label htmlFor="reason" className={styles.label}>{t('referralReason', 'Motivo do Encaminhamento')}</label>
                    <textarea
                        id="reason"
                        name="reason"
                        className={styles.textarea}
                        value={formData.reason}
                        onChange={handleInputChange}
                        placeholder={t('referralReasonPlaceholder', 'Descreva o motivo do encaminhamento...')}
                        rows={4}
                    />
                </div>
            </div>
        </>
    );

    const renderFormFields = () => {
        switch (activeSubTab) {
            case 'prescription': return renderPrescriptionForm();
            case 'report': return renderReportForm();
            case 'referral': return renderReferralForm();
            default: return null;
        }
    };

    const getButtonLabel = () => {
        if (isSubmitting) return t('generating', 'Gerando...');
        if (activeSubTab === 'prescription') return t('generatePrescription', 'Gerar Receita');
        return t('generateDocument', 'Gerar Documento');
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>
                    <FontAwesomeIcon icon={faPills} />
                    {t('prescription', 'Receituário')}
                </h2>
            </div>

            {/* Sub-tabs */}
            <div className={styles.docTabs}>
                {subTabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`${styles.docTab} ${activeSubTab === tab.id ? styles.docTabActive : ''}`}
                        onClick={() => setActiveSubTab(tab.id)}
                    >
                        <FontAwesomeIcon icon={tab.icon} className={styles.docTabIcon} />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Patient Selector */}
            <div className={styles.section}>
                <label className={styles.label}>{t('patient', 'Paciente')} *</label>
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

            {/* Footer */}
            <div className={styles.footer}>
                {lastCreatedDoc && !feedbackSent && (
                    <div className={styles.feedbackSection}>
                        <span className={styles.feedbackLabel}>{t('documentHelpful', 'Documento ficou bom?')}</span>
                        <button
                            className={`${styles.feedbackBtn} ${styles.likeBtn}`}
                            onClick={() => handleFeedback('like')}
                            title={t('like', 'Gostei')}
                        >
                            <FontAwesomeIcon icon={faThumbsUp} />
                        </button>
                        <button
                            className={`${styles.feedbackBtn} ${styles.dislikeBtn}`}
                            onClick={() => handleFeedback('dislike')}
                            title={t('dislike', 'Não gostei')}
                        >
                            <FontAwesomeIcon icon={faThumbsDown} />
                        </button>
                    </div>
                )}
                {feedbackSent && lastCreatedDoc && (
                    <div className={styles.feedbackThanks}>
                        {t('thankYou', 'Obrigado!')}
                    </div>
                )}
                <button
                    className={styles.generateButton}
                    onClick={handleGenerate}
                    disabled={isSubmitting || !selectedPatient}
                >
                    <FontAwesomeIcon icon={faFilePdf} />
                    {getButtonLabel()}
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

export default ReceituarioTab;
