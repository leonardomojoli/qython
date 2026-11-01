// frontend/src/components/consultation/QuickInsertBar.js
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faHeartPulse,
    faStethoscope,
    faClipboardList,
    faChevronDown,
    faChevronUp
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { getSubtemplatesForSpecialty } from '../../data/subtemplates';
import styles from './QuickInsertBar.module.css';

/**
 * Quick Insert Bar - Provides shortcuts for common medical note template insertions
 */

// Vital signs template
const VITAL_SIGNS_TEMPLATE = `
## Sinais Vitais
**PA:** ___/___mmHg | **FC:** ___bpm | **FR:** ___irpm
**SpO2:** ___%  | **Tax:** ___°C
**Peso:** ___kg | **Alt:** ___m | **IMC:** ___kg/m²
`;

// Normal physical exam templates by specialty
const NORMAL_EXAM_TEMPLATES = {
    general: `
## Exame Físico
**Estado Geral:** Bom, lúcido, orientado, corado, hidratado, anictérico, acianótico, afebril.
**ACV:** RCR, 2T, BNF, sem sopros.
**AR:** MV presente bilateralmente, sem RA.
**Abdome:** Plano, flácido, indolor à palpação, RHA+.
**MMII:** Sem edema, pulsos palpáveis e simétricos.
`,
    "Cardiologia": `
## Exame Cardiovascular
**ACV:** RCR, 2T, BNF, sem sopros. Ictus cordis normoposicionado.
**Pulsos:** Carotídeos simétricos, sem sopros. Periféricos presentes e simétricos.
**Jugulares:** Sem estase.
**MMII:** Sem edema. Panturrilhas livres.
`,
    "Pneumologia": `
## Exame Respiratório
**Inspeção:** Tórax simétrico, sem uso de musculatura acessória.
**Palpação:** Expansibilidade preservada bilateralmente. FTV normal.
**Percussão:** Som claro pulmonar bilateral.
**Ausculta:** MV presente bilateralmente, sem ruídos adventícios.
`,
    "Gastroenterologia": `
## Exame Abdominal
**Inspeção:** Plano, sem cicatrizes ou abaulamentos.
**Ausculta:** RHA presentes, normoativos.
**Percussão:** Timpanismo difuso, espaço de Traube livre.
**Palpação:** Flácido, indolor, sem massas ou visceromegalias.
**Sinais:** Murphy (-), Blumberg (-), Giordano (-).
`,
    "Neurologia": `
## Exame Neurológico
**Estado Mental:** Glasgow 15. Lúcido, orientado.
**Nervos Cranianos:** Pupilas isocóricas e fotorreagentes. MOE preservada. Mímica simétrica.
**Força:** Grau V nos 4 membros.
**Sensibilidade:** Tátil e dolorosa preservadas.
**Reflexos:** Presentes e simétricos. RCP em flexão bilateral.
**Coordenação:** Sem dismetria. **Marcha:** Normal.
`,
    "Psiquiatria": `
## Exame Psíquico
**Aparência:** Adequada. **Atitude:** Cooperativo.
**Consciência:** Vigil. **Orientação:** Preservada.
**Atenção/Memória:** Preservadas.
**Humor:** Eutímico. **Afeto:** Modulado.
**Pensamento:** Curso e conteúdo sem alterações.
**Sensopercepção:** Sem alucinações.
**Juízo/Insight:** Preservados.
`,
    "Dermatologia": `
## Exame Dermatológico
**Pele:** Normotérmica, normocorada, turgor preservado.
**Lesões:** Ausentes/Presentes (descrever localização, tipo, cor, tamanho, bordas).
**Mucosas:** Íntegras, normocoradas.
**Fâneros:** Cabelos e unhas sem alterações.
`,
    "Reumatologia": `
## Exame Reumatológico
**Articulações:** Sem sinais flogísticos. Amplitude de movimento preservada.
**Coluna:** Sem desvios. Mobilidade preservada.
**Força muscular:** Grau V nos 4 membros.
**Pele:** Sem rash, nódulos ou vasculite.
`,
    "Nefrologia": `
## Exame Nefrológico
**PA:** ___mmHg (ambos os braços)
**Edema:** [ ] Ausente [ ] Presente (+/++/+++)
**Abdome:** Sem massas palpáveis. Giordano bilateral: ___
**Extremidades:** Aquecidas, perfundidas, pulsos presentes.
`,
    "Endocrinologia e Metabologia": `
## Exame Endocrinológico
**Tireoide:** Volume normal, sem nódulos palpáveis, indolor.
**Peso:** ___kg | **Alt:** ___m | **IMC:** ___kg/m²
**CA:** ___cm
**Pele:** Sem acantose nigricans, sem estrias violáceas.
**Extremidades:** Sem edema. Pulsos periféricos presentes.
`,
    "Urologia": `
## Exame Urológico
**Abdome:** Plano, sem massas palpáveis. Bexiga não palpável.
**Genitália externa:** Sem alterações.
**Toque retal (se indicado):** Próstata ___
**Giordano:** [ ] Negativo [ ] Positivo
`,
    "Ginecologia e Obstetrícia": `
## Exame Ginecológico
**Mamas:** Simétricas, sem nódulos palpáveis, mamilos sem alterações.
**Abdome:** Plano, flácido, indolor à palpação.
**Especular:** Colo do útero sem lesões, secreção fisiológica.
**Toque vaginal:** Útero em AVF, volume normal, indolor. Anexos livres.
`,
    "Pediatria": `
## Exame Pediátrico
**Estado Geral:** Ativo, reativo, corado, hidratado, acianótico, anictérico.
**Peso:** ___kg | **Comprimento/Altura:** ___cm | **PC:** ___cm
**Oroscopia:** Amígdalas sem hiperemia. Otoscopia: MT íntegra bilateral.
**AR:** MV presente bilateral, sem RA.
**ACV:** RCR, 2T, BNF, sem sopros.
**Abdome:** Plano, flácido, indolor, sem visceromegalias.
`,
};

