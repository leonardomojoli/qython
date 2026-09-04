import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Linking,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { DracmaPackage } from '../../types/billing';
import ComingSoonModal from './ComingSoonModal';
import usePaymentGateways from '../../hooks/usePaymentGateways';
import api from '../../services/api';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const PACKAGES: DracmaPackage[] = [
  {
    id: 'pack_small',
    amount: '500',
    priceUSD: 5.0,
    popular: false,
    iconColor: '#40e0d0',
  },
  {
    id: 'pack_medium',
    amount: '2.000',
    priceUSD: 20.0,
    popular: true,
    iconColor: '#bb86fc',
  },
  {
    id: 'pack_large',
    amount: '4.000',
    priceUSD: 35.0,
    popular: false,
    iconColor: '#ffd700',
  },
];

export default function DracmaPurchaseModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { anyEnabled, provider } = usePaymentGateways();
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handlePurchase = async (pack: DracmaPackage) => {
    // dLocal fica OFF até go-live → "Em breve".
    if (!anyEnabled) {
      setComingSoonVisible(true);
      return;
    }
    if (loadingId) return;
    setLoadingId(pack.id);
    try {
      const res = await api.post('/billing/create-checkout-session', {
        packId: pack.id,
        provider,
        type: 'one_time',
      });
      const url = res.data?.url;
      if (url) {
        await Linking.openURL(url);
        onClose();
      }
    } catch (e) {
      Alert.alert(t('error', 'Erro'), t('errorRedirectingToPayment', 'Não foi possível iniciar o pagamento.'));
    } finally {
      setLoadingId(null);
    }
  };

  const getBadgeText = (pack: DracmaPackage) => {
    if (pack.popular) return t('billingMostPopular', 'Mais Popular');
    if (pack.id === 'pack_large') return t('billingBestValue', 'Melhor Valor');
    return null;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {t('buyDracmas')}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeText, { color: theme.textMuted }]}>{'✕'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.packagesContainer}
          showsVerticalScrollIndicator={false}>
          {PACKAGES.map((pack) => {
            const badge = getBadgeText(pack);

            return (
              <View
                key={pack.id}
                style={[
                  styles.packageCard,
                  { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
                  pack.popular && { borderColor: theme.primary, borderWidth: 2 },
                ]}>
                {badge && (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: pack.popular ? theme.primary : '#ffd700',
                      },
                    ]}>
                    <Text style={[styles.badgeText, { color: pack.popular ? '#fff' : '#1a1a2e' }]}>
                      {badge}
                    </Text>
                  </View>
                )}

                {/* Icon */}
                <View style={[styles.iconCircle, { backgroundColor: pack.iconColor + '20' }]}>
                  <Text style={[styles.gemIcon, { color: pack.iconColor }]}>
                    {'\uD83D\uDC8E'}
                  </Text>
                </View>

                {/* Amount */}
                <Text style={[styles.amount, { color: theme.text }]}>
                  {pack.amount}
                </Text>
                <Text style={[styles.dracmasLabel, { color: theme.textSecondary }]}>
                  {t('dracmas')}
                </Text>

                {/* Price */}
                <Text style={[styles.price, { color: theme.text }]}>
                  US$ {pack.priceUSD.toFixed(2)}
                </Text>

                {/* Buy Button */}
                <TouchableOpacity
                  style={[
                    styles.buyButton,
                    {
                      backgroundColor: pack.popular ? theme.primary : theme.surface,
                      borderWidth: pack.popular ? 0 : 1,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() => handlePurchase(pack)}
                  activeOpacity={0.8}>
                  <Text
                    style={[
                      styles.buyButtonText,
                      { color: pack.popular ? '#ffffff' : theme.primary },
                    ]}>
                    {t('buyDracmas')}
                  </Text>
                </TouchableOpacity>
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
  packagesContainer: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  packageCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomLeftRadius: borderRadius.md,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '700',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  gemIcon: {
    fontSize: 28,
  },
  amount: {
    fontSize: 36,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  dracmasLabel: {
    ...typography.bodySmall,
    marginBottom: spacing.md,
  },
  price: {
    ...typography.h3,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  buyButton: {
    width: '100%',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buyButtonText: {
    ...typography.button,
  },
});
