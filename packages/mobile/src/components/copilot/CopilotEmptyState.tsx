import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { COPILOT_PROMPTS, sampleFrom, type CopilotPill } from '../../data/copilotPrompts';
import { getSuggestedPrompts, recordPromptClick } from '../../services/copilot';

const ISOTIPO = require('../../assets/qython-imagotipo.png');
const N_PILLS = 4;

interface Props {
  onPick: (opener: string) => void;
  name?: string | null;
  treatment?: string | null;
}

// Empty-state premium do copiloto (paridade com o web): imagotipo num halo orbital
// (anel gradiente teal→roxo girando), saudação com tratamento, e pílulas de sugestão que
// pré-preenchem o input. Pílulas servidas pela API (fallback offline = lista embutida).
export default function CopilotEmptyState({ onPick, name, treatment }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [allPrompts, setAllPrompts] = useState<CopilotPill[]>(COPILOT_PROMPTS);
  const [pills, setPills] = useState<CopilotPill[]>(() => sampleFrom(COPILOT_PROMPTS, N_PILLS));

  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 7000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  useEffect(() => {
    let active = true;
    getSuggestedPrompts()
      .then((items) => {
        if (!active || !Array.isArray(items) || items.length === 0) return;
        const mapped: CopilotPill[] = items.map((p) => ({
          id: p.slug,
          category: p.category || '',
          icon: p.icon || '💬',
          labelKey: p.label_key || '',
          label: p.label,
          opener: p.opener,
        }));
        setAllPrompts(mapped);
        setPills(sampleFrom(mapped, N_PILLS));
      })
      .catch(() => {
        /* mantém o fallback embutido */
      });
    return () => {
      active = false;
    };
  }, []);

  const shuffle = useCallback(() => {
    setPills(sampleFrom(allPrompts, N_PILLS));
  }, [allPrompts]);

  const handlePick = useCallback(
    (p: CopilotPill) => {
      onPick(p.opener);
      recordPromptClick(p.id); // sinal de uso p/ o flywheel (fire-and-forget)
    },
    [onPick],
  );

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const firstName = (name || '').trim().split(' ')[0];
  // Default eleva o ego: sem tratamento definido → "Dr."; "" (Nenhum) → sem prefixo.
  const prefix = treatment === '' ? '' : `${treatment || 'Dr.'} `;
  const greeting = firstName
    ? t('copilotEmptyGreetingName', {
        treatment: prefix,
        name: firstName,
        defaultValue: `Como posso ajudar, ${prefix}${firstName}?`,
      })
    : t('copilotEmptyGreeting', 'Como posso ajudar hoje?');

  return (
    <View style={styles.container}>
      {/* Imagotipo + halo orbital */}
      <View style={styles.logoWrap}>
        <Animated.View style={[styles.halo, { transform: [{ rotate }] }]}>
          <LinearGradient
            colors={['#03dac6', '#7c5ce0', '#03dac6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.haloGradient}
          />
        </Animated.View>
        <View style={[styles.haloHole, { backgroundColor: theme.background }]} />
        <View
          style={[
            styles.logoDisc,
            { backgroundColor: theme.surface, borderColor: theme.surfaceBorder, shadowColor: theme.primary },
          ]}>
          <Image source={ISOTIPO} style={styles.logo} resizeMode="contain" />
        </View>
      </View>

      <Text style={[styles.greeting, { color: theme.text }]}>{greeting}</Text>
      <Text style={[styles.sub, { color: theme.textSecondary }]}>
        {t('copilotEmptySub', 'Comece por uma sugestão ou pergunte o que quiser.')}
      </Text>

      {/* Cabeçalho de sugestões */}
      <View style={styles.suggestHead}>
        <Text style={[styles.suggestLabel, { color: theme.textMuted }]}>
          {t('suggestions', 'Sugestões').toUpperCase()}
        </Text>
        <View style={[styles.hr, { backgroundColor: theme.surfaceBorder }]} />
        <TouchableOpacity
          onPress={shuffle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}>
          <Text style={[styles.shuffle, { color: theme.primary }]}>
            {'⟳'} {t('shuffle', 'Trocar')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pílulas */}
      <View style={styles.pillList}>
        {pills.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}
            onPress={() => handlePick(p)}
            activeOpacity={0.8}>
            <View style={[styles.pillIcon, { borderColor: theme.surfaceBorder }]}>
              <Text style={styles.pillIconText}>{p.icon}</Text>
            </View>
            <Text style={[styles.pillLabel, { color: theme.text }]} numberOfLines={2}>
              {p.labelKey ? t(p.labelKey, p.label) : p.label}
            </Text>
            <Text style={[styles.pillArrow, { color: theme.primary }]}>{'›'}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  logoWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  halo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
  },
  haloGradient: {
    width: 96,
    height: 96,
  },
  haloHole: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  logoDisc: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  logo: {
    width: 42,
    height: 42,
  },
  greeting: {
    ...typography.h2,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  sub: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  suggestHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
    marginBottom: spacing.md,
  },
  suggestLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  hr: {
    flex: 1,
    height: 1,
  },
  shuffle: {
    fontSize: 13,
    fontWeight: '600',
  },
  pillList: {
    width: '100%',
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  pillIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pillIconText: {
    fontSize: 20,
  },
  pillLabel: {
    flex: 1,
    ...typography.body,
    fontWeight: '500',
  },
  pillArrow: {
    fontSize: 22,
    fontWeight: '300',
  },
});
