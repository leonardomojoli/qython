import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing } from '../../theme/spacing';
import TabBar from '../../components/pharmacy/TabBar';
import LibrariesTab from './LibrariesTab';
import ArenaTab from './ArenaTab';

export default function AcademicScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('libraries');

  const tabs = [
    { key: 'libraries', label: t('myLibraries', 'Bibliotecas') },
    { key: 'arena', label: t('arenaQython', 'Arena') },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === 'libraries' && <LibrariesTab />}
      {activeTab === 'arena' && <ArenaTab />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
