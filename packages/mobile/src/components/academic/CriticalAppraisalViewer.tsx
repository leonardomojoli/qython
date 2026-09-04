import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

// Viewer da Leitura Crítica de Artigo (material `critical_appraisal`). `data` = o result do
// material ({ appraisal: {...} }). Espelha o viewer web: PICO, nível de evidência, risco de
// viés, resultados, forças/limitações, aplicabilidade, "como cai na prova" e bottom line.

interface Props {
  data: any;
  onClose: () => void;
}

const judgmentColor = (j?: string) => {
  const v = (j || '').toLowerCase();
  if (v.includes('baixo')) return '#2ecc71';
  if (v.includes('alto')) return '#e74c3c';
  return '#f1c40f';
};

const gradeColor = (g?: string) => {
  const v = (g || '').toLowerCase();
  if (v.includes('muito')) return '#e74c3c';
  if (v.includes('alta')) return '#2ecc71';
  if (v.includes('moderada')) return '#3498db';
  if (v.includes('baixa')) return '#f1c40f';
  return '#9aa0aa';
};

const Section = ({ theme, title, children }: any) => (
  <View style={styles.section}>
    <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{title}</Text>
    {children}
  </View>
);

const Chip = ({ text, color }: { text: string; color: string }) => (
  <View style={[styles.chip, { backgroundColor: color + '22', borderColor: color + '55' }]}>
    <Text style={[styles.chipText, { color }]}>{text}</Text>
  </View>
);

const Bullet = ({ theme, children }: any) => (
  <View style={styles.bulletRow}>
    <Text style={[styles.bulletDot, { color: theme.primary }]}>{'•'}</Text>
    <Text style={[styles.bulletText, { color: theme.text }]}>{children}</Text>
  </View>
);

