import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import GovProgramBadge from './GovProgramBadge';
import ControlledBadge from './ControlledBadge';
import { submitMedicationFeedback } from '../../services/pharmacy';
import type { Medication } from '../../types/pharmacy';

interface Props {
  medication: Medication | null;
  selectedCountry: string;
  onClose: () => void;
}

const PREGNANCY_COLORS: Record<string, string> = {
  A: '#27ae60',
  B: '#3498db',
  C: '#f39c12',
  D: '#e67e22',
  X: '#e74c3c',
};

export default function MedicationDetailModal({
  medication,
  selectedCountry,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [feedbackSent, setFeedbackSent] = useState<'like' | 'dislike' | null>(null);

  if (!medication) return null;

  const buildContent = () => {
    const parts = [`${medication.name} (${medication.active_principle})`];
    if (medication.presentation) parts.push(`Apresentação: ${medication.presentation}`);
    if (medication.therapeutic_class) parts.push(`Classe: ${medication.therapeutic_class}`);
    if (medication.usual_posology) parts.push(`Posologia: ${medication.usual_posology}`);
    if (medication.max_daily_dose) parts.push(`Dose máx: ${medication.max_daily_dose}`);
    if (medication.common_indications) parts.push(`Indicações: ${medication.common_indications}`);
    if (medication.pregnancy_category) parts.push(`Gestação: ${medication.pregnancy_category}`);
    return parts.join(' | ');
  };

  const handleFeedback = async (type: 'like' | 'dislike') => {
    try {
      await submitMedicationFeedback({
        feedbackType: type,
        contentId: String(medication.id),
        originalContent: buildContent(),
      });
      setFeedbackSent(type);
    } catch {
      Alert.alert('', t('feedbackSentError', 'Erro ao enviar feedback'));
    }
  };

  const pregColor = PREGNANCY_COLORS[medication.pregnancy_category || ''] || theme.textMuted;

  return (
    <Modal visible={!!medication} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <TouchableOpacity activeOpacity={1}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
              <View style={styles.headerLeft}>
                <Text style={[styles.title, { color: theme.text }]}>{medication.name}</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  {medication.active_principle}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Text style={[styles.closeText, { color: theme.textMuted }]}>X</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}>
              {/* Badges */}
              <View style={styles.badgesRow}>
                <GovProgramBadge
                  programs={medication.government_programs || []}
                  fallbackFarmaciaPopular={medication.farmacia_popular}
                  selectedCountry={selectedCountry}
                />
                <ControlledBadge type={medication.controlled_type} />
              </View>

              {/* Detail rows */}
              {medication.presentation && (
                <DetailRow label={t('presentation')} value={medication.presentation} theme={theme} />
              )}
              {medication.common_brands && (
                <DetailRow label={t('commonBrands')} value={medication.common_brands} theme={theme} />
              )}
              <DetailRow
                label={t('therapeuticClass')}
                value={medication.therapeutic_class || '-'}
                theme={theme}
              />
              {medication.administration_route &&
                medication.administration_route !== 'oral' && (
                  <DetailRow
                    label={t('administrationRoute')}
                    value={medication.administration_route}
                    theme={theme}
                  />
                )}
              {medication.common_indications && (
                <DetailRow
                  label={t('commonIndications')}
                  value={medication.common_indications}
                  theme={theme}
                />
              )}
              {medication.usual_posology && (
                <DetailRow label={t('usualPosology')} value={medication.usual_posology} theme={theme} />
              )}
              {medication.max_daily_dose && (
                <DetailRow label={t('maxDose')} value={medication.max_daily_dose} theme={theme} />
              )}

              {/* Pregnancy */}
              {medication.pregnancy_category && (
                <View style={styles.row}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>
                    {t('pregnancyCategory')}:
                  </Text>
                  <View style={styles.pregInfo}>
                    <View style={[styles.pregBadge, { backgroundColor: pregColor + '30' }]}>
                      <Text style={[styles.pregBadgeText, { color: pregColor }]}>
                        {medication.pregnancy_category}
                      </Text>
                    </View>
                    <Text style={[styles.value, { color: theme.text, flex: 1 }]}>
                      {t(`pregnancyCat${medication.pregnancy_category}`)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Adjustments */}
              {(medication.renal_adjustment || medication.hepatic_adjustment) && (
                <View style={styles.adjustmentRow}>
                  {medication.renal_adjustment && (
                    <View style={styles.adjustmentBadge}>
                      <Text style={styles.adjustmentText}>{t('renalAdjustment')}</Text>
                    </View>
                  )}
                  {medication.hepatic_adjustment && (
                    <View style={styles.adjustmentBadge}>
                      <Text style={styles.adjustmentText}>{t('hepaticAdjustment')}</Text>
                    </View>
                  )}
                </View>
              )}

              {medication.requires_prescription && (
                <View style={styles.rxRow}>
                  <Text style={styles.rxText}>{t('requiresPrescription')}</Text>
                </View>
              )}

              {/* CEAF info */}
              {medication.government_programs?.some((p) => p.code === 'ceaf') && (
                <View style={[styles.ceafInfo, { backgroundColor: '#8e44ad15' }]}>
                  <Text style={[styles.ceafTitle, { color: '#8e44ad' }]}>
                    {t('ceafAuthRequired')}
                  </Text>
                  <Text style={[styles.ceafDesc, { color: theme.textSecondary }]}>
                    {t('ceafAuthDescription')}
                  </Text>
                </View>
              )}

              {/* Feedback */}
              <View style={[styles.feedbackSection, { borderTopColor: theme.surfaceBorder }]}>
                <Text style={[styles.feedbackLabel, { color: theme.textSecondary }]}>
                  {t('medDataCorrect')}
                </Text>
                <View style={styles.feedbackButtons}>
                  <TouchableOpacity
                    style={[
                      styles.feedbackBtn,
                      feedbackSent === 'like' && { backgroundColor: '#27ae6030' },
                    ]}
                    onPress={() => handleFeedback('like')}
                    disabled={!!feedbackSent}>
                    <Text
                      style={{
                        fontSize: 18,
                        opacity: feedbackSent && feedbackSent !== 'like' ? 0.3 : 1,
                      }}>
                      👍
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.feedbackBtn,
                      feedbackSent === 'dislike' && { backgroundColor: '#e74c3c30' },
                    ]}
                    onPress={() => handleFeedback('dislike')}
                    disabled={!!feedbackSent}>
                    <Text
                      style={{
                        fontSize: 18,
                        opacity: feedbackSent && feedbackSent !== 'dislike' ? 0.3 : 1,
                      }}>
                      👎
                    </Text>
                  </TouchableOpacity>
                </View>
                {feedbackSent && (
                  <Text style={[styles.feedbackThanks, { color: theme.success }]}>
                    {t('medFeedbackThanks')}
                  </Text>
                )}
              </View>
            </ScrollView>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: any;
}) {
  return (
    <View style={detailStyles.row}>
      <Text style={[detailStyles.label, { color: theme.textSecondary }]}>{label}:</Text>
      <Text style={[detailStyles.value, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: 2,
  },
  value: {
    ...typography.body,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.base,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  title: {
    ...typography.h3,
    marginBottom: 2,
  },
  subtitle: {
    ...typography.bodySmall,
  },
  closeBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 18,
    fontWeight: '600',
  },
  body: {
    maxHeight: 500,
  },
  bodyContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  row: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: 2,
  },
  value: {
    ...typography.body,
  },
  pregInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  pregBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  pregBadgeText: {
    ...typography.bodySmall,
    fontWeight: '700',
  },
  adjustmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  adjustmentBadge: {
    backgroundColor: '#f39c1230',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  adjustmentText: {
    ...typography.caption,
    fontWeight: '600',
    color: '#f39c12',
  },
  rxRow: {
    marginBottom: spacing.md,
  },
  rxText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: '#3498db',
  },
  ceafInfo: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  ceafTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  ceafDesc: {
    ...typography.caption,
    lineHeight: 18,
  },
  feedbackSection: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  feedbackLabel: {
    ...typography.bodySmall,
    marginBottom: spacing.sm,
  },
  feedbackButtons: {
    flexDirection: 'row',
    gap: spacing.base,
  },
  feedbackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedbackThanks: {
    ...typography.caption,
    marginTop: spacing.sm,
  },
});
