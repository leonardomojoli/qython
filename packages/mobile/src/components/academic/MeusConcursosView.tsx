// Meus Concursos (mobile) — paridade com o pilar web (MeusConcursos.js).
// Gerador PESSOAL de provas: card a partir de bibliotecas e/ou arquivos + dossiê de
// pesquisa da banca → gera provas fiéis, que o usuário faz e se autocorrige no
// MaterialQuizMode. Sem compartilhar/competir. Ver docs/ARENA_CUSTOM_EXAMS.md.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { pick } from 'react-native-document-picker';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  listCustomCards,
  createCustomCard,
  updateCustomCard,
  deleteCustomCard,
  generateCardDraft,
  getCardDrafts,
  researchCardExam,
  updateCardDossier,
  getMaterialStatus,
  saveMaterialAttempt,
  getLibraries,
  createLibrary,
  uploadDocument,
} from '../../services/academic';
import type { CustomCard, AcademicMaterialLite } from '../../services/academic';
import type { Library } from '../../types/academic';
import { resolveLibraryIcon } from '../../types/academic';
import MaterialQuizMode from './MaterialQuizMode';
import MarkdownRenderer from '../copilot/MarkdownRenderer';

interface PickedFile { uri: string; name: string; type: string; }

interface BlueprintBlock {
  label: string;
  num_questions: string;
  library_ids: number[];
  weight?: string;      // pontos por questão (default 1)
  min_correct?: string; // acertos mínimos p/ não eliminar (vazio = sem regra)
}

interface FormState {
  name: string;
  description: string;
  libraryIds: number[];
  editalFiles: PickedFile[];
  pastExamFiles: PickedFile[];
  numQuestions: string;
  questionType: 'objective' | 'subjective';
  numAlternatives: number;
  timeLimit: string;
  useBlueprint: boolean;
  blueprint: BlueprintBlock[];
  passingScore: string;
}

// Pontuação: "39" em vez de "39.0"; "1,5" com vírgula
const formatPoints = (n: number) => {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(1).replace('.', ',');
};

const EMPTY_FORM: FormState = {
  name: '', description: '', libraryIds: [], editalFiles: [], pastExamFiles: [],
  numQuestions: '25', questionType: 'objective', numAlternatives: 5, timeLimit: '',
  useBlueprint: false, blueprint: [], passingScore: '',
};

const PICK_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/markdown', 'text/csv', 'text/html',
  'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
  'video/mp4', 'video/x-msvideo', 'video/quicktime',
];