function QuickInsertBar({ onInsert, specialty = 'general', disabled = false }) {
    const { t } = useTranslation();
    const [showProtocolMenu, setShowProtocolMenu] = useState(false);
    const protocolRef = useRef(null);

    const groupedSubtemplates = useMemo(() => {
        return getSubtemplatesForSpecialty(specialty);
    }, [specialty]);

    const hasSubtemplates = Object.keys(groupedSubtemplates).length > 0;

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (protocolRef.current && !protocolRef.current.contains(event.target)) {
                setShowProtocolMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close menu when specialty changes
    useEffect(() => {
        setShowProtocolMenu(false);
    }, [specialty]);

    const handleInsertVitalSigns = () => {
        onInsert(VITAL_SIGNS_TEMPLATE.trim());
    };

    const handleInsertNormalExam = () => {
        const template = NORMAL_EXAM_TEMPLATES[specialty] || NORMAL_EXAM_TEMPLATES.general;
        onInsert(template.trim());
    };

    const handleInsertSubtemplate = (subtemplate) => {
        onInsert(subtemplate.content.trim());
        setShowProtocolMenu(false);
    };

    return (
        <div className={styles.quickInsertBar}>
            <span className={styles.label}>{t('quickInsert')}:</span>

            <button
                type="button"
                className={styles.insertButton}
                onClick={handleInsertVitalSigns}
                disabled={disabled}
                title={t('insertVitalSigns')}
            >
                <FontAwesomeIcon icon={faHeartPulse} />
                <span>{t('vitalSigns')}</span>
            </button>

            <button
                type="button"
                className={styles.insertButton}
                onClick={handleInsertNormalExam}
                disabled={disabled}
                title={t('insertNormalExam')}
            >
                <FontAwesomeIcon icon={faStethoscope} />
                <span>{t('normalExam')}</span>
            </button>

            <div className={styles.protocolContainer} ref={protocolRef}>
                <button
                    type="button"
                    className={`${styles.insertButton} ${showProtocolMenu ? styles.active : ''}`}
                    onClick={() => setShowProtocolMenu(!showProtocolMenu)}
                    disabled={disabled}
                    title={t('insertProtocol')}
                >
                    <FontAwesomeIcon icon={faClipboardList} />
                    <span>{t('protocols')}</span>
                    <FontAwesomeIcon icon={showProtocolMenu ? faChevronUp : faChevronDown} className={styles.chevron} />
                </button>

                {showProtocolMenu && (
                    <div className={styles.subtemplateMenu}>
                        {!hasSubtemplates ? (
                            <div className={styles.emptyState}>
                                {specialty
                                    ? t('noProtocolsForSpecialty')
                                    : t('selectSpecialtyForProtocols')
                                }
                            </div>
                        ) : (
                            Object.entries(groupedSubtemplates).map(([catKey, cat]) => (
                                <div key={catKey} className={styles.categoryGroup}>
                                    <div className={styles.categoryHeader}>
                                        {t(cat.labelKey)}
                                    </div>
                                    {cat.items.map((item) => (
                                        <button
                                            key={item.id}
                                            className={styles.subtemplateItem}
                                            onClick={() => handleInsertSubtemplate(item)}
                                        >
                                            {t(item.labelKey)}
                                        </button>
                                    ))}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default QuickInsertBar;
