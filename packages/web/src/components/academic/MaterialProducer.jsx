// frontend/src/components/academic/MaterialProducer.js

import React, { useState, useEffect, useRef } from 'react';
import styles from './MaterialProducer.module.css';
import { useNotification } from '../../contexts/NotificationContext';
import { useUser } from '../../contexts/UserContext';
import { useMaterialViewer, MAX_OPEN_MATERIALS } from '../../contexts/MaterialViewerContext';
import { useTranslation } from 'react-i18next';

import {
  getLibraries,
  uploadFile,
  processFile,
  getMaterialJobStatus,
} from '../../api';
import { useNavigate } from 'react-router-dom';
import LibraryDropdown from './LibraryDropdown';
import UpgradeModal from '../shared/UpgradeModal';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
// Worker do pdf.js configurado em um único lugar, com versão travada à API do
// react-pdf (ver utils/pdfWorker.js). Antes usava o estático /pdf.worker.min.js
// (pdfjs 5.3.31) → mismatch com a API → preview de PDF não carregava.
import '../../utils/pdfWorker';
import { hasPlatformAccess } from '../../utils/access';

const ACCEPTED_FILE_TYPES = ".pdf,.pptx,.txt,.mp4,.webm,.mkv,.mp3,.wav,.ogg,.png,.jpg,.jpeg,.gif";

