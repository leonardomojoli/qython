import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  SafeAreaView,
  Animated,
  Linking,
  Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useUser } from '../../contexts/UserContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { useButtonPress } from '../../hooks/useButtonPress';
import type { PlanTier } from '../../types/billing';
import ComingSoonModal from './ComingSoonModal';
import usePaymentGateways from '../../hooks/usePaymentGateways';
import api from '../../services/api';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface PlanCard {
  key: PlanTier;
  dracmas: string;
  basePriceUSD: number | null;
  highlight: boolean;
  isEnterprise: boolean;
  featureKeys: { key: string; included: boolean }[];
}

const PLANS: PlanCard[] = [
  {
    key: 'intern',
    dracmas: '250',
    basePriceUSD: 0,
    highlight: false,
    isEnterprise: false,
    featureKeys: [
      { key: 'featureChatBasic', included: true },
      { key: 'featureConsultationTools', included: true },
      { key: 'featureLibraryRAG', included: true },
      { key: 'featureMediaGenerationBasic', included: true },
      { key: 'featureImageAnalysis', included: true },
      { key: 'featurePremiumContent', included: false },
      { key: 'featureArena', included: false },
    ],
  },
  {
    key: 'resident',
    dracmas: '1.200',
    basePriceUSD: 9.90,
    highlight: false,
    isEnterprise: false,
    featureKeys: [
      { key: 'featureChatBasic', included: true },
      { key: 'featureConsultationTools', included: true },
      { key: 'featureLibraryRAG', included: true },
      { key: 'featureMediaGenerationBasic', included: true },
      { key: 'featureImageAnalysis', included: true },
      { key: 'featurePremiumContent', included: true },
      { key: 'featureArena', included: true },
    ],
  },
  {
    key: 'staff',
    dracmas: '2.400',
    basePriceUSD: 19.90,
    highlight: true,
    isEnterprise: false,
    featureKeys: [
      { key: 'featureChatBasic', included: true },
      { key: 'featureConsultationTools', included: true },
      { key: 'featureLibraryRAG', included: true },
      { key: 'featureMediaGenerationBasic', included: true },
      { key: 'featureImageAnalysis', included: true },
      { key: 'featurePremiumContent', included: true },
      { key: 'featureArena', included: true },
    ],
  },
  {
    key: 'specialist',
    dracmas: '6.000',
    basePriceUSD: 49.90,
    highlight: false,
    isEnterprise: false,
    featureKeys: [
      { key: 'featureChatBasic', included: true },
      { key: 'featureConsultationTools', included: true },
      { key: 'featureLibraryRAG', included: true },
      { key: 'featureMediaGenerationBasic', included: true },
      { key: 'featureImageAnalysis', included: true },
      { key: 'featurePremiumContent', included: true },
      { key: 'featureArena', included: true },
      { key: 'featurePriority', included: true },
    ],
  },
  {
    key: 'enterprise',
    dracmas: '',
    basePriceUSD: null,
    highlight: false,
    isEnterprise: true,
    featureKeys: [
      { key: 'featureAPIAccess', included: true },
      { key: 'featureSSO', included: true },
      { key: 'featureAccountManager', included: true },
      { key: 'featureTeamTraining', included: true },
      { key: 'featureSLA', included: true },
    ],
  },
];

const PLAN_NAME_KEYS: Record<PlanTier, string> = {
  intern: 'planIntern',
  resident: 'planResident',
  staff: 'planStaff',
  specialist: 'planSpecialist',
  enterprise: 'planEnterprise',
};

// Subtle gradient overlay applied behind the highlight card content.
// Uses primaryGradient stops at very low opacity (~10%) so it reads as
// a "spotlight" rather than a flat purple block.
function highlightTint(color: string, alpha: string) {
  // theme.primaryGradient is ['#a78bfa', '#8b5cf6'] etc. We don't have alpha
  // in hex so we append '1A' (~10%) for the overlay.
  return color + alpha;
}

interface PlanCTAProps {
  highlight: boolean;
  isCurrent: boolean;
  isEnterprise: boolean;
  themePrimary: string;
  themeGradient: readonly [string, string];
  themeSurface: string;
  themeSurfaceBorder: string;
  themeTextMuted: string;
  onPress: () => void;
  label: string;
}

