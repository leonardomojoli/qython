import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { COPILOT_PROMPTS } from './copilotPrompts';
import { getSuggestedPrompts, recordPromptClick } from '../../api';
import styles from './CopilotEmptyState.module.css';

// Amostra N pílulas aleatórias de uma lista (o conteúdo "rotaciona", não a posição).
function sampleFrom(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

const ISOTIPO = '/assets/images/branding/qython-isotipo.png';

// Empty-state premium do copiloto: imagotipo num halo orbital (anel cônico teal→roxo girando),
// saudação, e grade de pílulas em vidro com glow luminoso. As pílulas pré-preenchem o input
// (onPick). Entrada em cascata. Sem nuvem de fundo — foco no orbe. Frontend puro.
const CopilotEmptyState = ({ onPick, name, treatment }) => {
  const { t } = useTranslation();
  // v2: pílulas curadas servidas pela API (curar sem deploy). Fallback offline = lista embutida.
  const [allPrompts, setAllPrompts] = useState(COPILOT_PROMPTS);
  const [pills, setPills] = useState(() => sampleFrom(COPILOT_PROMPTS, 6));
  const [spin, setSpin] = useState(0);

  useEffect(() => {
    let active = true;
    getSuggestedPrompts()
      .then((items) => {
        if (!active || !Array.isArray(items) || items.length === 0) return;
        const mapped = items.map((p) => ({
          id: p.slug,
          category: p.category,
          icon: p.icon,
          labelKey: p.label_key,
          label: p.label,
          opener: p.opener,
        }));
        setAllPrompts(mapped);
        setPills(sampleFrom(mapped, 6));
      })
      .catch(() => { /* mantém o fallback embutido */ });
    return () => { active = false; };
  }, []);

  const shuffle = useCallback(() => {
    setPills(sampleFrom(allPrompts, 6));
    setSpin((s) => s + 1);
  }, [allPrompts]);

  const handlePick = useCallback((p) => {
    onPick(p.opener);
    recordPromptClick(p.id); // sinal de uso p/ o flywheel (fire-and-forget)
  }, [onPick]);

  const firstName = (name || '').trim().split(' ')[0];
  // Default eleva o ego: sem tratamento definido → "Dr."; "" (Nenhum, escolha explícita) → sem prefixo.
  const prefix = treatment === '' ? '' : `${treatment || 'Dr.'} `;
  const greeting = firstName
    ? t('copilotEmptyGreetingName', { treatment: prefix, name: firstName, defaultValue: `Como posso ajudar, ${prefix}${firstName}?` })
    : t('copilotEmptyGreeting', 'Como posso ajudar hoje?');

  return (
    <div className={styles.empty}>
      <div className={styles.hero}>
        <div className={styles.logoWrap}>
          <span className={styles.haloSoft} />
          <span className={styles.halo} />
          <span className={styles.logoDisc}>
            <img src={ISOTIPO} alt="Qython" className={styles.logo} draggable="false" />
          </span>
        </div>

        <h2 className={styles.greeting}>{greeting}</h2>
        <p className={styles.sub}>
          {t('copilotEmptySub', 'Comece por uma sugestão ou pergunte o que quiser.')}
        </p>

        <div className={styles.suggestHead}>
          <span className={styles.suggestLabel}>{t('suggestions', 'Sugestões')}</span>
          <span className={styles.hr} />
          <button
            type="button"
            className={styles.shuffle}
            onClick={shuffle}
            title={t('shuffleSuggestions', 'Trocar sugestões')}
          >
            <span className={styles.shuffleIcon} style={{ transform: `rotate(${spin * 360}deg)` }} aria-hidden="true">⟳</span>
            {t('shuffle', 'Trocar')}
          </button>
        </div>

        <div className={styles.pillGrid}>
          {pills.map((p, i) => (
            <button
              key={`${spin}-${p.id}`}
              type="button"
              className={styles.pill}
              style={{ animationDelay: `${0.14 + i * 0.05}s` }}
              onClick={() => handlePick(p)}
              title={p.opener}
            >
              <span className={styles.pillIcon} aria-hidden="true">{p.icon}</span>
              <span className={styles.pillLabel}>{t(p.labelKey, p.label)}</span>
              <span className={styles.pillArrow} aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CopilotEmptyState;
