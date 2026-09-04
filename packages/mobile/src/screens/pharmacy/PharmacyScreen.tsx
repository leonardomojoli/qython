import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import TabBar, { type Tab } from '../../components/pharmacy/TabBar';
import MedicationSearchTab from './MedicationSearchTab';
import SupplySearchTab from './SupplySearchTab';
import InteractionCheckerTab from './InteractionCheckerTab';
import MyPrescriptionsTab from './MyPrescriptionsTab';

type TabKey = 'medications' | 'supplies' | 'interactions' | 'prescriptions';

export default function PharmacyScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabKey>('medications');

  const tabs: Tab[] = [
    { key: 'medications', label: t('medications', 'Medicamentos') },
    { key: 'supplies', label: t('suppliesAndDevices', 'Insumos') },
    { key: 'interactions', label: t('checkInteractions', 'Interações') },
    { key: 'prescriptions', label: t('myPrescriptions', 'Receitas') },
  ];

  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key as TabKey);
  }, []);

  const renderTab = () => {
    switch (activeTab) {
      case 'medications':
        return <MedicationSearchTab />;
      case 'supplies':
        return <SupplySearchTab />;
      case 'interactions':
        return <InteractionCheckerTab />;
      case 'prescriptions':
        return <MyPrescriptionsTab />;
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