export default function MeusConcursosView() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const [cards, setCards] = useState<CustomCard[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDoneRef = useRef<number | null>(null);

  const [quiz, setQuiz] = useState<{ title: string; materialId: number; objective: any[]; subjective: any[]; supportTexts?: any[]; timeLimitMinutes?: number | null; initialAttempt?: any; scoring?: any } | null>(null);
  const [draftsModal, setDraftsModal] = useState<{ card: CustomCard; drafts: AcademicMaterialLite[]; loading: boolean } | null>(null);
  const [dossierModal, setDossierModal] = useState<{
    card: CustomCard; researching: boolean; mode: 'view' | 'edit'; synthesis: string; sources: any[]; confirmed: boolean; grounded?: boolean;
  } | null>(null);

  const fetchCards = useCallback(async () => {
    try {
      const data = await listCustomCards();
      setCards(data || []);
    } catch {
      /* erro silencioso; lista vazia */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
    getLibraries().then((d) => setLibraries(d || [])).catch(() => {});
  }, [fetchCards]);

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };
  useEffect(() => () => stopPoll(), []);

  const refreshLibraries = () => { getLibraries().then((d) => setLibraries(d || [])).catch(() => {}); };

  // ── Form ──────────────────────────────────────────────
  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true); };

  const openEdit = (card: CustomCard) => {
    const cfg = card.config || {};
    setEditingId(card.id);
    setForm({
      name: card.name || '',
      description: card.description || '',
      libraryIds: (card.sources || []).map((s) => s.library_id).filter((x): x is number => !!x),
      editalFiles: [],
      pastExamFiles: [],
      numQuestions: String(cfg.num_questions || 25),
      questionType: cfg.question_type === 'subjective' ? 'subjective' : 'objective',
      numAlternatives: Number(cfg.num_alternatives) || 5,
      timeLimit: cfg.time_limit_minutes ? String(cfg.time_limit_minutes) : '',
      useBlueprint: Array.isArray(cfg.blueprint) && cfg.blueprint.length > 0,
      blueprint: Array.isArray(cfg.blueprint)
        ? cfg.blueprint.map((b: any) => ({
          label: b.label || '',
          num_questions: String(b.num_questions || 5),
          library_ids: b.library_ids || [],
          weight: b.weight === undefined || b.weight === null ? '1' : String(b.weight),
          min_correct: b.min_correct === undefined || b.min_correct === null ? '' : String(b.min_correct),
        }))
        : [],
      passingScore: cfg.passing_score === undefined || cfg.passing_score === null ? '' : String(cfg.passing_score),
    });
    setShowForm(true);
  };

  const toggleLibrary = (id: number) => {
    setForm((f) => ({
      ...f,
      libraryIds: f.libraryIds.includes(id) ? f.libraryIds.filter((x) => x !== id) : [...f.libraryIds, id],
    }));
  };

  // --- Distribuição por bloco (blueprint): cada bloco = nome + nº de questões + bibliotecas ---
  const addBlock = () => setForm((f) => ({ ...f, blueprint: [...f.blueprint, { label: '', num_questions: '5', library_ids: [], weight: '1', min_correct: '' }] }));
  const removeBlock = (bi: number) => setForm((f) => ({ ...f, blueprint: f.blueprint.filter((_, j) => j !== bi) }));
  const updateBlock = (bi: number, patch: Partial<BlueprintBlock>) => setForm((f) => ({ ...f, blueprint: f.blueprint.map((b, j) => (j === bi ? { ...b, ...patch } : b)) }));
  const toggleBlockLib = (bi: number, libId: number) => setForm((f) => ({
    ...f,
    blueprint: f.blueprint.map((b, j) => {
      if (j !== bi) return b;
      const lids = b.library_ids || [];
      return { ...b, library_ids: lids.includes(libId) ? lids.filter((x) => x !== libId) : [...lids, libId] };
    }),
  }));

  const pickFiles = async (target: 'editalFiles' | 'pastExamFiles') => {
    try {
      const results = await pick({ allowMultiSelection: true, type: PICK_TYPES });
      const picked: PickedFile[] = results.map((f) => ({
        uri: f.uri, name: f.name || 'arquivo', type: f.type || 'application/pdf',
      }));
      setForm((f) => ({ ...f, [target]: [...f[target], ...picked] }));
    } catch (e: any) {
      if (e && e.code === 'DOCUMENT_PICKER_CANCELED') return;
      Alert.alert('', t('errorUploadingDocument', 'Erro ao selecionar arquivos.'));
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('', t('mcNameRequired', 'Dê um nome ao concurso.')); return; }
    if (form.libraryIds.length === 0 && form.editalFiles.length === 0 && form.pastExamFiles.length === 0) {
      Alert.alert('', t('mcLibRequired', 'Selecione ao menos uma biblioteca.')); return;
    }
    let blueprint: { label: string; num_questions: number; library_ids: number[] }[] | undefined;
    if (form.useBlueprint) {
      // NUNCA descartar bloco silenciosamente: incompleto = erro apontando qual.
      const cleaned = form.blueprint
        .map((b) => ({
          label: (b.label || '').trim(),
          num_questions: Number(b.num_questions) || 0,
          library_ids: (b.library_ids || []).filter(Boolean),
          weight: (b.weight ?? '') === '' ? 1 : Math.max(0, Number(b.weight) || 0),
          ...((b.min_correct ?? '').trim() !== '' ? { min_correct: Math.max(0, Number(b.min_correct) || 0) } : {}),
        }));
      if (cleaned.length === 0) { Alert.alert('', t('mcBlueprintRequired', 'Adicione ao menos um bloco com bibliotecas e nº de questões.')); return; }
      const badIdx = cleaned.findIndex((b) => b.library_ids.length === 0 || b.num_questions <= 0);
      if (badIdx !== -1) {
        Alert.alert('', t('mcBlueprintBlockInvalid', {
          name: cleaned[badIdx].label || `#${badIdx + 1}`,
          defaultValue: 'O bloco "{{name}}" está incompleto: selecione ao menos uma biblioteca e um nº de questões — ou remova o bloco.',
        }));
        return;
      }
      blueprint = cleaned;
    }
    setSaving(true);
    try {
      const libraryIds = [...form.libraryIds];
      const attachedLibIds: number[] = [];
      let pastExamsLibId: number | null = null;
      if (form.editalFiles.length > 0) {
        const lib = await createLibrary({ name: `${form.name.trim()} — edital`, icon: 'book' });
        for (const f of form.editalFiles) { await uploadDocument(lib.id, f); }
        libraryIds.push(lib.id);
        attachedLibIds.push(lib.id);
      }
      if (form.pastExamFiles.length > 0) {
        const lib = await createLibrary({ name: `${form.name.trim()} — provas anteriores`, icon: 'book' });
        for (const f of form.pastExamFiles) { await uploadDocument(lib.id, f); }
        libraryIds.push(lib.id);
        attachedLibIds.push(lib.id);
        pastExamsLibId = lib.id;
      }
      if (form.editalFiles.length > 0 || form.pastExamFiles.length > 0) {
        Alert.alert('', t('mcFilesUploaded', 'Arquivos enviados — processando…'));
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
          ...(blueprint && (form.passingScore ?? '').trim() !== ''
            ? { passing_score: Math.max(0, Number(form.passingScore) || 0) }
            : { passing_score: null }),
        },
        source_library_ids: libraryIds,
        attached_library_ids: attachedLibIds,
        past_exams_library_id: pastExamsLibId,
      };
      if (editingId) { await updateCustomCard(editingId, payload); }
      else { await createCustomCard(payload); }
      setShowForm(false);
      fetchCards();
      refreshLibraries();
    } catch {
      Alert.alert('', t('mcSaveError', 'Não foi possível salvar o concurso.'));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (card: CustomCard, deleteLibraries: boolean) => {
    try { await deleteCustomCard(card.id, deleteLibraries); fetchCards(); } catch { /* ignore */ }
  };

  const handleDelete = (card: CustomCard) => {
    const hasFiles = ((card.config?._attached_library_ids as number[] | undefined) || []).length > 0;
    if (!hasFiles) {
      Alert.alert(
        t('mcDelete', 'Excluir'),
        t('mcDeleteConfirm', 'Excluir este concurso? As provas já geradas serão mantidas.'),
        [
          { text: t('mcCancel', 'Cancelar'), style: 'cancel' },
          { text: t('mcDelete', 'Excluir'), style: 'destructive', onPress: () => doDelete(card, false) },
        ],
      );
      return;
    }
    Alert.alert(
      t('mcDelete', 'Excluir'),
      t('mcDeleteFilesConfirm', 'Apagar também a biblioteca de arquivos anexados a este concurso? Isso libera o armazenamento.'),
      [
        { text: t('mcCancel', 'Cancelar'), style: 'cancel' },
        { text: t('mcKeepFiles', 'Manter arquivos'), onPress: () => doDelete(card, false) },
        { text: t('mcDeleteAll', 'Apagar tudo'), style: 'destructive', onPress: () => doDelete(card, true) },
      ],
    );
  };

  // ── Geração + abrir prova ─────────────────────────────
  const openMaterial = (m: AcademicMaterialLite, card: CustomCard) => {
    const oq = (m.content && m.content.questionario_objetivo) || [];
    const sq = (m.content && m.content.questionario_subjetivo) || [];
    setQuiz({
      title: card.name,
      materialId: m.id,
      objective: oq,
      subjective: sq,
      supportTexts: (m.content && (m.content as any).textos_base) || [],
      timeLimitMinutes: card.config?.time_limit_minutes || null,
      initialAttempt: m.content?.last_attempt || null,
      scoring: Array.isArray(card.config?.blueprint) && card.config.blueprint.length > 0
        ? { blueprint: card.config.blueprint, passingScore: card.config.passing_score ?? null }
        : null,
    });
  };

  // Documentos pending/processing das fontes do card (a geração sairia SEM eles)
  const pendingDocsForCard = (card: CustomCard, libs: Library[]) => {
    const srcIds = new Set((card.sources || []).map((s) => s.library_id).filter(Boolean));
    return (libs || []).reduce((sum, l) => sum + (srcIds.has(l.id) ? (l.processing_count || 0) : 0), 0);
  };

  const handleGenerate = async (card: CustomCard) => {
    if (generatingId) return; // já há geração em curso (guarda contra duplo toque)
    // Trava o botão ANTES do await: sem isto, a busca de bibliotecas abre uma janela
    // em que o "Gerar prova" segue tocável → 2ª geração + débito de dracmas em dobro.
    setGeneratingId(card.id);
    // Contagem FRESCA: avisa em vez de gerar calado sem os docs ainda processando
    let libs = libraries;
    try {
      libs = (await getLibraries()) || [];
      setLibraries(libs);
    } catch { /* usa o estado atual */ }
    const pending = pendingDocsForCard(card, libs);
    if (pending > 0) {
      setGeneratingId(null); // decisão do usuário: solta o botão até ele confirmar
      Alert.alert(
        t('mcDocsProcessing', { count: pending, defaultValue: `${pending} documento(s) das fontes ainda processando` }),
        t('mcGenPendingWarn', 'A prova sairá sem esses documentos. Você pode gerar mesmo assim ou aguardar o processamento terminar.'),
        [
          { text: t('mcCancel', 'Cancelar'), style: 'cancel' },
          { text: t('mcGenerateAnyway', 'Gerar mesmo assim'), onPress: () => doGenerate(card) },
        ],
      );
      return;
    }
    doGenerate(card);
  };

  const doGenerate = async (card: CustomCard) => {
    setGeneratingId(card.id);
    try {
      const material = await generateCardDraft(card.id, {});
      Alert.alert('', t('mcGenStarted', 'Geração iniciada — sua prova ficará pronta em instantes.'));
      stopPoll();
      pollDoneRef.current = null;
      pollRef.current = setInterval(async () => {
        try {
          const m = await getMaterialStatus(material.id);
          if (m.status === 'completed' || m.status === 'error') {
            // tick é async: o stopPoll() só roda após o await, então outro tick pode
            // entrar em voo e repetir o desfecho — guarda torna idempotente
            if (pollDoneRef.current === material.id) return;
            pollDoneRef.current = material.id;
            stopPoll();
            setGeneratingId(null);
            if (m.status === 'completed') { openMaterial(m, card); fetchCards(); }
            else { Alert.alert('', t('mcGenError', 'Não foi possível gerar a prova. Tente novamente.')); }
          }
        } catch {
          stopPoll();
          setGeneratingId(null);
          Alert.alert('', t('mcGenError', 'Não foi possível gerar a prova. Tente novamente.'));
        }
      }, 3000);
    } catch {
      setGeneratingId(null);
    }
  };

  const handleViewDrafts = async (card: CustomCard) => {
    setDraftsModal({ card, drafts: [], loading: true });
    try {
      const drafts = await getCardDrafts(card.id);
      setDraftsModal({ card, drafts: drafts || [], loading: false });
    } catch {
      setDraftsModal(null);
    }
  };

  const openDraft = (draft: AcademicMaterialLite, card: CustomCard) => {
    if (draft.status !== 'completed') return;
    setDraftsModal(null);
    openMaterial(draft, card);
  };

  // ── Dossiê ────────────────────────────────────────────
  const openDossier = (card: CustomCard) => {
    const d = card.dossier || {};
    setDossierModal({
      card, researching: false, mode: 'view',
      synthesis: d.synthesis || '', sources: d.sources || [], confirmed: !!d.confirmed,
      grounded: d.grounded,
    });
  };

  const applyDossierFromCard = (card: CustomCard) => {
    const d = card.dossier || {};
    setDossierModal({
      card, researching: false, mode: 'view',
      synthesis: d.synthesis || '', sources: d.sources || [], confirmed: !!d.confirmed,
      grounded: d.grounded,
    });
  };

  const runResearch = async () => {
    if (!dossierModal) return;
    const card = dossierModal.card;
    setDossierModal((m) => (m ? { ...m, researching: true } : m));
    try {
      const updated = await researchCardExam(card.id);
      applyDossierFromCard(updated);
      fetchCards();
    } catch {
      setDossierModal((m) => (m ? { ...m, researching: false } : m));
      Alert.alert('', t('mcGenError', 'Não foi possível pesquisar a prova. Tente novamente.'));
    }
  };

  // confirmedValue: true = confirmar e usar; false = PARAR de usar; null = só salvar o texto
  const saveDossier = async (confirmedValue: boolean | null = null) => {
    if (!dossierModal) return;
    const card = dossierModal.card;
    try {
      const updated = await updateCardDossier(card.id, {
        synthesis: dossierModal.synthesis,
        confirmed: confirmedValue === null ? dossierModal.confirmed : confirmedValue,
      });
      if (confirmedValue === true) {
        Alert.alert('', t('mcDossierConfirmedToast', 'Dossiê confirmado — agora guia a geração das provas.'));
      } else if (confirmedValue === false) {
        Alert.alert('', t('mcDossierStopped', 'Dossiê desativado — não entra mais na geração das provas.'));
      }
      applyDossierFromCard(updated);
      fetchCards();
    } catch {
      Alert.alert('', t('mcSaveError', 'Não foi possível salvar o dossiê.'));
    }
  };

  // ── Helpers de render ─────────────────────────────────
  const typeLabel = (qt?: string) => (qt === 'subjective' ? t('mcSubjective', 'Discursiva') : t('mcObjective', 'Objetiva'));

  const toggleCardExpanded = (id: number) => setExpandedCards((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const renderCard = (card: CustomCard) => {
    const cfg = card.config || {};
    // Com blueprint, o total REAL é a soma dos blocos (num_questions fica órfão)
    const totalQuestions = Array.isArray(cfg.blueprint) && cfg.blueprint.length > 0
      ? cfg.blueprint.reduce((s: number, b: any) => s + (Number(b.num_questions) || 0), 0)
      : (cfg.num_questions || 25);
    const isGenerating = generatingId === card.id;
    const isExpanded = expandedCards.has(card.id);
    const sources = card.sources || [];
    const visibleSources = isExpanded ? sources : sources.slice(0, 3);
    return (
      <View key={card.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <View style={styles.cardTitleRow}>
          <Text
            style={[typography.h3, { color: theme.text, flex: 1, minWidth: 0 }]}
            numberOfLines={isExpanded ? undefined : 2}
          >
            {card.name}
          </Text>
          {card.dossier?.confirmed && (
            <View style={[styles.badge, { backgroundColor: 'rgba(45,212,191,0.15)', borderColor: 'rgba(45,212,191,0.35)' }]}>
              <Text style={[typography.caption, { color: theme.secondary }]} numberOfLines={1}>✓ {t('mcConfirmedBadge', 'Dossiê em uso')}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.expandBtn, { borderColor: theme.surfaceBorder }]}
            onPress={() => toggleCardExpanded(card.id)}
            accessibilityLabel={isExpanded ? t('mcHideDetails', 'Recolher') : t('mcShowDetails', 'Ver detalhes')}>
            <Text style={[typography.caption, { color: theme.textMuted }]}>{isExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>
        </View>
        {!!card.description && (
          <Text
            style={[typography.bodySmall, { color: theme.textMuted }]}
            numberOfLines={isExpanded ? undefined : 2}
          >
            {card.description}
          </Text>
        )}

        {sources.length > 0 && (
          <View style={styles.chips}>
            {visibleSources.map((s, i) => (
              <View key={i} style={[styles.chip, { borderColor: theme.surfaceBorder, maxWidth: isExpanded ? undefined : 170 }]}>
                <Text style={[typography.caption, { color: theme.textMuted }]} numberOfLines={isExpanded ? undefined : 1}>
                  {resolveLibraryIcon(libraries.find((l) => l.id === s.library_id)?.icon)} {s.name || `#${s.library_id}`}
                </Text>
              </View>
            ))}
            {!isExpanded && sources.length > 3 && (
              <TouchableOpacity
                style={[styles.chip, { borderColor: theme.surfaceBorder }]}
                onPress={() => toggleCardExpanded(card.id)}>
                <Text style={[typography.caption, { color: theme.textMuted, fontWeight: '700' }]}>+{sources.length - 3}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.metaRow}>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            {totalQuestions} {t('mcQuestionsShort', 'questões')} · {typeLabel(cfg.question_type)}
          </Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            {card.drafts_count ?? 0} {t('mcDrafts', 'provas')}
          </Text>
          {pendingDocsForCard(card, libraries) > 0 && (
            <Text style={[typography.caption, { color: '#f59e0b' }]}>
              ⏳ {t('mcDocsProcessing', { count: pendingDocsForCard(card, libraries), defaultValue: `${pendingDocsForCard(card, libraries)} documento(s) ainda processando` })}
            </Text>
          )}
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.primary, opacity: isGenerating ? 0.6 : 1 }]}
            disabled={isGenerating}
            onPress={() => handleGenerate(card)}>
            {isGenerating ? <ActivityIndicator size="small" color="#fff" /> : (
              <Text style={[typography.buttonSmall, { color: '#fff' }]}>⚡ {t('mcGenerate', 'Gerar prova')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnOutline, { borderColor: theme.surfaceBorder }]} onPress={() => handleViewDrafts(card)}>
            <Text style={[typography.buttonSmall, { color: theme.text }]}>{t('mcViewDrafts', 'Ver provas')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnOutline, { borderColor: theme.surfaceBorder }]} onPress={() => openDossier(card)}>
            <Text style={[typography.buttonSmall, { color: theme.text }]}>📋 {t('mcDossier', 'Dossiê')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnGhost} onPress={() => openEdit(card)}>
            <Text style={[typography.buttonSmall, { color: theme.textMuted }]}>{t('mcEdit', 'Editar')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnGhost} onPress={() => handleDelete(card)}>
            <Text style={[typography.buttonSmall, { color: theme.danger }]}>{t('mcDelete', 'Excluir')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View>
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={[typography.h3, { color: theme.text }]}>{t('mcTitle', 'Meus Concursos')}</Text>
            <Text style={[typography.caption, { color: '#f59e0b', fontWeight: '500' }]}>🎓 {t('mcNotRanked', 'Provas de treino, só suas')}</Text>
          </View>
          <Text style={[typography.caption, { color: theme.textMuted }]}>{t('mcSubtitle', 'Crie provas sob medida para o seu concurso a partir das suas bibliotecas.')}</Text>
        </View>
        <TouchableOpacity style={[styles.newBtn, { backgroundColor: theme.primary }]} onPress={openCreate}>
          <Text style={[typography.buttonSmall, { color: '#fff' }]}>＋ {t('mcNewCard', 'Novo concurso')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: spacing.xl }} />
      ) : cards.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 40, marginBottom: spacing.sm }}>🗂️</Text>
          <Text style={[typography.body, { color: theme.text, textAlign: 'center' }]}>{t('mcEmptyTitle', 'Nenhum concurso ainda')}</Text>
          <Text style={[typography.bodySmall, { color: theme.textMuted, textAlign: 'center', marginTop: 4 }]}>{t('mcEmptyText', 'Crie um concurso, escolha suas bibliotecas e gere quantas provas quiser.')}</Text>
        </View>
      ) : (
        cards.map(renderCard)
      )}

      {/* ── Form criar/editar ── */}
      <Modal visible={showForm} animationType="slide" onRequestClose={() => !saving && setShowForm(false)}>
        <View style={[styles.modalRoot, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.surfaceBorder }]}>
            <Text style={[typography.h3, { color: theme.text }]}>{editingId ? t('mcEditTitle', 'Editar concurso') : t('mcCreateTitle', 'Criar concurso')}</Text>
            <TouchableOpacity onPress={() => setShowForm(false)} disabled={saving}><Text style={[typography.h3, { color: theme.textMuted }]}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.base }}>
            <Text style={[styles.label, { color: theme.text }]}>{t('mcName', 'Nome do concurso')}</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.surfaceBorder }]}
              value={form.name}
              maxLength={120}
              placeholder={t('mcNamePlaceholder', 'Ex.: Concurso SES-PB 2026 — Clínica Médica')}
              placeholderTextColor={theme.textMuted}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            />

            <Text style={[styles.label, { color: theme.text }]}>{t('mcDescription', 'Descrição (opcional)')}</Text>
            <TextInput
              style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.surfaceBorder }]}
              value={form.description}
              multiline
              placeholderTextColor={theme.textMuted}
              onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
            />

            <Text style={[styles.label, { color: theme.text }]}>{t('mcLibraries', 'Bibliotecas-fonte')}</Text>
            {libraries.length === 0 ? (
              <Text style={[typography.caption, { color: theme.textMuted }]}>{t('mcNoLibraries', 'Você ainda não tem bibliotecas. Crie uma na aba Biblioteca primeiro.')}</Text>
            ) : (
              <View style={styles.chips}>
                {libraries.map((lib) => {
                  const active = form.libraryIds.includes(lib.id);
                  const docCount = lib.document_count ?? 0;
                  return (
                    <TouchableOpacity
                      key={lib.id}
                      style={[
                        styles.libChip,
                        { borderColor: active ? theme.primary : theme.surfaceBorder, backgroundColor: active ? 'rgba(167,139,250,0.15)' : 'transparent' },
                        docCount === 0 && { opacity: 0.45 },
                      ]}
                      onPress={() => toggleLibrary(lib.id)}>
                      <Text style={[typography.caption, { color: theme.text }]}>
                        {resolveLibraryIcon(lib.icon)} {lib.name} <Text style={{ color: theme.textMuted }}>({docCount})</Text>
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Edital / conteúdo programático — CONTEÚDO (em destaque) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.base }}>
              <Text style={[styles.label, { color: theme.text, marginTop: 0, marginBottom: 0 }]}>{t('mcEdital', 'Edital / conteúdo programático')}</Text>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(167,139,250,0.15)' }}>
                <Text style={[typography.caption, { color: theme.primary, fontWeight: '700' }]}>{t('mcRecommended', 'Recomendado')}</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.btnOutline, { borderColor: theme.surfaceBorder, alignSelf: 'flex-start', marginTop: spacing.xs }]} onPress={() => pickFiles('editalFiles')}>
              <Text style={[typography.buttonSmall, { color: theme.text }]}>⬆ {t('mcChooseFiles', 'Escolher arquivos')}</Text>
            </TouchableOpacity>
            {form.editalFiles.map((f, i) => (
              <View key={i} style={styles.fileRow}>
                <Text style={[typography.caption, { color: theme.textMuted, flexShrink: 1 }]} numberOfLines={1}>{f.name}</Text>
                <TouchableOpacity onPress={() => setForm((ff) => ({ ...ff, editalFiles: ff.editalFiles.filter((_, j) => j !== i) }))}>
                  <Text style={{ color: theme.danger }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <Text style={[typography.caption, { color: theme.textMuted, marginTop: 4 }]}>{t('mcEditalHint', 'O programa do concurso. Vira material-fonte das questões e conta no seu armazenamento.')}</Text>

            {/* Provas anteriores — FORMATO/estilo (opcional) */}
            <Text style={[styles.label, { color: theme.text, marginTop: spacing.base }]}>{t('mcPastExams', 'Provas anteriores (opcional)')}</Text>
            <TouchableOpacity style={[styles.btnOutline, { borderColor: theme.surfaceBorder, alignSelf: 'flex-start' }]} onPress={() => pickFiles('pastExamFiles')}>
              <Text style={[typography.buttonSmall, { color: theme.text }]}>⬆ {t('mcChooseFiles', 'Escolher arquivos')}</Text>
            </TouchableOpacity>
            {form.pastExamFiles.map((f, i) => (
              <View key={i} style={styles.fileRow}>
                <Text style={[typography.caption, { color: theme.textMuted, flexShrink: 1 }]} numberOfLines={1}>{f.name}</Text>
                <TouchableOpacity onPress={() => setForm((ff) => ({ ...ff, pastExamFiles: ff.pastExamFiles.filter((_, j) => j !== i) }))}>
                  <Text style={{ color: theme.danger }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <Text style={[typography.caption, { color: theme.textMuted, marginTop: 4 }]}>{t('mcPastExamsHint', 'Formato e estilo da banca + inspiração de conteúdo — temas de provas anteriores podem voltar reformulados, nunca copiados. Também contam no armazenamento.')}</Text>

            <Text style={[styles.label, { color: theme.text }]}>{t('mcQuestionType', 'Tipo de questão')}</Text>
            <View style={styles.typeToggle}>
              {(['objective', 'subjective'] as const).map((qt) => (
                <TouchableOpacity
                  key={qt}
                  style={[styles.typeBtn, { borderColor: theme.surfaceBorder, backgroundColor: form.questionType === qt ? theme.primary : 'transparent' }]}
                  onPress={() => setForm((f) => ({ ...f, questionType: qt }))}>
                  <Text style={[typography.caption, { color: form.questionType === qt ? '#fff' : theme.textMuted }]}>
                    {qt === 'objective' ? t('mcObjective', 'Objetiva') : t('mcSubjective', 'Discursiva')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.questionType === 'objective' && (
              <>
                <Text style={[styles.label, { color: theme.text }]}>{t('mcNumAlternatives', 'Alternativas por questão objetiva')}</Text>
                <View style={styles.typeToggle}>
                  {[2, 3, 4, 5, 6].map((alt) => (
                    <TouchableOpacity
                      key={alt}
                      style={[styles.typeBtn, { borderColor: theme.surfaceBorder, backgroundColor: form.numAlternatives === alt ? theme.primary : 'transparent' }]}
                      onPress={() => setForm((f) => ({ ...f, numAlternatives: alt }))}>
                      <Text style={[typography.caption, { color: form.numAlternatives === alt ? '#fff' : theme.textMuted }]}>{alt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[typography.caption, { color: theme.textMuted, marginTop: 4, marginBottom: spacing.sm }]}>{t('mcNumAlternativesHint', 'Quantas opções (A, B, C…) cada questão de múltipla escolha terá.')}</Text>
              </>
            )}

            {/* Distribuição por bloco (avançado) */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm }}
              onPress={() => setForm((f) => ({ ...f, useBlueprint: !f.useBlueprint }))}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: form.useBlueprint ? theme.primary : theme.surfaceBorder, backgroundColor: form.useBlueprint ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {form.useBlueprint && <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>✓</Text>}
              </View>
              <Text style={[styles.label, { color: theme.text, marginTop: 0, marginBottom: 0, flex: 1 }]}>{t('mcBlueprintToggle', 'Distribuição por bloco (avançado)')}</Text>
            </TouchableOpacity>
            <Text style={[typography.caption, { color: theme.textMuted, marginTop: 4 }]}>{t('mcBlueprintHint', 'Defina quantas questões saem de cada conjunto de bibliotecas (estilo banca). Cada bloco gera só das suas bibliotecas.')}</Text>

            {!form.useBlueprint ? (
              <>
                <Text style={[styles.label, { color: theme.text, marginTop: spacing.sm }]}>{t('mcNumQuestions', 'Nº de questões')}</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.surfaceBorder }]}
                  value={form.numQuestions}
                  keyboardType="number-pad"
                  onChangeText={(v) => setForm((f) => ({ ...f, numQuestions: v.replace(/[^0-9]/g, '') }))}
                />
              </>
            ) : (
              <View style={{ marginTop: spacing.sm }}>
                {form.libraryIds.length === 0 && (
                  <Text style={[typography.caption, { color: theme.textMuted, marginBottom: spacing.xs }]}>{t('mcBlueprintNeedLibs', 'Selecione as bibliotecas-fonte acima primeiro — os blocos distribuem essas bibliotecas.')}</Text>
                )}
                {form.blueprint.map((blk, bi) => (
                  <View key={bi} style={{ borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 10, padding: spacing.sm, marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        style={[styles.input, { color: theme.text, borderColor: theme.surfaceBorder, flex: 1, marginBottom: 0 }]}
                        value={blk.label}
                        placeholder={t('mcBlockName', 'Nome do bloco')}
                        placeholderTextColor={theme.textMuted}
                        onChangeText={(v) => updateBlock(bi, { label: v })}
                      />
                      <TextInput
                        style={[styles.input, { color: theme.text, borderColor: theme.surfaceBorder, width: 56, marginBottom: 0, textAlign: 'center' }]}
                        value={blk.num_questions}
                        keyboardType="number-pad"
                        onChangeText={(v) => updateBlock(bi, { num_questions: v.replace(/[^0-9]/g, '') })}
                      />
                      <TouchableOpacity onPress={() => removeBlock(bi)}><Text style={{ color: theme.danger, fontSize: 18 }}>✕</Text></TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.xs }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.caption, { color: theme.textMuted }]}>{t('mcBlockWeight', 'Peso')}</Text>
                        <TextInput
                          style={[styles.input, { color: theme.text, borderColor: theme.surfaceBorder, marginBottom: 0 }]}
                          value={blk.weight ?? '1'}
                          keyboardType="decimal-pad"
                          onChangeText={(v) => updateBlock(bi, { weight: v.replace(/[^0-9.,]/g, '').replace(',', '.') })}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.caption, { color: theme.textMuted }]}>{t('mcBlockMinCorrect', 'Mín. acertos')}</Text>
                        <TextInput
                          style={[styles.input, { color: theme.text, borderColor: theme.surfaceBorder, marginBottom: 0 }]}
                          value={blk.min_correct ?? ''}
                          placeholder="—"
                          placeholderTextColor={theme.textMuted}
                          keyboardType="number-pad"
                          onChangeText={(v) => updateBlock(bi, { min_correct: v.replace(/[^0-9]/g, '') })}
                        />
                      </View>
                    </View>
                    <View style={[styles.chips, { marginTop: spacing.xs }]}>
                      {form.libraryIds.map((libId) => {
                        const lib = libraries.find((l) => l.id === libId);
                        if (!lib) return null;
                        const active = (blk.library_ids || []).includes(libId);
                        const docCount = lib.document_count ?? 0;
                        return (
                          <TouchableOpacity
                            key={libId}
                            style={[
                              styles.libChip,
                              { borderColor: active ? theme.primary : theme.surfaceBorder, backgroundColor: active ? 'rgba(167,139,250,0.15)' : 'transparent' },
                              docCount === 0 && { opacity: 0.45 },
                            ]}
                            onPress={() => toggleBlockLib(bi, libId)}>
                            <Text style={[typography.caption, { color: theme.text }]}>
                              {resolveLibraryIcon(lib.icon)} {lib.name} <Text style={{ color: theme.textMuted }}>({docCount})</Text>
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
                <TouchableOpacity style={[styles.btnOutline, { borderColor: theme.surfaceBorder, alignSelf: 'flex-start' }]} onPress={addBlock}>
                  <Text style={[typography.buttonSmall, { color: theme.text }]}>+ {t('mcAddBlock', 'Adicionar bloco')}</Text>
                </TouchableOpacity>
                <Text style={[typography.caption, { color: theme.textMuted, marginTop: 4 }]}>
                  {t('mcBlueprintTotal', 'Total')}: {form.blueprint.reduce((s, b) => s + (Number(b.num_questions) || 0), 0)} {t('mcQuestionsShort', 'questões')}
                  {' · '}
                  {formatPoints(form.blueprint.reduce((s, b) => s + (Number(b.num_questions) || 0) * (b.weight === '' || b.weight === undefined ? 1 : Number(b.weight) || 0), 0))} {t('mcPoints', 'pontos')}
                </Text>
                <Text style={[styles.label, { color: theme.text, marginTop: spacing.sm }]}>{t('mcPassingScore', 'Nota de corte (pontos)')}</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.surfaceBorder }]}
                  value={form.passingScore}
                  placeholder="—"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  onChangeText={(v) => setForm((f) => ({ ...f, passingScore: v.replace(/[^0-9.,]/g, '').replace(',', '.') }))}
                />
                <Text style={[typography.caption, { color: theme.textMuted }]}>{t('mcPassingScoreHint', 'Pontuação mínima para ser aprovado. Vazio = sem veredito de aprovação.')}</Text>
              </View>
            )}

            <Text style={[styles.label, { color: theme.text, marginTop: spacing.sm }]}>{t('mcTimeLimit', 'Tempo de prova (min, opcional)')}</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.surfaceBorder }]}
              value={form.timeLimit}
              keyboardType="number-pad"
              onChangeText={(v) => setForm((f) => ({ ...f, timeLimit: v.replace(/[^0-9]/g, '') }))}
            />
            <Text style={[typography.caption, { color: theme.textMuted, marginTop: 4 }]}>
              {t('mcTimeLimitHint', 'Duração oficial da prova — o treino roda com cronômetro regressivo e entrega automática ao zerar. Não muda as questões geradas.')}
            </Text>

            <View style={styles.formActions}>
              <TouchableOpacity style={[styles.btnOutline, { borderColor: theme.surfaceBorder }]} onPress={() => setShowForm(false)} disabled={saving}>
                <Text style={[typography.buttonSmall, { color: theme.text }]}>{t('mcCancel', 'Cancelar')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[typography.buttonSmall, { color: '#fff' }]}>{t('mcSave', 'Salvar')}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Drafts ── */}
      <Modal visible={!!draftsModal} animationType="slide" onRequestClose={() => setDraftsModal(null)}>
        <View style={[styles.modalRoot, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.surfaceBorder }]}>
            <Text style={[typography.h3, { color: theme.text, flexShrink: 1 }]}>{t('mcDraftsTitle', 'Provas geradas')}</Text>
            <TouchableOpacity onPress={() => setDraftsModal(null)}><Text style={[typography.h3, { color: theme.textMuted }]}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.base }}>
            {draftsModal?.loading ? (
              <ActivityIndicator color={theme.primary} />
            ) : (draftsModal?.drafts.length || 0) === 0 ? (
              <Text style={[typography.bodySmall, { color: theme.textMuted }]}>{t('mcNoDrafts', 'Nenhuma prova gerada ainda. Toque em "Gerar prova".')}</Text>
            ) : (
              draftsModal?.drafts.map((d, idx) => {
                const count = ((d.content && (d.content.questionario_objetivo || d.content.questionario_subjetivo)) || []).length;
                // Numeração POR CONCURSO (1 = a mais antiga), não o id do banco
                const provaNumber = (draftsModal?.drafts.length || 0) - idx;
                const attempt = d.content?.last_attempt;
                return (
                  <View key={d.id} style={[styles.draftRow, { borderColor: theme.surfaceBorder }]}>
                    <View style={{ flexShrink: 1 }}>
                      <Text style={[typography.bodySmall, { color: theme.text }]}>{t('mcUntitledDraft', 'Prova')} #{provaNumber}</Text>
                      <Text style={[typography.caption, { color: theme.textMuted }]}>
                        {d.status === 'completed' && count ? `${count} ${t('mcQuestionsShort', 'questões')}` : t(`mcStatus_${d.status}`, d.status)}
                      </Text>
                      {d.status === 'completed' && (
                        attempt ? (
                          <Text style={[typography.caption, { color: theme.secondary, fontWeight: '600' }]}>
                            ✓ {t('mcAttemptScore', {
                              correct: attempt.correct,
                              total: attempt.total,
                              pct: attempt.total ? Math.round((attempt.correct / attempt.total) * 100) : 0,
                              defaultValue: `Entregue · ${attempt.correct}/${attempt.total}`,
                            })}
                          </Text>
                        ) : (
                          <Text style={[typography.caption, { color: '#f59e0b' }]}>{t('mcAttemptNone', 'Ainda não realizada')}</Text>
                        )
                      )}
                    </View>
                    {d.status === 'completed' && draftsModal && (
                      <TouchableOpacity style={[styles.btnOutline, { borderColor: theme.surfaceBorder }]} onPress={() => openDraft(d, draftsModal.card)}>
                        <Text style={[typography.buttonSmall, { color: theme.text }]}>{t('mcOpenDraft', 'Abrir')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Dossiê ── */}
      <Modal visible={!!dossierModal} animationType="slide" onRequestClose={() => !dossierModal?.researching && setDossierModal(null)}>
        <View style={[styles.modalRoot, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.surfaceBorder }]}>
            <Text style={[typography.h3, { color: theme.text, flexShrink: 1 }]}>📋 {t('mcDossierTitle', 'Dossiê da prova')}</Text>
            <TouchableOpacity onPress={() => setDossierModal(null)} disabled={dossierModal?.researching}><Text style={[typography.h3, { color: theme.textMuted }]}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.base }}>
            {dossierModal?.researching ? (
              <View style={styles.empty}>
                <ActivityIndicator color={theme.primary} />
                <Text style={[typography.bodySmall, { color: theme.textMuted, marginTop: spacing.sm }]}>{t('mcResearching', 'Pesquisando a prova na web…')}</Text>
              </View>
            ) : !dossierModal?.synthesis ? (
              <View style={styles.empty}>
                <Text style={[typography.bodySmall, { color: theme.textMuted, textAlign: 'center', marginBottom: spacing.base }]}>{t('mcDossierEmptyHint', 'Deixe o Qython pesquisar a banca/edital na web (formato, estilo, temas mais cobrados) para montar provas mais fiéis.')}</Text>
                <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={runResearch}>
                  <Text style={[typography.buttonSmall, { color: '#fff' }]}>🔎 {t('mcResearch', 'Pesquisar a prova')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.dossierStatusRow}>
                  <View style={[styles.badge, { backgroundColor: dossierModal.confirmed ? 'rgba(45,212,191,0.15)' : 'rgba(245,158,11,0.15)', borderColor: theme.surfaceBorder }]}>
                    <Text style={[typography.caption, { color: dossierModal.confirmed ? theme.secondary : theme.warning }]}>
                      {dossierModal.confirmed ? `✓ ${t('mcDossierConfirmed', 'Dossiê confirmado — guia a geração')}` : t('mcDossierUnconfirmed', 'Ainda não confirmado')}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setDossierModal((m) => (m ? { ...m, mode: m.mode === 'edit' ? 'view' : 'edit' } : m))}>
                    <Text style={[typography.buttonSmall, { color: theme.primary }]}>{dossierModal.mode === 'edit' ? t('mcPreview', 'Pré-visualizar') : t('mcEditDossier', 'Editar')}</Text>
                  </TouchableOpacity>
                </View>

                {dossierModal.grounded === false && (
                  <Text style={[typography.caption, { color: '#f59e0b', marginBottom: spacing.sm, lineHeight: 18 }]}>
                    ⚠️ {t('mcDossierUngrounded', 'A busca na web não retornou fontes — este dossiê veio do conhecimento do modelo, guiado pela sua descrição. Revise com atenção antes de confirmar.')}
                  </Text>
                )}

                {dossierModal.mode === 'edit' ? (
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.surfaceBorder, minHeight: 260, textAlignVertical: 'top' }]}
                    value={dossierModal.synthesis}
                    multiline
                    onChangeText={(v) => setDossierModal((m) => (m ? { ...m, synthesis: v } : m))}
                  />
                ) : (
                  <MarkdownRenderer content={dossierModal.synthesis} />
                )}

                {dossierModal.sources?.length > 0 && (
                  <View style={{ marginTop: spacing.base }}>
                    <Text style={[styles.label, { color: theme.text }]}>{t('mcSourcesFound', 'Fontes encontradas')}</Text>
                    {dossierModal.sources.map((s, i) => (
                      <TouchableOpacity key={i} onPress={() => s.uri && Linking.openURL(s.uri)}>
                        <Text style={[typography.caption, { color: theme.primary, marginBottom: 4 }]} numberOfLines={1}>• {s.title || s.uri}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={styles.formActions}>
                  <TouchableOpacity style={[styles.btnOutline, { borderColor: theme.surfaceBorder }]} onPress={runResearch}>
                    <Text style={[typography.buttonSmall, { color: theme.text }]}>🔎 {t('mcReResearch', 'Pesquisar de novo')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnOutline, { borderColor: theme.surfaceBorder }]} onPress={() => saveDossier(null)}>
                    <Text style={[typography.buttonSmall, { color: theme.text }]}>{t('mcSaveDossier', 'Salvar')}</Text>
                  </TouchableOpacity>
                  {/* Slot de ação por estado: fora da geração → confirmar; em uso → parar */}
                  {dossierModal.confirmed ? (
                    <TouchableOpacity style={[styles.btnOutline, { borderColor: theme.surfaceBorder }]} onPress={() => saveDossier(false)}>
                      <Text style={[typography.buttonSmall, { color: theme.text }]}>✕ {t('mcDossierStopUse', 'Parar de usar')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => saveDossier(true)}>
                      <Text style={[typography.buttonSmall, { color: '#fff' }]}>✓ {t('mcConfirmUse', 'Confirmar e usar')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Fazer a prova (reusa o MaterialQuizMode) ── */}
      {quiz && (
        <MaterialQuizMode
          title={quiz.title}
          objectiveQuestions={quiz.objective}
          subjectiveQuestions={quiz.subjective}
          supportTexts={quiz.supportTexts || []}
          trainingNote={t('mcResultNotRanked', 'Treino pessoal')}
          timeLimitMinutes={quiz.timeLimitMinutes || null}
          examMode
          scoring={quiz.scoring || null}
          initialAttempt={quiz.initialAttempt || null}
          onSaveAttempt={(attempt) => { saveMaterialAttempt(quiz.materialId, attempt).catch(() => {}); }}
          onClose={() => setQuiz(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  newBtn: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  expandBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  libChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 96,
  },
  btnOutline: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  btnGhost: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    borderBottomWidth: 1,
  },
  label: {
    ...typography.label,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
  },
  textArea: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  typeToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  typeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
    flexWrap: 'wrap',
  },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dossierStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
});