const Pico = ({ theme, label, value }: any) => (
  <View style={[styles.picoCell, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
    <Text style={[styles.picoLabel, { color: theme.primary }]}>{label}</Text>
    <Text style={[styles.picoValue, { color: theme.text }]}>{value || '—'}</Text>
  </View>
);

export default function CriticalAppraisalViewer({ data, onClose }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const a = data?.appraisal;
  if (!a) return null;

  const handleShare = async () => {
    try {
      await Share.share({ title: a.title, message: `${a.title || ''}\n\n${a.bottom_line || ''}`.trim() });
    } catch {}
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeBtnText, { color: theme.primary }]}>{t('close', 'Fechar')}</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {a.title || t('criticalAppraisal', 'Leitura Crítica')}
          </Text>
          <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
            <Text style={{ color: theme.primary, fontSize: 16 }}>{'↗'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {!!a.citation && <Text style={[styles.citation, { color: theme.textMuted }]}>{a.citation}</Text>}

          <View style={styles.chipRow}>
            {!!a.study_type && <Chip text={a.study_type} color={theme.primary} />}
            {!!a.evidence?.oxford_level && <Chip text={`Oxford ${a.evidence.oxford_level}`} color={theme.primary} />}
            {!!a.evidence?.grade && <Chip text={`GRADE: ${a.evidence.grade}`} color={gradeColor(a.evidence.grade)} />}
          </View>

          {!!a.objective && (
            <Section theme={theme} title={t('caObjective', 'Objetivo')}>
              <Text style={[styles.bodyText, { color: theme.text }]}>{a.objective}</Text>
            </Section>
          )}

          {!!a.pico && (
            <Section theme={theme} title="PICO">
              <View style={styles.picoGrid}>
                <Pico theme={theme} label={t('caPicoP', 'P — População')} value={a.pico.population} />
                <Pico theme={theme} label={t('caPicoI', 'I — Intervenção')} value={a.pico.intervention} />
                <Pico theme={theme} label={t('caPicoC', 'C — Comparação')} value={a.pico.comparison} />
                <Pico theme={theme} label={t('caPicoO', 'O — Desfecho')} value={a.pico.outcome} />
              </View>
            </Section>
          )}

          {!!a.evidence?.rationale && (
            <Section theme={theme} title={t('caEvidence', 'Nível de evidência')}>
              <Text style={[styles.bodyText, { color: theme.text }]}>{a.evidence.rationale}</Text>
            </Section>
          )}

          {Array.isArray(a.risk_of_bias) && a.risk_of_bias.length > 0 && (
            <Section theme={theme} title={t('caRiskOfBias', 'Risco de viés')}>
              {a.risk_of_bias.map((r: any, i: number) => (
                <View key={i} style={[styles.biasItem, { borderColor: theme.surfaceBorder }]}>
                  <View style={styles.biasHead}>
                    <Text style={[styles.biasDomain, { color: theme.text }]}>{r.domain}</Text>
                    {!!r.judgment && (
                      <View style={[styles.badge, { backgroundColor: judgmentColor(r.judgment) + '22' }]}>
                        <Text style={[styles.badgeText, { color: judgmentColor(r.judgment) }]}>{r.judgment}</Text>
                      </View>
                    )}
                  </View>
                  {!!r.rationale && <Text style={[styles.biasRationale, { color: theme.textMuted }]}>{r.rationale}</Text>}
                </View>
              ))}
            </Section>
          )}

          {Array.isArray(a.key_results) && a.key_results.length > 0 && (
            <Section theme={theme} title={t('caKeyResults', 'Resultados-chave')}>
              {a.key_results.map((k: any, i: number) => (
                <View key={i} style={[styles.resultItem, { borderColor: theme.surfaceBorder }]}>
                  <Text style={[styles.resultOutcome, { color: theme.text }]}>{k.outcome}</Text>
                  {!!k.effect && <Text style={[styles.resultEffect, { color: theme.primary }]}>{k.effect}</Text>}
                  {!!k.interpretation && <Text style={[styles.resultInterp, { color: theme.textMuted }]}>{k.interpretation}</Text>}
                </View>
              ))}
            </Section>
          )}

          {Array.isArray(a.strengths) && a.strengths.length > 0 && (
            <Section theme={theme} title={t('caStrengths', 'Forças')}>
              {a.strengths.map((s: string, i: number) => <Bullet key={i} theme={theme}>{s}</Bullet>)}
            </Section>
          )}
          {Array.isArray(a.limitations) && a.limitations.length > 0 && (
            <Section theme={theme} title={t('caLimitations', 'Limitações')}>
              {a.limitations.map((s: string, i: number) => <Bullet key={i} theme={theme}>{s}</Bullet>)}
            </Section>
          )}

          {!!a.applicability && (
            <Section theme={theme} title={t('caApplicability', 'Aplicabilidade')}>
              <Text style={[styles.bodyText, { color: theme.text }]}>{a.applicability}</Text>
            </Section>
          )}

          {!!a.exam_relevance && (
            <View style={[styles.highlight, { backgroundColor: '#03dac61a', borderColor: '#03dac64d' }]}>
              <Text style={[styles.highlightLabel, { color: '#03dac6' }]}>{t('caExamRelevance', 'Como cai na prova')}</Text>
              <Text style={[styles.highlightText, { color: theme.text }]}>{a.exam_relevance}</Text>
            </View>
          )}

          {!!a.bottom_line && (
            <View style={[styles.highlight, { backgroundColor: theme.primary + '1f', borderColor: theme.primary + '59' }]}>
              <Text style={[styles.highlightLabel, { color: theme.primary }]}>{t('caBottomLine', 'Bottom line')}</Text>
              <Text style={[styles.highlightText, { color: theme.text }]}>{a.bottom_line}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  closeBtn: { paddingVertical: 4 },
  closeBtnText: { ...typography.buttonSmall },
  headerTitle: { ...typography.h3, flex: 1, textAlign: 'center' },
  shareBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  body: { padding: spacing.base, gap: spacing.base, paddingBottom: spacing.xxl },
  citation: { ...typography.caption, fontStyle: 'italic' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { ...typography.caption, fontWeight: '600' },
  section: { gap: spacing.xs },
  sectionTitle: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  bodyText: { ...typography.body, lineHeight: 22 },
  picoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  picoCell: {
    width: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  picoLabel: { ...typography.caption, fontWeight: '700', marginBottom: 4 },
  picoValue: { ...typography.body },
  biasItem: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.xs },
  biasHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  biasDomain: { ...typography.body, fontWeight: '600', flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  badgeText: { ...typography.caption, fontWeight: '700', textTransform: 'capitalize' },
  biasRationale: { ...typography.caption, marginTop: 4 },
  resultItem: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.xs },
  resultOutcome: { ...typography.body, fontWeight: '600' },
  resultEffect: { ...typography.body, fontWeight: '600', marginTop: 2 },
  resultInterp: { ...typography.caption, marginTop: 2 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletDot: { ...typography.body, lineHeight: 22 },
  bulletText: { ...typography.body, flex: 1, lineHeight: 22 },
  highlight: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md },
  highlightLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  highlightText: { ...typography.body, lineHeight: 22 },
});
