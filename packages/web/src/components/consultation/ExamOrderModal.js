// frontend/src/components/consultation/ExamOrderModal.js

import React, { useState } from 'react';
import styles from './ExamOrderModal.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faFlask,
    faUserPlus,
    faTimes,
    faFilePdf,
    faChevronDown,
    faChevronUp,
    faPlus
} from '@fortawesome/free-solid-svg-icons';
import { createExamOrder, getExamOrderPdf } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import PatientPickerModal from './PatientPickerModal';
import { EXAM_PANELS } from '../../data/examPanels';

function ExamOrderModal({ isEmbedded = false, defaultIcdCodes = [] }) {
    const { t } = useTranslation();
    const { addNotification } = useNotification();

    const [selectedPatient, setSelectedPatient] = useState(null);
    const [isPatientPickerOpen, setIsPatientPickerOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Selected exams
    const [selectedExams, setSelectedExams] = useState([]);
    const [customExamName, setCustomExamName] = useState('');

    // Form fields
    const [clinicalIndication, setClinicalIndication] = useState('');
    const [urgency, setUrgency] = useState('routine');

    // Expanded panels
    const [expandedPanels, setExpandedPanels] = useState(['laboratorial']);

    // ICD-10 codes from consultation
    const [icdCodes, setIcdCodes] = useState(defaultIcdCodes);

    // Sync with external ICD codes when they change
    React.useEffect(() => {
        if (defaultIcdCodes && defaultIcdCodes.length > 0) {
            setIcdCodes(defaultIcdCodes);
        }
    }, [defaultIcdCodes]);

    const handlePatientSelect = (patient) => {
        setSelectedPatient(patient);
        setIsPatientPickerOpen(false);
    };

    const handleClearPatient = () => {
        setSelectedPatient(null);
    };

    const togglePanel = (panelId) => {
        setExpandedPanels(prev =>
            prev.includes(panelId)
                ? prev.filter(id => id !== panelId)
                : [...prev, panelId]
        );
    };

    const handleExamToggle = (exam, category) => {
        const examWithCategory = { ...exam, category };
        const isSelected = selectedExams.some(e => e.code === exam.code);

        if (isSelected) {
            setSelectedExams(prev => prev.filter(e => e.code !== exam.code));
        } else {
            setSelectedExams(prev => [...prev, examWithCategory]);
        }
    };

    const handleAddCustomExam = () => {
        if (!customExamName.trim()) return;

        const customExam = {
            name: customExamName.trim(),
            code: `CUSTOM_${Date.now()}`,
            category: 'Personalizado'
        };

        setSelectedExams(prev => [...prev, customExam]);
        setCustomExamName('');
    };

    const handleRemoveExam = (code) => {
        setSelectedExams(prev => prev.filter(e => e.code !== code));
    };

    const validateForm = () => {
        if (!selectedPatient) {
            addNotification(t('selectPatientFirst', 'Selecione um paciente primeiro'), 'warning');
            return false;
        }
        if (selectedExams.length === 0) {
            addNotification(t('selectAtLeastOneExam', 'Selecione pelo menos um exame'), 'warning');
            return false;
        }
        return true;
    };

    const handleGenerate = async () => {
        if (!validateForm()) return;

        setIsSubmitting(true);
        try {
            const orderData = {
                patient_id: selectedPatient.id,
                exams: selectedExams,
                clinical_indication: clinicalIndication,
                urgency,
            };

            const createdOrder = await createExamOrder(orderData);
            addNotification(t('examOrderCreatedSuccess', 'Pedido de exames criado com sucesso!'), 'success');

            // Trigger PDF download
            try {
                const pdfBlob = await getExamOrderPdf(createdOrder.id);
                const url = window.URL.createObjectURL(pdfBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `PedidoExames_${selectedPatient.full_name.replace(/\s/g, '_')}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (pdfError) {
                console.error('Error downloading PDF:', pdfError);
                addNotification(t('pdfDownloadError', 'Erro ao baixar PDF'), 'error');
            }

            // Reset form
            setSelectedExams([]);
            setClinicalIndication('');
            setUrgency('routine');
            setSelectedPatient(null);

        } catch (error) {
            console.error('Error creating exam order:', error);
            addNotification(t('examOrderCreateError', 'Erro ao criar pedido'), 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>
                    <FontAwesomeIcon icon={faFlask} />
                    {t('examOrder', 'Pedido de Exames')}
                </h2>
            </div>

            {/* Patient Selector */}
            <div className={styles.section}>
                <label htmlFor="exam-patient-selector" className={styles.label}>
                    {t('patient', 'Paciente')} *
                </label>
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
                                id="exam-patient-selector"
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
                            id="exam-patient-selector"
                            className={styles.selectPatientBtn}
                            onClick={() => setIsPatientPickerOpen(true)}
                        >
                            <FontAwesomeIcon icon={faUserPlus} />
                            <span>{t('selectOrCreatePatient', 'Selecionar Paciente')}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ICD-10 Diagnosis Section */}
            {icdCodes && icdCodes.length > 0 && (
                <div className={styles.icdSection}>
                    <label className={styles.label}>
                        <FontAwesomeIcon icon={faFlask} style={{ marginRight: '8px', opacity: 0.7 }} />
                        {t('clinicalDiagnosis') || 'Diagnóstico Clínico (CID-10)'}
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

            {/* Selected Exams Pills */}
            {selectedExams.length > 0 && (
                <div className={styles.selectedExamsSection}>
                    <label className={styles.label}>
                        {t('selectedExams', 'Exames Selecionados')} ({selectedExams.length})
                    </label>
                    <div className={styles.examPills}>
                        {selectedExams.map(exam => (
                            <span key={exam.code} className={styles.examPill}>
                                {exam.name}
                                <button
                                    type="button"
                                    onClick={() => handleRemoveExam(exam.code)}
                                    className={styles.removePill}
                                >
                                    <FontAwesomeIcon icon={faTimes} />
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Exam Panels */}
            <div className={styles.panelsContainer}>
                {Object.entries(EXAM_PANELS).map(([panelId, panel]) => (
                    <div key={panelId} className={styles.panel}>
                        <button
                            type="button"
                            className={styles.panelHeader}
                            onClick={() => togglePanel(panelId)}
                        >
                            <span>{panel.label}</span>
                            <FontAwesomeIcon
                                icon={expandedPanels.includes(panelId) ? faChevronUp : faChevronDown}
                            />
                        </button>
                        {expandedPanels.includes(panelId) && (
                            <div className={styles.panelContent}>
                                {panel.exams.map(exam => {
                                    const isSelected = selectedExams.some(e => e.code === exam.code);
                                    return (
                                        <label key={exam.code} className={styles.examCheckbox} htmlFor={`exam-${exam.code}`}>
                                            <input
                                                type="checkbox"
                                                id={`exam-${exam.code}`}
                                                name={`exam-${exam.code}`}
                                                checked={isSelected}
                                                onChange={() => handleExamToggle(exam, panel.label)}
                                            />
                                            <span className={styles.checkboxCustom}></span>
                                            <span className={styles.examName}>{exam.name}</span>
                                            <span className={styles.examCode}>{exam.code}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}

                {/* Custom Exam */}
                <div className={styles.customExamRow}>
                    <input
                        type="text"
                        id="custom-exam-input"
                        name="custom-exam-input"
                        className={styles.input}
                        placeholder={t('customExamPlaceholder', 'Adicionar exame personalizado...')}
                        value={customExamName}
                        onChange={(e) => setCustomExamName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddCustomExam()}
                    />
                    <button
                        type="button"
                        className={styles.addCustomBtn}
                        onClick={handleAddCustomExam}
                        disabled={!customExamName.trim()}
                    >
                        <FontAwesomeIcon icon={faPlus} />
                    </button>
                </div>
            </div>

            {/* Clinical Indication */}
            <div className={styles.section}>
                <label htmlFor="clinical-indication" className={styles.label}>
                    {t('clinicalIndication', 'Indicação Clínica')}
                </label>
                <textarea
                    id="clinical-indication"
                    className={styles.textarea}
                    value={clinicalIndication}
                    onChange={(e) => setClinicalIndication(e.target.value)}
                    placeholder={t('clinicalIndicationPlaceholder', 'Descreva a indicação clínica para os exames...')}
                    rows={3}
                />
            </div>

            {/* Urgency */}
            <div className={styles.section}>
                <label htmlFor="exam-urgency" className={styles.label}>
                    {t('urgency', 'Prioridade')}
                </label>
                <select
                    id="exam-urgency"
                    className={styles.select}
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                >
                    <option value="routine">{t('routine', 'Rotina')}</option>
                    <option value="urgent">{t('urgent', 'Urgente')}</option>
                    <option value="emergency">{t('emergency', 'Emergência')}</option>
                </select>
            </div>

            {/* Footer with Generate Button */}
            <div className={styles.footer}>
                <button
                    className={styles.generateButton}
                    onClick={handleGenerate}
                    disabled={isSubmitting || !selectedPatient || selectedExams.length === 0}
                >
                    <FontAwesomeIcon icon={faFilePdf} />
                    {isSubmitting ? t('generating', 'Gerando...') : t('generateExamOrder', 'Gerar Pedido')}
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

export default ExamOrderModal;
