import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { PrescriptionItem } from '../../types/ambulatory';

interface Props {
  item: PrescriptionItem;
  index: number;
  onChange: (index: number, field: keyof PrescriptionItem, value: string) => void;
  onRemove: (index: number) => void;
}

export default function PrescriptionItemRow({ item, index, onChange, onRemove }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const renderInput = (
    label: string,
    field: keyof PrescriptionItem,
    placeholder?: string,
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.background, borderColor: theme.surfaceBorder },
        ]}
        value={item[field]}
        onChangeText={(val) => onChange(index, field, val)}
        placeholder={placeholder || label}
        placeholderTextColor={theme.textMuted}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
      <View style={styles.header}>
        <Text style={[styles.itemNumber, { color: theme.primary }]}>
          #{index + 1}
        </Text>
        <TouchableOpacity onPress={() => onRemove(index)}>
          <Text style={styles.removeButton}>X</Text>
        </TouchableOpacity>
      </View>

      {renderInput(
        t('medication', 'Medicamento'),
        'medication',
        t('medicationPlaceholder', 'Nome do medicamento'),
      )}
      <View style={styles.row}>
        <View style={styles.halfField}>
          {renderInput(t('dosage', 'Posologia'), 'dosage')}
        </View>
        <View style={styles.halfField}>
          {renderInput(t('frequency', 'Frequencia'), 'frequency')}
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.halfField}>
          {renderInput(t('duration', 'Duracao'), 'duration')}
        </View>
        <View style={styles.halfField}>
          {renderInput(t('quantity', 'Quantidade'), 'quantity')}
        </View>
      </View>
      {renderInput(t('usage', 'Instrucoes'), 'instructions')}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  itemNumber: {
    ...typography.body,
    fontWeight: '700',
  },
  removeButton: {
    ...typography.body,
    color: '#e74c3c',
    fontWeight: '600',
    padding: spacing.xs,
  },
  fieldGroup: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    ...typography.caption,
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.bodySmall,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfField: {
    flex: 1,
  },
});