// Single CTA component so the hook can be created at render-time without
// breaking React's hook rules (the map below renders one CTA per plan).
function PlanCTA({
  highlight,
  isCurrent,
  isEnterprise,
  themePrimary,
  themeGradient,
  themeSurface,
  themeSurfaceBorder,
  themeTextMuted,
  onPress,
  label,
}: PlanCTAProps) {
  const press = useButtonPress();

  const wrapperStyle: any = {
    transform: [
      { scale: press.scale },
      {
        translateY: press.translateY.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 2],
        }),
      },
    ],
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  };
  if (highlight) {
    Object.assign(wrapperStyle, {
      shadowColor: themePrimary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 6,
    });
  }

  if (isCurrent) {
    return (
      <View
        style={[
          styles.ctaButton,
          { backgroundColor: themeSurfaceBorder, marginTop: spacing.md },
        ]}>
        <Text style={[styles.ctaText, { color: themeTextMuted }]}>{label}</Text>
      </View>
    );
  }

  if (highlight) {
    return (
      <Animated.View style={wrapperStyle}>
        <Pressable onPressIn={press.onPressIn} onPressOut={press.onPressOut} onPress={onPress}>
          <LinearGradient
            colors={themeGradient as unknown as string[]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaButton}>
            <Text style={[styles.ctaText, { color: '#ffffff' }]}>{label}</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={wrapperStyle}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={onPress}
        style={[
          styles.ctaButton,
          { backgroundColor: themeSurface, borderWidth: 1, borderColor: themePrimary },
        ]}>
        <Text style={[styles.ctaText, { color: themePrimary }]}>
          {isEnterprise ? label : label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function PricingModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { user } = useUser();

  const { anyEnabled, provider } = usePaymentGateways();
  const [isAnnual, setIsAnnual] = useState(false);
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const [loadingKey, setLoadingKey] = useState<PlanTier | null>(null);

  const isCurrentPlan = (planKey: PlanTier) => {
    const current = (user?.plan || 'free').toLowerCase();
    if (planKey === 'intern' && current === 'free') return true;
    return current === planKey;
  };

  const formatPrice = (basePrice: number) => {
    if (basePrice === 0) return t('free');
    const finalPrice = isAnnual ? basePrice * 0.8 : basePrice;
    return `US$ ${finalPrice.toFixed(2)}`;
  };

  const handleSelectPlan = async (plan: PlanCard) => {
    if (isCurrentPlan(plan.key)) return;
    // Enterprise (preço null) e plano gratuito (0) não vão pro checkout; sem gateway → "Em breve".
    if (!plan.basePriceUSD || !anyEnabled) {
      setComingSoonVisible(true);
      return;
    }
    if (loadingKey) return;
    setLoadingKey(plan.key);
    try {
      const res = await api.post('/billing/create-checkout-session', {
        planKey: plan.key,
        interval: isAnnual ? 'annual' : 'monthly',
        provider,
      });
      const url = res.data?.url;
      if (url) {
        await Linking.openURL(url);
        onClose();
      }
    } catch (e) {
      Alert.alert(t('error', 'Erro'), t('errorRedirectingToPayment', 'Não foi possível iniciar o pagamento.'));
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {t('chooseYourPlan')}
          </Text>
          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
            <Text style={[styles.closeText, { color: theme.textMuted }]}>{'✕'}</Text>
          </Pressable>
        </View>

        {/* Billing Toggle */}
        <View style={styles.toggleRow}>
          <Pressable onPress={() => setIsAnnual(false)} hitSlop={6}>
            <Text style={[styles.toggleLabel, { color: !isAnnual ? theme.primary : theme.textMuted }]}>
              {t('monthlyBilling')}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.toggleTrack, { backgroundColor: isAnnual ? theme.primary : theme.surfaceBorder }]}
            onPress={() => setIsAnnual(!isAnnual)}>
            <View style={[styles.toggleThumb, isAnnual && styles.toggleThumbActive]} />
          </Pressable>

          <View style={styles.annualLabelRow}>
            <Pressable onPress={() => setIsAnnual(true)} hitSlop={6}>
              <Text style={[styles.toggleLabel, { color: isAnnual ? theme.primary : theme.textMuted }]}>
                {t('annualBilling')}
              </Text>
            </Pressable>
            {isAnnual && (
              <View style={[styles.discountBadge, { backgroundColor: theme.success + '20' }]}>
                <Text style={[styles.discountText, { color: theme.success }]}>-20%</Text>
              </View>
            )}
          </View>
        </View>

        {/* Plan Cards */}
        <ScrollView
          contentContainerStyle={styles.plansContainer}
          showsVerticalScrollIndicator={false}>
          {PLANS.map((plan) => {
            const isCurrent = isCurrentPlan(plan.key);

            const cardStyle: any = [
              styles.planCard,
              { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
            ];
            if (plan.highlight) {
              cardStyle.push({
                borderColor: theme.primary,
                borderWidth: 2,
                shadowColor: theme.primary,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.25,
                shadowRadius: 18,
                elevation: 10,
                transform: [{ scale: 1.015 }],
              });
            }

            const ctaLabel = isCurrent
              ? t('currentPlan')
              : plan.isEnterprise
              ? t('contactSales')
              : t('subscribeNow');

            return (
              <View key={plan.key} style={cardStyle}>
                {/* Subtle gradient tint overlay only on the highlight card */}
                {plan.highlight && (
                  <LinearGradient
                    colors={[
                      highlightTint(theme.primaryGradient[0], '1A'),
                      'transparent',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                    pointerEvents="none"
                  />
                )}

                {plan.highlight && (
                  <LinearGradient
                    colors={theme.primaryGradient as unknown as string[]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.recommendedBadge}>
                    <Text style={styles.recommendedText}>{t('recommended')}</Text>
                  </LinearGradient>
                )}

                <Text style={[styles.planName, { color: theme.text }]}>
                  {t(PLAN_NAME_KEYS[plan.key])}
                </Text>

                {/* Price */}
                <View style={styles.priceRow}>
                  {plan.basePriceUSD !== null ? (
                    <>
                      <Text style={[styles.price, { color: theme.text }]}>
                        {formatPrice(plan.basePriceUSD)}
                      </Text>
                      {plan.basePriceUSD > 0 && (
                        <Text style={[styles.perMonth, { color: theme.textMuted }]}>
                          {t('perMonth')}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={[styles.price, { color: theme.text }]}>
                      {t('contactSales')}
                    </Text>
                  )}
                </View>

                {/* Dracmas */}
                {plan.dracmas ? (
                  <View style={styles.dracmaRow}>
                    <Text style={styles.dracmaIcon}>{'💎'}</Text>
                    <Text style={[styles.dracmaAmount, { color: theme.primary }]}>
                      {plan.dracmas}
                    </Text>
                    <Text style={[styles.dracmaLabel, { color: theme.textSecondary }]}>
                      {' '}{t('dracmas')} {t('monthly')}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.dracmaLabel, { color: theme.textSecondary }]}>
                    {t('customized')}
                  </Text>
                )}

                {/* Divider */}
                <View style={[styles.divider, { backgroundColor: theme.surfaceBorder }]} />

                {/* Features */}
                {plan.featureKeys.map((feat, idx) => (
                  <View key={idx} style={styles.featureRow}>
                    <Text style={[styles.featureIcon, { color: feat.included ? theme.success : theme.textMuted }]}>
                      {feat.included ? '✓' : '✗'}
                    </Text>
                    <Text
                      style={[
                        styles.featureText,
                        { color: feat.included ? theme.textSecondary : theme.textMuted },
                      ]}>
                      {t(feat.key)}
                    </Text>
                  </View>
                ))}

                {/* CTA */}
                <PlanCTA
                  highlight={plan.highlight}
                  isCurrent={isCurrent}
                  isEnterprise={plan.isEnterprise}
                  themePrimary={theme.primary}
                  themeGradient={theme.primaryGradient}
                  themeSurface={theme.surface}
                  themeSurfaceBorder={theme.surfaceBorder}
                  themeTextMuted={theme.textMuted}
                  onPress={() => handleSelectPlan(plan)}
                  label={ctaLabel}
                />
              </View>
            );
          })}
        </ScrollView>

        <ComingSoonModal visible={comingSoonVisible} onClose={() => setComingSoonVisible(false)} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.h3,
  },
  closeButton: {
    padding: spacing.sm,
  },
  closeText: {
    fontSize: 20,
    fontWeight: '300',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  toggleLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  annualLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  discountBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  discountText: {
    ...typography.caption,
    fontWeight: '700',
  },
  plansContainer: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  planCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  recommendedBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomLeftRadius: borderRadius.md,
  },
  recommendedText: {
    ...typography.caption,
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  planName: {
    ...typography.h3,
    marginBottom: spacing.sm,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  price: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  perMonth: {
    ...typography.bodySmall,
    marginLeft: spacing.xs,
  },
  dracmaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dracmaIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  dracmaAmount: {
    ...typography.body,
    fontWeight: '700',
  },
  dracmaLabel: {
    ...typography.bodySmall,
  },
  divider: {
    height: 1,
    marginBottom: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  featureIcon: {
    fontSize: 14,
    fontWeight: '700',
    width: 24,
    marginTop: 2,
  },
  featureText: {
    ...typography.bodySmall,
    flex: 1,
  },
  ctaButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  ctaText: {
    ...typography.button,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
