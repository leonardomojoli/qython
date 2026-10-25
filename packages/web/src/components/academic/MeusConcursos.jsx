// Meus Concursos — pilar de provas customizadas da Arena.
// O usuário cria um "card" (gerador de prova) a partir de uma ou mais bibliotecas,
// define a quantidade/tipo de questões e gera quantas provas quiser. As provas geradas
// (drafts) ficam listadas; mais tarde poderão virar rounds congelados e competíveis.
// Desenho: docs/ARENA_CUSTOM_EXAMS.md

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LibraryIcon } from '../library/libraryIcons';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faPlus, faBolt, faList, faPen, faTrash, faSpinner, faTimes,
    faFileAlt, faClock, faLayerGroup,
    faSearch, faCheckCircle, faClipboardList, faUpload, faGraduationCap,
    faCaretUp, faCaretDown, faChevronUp, faChevronDown,
} from '@fortawesome/free-solid-svg-icons';
import ReactMarkdown from 'react-markdown';
import {
    listCustomCards, createCustomCard, updateCustomCard, deleteCustomCard,
    generateCardDraft, getCardDrafts, getMaterialJobStatus, getLibraries,
    researchCardExam, updateCardDossier, createLibrary, uploadDocumentToLibrary,
    saveMaterialAttempt,
} from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import MaterialResultModal from './MaterialResultModal';
import InlineLoading from '../shared/InlineLoading';
import styles from './MeusConcursos.module.css';

// Input numérico com stepper próprio: as setas nativas do <input type="number"> são render
// do browser (caixa clara, não tematizável) — escondemos via CSS e desenhamos as nossas.
// Definido FORA do componente (identidade estável — senão o input perde foco a cada render).
const NumberInput = ({ value, onChange, min, max, style, ...rest }) => {
    const step = (delta) => {
        const base = Number(value);
        let next = (Number.isFinite(base) && String(value).trim() !== '' ? base : (min ?? 0)) + delta;
        if (min !== undefined && next < min) next = min;
        if (max !== undefined && next > max) next = max;
        onChange(next);
    };
    return (
        <div className={styles.numberWrap} style={style}>
            <input
                type="number"
                className={styles.input}
                value={value}
                min={min}
                max={max}
                onChange={(e) => onChange(e.target.value)}
                {...rest}
            />
            <div className={styles.stepBtns}>
                <button type="button" tabIndex={-1} className={styles.stepBtn} onClick={() => step(1)} aria-label="+1">
                    <FontAwesomeIcon icon={faCaretUp} />
                </button>
                <button type="button" tabIndex={-1} className={styles.stepBtn} onClick={() => step(-1)} aria-label="-1">
                    <FontAwesomeIcon icon={faCaretDown} />
                </button>
            </div>
        </div>
    );
};

const EMPTY_FORM = {
    name: '', description: '', libraryIds: [], editalFiles: [], pastExamFiles: [],
    numQuestions: 25, questionType: 'objective', numAlternatives: 5, timeLimit: '',
    useBlueprint: false, blueprint: [], passingScore: '',
};

// Pontuação: "39" em vez de "39.0"; "1,5" com vírgula (pt-BR e afins)
const formatPoints = (n) => {
    const num = Number(n) || 0;
    return Number.isInteger(num) ? String(num) : num.toFixed(1).replace('.', ',');
};

