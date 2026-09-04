import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  VITAL_SIGNS_TEMPLATE,
  NORMAL_EXAM_TEMPLATES,
} from '../../data/normalExamTemplates';

interface Props {
  onInsert: (text: string) => void;
  specialty?: string;
  disabled?: boolean;
  onOpenProtocols: () => void;
}

export default function QuickInsertBar({
  onInsert,
  specialty,
  disabled = false,
  onOpenProtocols,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const handleVitalSigns = () => {
    onInsert(VITAL_SIGNS_TEMPLATE);
  };

  const handleNormalExam = () => {
    const template =
      (specialty && NORMAL_EXAM_TEMPLATES[specialty]) ||
      NORMAL_EXAM_TEMPLATES.general;
    onInsert(template);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
        onPress={handleVitalSigns}
        disabled={disabled}
        activeOpacity={0.7}>
        <Text style={[styles.buttonText, { color: theme.text }]}>
          {'\uD83D\uDC93'} {t('vitalSigns', 'Sinais Vitais')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
        onPress={handleNormalExam}
        disabled={disabled}
        activeOpacity={0.7}>
        <Text style={[styles.buttonText, { color: theme.text }]}>
          {'\uD83E\uDE7A'} {t('normalExam', 'Exame Normal')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
        onPress={onOpenProtocols}
        disabled={disabled}
        activeOpacity={0.7}>
        <Text style={[styles.buttonText, { color: theme.text }]}>
          {'\uD83D\uDCCB'} {t('protocols', 'Protocolos')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  buttonText: {
    ...typography.caption,
    fontWeight: '500',
  },
});
