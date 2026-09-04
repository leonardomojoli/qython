import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useUser } from '../../contexts/UserContext';
import { getBalanceBreakdown, getStorageInfo } from '../../services/billing';
import type { BalanceBreakdown, StorageInfo, DracmaSource } from '../../types/billing';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import PricingModal from '../../components/billing/PricingModal';
import DracmaPurchaseModal from '../../components/billing/DracmaPurchaseModal';

const SOURCE_ICONS: Record<string, string> = {
  subscription: '\uD83D\uDC8E',
  internal_plan: '\uD83D\uDC8E',
  student_bonus: '\uD83C\uDF93',
  purchase: '\uD83D\uDCB0',
  promo: '\uD83C\uDF81',
  admin: '\u26A1',
  migration: '\uD83D\uDCE6',
  registration: '\uD83C\uDF89',
};

const SOURCE_LABEL_KEYS: Record<string, string> = {
  subscription: 'planCredits',
  internal_plan: 'planCredits',
  student_bonus: 'studentBonus',
  purchase: 'purchasedDracmas',
  promo: 'promoCredits',
  admin: 'adminCredits',
  migration: 'migratedCredits',
  registration: 'welcomeBonus',
};

const PLAN_DRACMAS: Record<string, number> = {
  free: 250,
  intern: 250,
  resident: 1200,
  staff: 2400,
  specialist: 6000,
};