// File type categories for conditional card visibility
const AUDIO_VIDEO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'mp4', 'webm', 'mkv', 'avi', 'mov'];
const TEXT_DOCUMENT_EXTENSIONS = ['pdf', 'pptx', 'txt'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif'];

function MaterialProducer({ isSidebarOpen }) {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const { user } = useUser();
  const navigate = useNavigate();
  const { openMaterial, isViewerFull } = useMaterialViewer();
  // Ref sempre-atual do handleRedo p/ o visualizador persistente (o modal de estudo agora
  // vive no MaterialViewerHost, fora desta tela) — evita closure obsoleta em "refazer".
  const handleRedoRef = useRef(null);
  // "Tem acesso às features" — verificado no Latreo OU acesso concedido pelo Qython.
  const isVerified = hasPlatformAccess(user);

  // Upgrade modal state
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState('premium_content');

  const [file, setFile] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [selectedLibrary, setSelectedLibrary] = useState(null);
  const [libraries, setLibraries] = useState([]);

  const [loading, setLoading] = useState(false);
  const [generatedMaterialType, setGeneratedMaterialType] = useState(null);

  const fileInputRef = useRef(null);
  const previewContainerRef = useRef(null);
  const [previewWidth, setPreviewWidth] = useState(0);

  const [numPages, setNumPages] = useState(null);

  const [pollingJob, setPollingJob] = useState(null); // This is for standard materials.
  // Job cuja conclusão já foi tratada — ver a nota no tick do polling abaixo.
  const pollDoneRef = useRef(null);

  useEffect(() => {
    const updatePreviewWidth = () => {
      if (previewContainerRef.current) {
        setPreviewWidth(previewContainerRef.current.clientWidth);
      }
    };
    updatePreviewWidth();
    window.addEventListener('resize', updatePreviewWidth);
    return () => {
      window.removeEventListener('resize', updatePreviewWidth);
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setFilePreviewUrl(objectUrl);

    const fileType = file.type;
    const isPreviewable = fileType.startsWith('video/') || fileType.startsWith('image/') || fileType.startsWith('audio/') || fileType === 'application/pdf' || fileType === 'text/plain';
    const isProcessable = ACCEPTED_FILE_TYPES.includes(`.${file.name.split('.').pop()}`);

    if (isProcessable && !isPreviewable) {
      addNotification(t('previewNotAvailableButProcessable'), 'info');
    }

    return () => URL.revokeObjectURL(objectUrl);
  }, [file, addNotification, t]);

  useEffect(() => {
    const fetchLibraries = async () => {
      try {
        const userLibraries = await getLibraries();
        setLibraries(userLibraries);
      } catch (error) {
        console.error("Failed to fetch libraries:", error);
        addNotification(t('errorLoadingLibraries'), 'error');
      }
    };
    fetchLibraries();
  }, [addNotification, t]);

  useEffect(() => {
    let interval;

    if (pollingJob) {
      interval = setInterval(async () => {
        try {
          const updatedJob = await getMaterialJobStatus(pollingJob.id);
          if (updatedJob.status === 'completed' || updatedJob.status === 'error') {
            // O callback é ASSÍNCRONO: o `clearInterval` só roda depois do await, então
            // um segundo tick pode entrar enquanto o primeiro espera a resposta e tratar
            // a MESMA conclusão de novo (material duplicado no dock + notificação em
            // dobro). O ref marca o job já tratado antes de qualquer efeito colateral.
            if (pollDoneRef.current === pollingJob.id) return;
            pollDoneRef.current = pollingJob.id;
            clearInterval(interval);
            setPollingJob(null);
            setLoading(false);
            if (updatedJob.status === 'completed') {
              // Materiais de estudo (quiz, flashcards, mapa mental, resumo, tabela, caso
              // clínico) abrem no visualizador PERSISTENTE (nível de app), que sobrevive à
              // navegação entre seções.
              openMaterial({
                result: updatedJob,
                materialType: generatedMaterialType,
                sourceName: file?.name || selectedLibrary?.name || '',
                sourceType: file ? t('file') : (selectedLibrary ? t('library') : ''),
                onRedo: () => { if (handleRedoRef.current) handleRedoRef.current(); },
              });
              addNotification(t('materialGeneratedSuccess'), 'success');
            } else {
              addNotification(t('materialGenerationFailed'), 'error');
            }
          }
        } catch (error) {
          clearInterval(interval);
          setPollingJob(null);
          setLoading(false);
          console.error('Polling error:', error);
          addNotification(t('materialGenerationFailed'), 'error');
        }
      }, 5000);
    }

    return () => clearInterval(interval);
    // generatedMaterialType/file/selectedLibrary são lidos por closure (estáveis durante a
    // geração); openMaterial/handleRedoRef são estáveis. Não re-rodar o polling por eles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingJob, addNotification, t]);


  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    const fileExtension = `.${selectedFile.name.split('.').pop().toLowerCase()}`;
    if (!ACCEPTED_FILE_TYPES.includes(fileExtension)) {
      addNotification(t('fileTypeNotSupported'), 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFileContent(null);
    setFile(selectedFile);
    setSelectedLibrary(null);
    setNumPages(null);

    if (selectedFile.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (event) => setFileContent(event.target.result);
      reader.readAsText(selectedFile);
    }
  };

  const handleLibraryChange = (library) => {
    if (library) {
      setSelectedLibrary(library);
      setFile(null);
      setFileContent(null);
      setNumPages(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      setSelectedLibrary(null);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setFileContent(null);
    setNumPages(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGenerateMaterial = async (materialType) => {
    if (!file && !selectedLibrary) {
      addNotification(t('noFileOrLibrarySelected'), 'warning');
      return;
    }

    // Teto do visualizador (dock): materiais de estudo entram no MaterialViewer, que segura no
    // máximo MAX_OPEN_MATERIALS. Checa ANTES de gerar/debitar dracmas e NÃO descarta nada
    // sozinho — pede pro usuário fechar um.
    if (isViewerFull) {
      addNotification(
        t('materialViewerFull', { count: MAX_OPEN_MATERIALS, defaultValue: `Você tem ${MAX_OPEN_MATERIALS} materiais abertos — feche um para abrir outro.` }),
        'warning'
      );
      return;
    }

    // Biblioteca vazia: avisa de forma acionável e nem tenta gerar (sem debitar dracmas nem
    // abrir spinner). Só dispara quando já sabemos a contagem (document_count vindo do backend);
    // se vier undefined (backend antigo), cai no tratamento reativo do catch.
    if (selectedLibrary && !file && selectedLibrary.document_count === 0) {
      addNotification(t('libraryEmptyForMaterial', { name: selectedLibrary.name }), 'warning');
      return;
    }

    setGeneratedMaterialType(materialType);
    setLoading(true);

    try {
      let payload = { material_type: materialType };
      if (file) {
        const uploadData = await uploadFile(file);
        payload.source_type = 'filepath';
        payload.source_value = uploadData.filepath;
      } else if (selectedLibrary) {
        payload.source_type = 'library_id';
        payload.source_value = selectedLibrary.id;
      }

      const processData = await processFile(payload);
      setPollingJob({ id: processData.id, type: materialType });
    } catch (error) {
      console.error('Erro ao gerar material:', error);

      // handleError (api.js) re-lança um Error com .status e, p/ erros acionáveis, .code —
      // não há .response aqui. Trata cada caso com uma mensagem clara em vez do genérico.
      const httpStatus = error?.status ?? error?.response?.status;
      const errorCode = error?.code;
      if (httpStatus === 403) {
        // Restrição de plano → modal de upgrade
        const featureMap = {
          'mind_map': 'premium_content'
        };
        setUpgradeFeature(featureMap[materialType] || 'premium_content');
        setShowUpgradeModal(true);
      } else if (errorCode === 'LIBRARY_EMPTY') {
        addNotification(t('libraryEmptyForMaterial', { name: selectedLibrary?.name || '' }), 'warning');
      } else if (errorCode === 'LIBRARY_PROCESSING') {
        addNotification(t('libraryProcessingForMaterial'), 'info');
      } else if (errorCode === 'LIBRARY_NO_TEXT') {
        addNotification(t('libraryNoTextForMaterial'), 'warning');
      } else {
        addNotification(error?.message || t('materialGenerationFailed'), 'error');
      }
      setLoading(false);
    }
  };

  const handleRedo = () => {
    if (!generatedMaterialType) {
      addNotification(t('errorRedoingMaterial'), 'error');
      return;
    }
    handleGenerateMaterial(generatedMaterialType);
  };

  // Mantém a ref do handleRedo atualizada a cada render (usada pelo visualizador persistente).
  handleRedoRef.current = handleRedo;

  // Determine file extension for conditional card rendering
  const fileExtension = file ? file.name.split('.').pop().toLowerCase() : null;
  const isAudioVideoFile = fileExtension && AUDIO_VIDEO_EXTENSIONS.includes(fileExtension);
  const isTextDocumentFile = fileExtension && TEXT_DOCUMENT_EXTENSIONS.includes(fileExtension);
  const isImageFile = fileExtension && IMAGE_EXTENSIONS.includes(fileExtension);
  const isLibrarySelected = !!selectedLibrary;
  const hasSource = !!file || isLibrarySelected;

  // Check if a material type is compatible with current source
  const isMaterialCompatible = (materialId) => {
    // No source selected - all cards enabled (will show warning on click)
    if (!hasSource) return true;

    // Transcription only works with audio/video files
    if (materialId === 'transcription') {
      return isAudioVideoFile;
    }

    // Slideshow works best with text documents but can work with library
    if (materialId === 'slideshow_only') {
      return isTextDocumentFile || isLibrarySelected;
    }

    // Image files only support limited materials
    if (isImageFile) {
      return ['summary', 'detailed_text', 'clinical_case'].includes(materialId);
    }

    // Audio/video files support all text-generation materials (will be transcribed first)
    // All other materials work with text documents and libraries
    return true;
  };

  const materialTypes = [
    { id: 'transcription', title: t('transcription'), description: t('transcriptionDescription') },
    { id: 'summary', title: t('summary'), description: t('summaryDescription') },
    { id: 'detailed_text', title: t('completeDocumentLesson'), description: t('completeDocumentLessonDescription') },
    { id: 'flashcards', title: t('flashcards'), description: t('flashcardsDescription') },
    { id: 'mind_map', title: t('mindMap'), description: t('mindMapDescription') },
    { id: 'questionnaire_objective', title: t('objectiveQuestionnaire'), description: t('objectiveQuestionnaireDescription') },
    { id: 'questionnaire_subjective', title: t('subjectiveQuestionnaire'), description: t('subjectiveQuestionnaireDescription') },
    { id: 'comparative_table', title: t('comparativeTable'), description: t('comparativeTableDescription') },
    { id: 'clinical_case', title: t('clinicalCase'), description: t('clinicalCaseDescription') },
    { id: 'critical_appraisal', title: t('criticalAppraisal'), description: t('criticalAppraisalDescription') },
    { id: 'slideshow_only', title: t('slideshow'), description: t('slideshowOnlyDescription') },
  ];

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const renderPreview = () => {
    if (!file) return null;
    const fileType = file.type;

    if (fileType.startsWith('video/')) {
      return <video src={filePreviewUrl} controls className={styles.mediaPreview} />;
    }
    if (fileType.startsWith('image/')) {
      return <img src={filePreviewUrl} alt={file.name} className={styles.mediaPreview} />;
    }
    if (fileType.startsWith('audio/')) {
      return <audio src={filePreviewUrl} controls className={styles.audioPreview} />;
    }
    if (fileType === 'application/pdf') {
      // suspense={false}: o react-pdf 11 liga Suspense por padrão, e aí a prop
      // loading abaixo deixa de valer.
      return (
        <Document
          suspense={false}
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={console.error}
          loading={t('loadingPdf')}
        >
          {Array.from(new Array(numPages), (el, index) => (
            <Page
              key={`page_${index + 1}`}
              pageNumber={index + 1}
              width={previewWidth}
              className={styles.pdfPage}
            />
          ))}
        </Document>
      );
    }
    if (fileType === 'text/plain' && fileContent) {
      return <pre className={styles.textPreview}>{fileContent}</pre>;
    }
    return <p className={styles.previewPlaceholder}>{t('previewNotAvailable')}</p>;
  };

  return (
    <div className={`${styles.materialProducer} ${!isSidebarOpen ? styles.adjustedForClosedSidebar : ''}`}>
      <div className={styles.mainContainer}>
        <div className={styles.leftPanel}>
          <div className={styles.sourceSelectionContainer}>
            <div className={`${styles.fileContainer} ${file ? styles.fileSelected : ''}`}>
              <button className={styles.fileUploadButton} onClick={() => fileInputRef.current?.click()}>
                {t('chooseFile')}
              </button>
              <input
                id="fileInput"
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                accept={ACCEPTED_FILE_TYPES}
                style={{ display: 'none' }}
              />
              {file ? (
                <>
                  <span className={styles.fileName} title={file.name}>{file.name}</span>
                  <button onClick={handleRemoveFile} className={styles.removeFileButton} title={t('removeFile')}>×</button>
                </>
              ) : (
                <span className={styles.fileHint}>{t('acceptedFormatsHint', 'PDF, PPTX, TXT, Áudio, Vídeo, Imagens')}</span>
              )}
            </div>
            <div className={styles.orSeparator}>
              <span>{t('or')}</span>
            </div>
            <LibraryDropdown
              libraries={libraries}
              value={selectedLibrary}
              onChange={handleLibraryChange}
              disabled={libraries.length === 0}
            />
          </div>
          <div className={styles.materialGrid}>
            {materialTypes.map(material => {
              const isCompatible = isMaterialCompatible(material.id);
              const isDisabled = !isVerified || (!isCompatible && hasSource);

              return (
                <div
                  key={material.id}
                  className={`
                    ${styles.materialCard}
                    ${!isCompatible && hasSource ? styles.incompatibleCard : ''}
                  `}
                  onClick={() => {
                    if (!isVerified) {
                      addNotification(t('accountVerificationPending', 'Funcionalidade bloqueada durante análise de conta.'), 'warning');
                      return;
                    }
                    if (!isCompatible && hasSource) {
                      addNotification(t('materialNotCompatibleWithSource', 'Este material não é compatível com o tipo de arquivo selecionado.'), 'warning');
                      return;
                    }
                    handleGenerateMaterial(material.id);
                  }}
                  style={{
                    opacity: isDisabled ? 0.4 : 1,
                    cursor: isDisabled ? 'not-allowed' : 'pointer'
                  }}
                  title={
                    !isVerified
                      ? t('accountVerificationPending', 'Aguarde a verificação da conta')
                      : (!isCompatible && hasSource)
                        ? t('materialNotCompatibleWithSource', 'Este material não é compatível com o tipo de arquivo selecionado.')
                        : material.description
                  }
                >
                  <h3 className={styles.cardTitle}>{material.title}</h3>
                  <p className={styles.cardDescription}>{material.description}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className={styles.rightPanel}>
          <div className={styles.previewWrapper}>
            <div className={styles.previewContent} ref={previewContainerRef}>
              {file ? renderPreview() : (
                selectedLibrary ? (
                  <div className={styles.previewPlaceholder}>
                    <p>{t('librarySelected')}: <strong>{selectedLibrary.name}</strong></p>
                    <span>{t('libraryPreviewNotAvailable')}</span>
                  </div>
                ) : (
                  <div className={styles.previewPlaceholder}>
                    <p>{t('selectSourceForPreview')}</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingContent}>
            <div className={styles.typingIndicator}>
              <span className={styles.typingDot}></span>
              <span className={styles.typingDot}></span>
              <span className={styles.typingDot}></span>
            </div>
            <p>{t('generatingMaterial')}</p>
          </div>
        </div>
      )}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onUpgrade={() => {
          setShowUpgradeModal(false);
          navigate('/pricing');
        }}
        feature={upgradeFeature}
        message={t('mindMapUpgradeMessage', 'Mapas Mentais com IA estão disponíveis a partir do Plano Residente.')}
      />
    </div>
  );
}

export default MaterialProducer;
