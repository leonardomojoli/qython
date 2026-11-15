import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { alpha } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { downloadAndSharePdf } from '../../services/ambulatory';
import type { Prescription } from '../../types/pharmacy';

interface Props {
  prescription: Prescription;
}

export default function PrescriptionCard({ prescription }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [sharingPdf, setSharingPdf] = useState(false);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // A receita vai ao paciente como o próprio PDF, pela folha de compartilhar do sistema (WhatsApp, e-mail...).
  const handleSharePdf = async () => {
    setSharingPdf(true);
    try {
      await downloadAndSharePdf(
        `/prescriptions/${prescription.id}/pdf`,
        `Receita_${prescription.id}.pdf`,
      );
    } catch {
      // downloadAndSharePdf handles its own errors
    } finally {
      setSharingPdf(false);
    }
  };

  const items = prescription.items || [];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.surfaceBorder,
          shadowColor: theme.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 2,
        },
      ]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={[styles.title, { color: theme.text }]}>
            {t('prescription')} #{prescription.id}
          </Text>
          <Text style={[styles.date, { color: theme.textMuted }]}>
            {formatDate(prescription.created_at)}
          </Text>
          <Text style={[styles.type, { color: theme.textSecondary }]}>
            {prescription.prescription_type}
          </Text>
        </View>
        <View style={styles.medsPreview}>
          {items.slice(0, 3).map((item, i) => (
            <View key={i} style={[styles.medPill, { backgroundColor: alpha(theme.primary, 0.12) }]}>
              <Text style={[styles.medPillText, { color: theme.primary }]} numberOfLines={1}>
                {item.medication}
              </Text>
            </View>
          ))}
          {items.length > 3 && (
            <Text style={[styles.moreText, { color: theme.textMuted }]}>
              +{items.length - 3}
            </Text>
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={[styles.actions, { borderTopColor: theme.surfaceBorder }]}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.primary }]}
          onPress={handleSharePdf}
          disabled={sharingPdf}
          activeOpacity={0.7}>
          {sharingPdf ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.actionBtnText}>{t('sharePrescriptionPdf', 'Compartilhar PDF')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    padding: spacing.md,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  title: {
    ...typography.body,
    fontWeight: '600',
  },
  date: {
    ...typography.caption,
  },
  type: {
    ...typography.caption,
  },
  medsPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  medPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  medPillText: {
    ...typography.caption,
    fontWeight: '500',
    maxWidth: 120,
  },
  moreText: {
    ...typography.caption,
    paddingVertical: 2,
  },
  actions: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    height: 36,
  },
  actionBtnText: {
    ...typography.buttonSmall,
    color: '#fff',
  },
  noSends: {
    ...typography.bodySmall,
    textAlign: 'center',
    padding: spacing.md,
  },
});