export default function BillingTab() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { user } = useUser();

  const [breakdown, setBreakdown] = useState<BalanceBreakdown | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pricingVisible, setPricingVisible] = useState(false);
  const [purchaseVisible, setPurchaseVisible] = useState(false);

  useEffect(() => {
    Promise.all([getBalanceBreakdown(), getStorageInfo()])
      .then(([b, s]) => {
        setBreakdown(b);
        setStorage(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getPlanDisplayName = () => {
    const plan = user?.plan || 'free';
    const map: Record<string, string> = {
      free: t('planIntern'),
      intern: t('planIntern'),
      resident: t('planResident'),
      staff: t('planStaff'),
      specialist: t('planSpecialist'),
      enterprise: t('planEnterprise'),
    };
    return map[plan.toLowerCase()] || plan;
  };

  const planDracmas = PLAN_DRACMAS[user?.plan || 'free'] || 250;

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  const getDaysColor = (days: number) => {
    if (days <= 0) return theme.textMuted;
    if (days < 7) return theme.error;
    if (days <= 30) return theme.warning;
    return theme.success;
  };

  const getExpirationText = (days: number) => {
    if (days <= 0) return t('expiresToday');
    return `${t('expiresIn')} ${days} ${t('days', 'dias')}`;
  };

  const getStorageBarColor = (percent: number) => {
    if (percent > 90) return theme.error;
    if (percent > 70) return theme.warning;
    return theme.success;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      {/* 1. Subscription Card */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, { backgroundColor: theme.secondary + '20' }]}>
            <Text style={styles.cardIcon}>{'\uD83D\uDC8E'}</Text>
          </View>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            {t('yourSubscription')}
          </Text>
        </View>

        <View style={styles.planRow}>
          <Text style={[styles.planName, { color: theme.primary }]}>
            {getPlanDisplayName()}
          </Text>
        </View>

        <Text style={[styles.planDetail, { color: theme.textSecondary }]}>
          {t('billingDracmasIncluded', '{{amount}} dracmas/mes incluidos').replace('{{amount}}', String(planDracmas))}
        </Text>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: theme.primary }]}
          onPress={() => setPricingVisible(true)}
          activeOpacity={0.8}>
          <Text style={styles.actionButtonText}>
            {user?.plan === 'free' || !user?.plan
              ? t('upgradePlan')
              : t('managePlan')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 2. Dracma Balance Card */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, { backgroundColor: theme.primary + '20' }]}>
            <Text style={styles.cardIcon}>{'\uD83D\uDCB0'}</Text>
          </View>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            {t('dracmaBalance')}
          </Text>
        </View>

        <Text style={[styles.balanceTotal, { color: theme.text }]}>
          {'\u20AB'} {breakdown?.total?.toLocaleString() || user?.dracma_balance?.toLocaleString() || '0'}
        </Text>

        {breakdown && breakdown.expiring_soon > 0 && (
          <View style={[styles.warningBanner, { backgroundColor: theme.warning + '15', borderColor: theme.warning + '30' }]}>
            <Text style={[styles.warningText, { color: theme.warning }]}>
              {'\u26A0\uFE0F'} {t('billingExpiringWarning', '{{amount}} dracmas expiram em {{days}} dias')
                .replace('{{amount}}', String(Math.round(breakdown.expiring_soon)))
                .replace('{{days}}', String(breakdown.expiring_soon_days || 30))}
            </Text>
          </View>
        )}

        {/* Breakdown by source */}
        {breakdown?.by_source && Object.keys(breakdown.by_source).length > 0 && (
          <View style={styles.breakdownList}>
            {Object.entries(breakdown.by_source).map(([source, amount]) => (
              <View key={source} style={styles.breakdownRow}>
                <Text style={styles.breakdownIcon}>{SOURCE_ICONS[source] || '\uD83D\uDC8E'}</Text>
                <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>
                  {t(SOURCE_LABEL_KEYS[source] || source)}
                </Text>
                <Text style={[styles.breakdownAmount, { color: theme.text }]}>
                  {Math.round(amount as number)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: theme.secondary }]}
          onPress={() => setPurchaseVisible(true)}
          activeOpacity={0.8}>
          <Text style={styles.actionButtonText}>
            {t('buyDracmas')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. Storage Card */}
      {storage && (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: '#3b82f620' }]}>
              <Text style={styles.cardIcon}>{'\uD83D\uDCE6'}</Text>
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {t('storageTitle')}
            </Text>
          </View>

          <View style={styles.storageInfo}>
            <Text style={[styles.storageValue, { color: theme.text }]}>
              {formatBytes(storage.storage_used_bytes)}
              <Text style={[styles.storageTotal, { color: theme.textMuted }]}>
                {' / '}{formatBytes(storage.storage_quota_bytes)}
              </Text>
            </Text>
          </View>

          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBarBg, { backgroundColor: theme.surfaceBorder }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: getStorageBarColor(storage.storage_percent),
                    width: `${Math.min(100, storage.storage_percent)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressPercent, { color: theme.textSecondary }]}>
              {storage.storage_percent.toFixed(0)}%
            </Text>
          </View>

          <View style={styles.storageLimits}>
            <Text style={[styles.storageLimitText, { color: theme.textSecondary }]}>
              {t('librariesUsed')}: {storage.libraries_used}
              {storage.libraries_max ? ` / ${storage.libraries_max}` : ''}
            </Text>
            {storage.docs_per_library_max && (
              <Text style={[styles.storageLimitText, { color: theme.textSecondary }]}>
                {t('docsPerLibrary')}: {t('upTo')} {storage.docs_per_library_max}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* 4. Dracma Statement */}
      {breakdown?.batches && breakdown.batches.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: theme.primary + '20' }]}>
              <Text style={styles.cardIcon}>{'\uD83D\uDC8E'}</Text>
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {t('dracmaStatement')}
            </Text>
          </View>

          {breakdown.batches.map((batch, idx) => {
            const days = batch.days_until_expiration;
            const daysColor = getDaysColor(days);

            return (
              <View
                key={batch.id || idx}
                style={[styles.statementItem, idx < breakdown.batches.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.surfaceBorder }]}>
                <View style={styles.statementLeft}>
                  <Text style={styles.statementIcon}>
                    {SOURCE_ICONS[batch.source] || '\uD83D\uDC8E'}
                  </Text>
                  <View>
                    <Text style={[styles.statementSource, { color: theme.text }]}>
                      {t(SOURCE_LABEL_KEYS[batch.source] || batch.source)}
                    </Text>
                    <Text style={[styles.statementExpiry, { color: daysColor }]}>
                      {getExpirationText(days)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.statementAmount, { color: theme.text }]}>
                  +{Math.round(batch.amount)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Modals */}
      <PricingModal visible={pricingVisible} onClose={() => setPricingVisible(false)} />
      <DracmaPurchaseModal visible={purchaseVisible} onClose={() => setPurchaseVisible(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  cardIcon: {
    fontSize: 20,
  },
  cardTitle: {
    ...typography.label,
    fontWeight: '600',
  },
  planRow: {
    marginBottom: spacing.xs,
  },
  planName: {
    ...typography.h3,
    fontWeight: '700',
  },
  planDetail: {
    ...typography.bodySmall,
    marginBottom: spacing.md,
  },
  actionButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  actionButtonText: {
    ...typography.buttonSmall,
    color: '#ffffff',
  },
  balanceTotal: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  warningBanner: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  warningText: {
    ...typography.caption,
    fontWeight: '500',
  },
  breakdownList: {
    marginBottom: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  breakdownIcon: {
    fontSize: 16,
    width: 28,
  },
  breakdownLabel: {
    ...typography.bodySmall,
    flex: 1,
  },
  breakdownAmount: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  storageInfo: {
    marginBottom: spacing.sm,
  },
  storageValue: {
    ...typography.h3,
    fontWeight: '700',
  },
  storageTotal: {
    ...typography.body,
    fontWeight: '400',
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  progressBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercent: {
    ...typography.caption,
    fontWeight: '600',
    width: 36,
    textAlign: 'right',
  },
  storageLimits: {
    gap: spacing.xs,
  },
  storageLimitText: {
    ...typography.caption,
  },
  statementItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  statementLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statementIcon: {
    fontSize: 20,
    width: 32,
  },
  statementSource: {
    ...typography.bodySmall,
    fontWeight: '500',
  },
  statementExpiry: {
    ...typography.caption,
    marginTop: 2,
  },
  statementAmount: {
    ...typography.body,
    fontWeight: '700',
  },
});
