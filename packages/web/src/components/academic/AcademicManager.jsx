// frontend/src/components/academic/AcademicManager.js

import React, { useState, lazy, Suspense } from 'react';
import styles from './AcademicManager.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGraduationCap,
  faBookOpen,
  faFlask,
  faTrophy
} from '@fortawesome/free-solid-svg-icons';
import InlineLoading from '../shared/InlineLoading';

// Lazy load heavy sub-components for faster initial render
const LibraryManager = lazy(() => import('../library/LibraryManager'));
const MaterialProducer = lazy(() => import('./MaterialProducer'));
const ArenaQython = lazy(() => import('./ArenaQython'));

// DNA loading fallback for tabs
const TabLoader = () => (
  <div className={styles.tabLoader}>
    <InlineLoading size={60} />
  </div>
);

function AcademicManager({ isSidebarOpen }) {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState('libraries');

  // Tabs configuration - matching Ambulatory style
  const tabs = [
    { id: 'libraries', icon: faBookOpen, label: t('myLibraries') },
    { id: 'producer', icon: faFlask, label: t('materialProducer') },
    { id: 'arena', icon: faTrophy, label: t('arenaQython') },
  ];

  const handleTabClick = (tabId) => {
    setActiveView(tabId);
  };

  return (
    <div className={`${styles.academicManager} ${!isSidebarOpen ? styles.adjustedForClosedSidebar : ''}`}>
      {/* Header */}
      <div className={styles.academicHeader}>
        <div className={styles.headerTitleWrapper}>
          <FontAwesomeIcon icon={faGraduationCap} className={styles.headerIcon} />
          <h2 className={styles.academicManagerTitle}>{t('academic')}</h2>
        </div>
        <div className={styles.headerSpacer}></div>
      </div>

      {/* Glassmorphism Tabs */}
      <div className={styles.tabsContainer} data-tour="academic-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeView === tab.id ? styles.tabActive : ''}`}
            onClick={() => handleTabClick(tab.id)}
            data-tour={`academic-${tab.id}`}
          >
            <FontAwesomeIcon icon={tab.icon} className={styles.tabIcon} />
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className={styles.contentArea}>
        <Suspense fallback={<TabLoader />}>
          {activeView === 'libraries' && <LibraryManager />}
          {activeView === 'producer' && <MaterialProducer isSidebarOpen={isSidebarOpen} />}
          {activeView === 'arena' && <ArenaQython />}
        </Suspense>
      </div>
    </div>
  );
}

export default AcademicManager;