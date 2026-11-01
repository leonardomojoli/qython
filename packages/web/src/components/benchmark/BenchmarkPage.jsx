import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faFlask, faCheck, faSpinner, faClock, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import qythonLogo from '../../assets/qython-imagotipo.png';
import { api } from '../../api';
import {
  STUDY_STATUS,
  MODELS,
  CATEGORIES,
  METRICS,
  DATASETS,
  TIMELINE,
} from './benchmarkData';
import styles from './BenchmarkPage.module.css';

const phaseIcon = {
  'done': faCheck,
  'in-progress': faSpinner,
  'pending': faClock,
};

const RadarSkeleton = () => {
  const data = CATEGORIES.map((c) => ({ category: c.shortLabel, value: 0 }));
  return (
    <div className={styles.radarWrapper}>
      <ResponsiveContainer width="100%" height={360}>
        <RadarChart data={data} outerRadius="75%">
          <PolarGrid stroke="rgba(187, 134, 252, 0.18)" />
          <PolarAngleAxis dataKey="category" tick={{ fill: 'rgba(230, 230, 240, 0.65)', fontSize: 12, fontWeight: 500 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        </RadarChart>
      </ResponsiveContainer>
      <div className={styles.radarOverlay} aria-hidden="true">
        <div className={styles.overlayPill}>
          <FontAwesomeIcon icon={faFlask} />
          <span>Resultados serão preenchidos após coleta</span>
        </div>
      </div>
    </div>
  );
};

const MatrixSkeleton = () => (
  <div className={styles.matrixWrapper}>
    <table className={styles.matrix}>
      <thead>
        <tr>
          <th className={styles.matrixCornerCell}>Categoria \ Modelo</th>
          {MODELS.map((m) => (
            <th key={m.id} className={m.featured ? styles.matrixModelHeaderFeatured : styles.matrixModelHeader}>
              {m.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {CATEGORIES.map((c) => (
          <tr key={c.id}>
            <th scope="row" className={styles.matrixCategoryHeader}>{c.label}</th>
            {MODELS.map((m) => (
              <td key={m.id} className={styles.matrixCellEmpty}>—</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

function BenchmarkPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const progressPct = Math.round((STUDY_STATUS.casesEvaluated / STUDY_STATUS.casesTarget) * 100);

  const [email, setEmail] = useState('');
  const [submitState, setSubmitState] = useState('idle'); // idle | submitting | success | error | already
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitState('submitting');
    setErrorMsg('');
    try {
      await api.post('/user/payment-waitlist', { email: email.trim().toLowerCase() });
      setSubmitState('success');
      setEmail('');
    } catch (err) {
      const status = err?.response?.status;
      if (status === 409) {
        setSubmitState('already');
      } else {
        setSubmitState('error');
        setErrorMsg(err?.response?.data?.detail || 'Não foi possível inscrever agora. Tente novamente em instantes.');
      }
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="Voltar">
          <FontAwesomeIcon icon={faArrowLeft} />
          <span>Voltar</span>
        </button>
        <Link to="/" className={styles.logoLink}>
          <img src={qythonLogo} alt="Qython" />
        </Link>
      </header>

      {/* 1. HERO */}
      <section className={styles.hero}>
        <span className={styles.eyebrow}>
          <FontAwesomeIcon icon={faFlask} /> Pesquisa em andamento · TCC Faculdade de Medicina
        </span>
        <h1 className={styles.heroTitle}>
          {t('benchmarkHeroTitle', 'Qython Medical AI Benchmark')}
        </h1>
        <p className={styles.heroSubtitle}>
          {t('benchmarkHeroSubtitle', 'Avaliação comparativa de modelos clínicos em 8 especialidades médicas, sob rubrica de especialistas e datasets validados internacionalmente.')}
        </p>

        <div className={styles.statusBanner}>
          <div className={styles.statusBannerLabel}>
            <span className={styles.statusDot} />
            <strong>Coleta de dados em andamento</strong>
          </div>
          <div className={styles.statusBannerMeta}>
            <span>{STUDY_STATUS.casesEvaluated.toLocaleString('pt-BR')} de {STUDY_STATUS.casesTarget.toLocaleString('pt-BR')} casos avaliados</span>
            <span>·</span>
            <span>Publicação prevista: {new Date(STUDY_STATUS.expectedPublication).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </section>

      {/* 2. SOBRE O ESTUDO */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Sobre o estudo</h2>
        <div className={styles.aboutGrid}>
          <div className={styles.aboutCard}>
            <h3>Objetivo</h3>
            <p>
              Quantificar a performance clínica do Qython 1 frente aos principais LLMs disponíveis,
              em condições controladas e replicáveis, fornecendo evidência sobre qual modelo é mais
              seguro e útil em diferentes contextos da prática médica.
            </p>
          </div>
          <div className={styles.aboutCard}>
            <h3>Autoria e afiliação</h3>
            <p>
              Estudo conduzido como Trabalho de Conclusão de Curso (TCC) do curso de Medicina,
              com orientação acadêmica e submissão a Comitê de Ética em Pesquisa (CEP) antes da
              coleta. Identificação de autores e instituição será divulgada com a publicação.
            </p>
          </div>
          <div className={styles.aboutCard}>
            <h3>Por que isso importa</h3>
            <p>
              Modelos de IA estão chegando ao consultório sem benchmarks que reflitam a prática
              clínica real. Avaliações genéricas (MMLU, MedQA puro) não distinguem entre erros
              triviais e erros que mudam conduta. Este estudo introduz métricas de segurança e
              raciocínio clínico avaliadas por especialistas.
            </p>
          </div>
        </div>
      </section>

      {/* 3. MODELOS AVALIADOS */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Modelos avaliados</h2>
        <p className={styles.sectionLead}>
          Sete modelos da geração 2026, cobrindo modelos proprietários, abertos e especializados
          em raciocínio. Todos avaliados com mesmo prompt-base, temperatura 0 e cutoff de contexto idênticos.
        </p>
        <div className={styles.modelGrid}>
          {MODELS.map((m) => (
            <div key={m.id} className={m.featured ? styles.modelCardFeatured : styles.modelCard}>
              <div className={styles.modelVendor}>{m.vendor}</div>
              <div className={styles.modelLabel}>{m.label}</div>
              <div className={styles.modelTagline}>{m.tagline}</div>
              {m.featured && <span className={styles.featuredBadge}>Foco do estudo</span>}
            </div>
          ))}
        </div>
      </section>

      {/* 4. CATEGORIAS */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Especialidades avaliadas</h2>
        <p className={styles.sectionLead}>
          Cada modelo é submetido a casos representativos das 8 categorias abaixo, com pesos
          balanceados para refletir frequência epidemiológica e impacto clínico.
        </p>
        <div className={styles.categoryGrid}>
          {CATEGORIES.map((c) => (
            <div key={c.id} className={styles.categoryCard}>
              <div className={styles.categoryLabel}>{c.label}</div>
              <p className={styles.categoryDesc}>{c.description}</p>
              {c.multimodal && <span className={styles.multimodalBadge}>Multimodal</span>}
            </div>
          ))}
        </div>
      </section>

      {/* 5. RESULTADOS - empty state */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Resultados</h2>
        <p className={styles.sectionLead}>
          As visualizações abaixo serão preenchidas conforme cada modelo completa a avaliação nas
          8 categorias. Por integridade científica, nenhum valor é mostrado antes da coleta
          definitiva.
        </p>

        <h3 className={styles.subTitle}>Perfil multidimensional por modelo</h3>
        <RadarSkeleton />

        <h3 className={styles.subTitle}>Matriz de acurácia (categorias × modelos)</h3>
        <MatrixSkeleton />
      </section>

      {/* 6. METODOLOGIA + DATASETS */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Datasets e metodologia</h2>
        <p className={styles.sectionLead}>
          Combinamos quatro fontes complementares para evitar viés de domínio ou idioma.
          Todos os datasets têm uso autorizado para pesquisa acadêmica.
        </p>
        <div className={styles.datasetGrid}>
          {DATASETS.map((d) => (
            <div key={d.id} className={styles.datasetCard}>
              <div className={styles.datasetHeader}>
                <span className={styles.datasetLabel}>{d.label}</span>
                <span className={styles.datasetCoverage}>{d.coverage}</span>
              </div>
              <p className={styles.datasetDesc}>{d.description}</p>
              <div className={styles.datasetLicense}>Licença: {d.license}</div>
            </div>
          ))}
        </div>

        <h3 className={styles.subTitle}>Métricas avaliadas</h3>
        <div className={styles.metricsList}>
          {METRICS.map((m) => (
            <div key={m.id} className={styles.metricRow}>
              <div className={styles.metricLabel}>
                {m.label}
                <span className={styles.metricUnit}>{m.unit && `(${m.unit})`}</span>
              </div>
              <div className={styles.metricDesc}>{m.description}</div>
              <div className={styles.metricDirection}>
                {m.higherIsBetter ? '↑ melhor' : '↓ melhor'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 7. CRONOGRAMA */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Cronograma do estudo</h2>
        <ol className={styles.timeline}>
          {TIMELINE.map((step, idx) => (
            <li key={idx} className={`${styles.timelineItem} ${styles[`timeline-${step.status}`]}`}>
              <span className={styles.timelineIcon}>
                <FontAwesomeIcon icon={phaseIcon[step.status]} spin={step.status === 'in-progress'} />
              </span>
              <div className={styles.timelineContent}>
                <div className={styles.timelinePhase}>{step.phase}</div>
                <div className={styles.timelinePeriod}>{step.period}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 8. NEWSLETTER */}
      <section className={styles.notifySection}>
        <h2 className={styles.sectionTitle}>Avise-me quando publicarem</h2>
        <p className={styles.sectionLead}>
          Resultados completos serão divulgados em PDF aberto + artigo submetido a periódico
          revisado por pares. Deixe seu e-mail para receber a publicação direto.
        </p>
        {submitState === 'success' || submitState === 'already' ? (
          <div className={styles.notifySuccess} role="status">
            <FontAwesomeIcon icon={faCheckCircle} />
            <span>
              {submitState === 'success'
                ? 'Pronto! Vamos avisar assim que a publicação sair.'
                : 'Esse e-mail já está cadastrado — você vai receber a publicação.'}
            </span>
          </div>
        ) : (
          <form className={styles.notifyForm} onSubmit={handleSubscribe}>
            <input
              type="email"
              required
              placeholder="seu@email.com"
              className={styles.notifyInput}
              aria-label="Email para notificação"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitState === 'submitting'}
            />
            <button
              type="submit"
              className={styles.notifyButton}
              disabled={submitState === 'submitting' || !email.trim()}
            >
              {submitState === 'submitting' ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin /> Inscrevendo…
                </>
              ) : (
                'Quero ser avisado'
              )}
            </button>
          </form>
        )}
        {submitState === 'error' && (
          <div className={styles.notifyError} role="alert">{errorMsg}</div>
        )}
      </section>
    </div>
  );
}

export default BenchmarkPage;
