import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { alpha } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  createPrescriptionShareLink,
  getPrescriptionPharmacySends,
} from '../../services/pharmacy';
import { downloadAndSharePdf } from '../../services/ambulatory';
import { STATUS_CONFIG, type Prescription, type PharmacySend } from '../../types/pharmacy';

interface Props {
  prescription: Prescription;
}

export default function PrescriptionCard({ prescription }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [pharmacySends, setPharmacySends] = useState<PharmacySend[] | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleToggleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!pharmacySends) {
      try {
        const sends = await getPrescriptionPharmacySends(prescription.id);
        setPharmacySends(sends || []);
      } catch {
        setPharmacySends([]);
      }
    }
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const data = await createPrescriptionShareLink(prescription.id);
      if (data?.share_url) {
        await Share.share({
          message: data.share_url,
          title: `${t('prescription')} #${prescription.id}`,
        });
      }
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        Alert.alert('', t('error', 'Erro'));
      }
    } finally {
      setSharing(false);
    }
  };

  const handleCopyLink = async () => {
    setCopying(true);
    try {
      const data = await createPrescriptionShareLink(prescription.id);
      if (data?.share_url) {
        Clipboard.setString(data.share_url);
        Alert.alert('', t('linkCopied'));
      }
    } catch {
      Alert.alert('', t('error', 'Erro'));
    } finally {
      setCopying(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await downloadAndSharePdf(
        `/prescriptions/${prescription.id}/pdf`,
        `Receita_${prescription.id}.pdf`,
      );
    } catch {
      // downloadAndSharePdf handles its own errors
    } finally {
      setDownloadingPdf(false);
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
      <TouchableOpacity
        style={styles.header}
        onPress={handleToggleExpand}
        activeOpacity={0.7}>
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
      </TouchableOpacity>

      {/* Actions */}
      <View style={[styles.actions, { borderTopColor: theme.surfaceBorder }]}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.primary }]}
          onPress={handleShare}
          disabled={sharing}
          activeOpacity={0.7}>
          {sharing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.actionBtnText}>{t('shareLink')}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnOutline, { borderColor: theme.primary }]}
          onPress={handleCopyLink}
          disabled={copying}
          activeOpacity={0.7}>
          {copying ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Text style={[styles.actionBtnOutlineText, { color: theme.primary }]}>
              {t('copyLink')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Expanded: Download PDF + pharmacy sends */}
      {expanded && (
        <View style={[styles.expandedSection, { borderTopColor: theme.surfaceBorder }]}>
          {/* Download PDF */}
          <TouchableOpacity
            style={[styles.downloadBtn, { backgroundColor: theme.secondary }]}
            onPress={handleDownloadPdf}
            disabled={downloadingPdf}
            activeOpacity={0.7}>
            {downloadingPdf ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>{t('downloadPdf')}</Text>
            )}
          </TouchableOpacity>

          {/* Pharmacy Sends */}
          <Text style={[styles.sendsTitle, { color: theme.text }]}>
            {t('pharmacySends')}
          </Text>
          {pharmacySends && pharmacySends.length > 0 ? (
            pharmacySends.map((send) => {
              const statusConfig = STATUS_CONFIG[send.status] || STATUS_CONFIG.sent;
              return (
                <View
                  key={send.id}
                  style={[styles.sendCard, { borderColor: theme.surfaceBorder }]}>
                  <View style={styles.sendInfo}>
                    <Text style={[styles.sendPharmacy, { color: theme.text }]}>
                      {send.pharmacy_name}
                    </Text>
                    {send.pharmacy_address && (
                      <Text style={[styles.sendAddress, { color: theme.textMuted }]}>
                        {send.pharmacy_address}
                      </Text>
                    )}
                  </View>
                  <View style={styles.sendStatus}>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: statusConfig.color + '18', borderColor: statusConfig.color },
                      ]}>
                      <Text style={[styles.statusText, { color: statusConfig.color }]}>
                        {t(statusConfig.label)}
                      </Text>
                    </View>
                    <Text style={[styles.sendDate, { color: theme.textMuted }]}>
                      {formatDate(send.sent_at)}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : pharmacySends ? (
            <Text style={[styles.noSends, { color: theme.textMuted }]}>
              {t('noPharmacySends')}
            </Text>
          ) : (
            <ActivityIndicator size="small" color={theme.primary} />
          )}
        </View>
      )}
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
  actionBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  actionBtnOutlineText: {
    ...typography.buttonSmall,
  },
  expandedSection: {
    padding: spacing.md,
    borderTopWidth: 1,
  },
  downloadBtn: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    marginBottom: spacing.md,
  },
  sendsTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  sendCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  sendInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  sendPharmacy: {
    ...typography.bodySmall,
    fontWeight: '500',
  },
  sendAddress: {
    ...typography.caption,
    marginTop: 2,
  },
  sendStatus: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  sendDate: {
    ...typography.caption,
    marginTop: 2,
  },
  noSends: {
    ...typography.bodySmall,
    textAlign: 'center',
    padding: spacing.md,
  },
});
