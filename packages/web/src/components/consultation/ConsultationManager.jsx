// frontend/src/components/consultation/ConsultationManager.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './ConsultationManager.module.css';
import ConsultationForm from './ConsultationForm';
import ConsultationList from './ConsultationList';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserMd,
  faStethoscope,
  faList,
  faPills,
  faFileAlt,
  faFlask,
  faBookMedical
} from '@fortawesome/free-solid-svg-icons';
import { useNotification } from '../../contexts/NotificationContext';
import ReceituarioTab from './ReceituarioTab';
import AttestadoModal from './AttestadoModal';
import ExamOrderModal from './ExamOrderModal';
import OrientacoesTab from './OrientacoesTab';

function ConsultationManager({ isSidebarOpen }) {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('new');
  const [prefillMedication, setPrefillMedication] = useState(null);

  // ICD-10 codes for modals (prescription, attestado, exams)
  const [suggestedIcdCodes] = useState([]);

  // Handle navigation from pharmacy "Take to Prescription"
  useEffect(() => {
    if (location.state?.activeTab === 'prescription') {
      setActiveTab('prescription');
      if (location.state?.prefillMedication) {
        setPrefillMedication(location.state.prefillMedication);
      }
      // Clear location state to prevent re-trigger on re-render
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  // Tabs unificadas do Ambulatório
  const tabs = [
    { id: 'new', icon: faStethoscope, label: t('newConsultation') },
    { id: 'list', icon: faList, label: t('savedConsultations') },
    { id: 'prescription', icon: faPills, label: t('prescription') },
    { id: 'attestado', icon: faFileAlt, label: t('attestado') },
    { id: 'exams', icon: faFlask, label: t('examOrder') },
    { id: 'orientacoes', icon: faBookMedical, label: t('orientations') },
  ];

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    if (tabId !== 'prescription') {
      setPrefillMedication(null);
    }
  };

  // Renderiza o conteúdo baseado na tab ativa
  const renderContent = () => {
    switch (activeTab) {
      case 'new':
        return <ConsultationForm />;
      case 'list':
        return <ConsultationList />;
      case 'prescription':
        return <ReceituarioTab isEmbedded={true} defaultIcdCodes={suggestedIcdCodes} prefillMedication={prefillMedication} />;
      case 'attestado':
        return <AttestadoModal isEmbedded={true} defaultIcdCodes={suggestedIcdCodes} />;
      case 'exams':
        return <ExamOrderModal isEmbedded={true} defaultIcdCodes={suggestedIcdCodes} />;
      case 'orientacoes':
        return <OrientacoesTab isEmbedded={true} />;
      default:
        return <ConsultationForm />;
    }
  };

  return (
    <div className={`${styles.consultationManager} ${!isSidebarOpen ? styles.adjustedForClosedSidebar : ''}`}>
      {/* Header */}
      <div className={styles.consultationHeader}>
        <div className={styles.headerTitleWrapper}>
          <FontAwesomeIcon icon={faUserMd} className={styles.headerIcon} />
          <h2 className={styles.consultationManagerTitle}>{t('consultationManager')}</h2>
        </div>
        <div className={styles.headerSpacer}></div>
      </div>

      {/* Tabs Unificadas com Glassmorphism */}
      <div className={styles.tabsContainer}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            <FontAwesomeIcon icon={tab.icon} className={styles.tabIcon} />
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Área de Conteúdo */}
      <div className={styles.contentArea}>
        {renderContent()}
      </div>
    </div>
  );
}

export default ConsultationManager;
