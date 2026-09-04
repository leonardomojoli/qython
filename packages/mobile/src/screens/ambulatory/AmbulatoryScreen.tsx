import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import TabBar, { type Tab } from '../../components/pharmacy/TabBar';
import ConsultationTab from './ConsultationTab';
import ConsultationsHistoryTab from './ConsultationsHistoryTab';
import PrescriptionTab from './PrescriptionTab';
import PatientsTab from './PatientsTab';
import DocumentsTab from './DocumentsTab';
import ExamOrdersTab from './ExamOrdersTab';
import OrientationsTab from './OrientationsTab';

type TabKey =
  | 'consultation'
  | 'history'
  | 'prescription'
  | 'patients'
  | 'documents'
  | 'exams'
  | 'orientations';

export default function AmbulatoryScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabKey>('consultation');

  const tabs: Tab[] = [
    { key: 'consultation', label: t('consultation', 'Consulta') },
    { key: 'history', label: t('consultationHistory', 'Historico') },
    { key: 'prescription', label: t('prescription', 'Receituario') },
    { key: 'documents', label: t('documents', 'Documentos') },
    { key: 'exams', label: t('examOrders', 'Exames') },
    { key: 'orientations', label: t('orientations', 'Orientacoes') },
    { key: 'patients', label: t('patients', 'Pacientes') },
  ];

  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key as TabKey);
  }, []);

  const renderTab = () => {
    switch (activeTab) {
      case 'consultation':
        return <ConsultationTab />;
      case 'history':
        return <ConsultationsHistoryTab />;
      case 'prescription':
        return <PrescriptionTab />;
      case 'documents':
        return <DocumentsTab />;
      case 'exams':
        return <ExamOrdersTab />;
      case 'orientations':
        return <OrientationsTab />;
      case 'patients':
        return <PatientsTab />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />
      {renderTab()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
