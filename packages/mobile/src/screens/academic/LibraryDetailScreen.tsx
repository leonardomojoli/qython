import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Share,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { getLibraryDocuments, deleteDocument, retryDocumentProcessing, getLibraryMaterials, updateLibrary } from '../../services/academic';
import type { Library, LibraryDocument } from '../../types/academic';
import type { LibraryMaterial } from '../../types/academic';
import { MATERIAL_TYPE_CONFIG, resolveLibraryIcon } from '../../types/academic';
import DocumentCard from '../../components/academic/DocumentCard';
import DocumentUploadButton from '../../components/academic/DocumentUploadButton';
import EmptyState from '../../components/pharmacy/EmptyState';
import LibraryChatModal from '../../components/academic/LibraryChatModal';
import MaterialGeneratorModal from '../../components/academic/MaterialGeneratorModal';
import MaterialCard from '../../components/academic/MaterialCard';
import PodcastPlayer from '../../components/academic/PodcastPlayer';
import VideoLessonPlayer from '../../components/academic/VideoLessonPlayer';
import SlideshowViewer from '../../components/academic/SlideshowViewer';
import GradientButton from '../../components/shared/GradientButton';
import ClinicalCasePlayer from '../../components/academic/ClinicalCasePlayer';
import MaterialContentViewer from '../../components/academic/MaterialContentViewer';
import MaterialQuizMode from '../../components/academic/MaterialQuizMode';
import CriticalAppraisalViewer from '../../components/academic/CriticalAppraisalViewer';
import LibraryIconPicker from '../../components/academic/LibraryIconPicker';

interface Props {
  library: Library;
  onBack: () => void;
  onLibraryUpdated?: (updated: Library) => void;
}

