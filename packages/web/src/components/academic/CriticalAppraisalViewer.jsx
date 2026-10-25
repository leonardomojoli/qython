import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './CriticalAppraisalViewer.module.css';

// Viewer estruturado da Leitura Crítica de Artigo (material `critical_appraisal`).
// Renderiza o JSON `appraisal` em seções: PICO, nível de evidência, risco de viés,
// resultados, forças/limitações, aplicabilidade, "como cai na prova" e bottom line.

const judgmentClass = (j) => {
  const v = (j || '').toLowerCase();
  if (v.includes('baixo')) return styles.badgeGood;
  if (v.includes('alto')) return styles.badgeBad;
  return styles.badgeWarn; // incerto / desconhecido
};

const gradeClass = (g) => {
  const v = (g || '').toLowerCase();
  if (v.includes('muito')) return styles.badgeBad;
  if (v.includes('alta')) return styles.badgeGood;
  if (v.includes('moderada')) return styles.badgeInfo;
  if (v.includes('baixa')) return styles.badgeWarn;
  return styles.badgeNeutral;
};

const Section = ({ title, children }) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>{title}</h3>
    {children}
  </section>
);

const PicoCell = ({ label, value }) => (
  <div className={styles.picoCell}>
    <div className={styles.picoLabel}>{label}</div>
    <div className={styles.picoValue}>{value || '—'}</div>
  </div>
);

const CriticalAppraisalViewer = ({ data }) => {
  const { t } = useTranslation();
  if (!data) return null;

  const {
    title, citation, study_type, objective, pico, evidence,
    risk_of_bias = [], key_results = [], strengths = [], limitations = [],
    applicability, exam_relevance, bottom_line,
  } = data;

  return (
    <div className={styles.container}>
      {title && <h2 className={styles.title}>{title}</h2>}
      {citation && <p className={styles.citation}>{citation}</p>}

      <div className={styles.metaRow}>
        {study_type && <span className={styles.chip}>{study_type}</span>}
        {evidence?.oxford_level && <span className={styles.chip}>Oxford {evidence.oxford_level}</span>}
        {evidence?.grade && (
          <span className={`${styles.chip} ${gradeClass(evidence.grade)}`}>GRADE: {evidence.grade}</span>
        )}
      </div>

      {objective && (
        <Section title={t('caObjective', 'Objetivo')}>
          <p>{objective}</p>
        </Section>
      )}

      {pico && (
        <Section title="PICO">
          <div className={styles.picoGrid}>
            <PicoCell label={t('caPicoP', 'P — População')} value={pico.population} />
            <PicoCell label={t('caPicoI', 'I — Intervenção')} value={pico.intervention} />
            <PicoCell label={t('caPicoC', 'C — Comparação')} value={pico.comparison} />
            <PicoCell label={t('caPicoO', 'O — Desfecho')} value={pico.outcome} />
          </div>
        </Section>
      )}

      {evidence?.rationale && (
        <Section title={t('caEvidence', 'Nível de evidência')}>
          <p>{evidence.rationale}</p>
        </Section>
      )}

      {risk_of_bias.length > 0 && (
        <Section title={t('caRiskOfBias', 'Risco de viés')}>
          <ul className={styles.list}>
            {risk_of_bias.map((r, i) => (
              <li key={i} className={styles.biasItem}>
                <span className={styles.biasDomain}>{r.domain}</span>
                {r.judgment && <span className={`${styles.badge} ${judgmentClass(r.judgment)}`}>{r.judgment}</span>}
                {r.rationale && <span className={styles.biasRationale}>{r.rationale}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {key_results.length > 0 && (
        <Section title={t('caKeyResults', 'Resultados-chave')}>
          <ul className={styles.list}>
            {key_results.map((k, i) => (
              <li key={i} className={styles.resultItem}>
                <div className={styles.resultOutcome}>{k.outcome}</div>
                {k.effect && <div className={styles.resultEffect}>{k.effect}</div>}
                {k.interpretation && <div className={styles.resultInterp}>{k.interpretation}</div>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(strengths.length > 0 || limitations.length > 0) && (
        <div className={styles.twoCol}>
          {strengths.length > 0 && (
            <Section title={t('caStrengths', 'Forças')}>
              <ul className={styles.bullets}>{strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </Section>
          )}
          {limitations.length > 0 && (
            <Section title={t('caLimitations', 'Limitações')}>
              <ul className={styles.bullets}>{limitations.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </Section>
          )}
        </div>
      )}

      {applicability && (
        <Section title={t('caApplicability', 'Aplicabilidade')}>
          <p>{applicability}</p>
        </Section>
      )}

      {exam_relevance && (
        <div className={styles.examBox}>
          <div className={styles.examLabel}>{t('caExamRelevance', 'Como cai na prova')}</div>
          <p>{exam_relevance}</p>
        </div>
      )}

      {bottom_line && (
        <div className={styles.bottomLine}>
          <div className={styles.bottomLabel}>{t('caBottomLine', 'Bottom line')}</div>
          <p>{bottom_line}</p>
        </div>
      )}
    </div>
  );
};

export default CriticalAppraisalViewer;