const MeusConcursos = () => {
    const { t } = useTranslation();
    const { addNotification } = useNotification();

    const [cards, setCards] = useState([]);
    const [libraries, setLibraries] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const [generatingId, setGeneratingId] = useState(null);
    const [pollMaterialId, setPollMaterialId] = useState(null);
    // O tick do polling é async: o clearInterval só roda DEPOIS do await, então outro
    // tick pode entrar em voo e também ver 'completed' → notificação duplicada.
    // Este ref torna o desfecho idempotente (uma conclusão = um aviso).
    const pollDoneRef = useRef(null);

    // Meus Concursos = TREINAMENTO DE PROVA (foco): modal LOCAL próprio, não-persistente e
    // não-minimizável (de propósito). Diferente do Produtor de Materiais, aqui NÃO faz
    // sentido o usuário sair da tela no meio da prova. Por isso não usa o MaterialViewer.
    const [resultModal, setResultModal] = useState(null);  // { result, sourceName, materialType, cardId }
    const [confirmGenerate, setConfirmGenerate] = useState(null); // { card, pending } — docs ainda processando
    const [expandedCards, setExpandedCards] = useState(() => new Set()); // cards com detalhes abertos

    const toggleCardExpanded = (id) => setExpandedCards((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const [draftsModal, setDraftsModal] = useState(null);   // { card, drafts, loading }
    const [dossierModal, setDossierModal] = useState(null); // { card, researching, mode, synthesis, sources, confirmed }

    const fetchCards = useCallback(async () => {
        try {
            const data = await listCustomCards();
            setCards(data || []);
        } catch (_e) {
            // erro já notificado pela camada de api
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCards();
        getLibraries().then((d) => setLibraries(d || [])).catch(() => {});
    }, [fetchCards]);

    // Polling da geração de prova (reusa o endpoint de status de material)
    useEffect(() => {
        if (!pollMaterialId) return undefined;
        const interval = setInterval(async () => {
            try {
                const m = await getMaterialJobStatus(pollMaterialId);
                if (m.status === 'completed' || m.status === 'error') {
                    if (pollDoneRef.current === pollMaterialId) return; // já tratado por outro tick
                    pollDoneRef.current = pollMaterialId;
                    clearInterval(interval);
                    setPollMaterialId(null);
                    setGeneratingId(null);
                    if (m.status === 'completed') {
                        addNotification(t('mcGenDone'), 'success');
                        const card = cards.find((c) => c.id === m.card_id);
                        setResultModal({
                            result: m,
                            sourceName: card?.name || t('mcUntitledDraft'),
                            materialType: m.material_type,
                            cardId: m.card_id,
                            timeLimitMinutes: card?.config?.time_limit_minutes || null,
                            scoring: card?.config?.blueprint
                                ? { blueprint: card.config.blueprint, passingScore: card.config.passing_score ?? null }
                                : null,
                        });
                        fetchCards();
                    } else {
                        addNotification(t('mcGenError'), 'error');
                    }
                }
            } catch (_e) {
                clearInterval(interval);
                setPollMaterialId(null);
                setGeneratingId(null);
                addNotification(t('mcGenError'), 'error');
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [pollMaterialId, cards, addNotification, t, fetchCards]);

    const openCreate = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setShowForm(true);
    };

    const openEdit = (card) => {
        const cfg = card.config || {};
        setEditingId(card.id);
        setForm({
            name: card.name || '',
            description: card.description || '',
            libraryIds: (card.sources || []).map((s) => s.library_id).filter(Boolean),
            editalFiles: [],
            pastExamFiles: [],
            numQuestions: cfg.num_questions || 25,
            questionType: cfg.question_type || 'objective',
            numAlternatives: cfg.num_alternatives || 5,
            timeLimit: cfg.time_limit_minutes || '',
            useBlueprint: Array.isArray(cfg.blueprint) && cfg.blueprint.length > 0,
            blueprint: Array.isArray(cfg.blueprint)
                ? cfg.blueprint.map((b) => ({
                    label: b.label || '',
                    num_questions: b.num_questions || 5,
                    library_ids: b.library_ids || [],
                    weight: b.weight ?? 1,
                    min_correct: b.min_correct ?? '',
                }))
                : [],
            passingScore: cfg.passing_score ?? '',
        });
        setShowForm(true);
    };

    const toggleLibrary = (id) => {
        setForm((f) => ({
            ...f,
            libraryIds: f.libraryIds.includes(id)
                ? f.libraryIds.filter((x) => x !== id)
                : [...f.libraryIds, id],
        }));
    };

    // --- Distribuição por bloco (blueprint): cada bloco = nome + nº de questões + bibliotecas ---
    const addBlock = () => setForm((f) => ({ ...f, blueprint: [...f.blueprint, { label: '', num_questions: 5, library_ids: [], weight: 1, min_correct: '' }] }));
    const removeBlock = (bi) => setForm((f) => ({ ...f, blueprint: f.blueprint.filter((_, j) => j !== bi) }));
    const updateBlock = (bi, patch) => setForm((f) => ({ ...f, blueprint: f.blueprint.map((b, j) => (j === bi ? { ...b, ...patch } : b)) }));
    const toggleBlockLib = (bi, libId) => setForm((f) => ({
        ...f,
        blueprint: f.blueprint.map((b, j) => {
            if (j !== bi) return b;
            const lids = b.library_ids || [];
            return { ...b, library_ids: lids.includes(libId) ? lids.filter((x) => x !== libId) : [...lids, libId] };
        }),
    }));

    const handleSave = async () => {
        if (!form.name.trim()) { addNotification(t('mcNameRequired'), 'error'); return; }
        if (form.libraryIds.length === 0 && form.editalFiles.length === 0 && form.pastExamFiles.length === 0) { addNotification(t('mcLibRequired'), 'error'); return; }
        let blueprint;
        if (form.useBlueprint) {
            // NUNCA descartar bloco silenciosamente (já engoliu 3 questões de um usuário):
            // bloco incompleto = erro apontando qual, para completar ou remover.
            const cleaned = form.blueprint
                .map((b) => ({
                    label: (b.label || '').trim(),
                    num_questions: Number(b.num_questions) || 0,
                    library_ids: (b.library_ids || []).filter(Boolean),
                    // peso em PONTOS por questão (default 1); mínimo p/ não eliminar (opcional)
                    weight: b.weight === '' || b.weight === undefined || b.weight === null ? 1 : Math.max(0, Number(b.weight) || 0),
                    ...(String(b.min_correct ?? '').trim() !== '' ? { min_correct: Math.max(0, Number(b.min_correct) || 0) } : {}),
                }));
            if (cleaned.length === 0) { addNotification(t('mcBlueprintRequired'), 'error'); return; }
            const badIdx = cleaned.findIndex((b) => b.library_ids.length === 0 || b.num_questions <= 0);
            if (badIdx !== -1) {
                addNotification(t('mcBlueprintBlockInvalid', { name: cleaned[badIdx].label || `#${badIdx + 1}` }), 'error');
                return;
            }
            blueprint = cleaned;
        }
        setSaving(true);
        try {
            const libraryIds = [...form.libraryIds];
            const attachedLibIds = [];
            let pastExamsLibId = null;
            // Edital / conteúdo programático → biblioteca de CONTEÚDO.
            if (form.editalFiles.length > 0) {
                const lib = await createLibrary({ name: `${form.name.trim()} — edital`, description: null, icon: 'book' });
                for (const f of form.editalFiles) {
                    await uploadDocumentToLibrary(lib.id, f);
                }
                libraryIds.push(lib.id);
                attachedLibIds.push(lib.id);
            }
            // Provas anteriores → biblioteca de FORMATO (referência de estilo, não vira conteúdo).
            if (form.pastExamFiles.length > 0) {
                const lib = await createLibrary({ name: `${form.name.trim()} — provas anteriores`, description: null, icon: 'book' });
                for (const f of form.pastExamFiles) {
                    await uploadDocumentToLibrary(lib.id, f);
                }
                libraryIds.push(lib.id);
                attachedLibIds.push(lib.id);
                pastExamsLibId = lib.id;
            }
            if (form.editalFiles.length > 0 || form.pastExamFiles.length > 0) {
                addNotification(t('mcFilesUploaded'), 'info');
            }
            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || null,
                config: {
                    num_questions: Number(form.numQuestions) || 25,
                    question_type: form.questionType,
                    num_alternatives: Number(form.numAlternatives) || 5,
                    time_limit_minutes: form.timeLimit ? Number(form.timeLimit) : null,
                    ...(blueprint ? { blueprint } : {}),
                    ...(blueprint && String(form.passingScore ?? '').trim() !== ''
                        ? { passing_score: Math.max(0, Number(form.passingScore) || 0) }
                        : { passing_score: null }),
                },
                source_library_ids: libraryIds,
                attached_library_ids: attachedLibIds,
                past_exams_library_id: pastExamsLibId,
            };
            if (editingId) {
                await updateCustomCard(editingId, payload);
                addNotification(t('mcCardUpdated'), 'success');
            } else {
                await createCustomCard(payload);
                addNotification(t('mcCardCreated'), 'success');
            }
            setShowForm(false);
            fetchCards();
            getLibraries().then((d) => setLibraries(d || [])).catch(() => {});
        } catch (_e) {
            // notificado pela api
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (card) => {
        if (!window.confirm(t('mcDeleteConfirm'))) return;
        // Se o concurso tem arquivos anexados (biblioteca de apoio auto-criada), pergunta se
        // quer apagá-la também (libera a cota de armazenamento). OK = apaga; Cancelar = mantém.
        let deleteLibraries = false;
        if ((card.config?._attached_library_ids || []).length > 0) {
            deleteLibraries = window.confirm(t('mcDeleteFilesConfirm'));
        }
        try {
            await deleteCustomCard(card.id, deleteLibraries);
            addNotification(t('mcCardDeleted'), 'info');
            fetchCards();
        } catch (_e) { /* notificado */ }
    };

    const doGenerate = async (card) => {
        setGeneratingId(card.id);
        try {
            const material = await generateCardDraft(card.id, {});
            addNotification(t('mcGenStarted'), 'info');
            setPollMaterialId(material.id);
        } catch (_e) {
            setGeneratingId(null);
        }
    };

    // Documentos pending/processing das fontes do card (a geração sairia SEM eles)
    const pendingDocsForCard = (card, libs) => {
        const srcIds = new Set((card.sources || []).map((s) => s.library_id).filter(Boolean));
        return (libs || []).reduce((sum, l) => sum + (srcIds.has(l.id) ? (l.processing_count || 0) : 0), 0);
    };

    const handleGenerate = async (card) => {
        if (generatingId) return; // já há geração em curso (guarda contra duplo clique)
        // Trava o botão ANTES do await: sem isto, a busca de bibliotecas abre uma janela
        // em que o "Gerar prova" segue clicável → 2ª geração + débito de dracmas em dobro.
        setGeneratingId(card.id);
        // Contagem FRESCA (processamento muda em minutos): avisa em vez de gerar calado sem os docs
        let libs = libraries;
        try {
            libs = (await getLibraries()) || [];
            setLibraries(libs);
        } catch (_e) { /* usa o estado atual */ }
        const pending = pendingDocsForCard(card, libs);
        if (pending > 0) {
            setGeneratingId(null); // decisão do usuário: solta o botão até ele confirmar
            setConfirmGenerate({ card, pending });
            return;
        }
        doGenerate(card);
    };

    const handleViewDrafts = async (card) => {
        setDraftsModal({ card, drafts: [], loading: true });
        try {
            const drafts = await getCardDrafts(card.id);
            setDraftsModal({ card, drafts: drafts || [], loading: false });
        } catch (_e) {
            setDraftsModal(null);
        }
    };

    const openDraft = (draft, card) => {
        if (draft.status !== 'completed') return;
        setDraftsModal(null);
        setResultModal({
            result: draft,
            sourceName: card?.name || t('mcUntitledDraft'),
            materialType: draft.material_type,
            cardId: card?.id,
            timeLimitMinutes: card?.config?.time_limit_minutes || null,
            scoring: card?.config?.blueprint
                ? { blueprint: card.config.blueprint, passingScore: card.config.passing_score ?? null }
                : null,
        });
    };

    const openDossier = (card) => {
        const d = card.dossier || {};
        setDossierModal({
            card,
            researching: false,
            mode: 'view',
            synthesis: d.synthesis || '',
            sources: d.sources || [],
            confirmed: !!d.confirmed,
            grounded: d.grounded,
        });
    };

    const runResearch = async () => {
        if (!dossierModal) return;
        const card = dossierModal.card;
        setDossierModal((m) => ({ ...m, researching: true }));
        try {
            const updated = await researchCardExam(card.id);
            const d = updated.dossier || {};
            addNotification(t('mcResearchDone'), 'success');
            setDossierModal({
                card: updated, researching: false, mode: 'view',
                synthesis: d.synthesis || '', sources: d.sources || [], confirmed: !!d.confirmed,
                grounded: d.grounded,
            });
            fetchCards();
        } catch (_e) {
            setDossierModal((m) => (m ? { ...m, researching: false } : m));
        }
    };

    // confirmedValue: true = confirmar e usar; false = PARAR de usar; null = só salvar o texto
    const saveDossier = async (confirmedValue = null) => {
        if (!dossierModal) return;
        const card = dossierModal.card;
        try {
            const updated = await updateCardDossier(card.id, {
                synthesis: dossierModal.synthesis,
                confirmed: confirmedValue === null ? dossierModal.confirmed : confirmedValue,
            });
            addNotification(
                confirmedValue === true ? t('mcDossierConfirmedToast')
                    : confirmedValue === false ? t('mcDossierStopped')
                        : t('mcCardUpdated'),
                confirmedValue === false ? 'info' : 'success'
            );
            const d = updated.dossier || {};
            setDossierModal({
                card: updated, researching: false, mode: 'view',
                synthesis: d.synthesis || '', sources: d.sources || [], confirmed: !!d.confirmed,
                grounded: d.grounded,
            });
            fetchCards();
        } catch (_e) { /* notificado */ }
    };

    const libName = (id) => libraries.find((l) => l.id === id)?.name || `#${id}`;
    const libIcon = (id) => libraries.find((l) => l.id === id)?.icon;

    const typeLabel = (qt) => (qt === 'subjective' ? t('mcSubjective') : t('mcObjective'));

    const draftStatusBadge = (status) => {
        if (status === 'pending') return <span className={`${styles.statusBadge} ${styles.statusPending}`}>{t('mcStatusPending')}</span>;
        if (status === 'processing') return <span className={`${styles.statusBadge} ${styles.statusProcessing}`}>{t('mcStatusProcessing')}</span>;
        if (status === 'error') return <span className={`${styles.statusBadge} ${styles.statusError}`}>{t('mcStatusError')}</span>;
        return null;
    };

    // Reusado nos dois ramos do form (com/sem blueprint) p/ poder parear em .row
    const timeLimitField = (
        <div className={styles.field}>
            <label className={styles.label}>{t('mcTimeLimit')}</label>
            <NumberInput
                min={0}
                value={form.timeLimit}
                onChange={(v) => setForm({ ...form, timeLimit: v })}
            />
            <p className={styles.hint}>{t('mcTimeLimitHint')}</p>
        </div>
    );

    return (
        <div>
            <div className={styles.header}>
                <div className={styles.headerText}>
                    <h2>{t('mcTitle')} <span className={styles.trainingNote}><FontAwesomeIcon icon={faGraduationCap} /> {t('mcNotRanked')}</span></h2>
                    <p>{t('mcSubtitle')}</p>
                </div>
                <button className={styles.newBtn} onClick={openCreate}>
                    <FontAwesomeIcon icon={faPlus} /> {t('mcNewCard')}
                </button>
            </div>

            {loading ? (
                <InlineLoading text={t('mcTitle')} />
            ) : cards.length === 0 ? (
                <div className={styles.empty}>
                    <FontAwesomeIcon icon={faLayerGroup} className={styles.emptyIcon} />
                    <h3>{t('mcEmptyTitle')}</h3>
                    <p>{t('mcEmptyText')}</p>
                    <button className={`${styles.btn} ${styles.primary}`} onClick={openCreate}>
                        <FontAwesomeIcon icon={faPlus} /> {t('mcNewCard')}
                    </button>
                </div>
            ) : (
                <div className={styles.grid}>
                    {cards.map((card) => {
                        const cfg = card.config || {};
                        // Com blueprint, o total REAL é a soma dos blocos (num_questions fica órfão)
                        const totalQuestions = Array.isArray(cfg.blueprint) && cfg.blueprint.length > 0
                            ? cfg.blueprint.reduce((s, b) => s + (Number(b.num_questions) || 0), 0)
                            : (cfg.num_questions || 25);
                        const isGenerating = generatingId === card.id;
                        const isExpanded = expandedCards.has(card.id);
                        const sources = card.sources || [];
                        const visibleSources = isExpanded ? sources : sources.slice(0, 3);
                        return (
                            <div key={card.id} className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <h3 className={`${styles.cardName} ${!isExpanded ? styles.cardNameClamp : ''}`}>{card.name}</h3>
                                    {card.dossier?.confirmed && (
                                        <span className={styles.dossierBadge}>
                                            <FontAwesomeIcon icon={faCheckCircle} /> {t('mcConfirmedBadge')}
                                        </span>
                                    )}
                                    <button
                                        className={styles.expandBtn}
                                        onClick={() => toggleCardExpanded(card.id)}
                                        title={isExpanded ? t('mcHideDetails') : t('mcShowDetails')}
                                        aria-expanded={isExpanded}
                                    >
                                        <FontAwesomeIcon icon={isExpanded ? faChevronUp : faChevronDown} />
                                    </button>
                                </div>
                                {card.description && (
                                    <p className={`${styles.cardDesc} ${!isExpanded ? styles.cardDescClamp : ''}`}>{card.description}</p>
                                )}

                                {sources.length > 0 && (
                                    <div className={styles.chips}>
                                        {visibleSources.map((s) => (
                                            <span key={s.library_id} className={`${styles.chip} ${!isExpanded ? styles.chipClamp : ''}`}>
                                                <LibraryIcon value={libIcon(s.library_id)} /> <span className={styles.chipLabel}>{s.name || libName(s.library_id)}</span>
                                            </span>
                                        ))}
                                        {!isExpanded && sources.length > 3 && (
                                            <button type="button" className={`${styles.chip} ${styles.chipMore}`} onClick={() => toggleCardExpanded(card.id)}>
                                                +{sources.length - 3}
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className={styles.cardMeta}>
                                    <span className={styles.metaItem}>
                                        <strong>{totalQuestions}</strong> {t('mcQuestionsShort')}
                                    </span>
                                    <span className={styles.metaItem}>{typeLabel(cfg.question_type)}</span>
                                    {cfg.time_limit_minutes ? (
                                        <span className={styles.metaItem}>
                                            <FontAwesomeIcon icon={faClock} /> {cfg.time_limit_minutes} min
                                        </span>
                                    ) : null}
                                    <span className={styles.metaItem}>
                                        <FontAwesomeIcon icon={faFileAlt} /> {card.drafts_count ?? 0} {t('mcDrafts')}
                                    </span>
                                    {pendingDocsForCard(card, libraries) > 0 && (
                                        <span className={`${styles.metaItem} ${styles.metaWarn}`}>
                                            <FontAwesomeIcon icon={faClock} /> {t('mcDocsProcessing', { count: pendingDocsForCard(card, libraries) })}
                                        </span>
                                    )}
                                </div>

                                <div className={styles.cardActions}>
                                    <button
                                        className={`${styles.btn} ${styles.primary}`}
                                        onClick={() => handleGenerate(card)}
                                        disabled={isGenerating}
                                    >
                                        <FontAwesomeIcon icon={isGenerating ? faSpinner : faBolt} className={isGenerating ? styles.spin : ''} />
                                        {isGenerating ? t('mcGenerating') : t('mcGenerate')}
                                    </button>
                                    <button className={`${styles.btn} ${styles.secondary}`} onClick={() => handleViewDrafts(card)}>
                                        <FontAwesomeIcon icon={faList} /> {t('mcViewDrafts')}
                                    </button>
                                    <button className={`${styles.btn} ${styles.secondary}`} onClick={() => openDossier(card)}>
                                        <FontAwesomeIcon icon={faClipboardList} /> {t('mcDossier')}
                                    </button>
                                    <button className={`${styles.btn} ${styles.ghost}`} onClick={() => openEdit(card)} title={t('mcEdit')}>
                                        <FontAwesomeIcon icon={faPen} />
                                    </button>
                                    <button className={`${styles.btn} ${styles.ghost} ${styles.danger}`} onClick={() => handleDelete(card)} title={t('mcDelete')}>
                                        <FontAwesomeIcon icon={faTrash} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ---- Form criar/editar ---- */}
            {showForm && createPortal((
                <div className={styles.overlay} onClick={() => !saving && setShowForm(false)}>
                    <div className={`${styles.panel} ${styles.panelWide}`} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.panelHeader}>
                            <h3>{editingId ? t('mcEditTitle') : t('mcCreateTitle')}</h3>
                            <button className={styles.closeBtn} onClick={() => setShowForm(false)}>
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>{t('mcName')}</label>
                            <input
                                className={styles.input}
                                value={form.name}
                                maxLength={120}
                                placeholder={t('mcNamePlaceholder')}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>{t('mcDescription')}</label>
                            <textarea
                                className={styles.textarea}
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                            />
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>{t('mcLibraries')}</label>
                            {libraries.length === 0 ? (
                                <p className={styles.hint}>{t('mcNoLibraries')}</p>
                            ) : (
                                <div className={styles.libGrid}>
                                    {libraries.map((lib) => {
                                        const active = form.libraryIds.includes(lib.id);
                                        const docCount = lib.document_count ?? 0;
                                        return (
                                            <button
                                                type="button"
                                                key={lib.id}
                                                className={`${styles.libChip} ${active ? styles.libChipActive : ''} ${docCount === 0 ? styles.libChipEmpty : ''}`}
                                                onClick={() => toggleLibrary(lib.id)}
                                                title={docCount === 0 ? t('mcLibEmptyHint') : undefined}
                                            >
                                                <LibraryIcon value={lib.icon} /> {lib.name} <span className={styles.libChipCount}>({docCount})</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            <p className={styles.hint}>{t('mcLibrariesHint')}</p>
                        </div>

                        {/* Edital + Provas anteriores lado a lado (conteúdo × formato) */}
                        <div className={styles.row}>
                        <div className={styles.field}>
                            <label className={styles.label}>
                                {t('mcEdital')}
                                <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--accent-color)', background: 'rgba(var(--accent-color-rgb), 0.12)', padding: '2px 8px', borderRadius: '999px', marginLeft: '8px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('mcRecommended')}</span>
                            </label>
                            <label className={`${styles.btn} ${styles.secondary} ${styles.fileLabel}`}>
                                <FontAwesomeIcon icon={faUpload} /> {t('mcChooseFiles')}
                                <input
                                    type="file"
                                    multiple
                                    onChange={(e) => {
                                        const picked = Array.from(e.target.files || []);
                                        setForm((f) => ({ ...f, editalFiles: [...f.editalFiles, ...picked] }));
                                        e.target.value = '';
                                    }}
                                />
                            </label>
                            {form.editalFiles.length > 0 && (
                                <ul className={styles.fileList}>
                                    {form.editalFiles.map((f, i) => (
                                        <li key={i}>
                                            <span>{f.name}</span>
                                            <button type="button" onClick={() => setForm((ff) => ({ ...ff, editalFiles: ff.editalFiles.filter((_, j) => j !== i) }))}>
                                                <FontAwesomeIcon icon={faTimes} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <p className={styles.hint}>{t('mcEditalHint')}</p>
                        </div>

                        {/* Provas anteriores — FORMATO/estilo (opcional) */}
                        <div className={styles.field}>
                            <label className={styles.label}>{t('mcPastExams')}</label>
                            <label className={`${styles.btn} ${styles.secondary} ${styles.fileLabel}`}>
                                <FontAwesomeIcon icon={faUpload} /> {t('mcChooseFiles')}
                                <input
                                    type="file"
                                    multiple
                                    onChange={(e) => {
                                        const picked = Array.from(e.target.files || []);
                                        setForm((f) => ({ ...f, pastExamFiles: [...f.pastExamFiles, ...picked] }));
                                        e.target.value = '';
                                    }}
                                />
                            </label>
                            {form.pastExamFiles.length > 0 && (
                                <ul className={styles.fileList}>
                                    {form.pastExamFiles.map((f, i) => (
                                        <li key={i}>
                                            <span>{f.name}</span>
                                            <button type="button" onClick={() => setForm((ff) => ({ ...ff, pastExamFiles: ff.pastExamFiles.filter((_, j) => j !== i) }))}>
                                                <FontAwesomeIcon icon={faTimes} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <p className={styles.hint}>{t('mcPastExamsHint')}</p>
                        </div>
                        </div>

                        {/* Tipo + alternativas lado a lado */}
                        <div className={styles.row}>
                        <div className={styles.field}>
                            <label className={styles.label}>{t('mcQuestionType')}</label>
                            <select
                                className={styles.select}
                                value={form.questionType}
                                onChange={(e) => setForm({ ...form, questionType: e.target.value })}
                            >
                                <option value="objective">{t('mcObjective')}</option>
                                <option value="subjective">{t('mcSubjective')}</option>
                            </select>
                        </div>

                        {form.questionType === 'objective' && (
                            <div className={styles.field}>
                                <label className={styles.label}>{t('mcNumAlternatives')}</label>
                                <select
                                    className={styles.select}
                                    value={form.numAlternatives}
                                    onChange={(e) => setForm({ ...form, numAlternatives: Number(e.target.value) })}
                                >
                                    {[2, 3, 4, 5, 6].map((alt) => (
                                        <option key={alt} value={alt}>{alt}</option>
                                    ))}
                                </select>
                                <p className={styles.hint}>{t('mcNumAlternativesHint')}</p>
                            </div>
                        )}
                        </div>

                        {/* Distribuição por bloco (avançado): cota de questões por bibliotecas */}
                        <div className={styles.field}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input type="checkbox" className={styles.blueprintCheck} checked={form.useBlueprint} onChange={(e) => setForm({ ...form, useBlueprint: e.target.checked })} />
                                {t('mcBlueprintToggle')}
                            </label>
                            <p className={styles.hint}>{t('mcBlueprintHint')}</p>
                        </div>

                        {!form.useBlueprint ? (
                            <div className={styles.row}>
                                <div className={styles.field}>
                                    <label className={styles.label}>{t('mcNumQuestions')}</label>
                                    <NumberInput
                                        min={5}
                                        max={50}
                                        value={form.numQuestions}
                                        onChange={(v) => setForm({ ...form, numQuestions: v })}
                                    />
                                </div>
                                {timeLimitField}
                            </div>
                        ) : (
                            <div className={styles.field}>
                                <label className={styles.label}>{t('mcBlueprintBlocks')}</label>
                                {form.libraryIds.length === 0 && (
                                    <p className={styles.hint}>{t('mcBlueprintNeedLibs')}</p>
                                )}
                                {form.blueprint.map((blk, bi) => (
                                    <div key={bi} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap' }}>
                                            <div style={{ flex: 1, minWidth: 180 }}>
                                                <label className={styles.blockFieldLabel}>{t('mcBlockName')}</label>
                                                <input
                                                    className={styles.input}
                                                    placeholder={t('mcBlockName')}
                                                    value={blk.label}
                                                    onChange={(e) => updateBlock(bi, { label: e.target.value })}
                                                />
                                            </div>
                                            <div style={{ width: 104, flexShrink: 0 }}>
                                                <label className={styles.blockFieldLabel}>{t('mcBlockQuestions')}</label>
                                                <NumberInput
                                                    min={1}
                                                    max={50}
                                                    value={blk.num_questions}
                                                    onChange={(v) => updateBlock(bi, { num_questions: v })}
                                                />
                                            </div>
                                            <div style={{ width: 104, flexShrink: 0 }}>
                                                <label className={styles.blockFieldLabel}>{t('mcBlockWeight')}</label>
                                                <input
                                                    className={styles.input}
                                                    type="number"
                                                    min={0}
                                                    step="0.5"
                                                    value={blk.weight ?? 1}
                                                    onChange={(e) => updateBlock(bi, { weight: e.target.value })}
                                                    title={t('mcBlockWeightHint')}
                                                />
                                            </div>
                                            <div style={{ width: 112, flexShrink: 0 }}>
                                                <label className={styles.blockFieldLabel}>{t('mcBlockMinCorrect')}</label>
                                                <input
                                                    className={styles.input}
                                                    type="number"
                                                    min={0}
                                                    max={50}
                                                    placeholder="—"
                                                    value={blk.min_correct ?? ''}
                                                    onChange={(e) => updateBlock(bi, { min_correct: e.target.value })}
                                                    title={t('mcBlockMinCorrectHint')}
                                                />
                                            </div>
                                            <button type="button" onClick={() => removeBlock(bi)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '1rem', paddingBottom: 12 }} title={t('delete')}>
                                                <FontAwesomeIcon icon={faTimes} />
                                            </button>
                                        </div>
                                        <div className={styles.libGrid}>
                                            {form.libraryIds.map((libId) => {
                                                const lib = libraries.find((l) => l.id === libId);
                                                if (!lib) return null;
                                                const active = (blk.library_ids || []).includes(libId);
                                                const docCount = lib.document_count ?? 0;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={libId}
                                                        className={`${styles.libChip} ${active ? styles.libChipActive : ''} ${docCount === 0 ? styles.libChipEmpty : ''}`}
                                                        onClick={() => toggleBlockLib(bi, libId)}
                                                        title={docCount === 0 ? t('mcLibEmptyHint') : undefined}
                                                    >
                                                        <LibraryIcon value={lib.icon} /> {lib.name} <span className={styles.libChipCount}>({docCount})</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                                <button type="button" className={`${styles.btn} ${styles.secondary}`} onClick={addBlock}>
                                    + {t('mcAddBlock')}
                                </button>
                                <p className={styles.hint}>
                                    {t('mcBlueprintTotal')}: {form.blueprint.reduce((s, b) => s + (Number(b.num_questions) || 0), 0)} {t('mcQuestionsShort')}
                                    {' · '}
                                    <strong>{formatPoints(form.blueprint.reduce((s, b) => s + (Number(b.num_questions) || 0) * (b.weight === '' || b.weight === undefined ? 1 : Number(b.weight) || 0), 0))} {t('mcPoints')}</strong>
                                </p>
                            </div>
                        )}

                        {form.useBlueprint && (
                            <div className={styles.row}>
                                <div className={styles.field}>
                                    <label className={styles.label}>{t('mcPassingScore')}</label>
                                    <input
                                        className={styles.input}
                                        type="number"
                                        min={0}
                                        step="0.5"
                                        placeholder="—"
                                        value={form.passingScore}
                                        onChange={(e) => setForm({ ...form, passingScore: e.target.value })}
                                    />
                                    <p className={styles.hint}>{t('mcPassingScoreHint')}</p>
                                </div>
                                {timeLimitField}
                            </div>
                        )}

                        <div className={styles.formActions}>
                            <button className={`${styles.btn} ${styles.secondary}`} onClick={() => setShowForm(false)} disabled={saving}>
                                {t('mcCancel')}
                            </button>
                            <button className={`${styles.btn} ${styles.primary}`} onClick={handleSave} disabled={saving}>
                                {saving ? <FontAwesomeIcon icon={faSpinner} className={styles.spin} /> : null} {t('mcSave')}
                            </button>
                        </div>
                    </div>
                </div>
            ), document.body)}

            {/* ---- Lista de drafts ---- */}
            {draftsModal && createPortal((
                <div className={styles.overlay} onClick={() => setDraftsModal(null)}>
                    <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.panelHeader}>
                            <h3>{t('mcDraftsTitle')} — {draftsModal.card.name}</h3>
                            <button className={styles.closeBtn} onClick={() => setDraftsModal(null)}>
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                        {draftsModal.loading ? (
                            <InlineLoading text={t('mcDraftsTitle')} />
                        ) : draftsModal.drafts.length === 0 ? (
                            <p className={styles.hint}>{t('mcNoDrafts')}</p>
                        ) : (
                            <div className={styles.draftList}>
                                {draftsModal.drafts.map((d, idx) => {
                                    const count = (d.content?.questionario_objetivo || d.content?.questionario_subjetivo || []).length;
                                    // Numeração POR CONCURSO (1 = a mais antiga), não o id do banco
                                    const provaNumber = draftsModal.drafts.length - idx;
                                    const attempt = d.content?.last_attempt;
                                    return (
                                        <div key={d.id} className={styles.draftItem}>
                                            <div className={styles.draftInfo}>
                                                <span className={styles.draftTitle}>
                                                    {t('mcUntitledDraft')} #{provaNumber}
                                                </span>
                                                <span className={styles.draftSub}>
                                                    {new Date(d.created_at).toLocaleString()}
                                                    {d.status === 'completed' && count ? ` · ${count} ${t('mcQuestionsShort')}` : ''}
                                                </span>
                                                {d.status === 'completed' && (
                                                    attempt ? (
                                                        <span className={styles.draftScore}>
                                                            <FontAwesomeIcon icon={faCheckCircle} /> {t('mcAttemptScore', {
                                                                correct: attempt.correct,
                                                                total: attempt.total,
                                                                pct: attempt.total ? Math.round((attempt.correct / attempt.total) * 100) : 0,
                                                            })}
                                                        </span>
                                                    ) : (
                                                        <span className={styles.draftPending}>{t('mcAttemptNone')}</span>
                                                    )
                                                )}
                                            </div>
                                            {d.status === 'completed' ? (
                                                <button className={`${styles.btn} ${styles.secondary}`} onClick={() => openDraft(d, draftsModal.card)}>
                                                    {t('mcOpenDraft')}
                                                </button>
                                            ) : (
                                                draftStatusBadge(d.status)
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            ), document.body)}

            {/* ---- Dossiê (pesquisa da prova) ---- */}
            {dossierModal && createPortal((
                <div className={styles.overlay} onClick={() => !dossierModal.researching && setDossierModal(null)}>
                    <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.panelHeader}>
                            <h3><FontAwesomeIcon icon={faClipboardList} /> {t('mcDossierTitle')} — {dossierModal.card.name}</h3>
                            <button className={styles.closeBtn} onClick={() => setDossierModal(null)} disabled={dossierModal.researching}>
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>

                        {dossierModal.researching ? (
                            <InlineLoading text={t('mcResearching')} />
                        ) : !dossierModal.synthesis ? (
                            <div className={styles.empty}>
                                <FontAwesomeIcon icon={faSearch} className={styles.emptyIcon} />
                                <p>{t('mcDossierEmptyHint')}</p>
                                <button className={`${styles.btn} ${styles.primary}`} onClick={runResearch}>
                                    <FontAwesomeIcon icon={faSearch} /> {t('mcResearch')}
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className={styles.dossierStatus}>
                                    {dossierModal.confirmed ? (
                                        <span className={`${styles.statusBadge} ${styles.statusProcessing}`}>
                                            <FontAwesomeIcon icon={faCheckCircle} /> {t('mcDossierConfirmed')}
                                        </span>
                                    ) : (
                                        <span className={`${styles.statusBadge} ${styles.statusPending}`}>{t('mcDossierUnconfirmed')}</span>
                                    )}
                                    <button
                                        className={`${styles.btn} ${styles.ghost}`}
                                        onClick={() => setDossierModal((m) => ({ ...m, mode: m.mode === 'edit' ? 'view' : 'edit' }))}
                                    >
                                        <FontAwesomeIcon icon={faPen} /> {dossierModal.mode === 'edit' ? t('mcPreview') : t('mcEditDossier')}
                                    </button>
                                </div>

                                {dossierModal.grounded === false && (
                                    <p className={styles.ungroundedWarn}>
                                        ⚠️ {t('mcDossierUngrounded')}
                                    </p>
                                )}

                                {dossierModal.mode === 'edit' ? (
                                    <textarea
                                        className={styles.textarea}
                                        style={{ minHeight: 260 }}
                                        value={dossierModal.synthesis}
                                        onChange={(e) => setDossierModal((m) => ({ ...m, synthesis: e.target.value }))}
                                    />
                                ) : (
                                    <div className={styles.dossierBody}>
                                        <ReactMarkdown>{dossierModal.synthesis}</ReactMarkdown>
                                    </div>
                                )}

                                {dossierModal.sources?.length > 0 && (
                                    <div className={styles.field} style={{ marginTop: 14 }}>
                                        <label className={styles.label}>{t('mcSourcesFound')}</label>
                                        <ul className={styles.sourceList}>
                                            {dossierModal.sources.map((s, i) => (
                                                <li key={i}>
                                                    <a href={s.uri} target="_blank" rel="noopener noreferrer">{s.title || s.uri}</a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div className={styles.formActions}>
                                    <button className={`${styles.btn} ${styles.ghost}`} onClick={runResearch}>
                                        <FontAwesomeIcon icon={faSearch} /> {t('mcReResearch')}
                                    </button>
                                    <button className={`${styles.btn} ${styles.secondary}`} onClick={() => saveDossier(null)}>
                                        {t('mcSaveDossier')}
                                    </button>
                                    {/* Slot de ação por estado: fora da geração → confirmar; em uso → parar */}
                                    {dossierModal.confirmed ? (
                                        <button className={`${styles.btn} ${styles.secondary}`} onClick={() => saveDossier(false)}>
                                            <FontAwesomeIcon icon={faTimes} /> {t('mcDossierStopUse')}
                                        </button>
                                    ) : (
                                        <button className={`${styles.btn} ${styles.primary}`} onClick={() => saveDossier(true)}>
                                            <FontAwesomeIcon icon={faCheckCircle} /> {t('mcConfirmUse')}
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            ), document.body)}

            {/* ---- Confirmação: gerar com documentos ainda processando ---- */}
            {confirmGenerate && createPortal((
                <div className={styles.overlay} onClick={() => setConfirmGenerate(null)}>
                    <div className={styles.panel} style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.panelHeader}>
                            <h3><FontAwesomeIcon icon={faClock} /> {t('mcDocsProcessing', { count: confirmGenerate.pending })}</h3>
                            <button className={styles.closeBtn} onClick={() => setConfirmGenerate(null)}>
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                        <p className={styles.confirmBody}>{t('mcGenPendingWarn')}</p>
                        <div className={styles.formActions}>
                            <button className={`${styles.btn} ${styles.secondary}`} onClick={() => setConfirmGenerate(null)}>
                                {t('mcCancel')}
                            </button>
                            <button
                                className={`${styles.btn} ${styles.primary}`}
                                onClick={() => { const c = confirmGenerate.card; setConfirmGenerate(null); doGenerate(c); }}
                            >
                                <FontAwesomeIcon icon={faBolt} /> {t('mcGenerateAnyway')}
                            </button>
                        </div>
                    </div>
                </div>
            ), document.body)}

            {/* ---- Resultado da prova (modal LOCAL, focado: sem minimizar/persistir) ---- */}
            {resultModal && (
                <MaterialResultModal
                    isOpen
                    onClose={() => setResultModal(null)}
                    result={resultModal.result}
                    materialType={resultModal.materialType}
                    sourceName={resultModal.sourceName}
                    sourceType="library"
                    trainingNote={t('mcResultNotRanked')}
                    timeLimitMinutes={resultModal.timeLimitMinutes || null}
                    examMode
                    scoring={resultModal.scoring || null}
                    initialAttempt={resultModal.result?.content?.last_attempt || null}
                    onSaveAttempt={(attempt) => {
                        const materialId = resultModal.result?.id;
                        if (materialId) saveMaterialAttempt(materialId, attempt);
                    }}
                />
            )}
        </div>
    );
};

export default MeusConcursos;