export default function LibraryDetailScreen({ library, onBack, onLibraryUpdated }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatVisible, setChatVisible] = useState(false);
  const [generatorVisible, setGeneratorVisible] = useState(false);
  const [activePodcast, setActivePodcast] = useState<LibraryMaterial | null>(null);
  const [activeVideo, setActiveVideo] = useState<LibraryMaterial | null>(null);
  const [activeSlideshow, setActiveSlideshow] = useState<LibraryMaterial | null>(null);
  const [activeClinicalCase, setActiveClinicalCase] = useState<LibraryMaterial | null>(null);
  const [activeContent, setActiveContent] = useState<LibraryMaterial | null>(null);
  const [activeAppraisal, setActiveAppraisal] = useState<LibraryMaterial | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(library.name);
  const [editDescription, setEditDescription] = useState(library.description || '');
  const [editIcon, setEditIcon] = useState(library.icon || '');
  const [isSaving, setIsSaving] = useState(false);

  // Re-sincroniza o buffer de edição ao trocar de biblioteca (a instância da tela pode ser
  // reaproveitada). Dispara só quando o id muda — não atropela uma edição em andamento.
  useEffect(() => {
    setEditName(library.name);
    setEditDescription(library.description || '');
    setEditIcon(library.icon || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.id]);

  const fetchDocuments = useCallback(async () => {
    try {
      const data = await getLibraryDocuments(library.id);
      setDocuments(data);
    } catch {
      Alert.alert('', t('errorLoadingDocuments', 'Erro ao carregar os documentos da biblioteca.'));
    } finally {
      setLoading(false);
    }
  }, [library.id, t]);

  const fetchMaterials = useCallback(async () => {
    try {
      const data = await getLibraryMaterials(library.id);
      setMaterials(data || []);
    } catch {
      // Silently fail — materials section is secondary
    }
  }, [library.id]);

  useEffect(() => {
    fetchDocuments();
    fetchMaterials();
  }, [fetchDocuments, fetchMaterials]);

  // Smart polling: re-fetch every 10s if any doc is pending/processing
  useEffect(() => {
    const hasPending = documents.some(
      (d) => d.status === 'pending' || d.status === 'processing',
    );
    if (!hasPending) return;

    const interval = setInterval(fetchDocuments, 10000);
    return () => clearInterval(interval);
  }, [documents, fetchDocuments]);

  // Smart polling: re-fetch materials every 10s if any is pending/processing
  useEffect(() => {
    const hasPendingMaterial = materials.some(
      (m) => m.status === 'pending' || m.status === 'processing',
    );
    if (!hasPendingMaterial) return;

    const interval = setInterval(fetchMaterials, 10000);
    return () => clearInterval(interval);
  }, [materials, fetchMaterials]);

  const handleMaterialPress = (material: LibraryMaterial) => {
    if (material.status !== 'completed') return;

    switch (material.material_type) {
      case 'podcast':
        setActivePodcast(material);
        break;
      case 'video_lesson':
        setActiveVideo(material);
        break;
      case 'slideshow_only':
        if (material.result?.slideshow || material.result?.slides) {
          setActiveSlideshow(material);
        } else if (material.result?.url) {
          Linking.openURL(material.result.url).catch(() =>
            Alert.alert('', t('cannotOpenMaterial', 'Nao foi possivel abrir o material.')));
        }
        break;
      case 'clinical_case':
        if (material.result?.clinical_case) {
          setActiveClinicalCase(material);
        } else {
          setActiveContent(material);
        }
        break;
      case 'critical_appraisal':
        if (material.result?.appraisal) {
          setActiveAppraisal(material);
        } else {
          setActiveContent(material);
        }
        break;
      case 'transcription':
      case 'summary':
      case 'detailed_text':
      case 'flashcards':
      case 'mind_map':
      case 'questionnaire_objective':
      case 'questionnaire_subjective':
      case 'comparative_table':
        setActiveContent(material);
        break;
      default:
        if (material.result?.url) {
          Linking.openURL(material.result.url).catch(() =>
            Alert.alert('', t('cannotOpenMaterial', 'Nao foi possivel abrir o material.')));
        } else {
          Share.share({
            title: material.title || t(MATERIAL_TYPE_CONFIG[material.material_type]?.labelKey || ''),
            message: material.title || t(MATERIAL_TYPE_CONFIG[material.material_type]?.labelKey || ''),
          }).catch(() => {});
        }
    }
  };

  const handleDeleteDoc = async (doc: LibraryDocument) => {
    try {
      await deleteDocument(library.id, doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {
      Alert.alert('', t('errorDeletingDocument', 'Erro ao excluir documento.'));
    }
  };

  const handleRetryDoc = async (doc: LibraryDocument) => {
    try {
      const updated = await retryDocumentProcessing(library.id, doc.id);
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
      Alert.alert('', t('documentRetryStarted', 'Reprocessamento iniciado!'));
    } catch {
      Alert.alert('', t('errorRetryingDocument', 'Erro ao reprocessar documento.'));
    }
  };

  const handleEditSave = async () => {
    if (!editName.trim()) {
      Alert.alert('', t('libraryNameCannotBeEmpty'));
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateLibrary(library.id, {
        name: editName.trim(),
        description: editDescription.trim(),
        icon: editIcon,
      });
      if (onLibraryUpdated) {
        onLibraryUpdated(updated);
      }
      Alert.alert('', t('libraryUpdatedSuccess'));
      setIsEditing(false);
    } catch {
      Alert.alert('', t('errorUpdatingLibrary'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditCancel = () => {
    setEditName(library.name);
    setEditDescription(library.description || '');
    setEditIcon(library.icon || '');
    setIsEditing(false);
  };

  const hasProcessedDocs = documents.some((d) => d.status === 'processed');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
        <TouchableOpacity onPress={isEditing ? handleEditCancel : onBack} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.primary }]}>
            {isEditing ? `✕ ${t('cancel', 'Cancelar')}` : `← ${t('backToLibraries', 'Voltar')}`}
          </Text>
        </TouchableOpacity>
        {isEditing ? (
          <View style={styles.editContainer}>
            <TextInput
              style={[styles.editInput, { color: theme.text, borderColor: theme.primary }]}
              value={editName}
              onChangeText={setEditName}
              placeholder={t('newLibraryNamePlaceholder')}
              placeholderTextColor={theme.textMuted}
              autoFocus
            />
            <TextInput
              style={[styles.editInput, styles.editDescInput, { color: theme.text, borderColor: theme.surfaceBorder }]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder={t('editLibraryDescription')}
              placeholderTextColor={theme.textMuted}
              multiline
            />
            <LibraryIconPicker value={editIcon} onChange={setEditIcon} />
          </View>
        ) : (
          <TouchableOpacity style={styles.titleGroup} onPress={() => setIsEditing(true)}>
            <Text style={styles.titleIcon}>{resolveLibraryIcon(library.icon)}</Text>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {library.name}
            </Text>
            <Text style={[styles.editHint, { color: theme.textMuted }]}>✏️</Text>
          </TouchableOpacity>
        )}
        {isEditing ? (
          <View style={styles.headerCtaWrapper}>
            <GradientButton
              label={isSaving ? t('saving', 'Salvando...') : t('save', 'Salvar')}
              onPress={handleEditSave}
              loading={isSaving}
              style={styles.headerCtaButton}
              labelStyle={styles.headerCtaLabel}
            />
          </View>
        ) : (
          <View style={styles.headerCtaWrapper}>
            <GradientButton
              label={t('chat', 'Chat com IA')}
              onPress={() => setChatVisible(true)}
              disabled={!hasProcessedDocs}
              variant={hasProcessedDocs ? 'primary' : 'outline'}
              style={styles.headerCtaButton}
              labelStyle={styles.headerCtaLabel}
            />
          </View>
        )}
      </View>

      {/* Document list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <DocumentCard
              document={item}
              onDelete={() => handleDeleteDoc(item)}
              onRetry={() => handleRetryDoc(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="📄"
              message={t(
                'noDocumentsInLibrary',
                'Nenhum documento nesta biblioteca ainda.',
              )}
            />
          }
          ListFooterComponent={
            materials.length > 0 ? (
              <View style={styles.materialsSection}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  {t('materials', 'Materiais')}
                </Text>
                {materials.map((material) => (
                  <MaterialCard
                    key={material.id}
                    material={material}
                    onPress={() => handleMaterialPress(material)}
                  />
                ))}
              </View>
            ) : null
          }
        />
      )}

      {/* Active podcast player */}
      {activePodcast && (
        <PodcastPlayer
          title={activePodcast.title || t('podcast', 'Podcast')}
          audioUrl={activePodcast.result?.audio_url || activePodcast.result?.url || ''}
          duration={activePodcast.result?.duration}
          script={activePodcast.result?.script}
          onClose={() => setActivePodcast(null)}
        />
      )}

      {/* Active video player */}
      {activeVideo && (
        <VideoLessonPlayer
          title={activeVideo.title || t('videoLesson', 'Video Aula')}
          videoUrl={activeVideo.result?.video_url || activeVideo.result?.url || ''}
          duration={activeVideo.result?.duration}
          chapters={activeVideo.result?.chapters}
          onClose={() => setActiveVideo(null)}
        />
      )}

      {/* Active slideshow viewer */}
      {activeSlideshow && (
        <SlideshowViewer
          data={activeSlideshow.result?.slideshow || activeSlideshow.result || { title: activeSlideshow.title || '', slides: activeSlideshow.result?.slides || [] }}
          onClose={() => setActiveSlideshow(null)}
        />
      )}

      {/* Active clinical case player */}
      {activeClinicalCase && (
        <ClinicalCasePlayer
          caseData={activeClinicalCase.result}
          onClose={() => setActiveClinicalCase(null)}
        />
      )}

      {/* Active critical appraisal viewer */}
      {activeAppraisal && (
        <CriticalAppraisalViewer
          data={activeAppraisal.result}
          onClose={() => setActiveAppraisal(null)}
        />
      )}

      {/* Questionário gerado → modo quiz (treino, paridade com o web); demais → viewer genérico */}
      {activeContent && (
        (activeContent.material_type === 'questionnaire_objective' || activeContent.material_type === 'questionnaire_subjective')
          && activeContent.result && typeof activeContent.result !== 'string'
          && (((activeContent.result as any).questionario_objetivo?.length || 0) > 0
            || ((activeContent.result as any).questionario_subjetivo?.length || 0) > 0)
          ? (
            <MaterialQuizMode
              title={activeContent.title || t(MATERIAL_TYPE_CONFIG[activeContent.material_type]?.labelKey || '', activeContent.material_type)}
              objectiveQuestions={(activeContent.result as any).questionario_objetivo || []}
              subjectiveQuestions={(activeContent.result as any).questionario_subjetivo || []}
              supportTexts={(activeContent.result as any).textos_base || []}
              onClose={() => setActiveContent(null)}
            />
          ) : (
            <MaterialContentViewer
              materialType={activeContent.material_type}
              title={activeContent.title || t(MATERIAL_TYPE_CONFIG[activeContent.material_type]?.labelKey || '', activeContent.material_type)}
              content={
                typeof activeContent.result === 'string'
                  ? activeContent.result
                  : (activeContent.result as any)?.content || (activeContent.result as any)?.text || JSON.stringify(activeContent.result, null, 2)
              }
              onClose={() => setActiveContent(null)}
            />
          )
      )}

      {/* Upload button */}
      <DocumentUploadButton
        libraryId={library.id}
        onUploadComplete={() => {
          setLoading(true);
          fetchDocuments();
        }}
      />

      {/* Generate Material FAB — primary-tinted luminous shadow */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: theme.primary,
            shadowColor: theme.primary,
            shadowOpacity: 0.55,
          },
        ]}
        onPress={() => setGeneratorVisible(true)}
        activeOpacity={0.85}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Chat modal */}
      <LibraryChatModal
        visible={chatVisible}
        library={library}
        onClose={() => setChatVisible(false)}
      />

      {/* Material generator modal */}
      <MaterialGeneratorModal
        visible={generatorVisible}
        onClose={() => setGeneratorVisible(false)}
        libraryId={library.id}
        onMaterialGenerated={fetchMaterials}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  backBtn: {
    paddingRight: spacing.sm,
  },
  backText: {
    ...typography.buttonSmall,
  },
  titleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  titleIcon: {
    fontSize: 20,
  },
  title: {
    ...typography.h3,
    flex: 1,
  },
  editHint: {
    fontSize: 14,
  },
  editContainer: {
    flex: 1,
    gap: spacing.xs,
  },
  editInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  editDescInput: {
    minHeight: 40,
    textAlignVertical: 'top' as const,
  },
  headerCtaWrapper: {
    minWidth: 120,
  },
  headerCtaButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 38,
  },
  headerCtaLabel: {
    ...typography.buttonSmall,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: spacing.base,
    flexGrow: 1,
    paddingBottom: 80,
  },
  materialsSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: spacing.base,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    // shadowColor + shadowOpacity injected inline (theme-aware)
  },
  fabIcon: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    marginTop: -2,
  },
});
