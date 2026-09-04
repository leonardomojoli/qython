import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

export interface FilterOption {
  value: string;
  label: string;
}

interface Props {
  visible: boolean;
  title: string;
  options: FilterOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export default function FilterPicker({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}: Props) {
  const { theme } = useTheme();

  const allOptions: FilterOption[] = [
    { value: '', label: title },
    ...options,
  ];

  const renderItem = ({ item }: { item: FilterOption }) => {
    const isSelected = item.value === selectedValue;
    return (
      <TouchableOpacity
        style={[
          styles.item,
          { borderColor: theme.surfaceBorder },
          isSelected && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
        ]}
        onPress={() => {
          onSelect(item.value);
          onClose();
        }}
        activeOpacity={0.7}>
        <Text
          style={[
            styles.label,
            { color: isSelected ? theme.primary : theme.text },
            item.value === '' && { fontWeight: '600' },
          ]}>
          {item.label}
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
              <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            </View>
            <FlatList
              data={allOptions}
              renderItem={renderItem}
              keyExtractor={(item) => item.value || '__all__'}
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
    maxHeight: '60%',
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
    maxHeight: 350,
  },
  list: {
    padding: spacing.sm,
  },
  item: {
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.body,
  },
});
