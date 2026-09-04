// frontend/src/components/user/ProfileUpdateRequestModal.js

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes,
  faGraduationCap,
  faUniversity,
  faUserMd,
  faUpload,
  faSpinner,
  faCheck,
  faClock,
  faTimesCircle,
  faTrash
} from '@fortawesome/free-solid-svg-icons';
import {
  createProfileUpdateRequest,
  uploadProfileUpdateDocument,
  getMyProfileUpdateRequests,
  cancelProfileUpdateRequest
} from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import styles from './ProfileUpdateRequestModal.module.css';

const ProfileUpdateRequestModal = ({ isOpen, onClose, user, requestType, onRequestCreated }) => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();

  const [step, setStep] = useState(1); // 1: form, 2: upload docs, 3: confirmation
  const [isLoading, setIsLoading] = useState(false);
  const [createdRequest, setCreatedRequest] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Form data based on request type
  const [formData, setFormData] = useState({});

  // Fetch existing requests on mount
  useEffect(() => {
    if (isOpen) {
      fetchMyRequests();
      initializeFormData();
    }
  }, [isOpen, requestType]);

  const fetchMyRequests = async () => {
    try {
      const requests = await getMyProfileUpdateRequests();
      setMyRequests(requests);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const initializeFormData = () => {
    switch (requestType) {
      case 'period_change':
        setFormData({ period: user?.period || '' });
        break;
      case 'university_change':
        setFormData({
          university: user?.university || '',
          matricula: user?.matricula || ''
        });
        break;
      case 'occupation_upgrade':
        setFormData({
          occupation: 'Médico',
          identifier_type: 'CRM',
          identifier_number: ''
        });
        break;
      default:
        setFormData({});
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const currentValue = getCurrentValue();
      const requestedValue = formData;

      const result = await createProfileUpdateRequest({
        request_type: requestType,
        current_value: currentValue,
        requested_value: requestedValue
      });

      setCreatedRequest(result);
      addNotification(t('requestCreatedSuccess', 'Solicitação criada com sucesso!'), 'success');

      // For occupation upgrade, we need documents
      if (requestType === 'occupation_upgrade') {
        setStep(2);
      } else {
        setStep(3);
        if (onRequestCreated) onRequestCreated();
      }
    } catch (error) {
      addNotification(error.message || t('errorCreatingRequest', 'Erro ao criar solicitação'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentValue = () => {
    switch (requestType) {
      case 'period_change':
        return { period: user?.period || '' };
      case 'university_change':
        return { university: user?.university || '', matricula: user?.matricula || '' };
      case 'occupation_upgrade':
        return { occupation: user?.occupation || '', identifier_type: user?.identifier_type || '', identifier_number: user?.identifier_number || '' };
      default:
        return {};
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      addNotification(t('invalidFileType', 'Formato inválido. Use PDF, PNG, JPG ou JPEG.'), 'error');
      return;
    }

    setIsLoading(true);
    try {
      await uploadProfileUpdateDocument(createdRequest.id, file, (progress) => {
        setUploadProgress(progress);
      });
      addNotification(t('documentUploadedSuccess', 'Documento enviado com sucesso!'), 'success');
      setStep(3);
      if (onRequestCreated) onRequestCreated();
    } catch (error) {
      addNotification(error.message || t('errorUploadingDocument', 'Erro ao enviar documento'), 'error');
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
    }
  };

  const handleCancelRequest = async (requestId) => {
    try {
      await cancelProfileUpdateRequest(requestId);
      addNotification(t('requestCancelledSuccess', 'Solicitação cancelada com sucesso!'), 'success');
      fetchMyRequests();
    } catch (error) {
      addNotification(error.message || t('errorCancellingRequest', 'Erro ao cancelar solicitação'), 'error');
    }
  };

  const getRequestTypeConfig = () => {
    switch (requestType) {
      case 'period_change':
        return {
          icon: faGraduationCap,
          title: t('updatePeriod', 'Atualizar Período'),
          description: t('updatePeriodDescription', 'Atualize seu semestre/período atual no curso.')
        };
      case 'university_change':
        return {
          icon: faUniversity,
          title: t('updateUniversity', 'Alterar Universidade'),
          description: t('updateUniversityDescription', 'Solicite a mudança de universidade. Será necessário enviar um comprovante de matrícula.')
        };
      case 'occupation_upgrade':
        return {
          icon: faUserMd,
          title: t('upgradeToDoctor', 'Atualizar para Médico'),
          description: t('upgradeToDoctorDescription', 'Parabéns pela formatura! Envie seu diploma ou registro no CRM para atualizar seu status.')
        };
      default:
        return { icon: faGraduationCap, title: '', description: '' };
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <FontAwesomeIcon icon={faClock} className={styles.statusPending} />;
      case 'approved':
        return <FontAwesomeIcon icon={faCheck} className={styles.statusApproved} />;
      case 'rejected':
        return <FontAwesomeIcon icon={faTimesCircle} className={styles.statusRejected} />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending':
        return t('statusPending', 'Pendente');
      case 'approved':
        return t('statusApproved', 'Aprovado');
      case 'rejected':
        return t('statusRejected', 'Rejeitado');
      default:
        return status;
    }
  };

  const config = getRequestTypeConfig();

  // Check if there's already a pending request of this type
  const existingPendingRequest = myRequests.find(
    r => r.request_type === requestType && r.status === 'pending'
  );

  if (!isOpen) return null;

  const renderStep1 = () => (
    <>
      <div className={styles.iconContainer}>
        <FontAwesomeIcon icon={config.icon} />
      </div>

      <h3 className={styles.title}>{config.title}</h3>
      <p className={styles.description}>{config.description}</p>

      {existingPendingRequest ? (
        <div className={styles.existingRequestNotice}>
          <FontAwesomeIcon icon={faClock} />
          <span>{t('existingPendingRequest', 'Você já possui uma solicitação pendente deste tipo.')}</span>
        </div>
      ) : (
        <div className={styles.formContainer}>
          {requestType === 'period_change' && (
            <div className={styles.formGroup}>
              <label>{t('newPeriod', 'Novo Período')}</label>
              <select
                name="period"
                value={formData.period}
                onChange={handleInputChange}
                className={styles.input}
              >
                <option value="">{t('selectPeriod', 'Selecione o período')}</option>
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={`${i + 1}º Período`}>{i + 1}º {t('period', 'Período')}</option>
                ))}
              </select>
            </div>
          )}

          {requestType === 'university_change' && (
            <>
              <div className={styles.formGroup}>
                <label>{t('newUniversity', 'Nova Universidade')}</label>
                <input
                  type="text"
                  name="university"
                  value={formData.university}
                  onChange={handleInputChange}
                  className={styles.input}
                  placeholder={t('universityPlaceholder', 'Nome da universidade')}
                />
              </div>
              <div className={styles.formGroup}>
                <label>{t('newEnrollment', 'Nova Matrícula')}</label>
                <input
                  type="text"
                  name="matricula"
                  value={formData.matricula}
                  onChange={handleInputChange}
                  className={styles.input}
                  placeholder={t('enrollmentPlaceholder', 'Número de matrícula')}
                />
              </div>
            </>
          )}

          {requestType === 'occupation_upgrade' && (
            <>
              <div className={styles.formGroup}>
                <label>{t('identifierType', 'Tipo de Registro')}</label>
                <select
                  name="identifier_type"
                  value={formData.identifier_type}
                  onChange={handleInputChange}
                  className={styles.input}
                >
                  <option value="CRM">CRM</option>
                  <option value="Registro Profissional">Registro Profissional</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>{t('identifierNumber', 'Número do Registro')}</label>
                <input
                  type="text"
                  name="identifier_number"
                  value={formData.identifier_number}
                  onChange={handleInputChange}
                  className={styles.input}
                  placeholder={t('identifierPlaceholder', 'Ex: 123456/SP')}
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className={styles.buttonGroup}>
        {!existingPendingRequest && (
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className={`${styles.button} ${styles.primaryButton}`}
          >
            {isLoading ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              t('continue', 'Continuar')
            )}
          </button>
        )}
        <button onClick={onClose} className={`${styles.button} ${styles.cancelButton}`}>
          {t('close', 'Fechar')}
        </button>
      </div>
    </>
  );

  const renderStep2 = () => (
    <>
      <div className={styles.iconContainer}>
        <FontAwesomeIcon icon={faUpload} />
      </div>

      <h3 className={styles.title}>{t('uploadDocument', 'Enviar Documento')}</h3>
      <p className={styles.description}>
        {t('uploadDocumentDescription', 'Envie um documento comprobatório (diploma, CRM ou comprovante de matrícula).')}
      </p>

      <div className={styles.uploadContainer}>
        <label className={styles.uploadLabel}>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileUpload}
            disabled={isLoading}
            className={styles.fileInput}
          />
          {isLoading ? (
            <div className={styles.uploadProgress}>
              <FontAwesomeIcon icon={faSpinner} spin />
              <span>{uploadProgress}%</span>
            </div>
          ) : (
            <>
              <FontAwesomeIcon icon={faUpload} />
              <span>{t('clickToUpload', 'Clique para enviar')}</span>
              <span className={styles.uploadHint}>PDF, PNG, JPG (max 10MB)</span>
            </>
          )}
        </label>
      </div>

      <div className={styles.buttonGroup}>
        <button
          onClick={() => {
            setStep(3);
            if (onRequestCreated) onRequestCreated();
          }}
          className={`${styles.button} ${styles.secondaryButton}`}
        >
          {t('skipForNow', 'Enviar depois')}
        </button>
      </div>
    </>
  );

  const renderStep3 = () => (
    <>
      <div className={styles.iconContainer} style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(22, 163, 74, 0.25))', color: '#22c55e', border: '2px solid rgba(34, 197, 94, 0.3)' }}>
        <FontAwesomeIcon icon={faCheck} />
      </div>

      <h3 className={styles.title}>{t('requestSubmitted', 'Solicitação Enviada!')}</h3>
      <p className={styles.description}>
        {t('requestSubmittedDescription', 'Sua solicitação foi enviada e será analisada pela nossa equipe. Você será notificado quando houver uma atualização.')}
      </p>

      <div className={styles.buttonGroup}>
        <button onClick={onClose} className={`${styles.button} ${styles.primaryButton}`}>
          {t('done', 'Concluído')}
        </button>
      </div>
    </>
  );

  const renderMyRequests = () => {
    if (myRequests.length === 0) return null;

    return (
      <div className={styles.myRequestsSection}>
        <h4 className={styles.sectionTitle}>{t('myRequests', 'Minhas Solicitações')}</h4>
        <div className={styles.requestsList}>
          {myRequests.map(request => (
            <div key={request.id} className={styles.requestItem}>
              <div className={styles.requestInfo}>
                <div className={styles.requestType}>
                  {request.request_type === 'period_change' && t('periodChange', 'Mudança de Período')}
                  {request.request_type === 'university_change' && t('universityChange', 'Mudança de Universidade')}
                  {request.request_type === 'occupation_upgrade' && t('occupationUpgrade', 'Atualização para Médico')}
                </div>
                <div className={styles.requestDate}>
                  {new Date(request.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className={styles.requestStatus}>
                {getStatusIcon(request.status)}
                <span>{getStatusLabel(request.status)}</span>
              </div>
              {request.status === 'pending' && (
                <button
                  onClick={() => handleCancelRequest(request.id)}
                  className={styles.cancelRequestButton}
                  title={t('cancelRequest', 'Cancelar solicitação')}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              )}
              {request.status === 'rejected' && request.admin_notes && (
                <div className={styles.adminNotes}>
                  <strong>{t('reason', 'Motivo')}:</strong> {request.admin_notes}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return ReactDOM.createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faTimes} />
        </button>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}

        {step === 1 && renderMyRequests()}
      </div>
    </div>,
    document.getElementById('modal-portal')
  );
};

export default ProfileUpdateRequestModal;
