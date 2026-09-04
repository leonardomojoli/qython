import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { COUNTRIES, type Country } from '../../types/pharmacy';

interface Props {
  visible: boolean;
  selectedCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

export default function CountryPicker({
  visible,
  selectedCode,
  onSelect,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const renderItem = ({ item }: { item: Country }) => {
    const isSelected = item.code === selectedCode;
    return (
      <TouchableOpacity
        style={[
          styles.item,
          { borderColor: theme.surfaceBorder },
          isSelected && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
        ]}
        onPress={() => {
          onSelect(item.code);
          onClose();
        }}
        activeOpacity={0.7}>
        <Text style={styles.flag}>{item.flag}</Text>
        <Text
          style={[
            styles.label,
            { color: isSelected ? theme.primary : theme.text },
          ]}>
          {t(item.labelKey)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <TouchableOpacity activeOpacity={1}>
            <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
              <Text style={[styles.title, { color: theme.text }]}>
                {t('selectCountry', 'País')}
              </Text>
            </View>
            <FlatList
              data={COUNTRIES}
              renderItem={renderItem}
              keyExtractor={(item) => item.code}
              contentContainerStyle={styles.list}
              style={styles.listContainer}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    padding: spacing.base,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  title: {
    ...typography.h3,
  },
  listContainer: {
    maxHeight: 400,
  },
  list: {
    padding: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  flag: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  label: {
    ...typography.body,
  },
});
