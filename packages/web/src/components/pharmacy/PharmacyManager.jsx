// frontend/src/components/pharmacy/PharmacyManager.js
import React, { useState } from 'react';
import styles from './PharmacyManager.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPills, faExclamationTriangle, faFilePrescription, faMedkit } from '@fortawesome/free-solid-svg-icons';

import MedicationSearch from './MedicationSearch';
import SupplySearch from './SupplySearch';
import InteractionChecker from './InteractionChecker';
import MyPrescriptions from './MyPrescriptions';

function PharmacyManager({ isSidebarOpen }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('medications');

  const tabs = [
    { id: 'medications', icon: faPills, label: t('medications') },
    { id: 'supplies', icon: faMedkit, label: t('suppliesAndDevices') },
    { id: 'interactions', icon: faExclamationTriangle, label: t('checkInteractions') },
    { id: 'prescriptions', icon: faFilePrescription, label: t('myPrescriptions') },
  ];

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'medications':
        return <MedicationSearch />;
      case 'supplies':
        return <SupplySearch />;
      case 'interactions':
        return <InteractionChecker />;
      case 'prescriptions':
        return <MyPrescriptions />;
      default:
        return <MedicationSearch />;
    }
  };

  return (
    <div className={styles.pharmacyContainer}>
      <div className={styles.pharmacyHeader}>
        <div className={styles.headerTitleWrapper}>
          <FontAwesomeIcon icon={faPills} className={styles.headerIcon} />
          <h2 className={styles.pharmacyTitle}>{t('pharmacy')}</h2>
        </div>
      </div>

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

      <div className={styles.contentArea}>
        {renderContent()}
      </div>
    </div>
  );
}

export default PharmacyManager;
