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
import { submitMedicationFeedback } from '../../services/pharmacy';
import type { Medication } from '../../types/pharmacy';

interface Props {
  supply: Medication | null;
  selectedCountry: string;
  onClose: () => void;
}

export default function SupplyDetailModal({ supply, selectedCountry, onClose }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [feedbackSent, setFeedbackSent] = useState<'like' | 'dislike' | null>(null);

  if (!supply) return null;

  const buildContent = () => {
    const parts = [supply.name];
    if (supply.presentation) parts.push(`Apresentação: ${supply.presentation}`);
    if (supply.therapeutic_class) parts.push(`Categoria: ${supply.therapeutic_class}`);
    if (supply.common_indications) parts.push(`Indicações: ${supply.common_indications}`);
    return parts.join(' | ');
  };

  const handleFeedback = async (type: 'like' | 'dislike') => {
    try {
      await submitMedicationFeedback({
        feedbackType: type,
        contentId: String(supply.id),
        originalContent: buildContent(),
      });
      setFeedbackSent(type);
    } catch {
      Alert.alert('', t('feedbackSentError', 'Erro ao enviar feedback'));
    }
  };

  return (
    <Modal visible={!!supply} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <TouchableOpacity activeOpacity={1}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
              <View style={styles.headerLeft}>
                <Text style={[styles.title, { color: theme.text }]}>{supply.name}</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  {supply.therapeutic_class}
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
                  programs={supply.government_programs || []}
                  fallbackFarmaciaPopular={supply.farmacia_popular}
                  selectedCountry={selectedCountry}
                />
                {supply.requires_prescription && (
                  <View style={styles.lmeBadge}>
                    <Text style={styles.lmeText}>{t('requiresLME')}</Text>
                  </View>
                )}
              </View>

              {supply.presentation && (
                <View style={styles.row}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>
                    {t('presentation')}:
                  </Text>
                  <Text style={[styles.value, { color: theme.text }]}>{supply.presentation}</Text>
                </View>
              )}

              {supply.common_brands && (
                <View style={styles.row}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>
                    {t('commonBrands')}:
                  </Text>
                  <Text style={[styles.value, { color: theme.text }]}>{supply.common_brands}</Text>
                </View>
              )}

              {supply.therapeutic_class && (
                <View style={styles.row}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>
                    {t('supplyCategory')}:
                  </Text>
                  <Text style={[styles.value, { color: theme.text }]}>
                    {supply.therapeutic_class}
                  </Text>
                </View>
              )}

              {supply.common_indications && (
                <View style={styles.row}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>
                    {t('commonIndications')}:
                  </Text>
                  <Text style={[styles.value, { color: theme.text }]}>
                    {supply.common_indications}
                  </Text>
                </View>
              )}

              {/* CEAF / LME info */}
              {supply.government_programs?.some((p) => p.code === 'ceaf') && (
                <View style={[styles.ceafInfo, { backgroundColor: '#8e44ad15' }]}>
                  <Text style={[styles.ceafTitle, { color: '#8e44ad' }]}>
                    {t('requiresLME')}
                  </Text>
                  <Text style={[styles.ceafDesc, { color: theme.textSecondary }]}>
                    {t('lmeDescription')}
                  </Text>
                </View>
              )}

              {supply.requires_prescription &&
                !supply.government_programs?.some((p) => p.code === 'ceaf') && (
                  <View style={styles.rxRow}>
                    <Text style={styles.rxText}>{t('requiresPrescription')}</Text>
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '80%',
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
    maxHeight: 450,
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
  lmeBadge: {
    backgroundColor: '#8e44ad30',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  lmeText: {
    ...typography.caption,
    fontWeight: '600',
    color: '#8e44ad',
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
  rxRow: {
    marginBottom: spacing.md,
  },
  rxText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: '#3498db',
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
