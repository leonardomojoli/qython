// frontend/src/components/academic/MaterialResultModal.js

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faThumbsUp, faThumbsDown, faCopy, faFilePdf, faFileLines, faShareNodes, faCheck, faFileCode, faExpand, faCompress, faRedo, faDownload, faImage, faArrowsAltV, faArrowsAltH, faFileExport, faChevronDown, faChevronRight, faListUl, faPlay, faEye, faShuffle, faChartBar, faTimes, faCheckCircle, faTimesCircle, faTag, faGraduationCap, faClock, faWindowMinimize } from '@fortawesome/free-solid-svg-icons';
import ReactFlow, { Background, MarkerType, useNodesState, useEdgesState, useReactFlow, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { toPng, toSvg } from 'html-to-image';

import styles from './MaterialResultModal.module.css';
import { useNotification } from '../../contexts/NotificationContext';
import FeedbackModal from '../shared/FeedbackModal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { submitFeedback, api, API_STATIC_URL } from '../../api';
import { handleShareAsTxt, handleShareAsPdf, convertMarkdownToPlainText, handleShareAsMarkdown } from '../shared/ShareComponent';
import InlineLoading from '../shared/InlineLoading';
import InlineMarkdown from '../shared/InlineMarkdown';
import SlideshowPreview from '../academic/SlideshowPreview';
import ClinicalCasePlayer from '../academic/ClinicalCasePlayer';
import CriticalAppraisalViewer from '../academic/CriticalAppraisalViewer';
import AudioWaveformPlayer from '../academic/AudioWaveformPlayer';
import PodcastPlayer from '../academic/PodcastPlayer';
import VideoLessonPlayer from '../academic/VideoLessonPlayer';

// Calculate dynamic node dimensions based on text length
const calculateNodeDimensions = (text) => {
  const charWidth = 8;
  const padding = 32;
  const maxWidth = 280;
  const minWidth = 100;
  const lineHeight = 22;
  const basePadding = 20;

  const textLength = (text || '').length;
  const estimatedWidth = Math.min(Math.max(textLength * charWidth + padding, minWidth), maxWidth);
  const lines = Math.ceil((textLength * charWidth) / (maxWidth - padding));
  const height = Math.max(40, lines * lineHeight + basePadding);

  return { width: estimatedWidth, height };
};

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: isHorizontal ? 40 : 60,
    ranksep: isHorizontal ? 100 : 80
  });

  nodes.forEach((node) => {
    const dimensions = calculateNodeDimensions(node.data?.label);
    dagreGraph.setNode(node.id, { width: dimensions.width, height: dimensions.height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const dimensions = calculateNodeDimensions(node.data?.label);

    node.targetPosition = isHorizontal ? 'left' : 'top';
    node.sourcePosition = isHorizontal ? 'right' : 'bottom';
    node.position = {
      x: nodeWithPosition.x - dimensions.width / 2,
      y: nodeWithPosition.y - dimensions.height / 2,
    };

    // Store dimensions for styling
    node.style = {
      ...node.style,
      width: dimensions.width,
      minHeight: dimensions.height,
    };

    return node;
  });

  return { nodes, edges };
};

// Category color mapping for mind map nodes
const CATEGORY_COLORS = {
  definicao: { bg: 'rgba(99, 102, 241, 0.15)', border: '#6366f1', text: '#4f46e5' },
  fisiopatologia: { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#db2777' },
  quadro_clinico: { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#d97706' },
  diagnostico: { bg: 'rgba(14, 165, 233, 0.15)', border: '#0ea5e9', text: '#0284c7' },
  tratamento: { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', text: '#16a34a' },
  prognostico: { bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7', text: '#9333ea' },
  prevencao: { bg: 'rgba(20, 184, 166, 0.15)', border: '#14b8a6', text: '#0d9488' },
  epidemiologia: { bg: 'rgba(251, 146, 60, 0.15)', border: '#fb923c', text: '#ea580c' },
  default: { bg: 'rgba(107, 114, 128, 0.1)', border: '#6b7280', text: '#4b5563' }
};

const CATEGORY_LABELS = {
  definicao: 'Definição',
  fisiopatologia: 'Fisiopatologia',
  quadro_clinico: 'Quadro Clínico',
  diagnostico: 'Diagnóstico',
  tratamento: 'Tratamento',
  prognostico: 'Prognóstico',
  prevencao: 'Prevenção',
  epidemiologia: 'Epidemiologia'
};

// Outline item component for collapsible mind map outline
const OutlineItem = ({ node, depth = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const hasChildren = node.filhos && node.filhos.length > 0;
  const categoryColor = CATEGORY_COLORS[node.categoria] || CATEGORY_COLORS.default;

  return (
    <div className={styles.outlineItem} style={{ paddingLeft: `${depth * 16}px` }}>
      <div
        className={styles.outlineItemHeader}
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
        style={{ cursor: hasChildren ? 'pointer' : 'default' }}
      >
        {hasChildren && (
          <FontAwesomeIcon
            icon={isExpanded ? faChevronDown : faChevronRight}
            className={styles.outlineChevron}
          />
        )}
        <span
          className={styles.outlineItemTitle}
          style={{
            borderLeft: node.categoria ? `3px solid ${categoryColor.border}` : 'none',
            paddingLeft: node.categoria ? '8px' : '0'
          }}
        >
          {node.titulo}
        </span>
        {node.importancia === 'alta' && (
          <span className={styles.outlineImportance}>!</span>
        )}
      </div>
      {node.descricao && (
        <div className={styles.outlineItemDescription}>
          {node.descricao}
        </div>
      )}
      {isExpanded && hasChildren && (
        <div className={styles.outlineChildren}>
          {node.filhos.map((child, idx) => (
            <OutlineItem key={idx} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

// Mind map image view component with outline panel
const MindMapImageView = ({ mindMapImage, mindMapData, t }) => {
  const [showOutline, setShowOutline] = useState(false);

  return (
    <div className={styles.mindMapContainer}>
      {/* Mind Map Image */}
      <div className={styles.mindMapImageContainer}>
        <img
          src={`data:image/png;base64,${mindMapImage}`}
          alt="Mapa Mental"
          className={styles.mindMapImage}
        />
      </div>

      {/* Outline toggle button */}
      <div className={styles.mindMapImageControls}>
        <button
          className={`${styles.mindMapControlButton} ${showOutline ? styles.active : ''}`}
          onClick={() => setShowOutline(!showOutline)}
          title={showOutline ? t('hideOutline') : t('showOutline')}
        >
          <FontAwesomeIcon icon={faListUl} />
          <span>{showOutline ? t('hideOutline') : 'Outline'}</span>
        </button>
      </div>

      {/* Collapsible Outline Panel */}
      {showOutline && mindMapData && (
        <div className={styles.mindMapOutlinePanel}>
          <div className={styles.outlineCentralTheme}>
            <strong>{mindMapData.tema_central}</strong>
            {mindMapData.descricao && (
              <p className={styles.outlineCentralDescription}>{mindMapData.descricao}</p>
            )}
          </div>
          <div className={styles.outlineContent}>
            {mindMapData.nos?.map((node, idx) => (
              <OutlineItem key={idx} node={node} depth={0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Custom node component with tooltip support
const MindMapCustomNode = ({ data }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const colors = CATEGORY_COLORS[data.categoria] || CATEGORY_COLORS.default;

  const importanceIndicator = data.importancia === 'alta' ? '●●●' :
                              data.importancia === 'media' ? '●●' :
                              data.importancia === 'baixa' ? '●' : null;

  const nodeStyle = data.isCentral ? {} : {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: data.isBranch ? '2px' : '1px',
  };

  return (
    <div
      className={`${data.isCentral ? styles.mindMapCentralThemeNode : data.isBranch ? styles.mindMapBranchNode : styles.mindMapDefaultNode} ${styles.mindMapEnhancedNode}`}
      style={nodeStyle}
      onMouseEnter={() => data.descricao && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={styles.mindMapNodeContent}>
        <span className={styles.mindMapNodeLabel}>{data.label}</span>
        {importanceIndicator && !data.isCentral && (
          <span className={styles.mindMapImportanceIndicator} style={{ color: colors.border }}>
            {importanceIndicator}
          </span>
        )}
      </div>
      {showTooltip && data.descricao && (
        <div className={styles.mindMapTooltip}>
          {data.descricao}
        </div>
      )}
    </div>
  );
};

const nodeTypes = { mindMapNode: MindMapCustomNode };

const MindMapFlow = ({ mindMapData, layoutDirection = 'TB' }) => {
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const buildMindMapData = useCallback(() => {
    if (!mindMapData) return { nodes: [], edges: [] };

    const initialNodes = [];
    const initialEdges = [];
    let nodeId = 1;

    const centralNodeId = `node-${nodeId++}`;
    initialNodes.push({
      id: centralNodeId,
      type: 'mindMapNode',
      data: {
        label: mindMapData.tema_central,
        descricao: mindMapData.descricao,
        isCentral: true
      },
      position: { x: 0, y: 0 },
    });

    const addNodesAndEdges = (parentNode, parentId, parentCategoria, depth = 1) => {
      if (!parentNode.filhos) return;
      parentNode.filhos.forEach(childNode => {
        const childId = `node-${nodeId++}`;
        const categoria = childNode.categoria || parentCategoria;
        const colors = CATEGORY_COLORS[categoria] || CATEGORY_COLORS.default;

        initialNodes.push({
          id: childId,
          type: 'mindMapNode',
          data: {
            label: childNode.titulo,
            categoria: categoria,
            importancia: childNode.importancia,
            descricao: childNode.descricao,
            isBranch: false
          },
          position: { x: 0, y: 0 },
        });
        initialEdges.push({
          id: `edge-${parentId}-${childId}`,
          source: parentId,
          target: childId,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: colors.border },
          style: { stroke: colors.border, strokeWidth: 2, opacity: 1 },
        });
        addNodesAndEdges(childNode, childId, categoria, depth + 1);
      });
    };

    mindMapData.nos.forEach(branch => {
      const branchId = `node-${nodeId++}`;
      const colors = CATEGORY_COLORS[branch.categoria] || CATEGORY_COLORS.default;

      initialNodes.push({
        id: branchId,
        type: 'mindMapNode',
        data: {
          label: branch.titulo,
          categoria: branch.categoria,
          importancia: branch.importancia,
          descricao: branch.descricao,
          isBranch: true
        },
        position: { x: 0, y: 0 },
      });
      initialEdges.push({
        id: `edge-${centralNodeId}-${branchId}`,
        source: centralNodeId,
        target: branchId,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: colors.border },
        style: { stroke: colors.border, strokeWidth: 2.5 },
      });
      addNodesAndEdges(branch, branchId, branch.categoria, 1);
    });

    return { nodes: initialNodes, edges: initialEdges };
  }, [mindMapData]);

  useEffect(() => {
    const { nodes: initialNodes, edges: initialEdges } = buildMindMapData();
    if (initialNodes.length > 0) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(initialNodes, initialEdges, layoutDirection);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }
  }, [mindMapData, layoutDirection, buildMindMapData, setNodes, setEdges]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.15 });
    }, 100);
    return () => clearTimeout(timer);
  }, [nodes, fitView]);

  // Extract unique categories for legend
  const categories = mindMapData?.nos?.map(n => n.categoria).filter(Boolean) || [];
  const uniqueCategories = [...new Set(categories)];

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background variant="dots" gap={24} size={1} color="var(--text-muted)" />
      </ReactFlow>
      {uniqueCategories.length > 0 && (
        <div className={styles.mindMapLegend}>
          {uniqueCategories.map(cat => {
            const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS.default;
            return (
              <div key={cat} className={styles.mindMapLegendItem}>
                <span
                  className={styles.mindMapLegendColor}
                  style={{ backgroundColor: colors.border }}
                />
                <span className={styles.mindMapLegendLabel}>
                  {CATEGORY_LABELS[cat] || cat}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

const ResizableReactFlow = ({ mindMapData, onExportReady, addNotification, t }) => {
  const containerRef = useRef(null);
  const flowRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [layoutDirection, setLayoutDirection] = useState('TB');

  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      if (entries && entries.length > 0) {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, []);

  // Register export function with parent component
  useEffect(() => {
    if (onExportReady) {
      const exportHandler = async (format) => {
        const flowElement = flowRef.current?.querySelector('.react-flow__viewport');
        if (!flowElement) {
          addNotification?.(t?.('exportError') || 'Export failed', 'error');
          return;
        }

        try {
          const exportFn = format === 'png' ? toPng : toSvg;
          const dataUrl = await exportFn(flowElement, {
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--background-secondary').trim() || '#1a1a2e',
            quality: 1,
            pixelRatio: 2,
          });

          const link = document.createElement('a');
          link.download = `mapa_mental_${Date.now()}.${format}`;
          link.href = dataUrl;
          link.click();

          addNotification?.(t?.('exportSuccess') || 'Export successful', 'success');
        } catch (error) {
          console.error('Export error:', error);
          addNotification?.(t?.('exportError') || 'Export failed', 'error');
        }
      };
      onExportReady(exportHandler);
    }
  }, [onExportReady, addNotification, t]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Mind Map Controls - Layout only */}
      <div className={styles.mindMapControls}>
        <div className={styles.layoutToggle}>
          <button
            onClick={() => setLayoutDirection('TB')}
            className={`${styles.layoutButton} ${layoutDirection === 'TB' ? styles.active : ''}`}
            title={t?.('verticalLayout') || 'Vertical'}
          >
            <FontAwesomeIcon icon={faArrowsAltV} />
          </button>
          <button
            onClick={() => setLayoutDirection('LR')}
            className={`${styles.layoutButton} ${layoutDirection === 'LR' ? styles.active : ''}`}
            title={t?.('horizontalLayout') || 'Horizontal'}
          >
            <FontAwesomeIcon icon={faArrowsAltH} />
          </button>
        </div>
      </div>

      <div ref={flowRef} style={{ width: '100%', height: '100%' }}>
        {dimensions.width > 0 && dimensions.height > 0 && (
          <ReactFlowProvider>
            <MindMapFlow mindMapData={mindMapData} layoutDirection={layoutDirection} />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
};

// Pontuação: "39" em vez de "39.0"; "1,5" com vírgula (pt-BR e afins)
const formatPoints = (n) => {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(1).replace('.', ',');
};

// examMode (Meus Concursos): simulação do dia da prova — abre DIRETO no quiz, sem tags de
// dificuldade/tema, sem embaralhar, sem copiar/compartilhar até ENTREGAR a prova.
const MaterialResultModal = ({ isOpen, onClose, result, job, onClearJob, sourceName, sourceType, materialType, onRedo, trainingNote, timeLimitMinutes = null, examMode = false, scoring = null, initialAttempt = null, onSaveAttempt = null, isMinimized = false, onMinimize, onRestore, stackIndex = 0 }) => {
  const { t, i18n } = useTranslation();
  const { addNotification } = useNotification();

  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState(null);
  
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const shareMenuRef = useRef(null);

  const [flippedCardIndex, setFlippedCardIndex] = useState(null);
  const [visibleHintIndex, setVisibleHintIndex] = useState(null);

  // Semeado a partir do DOM: se o container do portal já está em tela cheia (ex.: o React
  // remontou o conteúdo do modal), o estado nasce coerente em vez de voltar pra "janela".
  const [isFullScreen, setIsFullScreen] = useState(
    () => typeof document !== 'undefined' && !!document.fullscreenElement && document.fullscreenElement === document.getElementById('modal-portal')
  );
  const modalContentRef = useRef(null);
  const ownsFullScreenRef = useRef(false);

  // Textos-base (formato clássico de banca: "Texto I" ancorando 2-4 questões).
  // Ficam no topo do content e as questões apontam para o rótulo.
  const supportTexts = React.useMemo(() => {
    const raw = result?.content?.textos_base;
    const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
    const map = {};
    list.forEach((t) => {
      const key = String(t?.rotulo || '').trim().toLowerCase();
      if (key && String(t?.conteudo || '').trim()) map[key] = t;
    });
    return map;
  }, [result]);
  const supportTextFor = (q) => supportTexts[String(q?.texto_base || '').trim().toLowerCase()];

  const [isCloseConfirmationModalOpen, setIsCloseConfirmationModalOpen] = useState(false);

  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef(null);

  // Mind map export handler (for ReactFlow fallback)
  const [mindMapExportHandler, setMindMapExportHandler] = useState(null);

  // Quiz mode states
  const [quizMode, setQuizMode] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizFinishedOnce, setQuizFinishedOnce] = useState(false); // examMode: já entregou ao menos 1×
  const [confirmRetakeOpen, setConfirmRetakeOpen] = useState(false); // examMode: refazer a MESMA prova
  const [shuffledQuestions, setShuffledQuestions] = useState(null);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  // Modo treino: questões cuja resposta o usuário "confirmou" p/ ver acerto/erro +
  // justificativa NA HORA (índice → true). Sem confirmar, só revela no fim (igual simulado).
  const [revealedQuestions, setRevealedQuestions] = useState({});
  const [quizStartTime, setQuizStartTime] = useState(null);
  const [quizElapsedTime, setQuizElapsedTime] = useState(0);

  // Comparative table states
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const [hoveredAbbreviation, setHoveredAbbreviation] = useState(null);
  const tableRef = useRef(null);

  // Podcast script state
  const [podcastScript, setPodcastScript] = useState(null);

  useEffect(() => {
    if (materialType === 'podcast' && job?.status === 'completed') {
      setAudioDuration(0);

      // Fetch podcast script if available
      if (job.script_path) {
        const scriptUrl = `${API_STATIC_URL}/${job.script_path.replace(/\\/g, '/')}`;
        fetch(scriptUrl)
          .then(res => res.text())
          .then(text => setPodcastScript(text))
          .catch(err => console.warn('Could not load podcast script:', err));
      }
    }
  }, [job, materialType]);

  // Timer for quiz mode.
  // Conta a partir do tempo já ACUMULADO (quizElapsedTime) em vez de (agora - início):
  // assim, ao minimizar o modal (isMinimized), o intervalo é limpo e o cronômetro PAUSA;
  // ao restaurar, reancora em (agora - acumulado) e retoma sem saltar o tempo em que o
  // usuário esteve fora (ex.: consultando o Copiloto). É estudo, não prova cronometrada.
  useEffect(() => {
    if (!(quizMode && !quizSubmitted && quizStartTime) || isMinimized) {
      return undefined;
    }
    const anchor = Date.now() - quizElapsedTime * 1000;
    const timer = setInterval(() => {
      setQuizElapsedTime(Math.floor((Date.now() - anchor) / 1000));
    }, 1000);
    return () => clearInterval(timer);
    // quizElapsedTime é lido só como base de retomada quando o efeito re-roda pelas deps
    // abaixo; incluí-lo recriaria o intervalo a cada segundo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizMode, quizSubmitted, quizStartTime, isMinimized]);

  // Cronômetro REGRESSIVO (Meus Concursos: card com tempo de prova definido).
  // Ao zerar, a prova é entregue automaticamente — treino em condição real de prova.
  const countdownRemaining = timeLimitMinutes
    ? Math.max(0, timeLimitMinutes * 60 - quizElapsedTime)
    : null;
  useEffect(() => {
    if (!quizMode || quizSubmitted || !timeLimitMinutes) return;
    if (quizElapsedTime >= timeLimitMinutes * 60) {
      deliverExam(true);
      addNotification(t('mcTimeUp'), 'warning');
    }
    // deliverExam re-cria a cada render; o efeito já re-roda a cada segundo (quizElapsedTime)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizMode, quizSubmitted, quizElapsedTime, timeLimitMinutes, addNotification, t]);

  // Reset quiz when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setQuizMode(false);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setShuffledQuestions(null);
      setCurrentQuizIndex(0);
      setQuizStartTime(null);
      setQuizElapsedTime(0);
      setQuizFinishedOnce(false);
    }
  }, [isOpen]);

  // examMode: prova já ENTREGUE → restaura o resultado salvo (fechar = entregar);
  // sem entrega → abre DIRETO no quiz (responder não é opcional)
  useEffect(() => {
    if (!isOpen || !examMode || quizMode || quizFinishedOnce) return;
    const raw = result?.content?.questionario_objetivo;
    const objQuestions = Array.isArray(raw) ? raw : Object.values(raw || {});
    if (objQuestions.length === 0) return;
    if (initialAttempt && initialAttempt.answers) {
      setShuffledQuestions(objQuestions);
      setQuizAnswers(initialAttempt.answers || {});
      setQuizElapsedTime(initialAttempt.elapsed_seconds || 0);
      setQuizMode(true);
      setQuizSubmitted(true);
      setQuizFinishedOnce(true);
    } else {
      startQuizMode(objQuestions);
    }
    // startQuizMode é estável o suficiente p/ este gatilho one-shot por abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, examMode, quizMode, quizFinishedOnce, result, initialAttempt]);

  const handleAttemptClose = () => {
    if (
      (materialType === 'podcast' || materialType === 'video_lesson') &&
      job &&
      (job.status === 'pending' || job.status === 'processing')
    ) {
      onClose();
      return;
    }
    // examMode: prova JÁ entregue → fecha direto (o resultado está salvo e volta
    // pelo "Abrir" em Ver provas). Confirmar só faz sentido durante a prova.
    if (examMode && quizSubmitted) {
      onClose();
      return;
    }
    setIsCloseConfirmationModalOpen(true);
  };

  const handleConfirmClose = async () => {
    if ((materialType === 'podcast' || materialType === 'video_lesson') && job && job.id) {
      try {
        // Use the onClearJob function passed from the parent to handle deletion.
        if (onClearJob) {
          onClearJob();
        }
      } catch (error) {
        const errorType = materialType === 'podcast' ? 'podcast' : 'video_lesson';
        console.error(`Erro ao deletar o job do ${errorType}:`, error);
        const errorKey = materialType === 'podcast' ? 'errorDeletingPodcast' : 'errorDeletingVideoLesson';
        addNotification(t(errorKey, `Error deleting ${errorType} job`), 'error');
      }
    }
    // examMode: fechar no meio da prova = ENTREGAR com as respostas marcadas
    if (examMode && quizMode && !quizSubmitted) {
      deliverExam(false);
    }
    setIsCloseConfirmationModalOpen(false);
    onClose();
  };

  const handleCancelClose = () => {
    setIsCloseConfirmationModalOpen(false);
  };

  // Tela cheia: o alvo é o CONTAINER do portal (#modal-portal), NÃO o nó do modal.
  // O navegador SAI da tela cheia sozinho assim que o elemento em fullscreen é removido
  // ou reinserido no DOM — e o conteúdo do modal é gerenciado pelo React (re-render a cada
  // segundo pelo cronômetro, diálogos de confirmação que entram/saem do mesmo container,
  // etc.), então qualquer movimentação derrubava a tela cheia "sozinha" após alguns segundos.
  // O container é estático (index.html) e o React nunca o remove nem o move.
  // Bônus: os diálogos de confirmação/feedback (irmãos NO MESMO container) passam a ficar
  // visíveis em tela cheia — antes ficavam fora do elemento fullscreen, ou seja, invisíveis.
  const getFullScreenTarget = useCallback(
    () => document.getElementById('modal-portal') || modalContentRef.current,
    []
  );

  const toggleFullScreen = () => {
    const target = getFullScreenTarget();
    if (!target) return;
    if (!document.fullscreenElement) {
      ownsFullScreenRef.current = true;
      target.requestFullscreen().catch(err => {
        ownsFullScreenRef.current = false;
        addNotification(`${t('enterFullScreen')}: ${err.message}`, 'error');
      });
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    // Montou com o container JÁ em tela cheia (remonte do conteúdo): herda a posse,
    // senão ninguém encerraria a tela cheia ao fechar o modal.
    if (document.fullscreenElement === getFullScreenTarget()) ownsFullScreenRef.current = true;
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === getFullScreenTarget();
      if (!active) ownsFullScreenRef.current = false;
      setIsFullScreen(active);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [getFullScreenTarget]);

  // Como o alvo do fullscreen agora SOBREVIVE ao modal, é preciso sair explicitamente ao
  // fechar/minimizar — senão o usuário ficaria numa tela cheia vazia. `ownsFullScreenRef`
  // garante que só quem PEDIU a tela cheia a encerra (no dock há várias instâncias vivas).
  useEffect(() => {
    const exitIfOurs = () => {
      if (ownsFullScreenRef.current && document.fullscreenElement === document.getElementById('modal-portal')) {
        document.exitFullscreen?.();
      }
    };
    if (!isOpen || isMinimized) exitIfOurs();
    return exitIfOurs;
  }, [isOpen, isMinimized]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (shareMenuOpen && shareMenuRef.current && !shareMenuRef.current.contains(event.target) && !event.target.closest('[data-share-button]')) {
        setShareMenuOpen(false);
      }
    }
    if (shareMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [shareMenuOpen]);

  if (!isOpen) {
    return null;
  }

  const handleFeedbackSubmit = async (type, comment = '', contactPermission = false) => {
    try {
      const payload = {
        feedback_type: type,
        content_type: materialType || 'material_gerado',
        training_data_id: (result && result.training_data_id) || (job && job.training_data_id) || null,
        original_content: JSON.stringify(result || job),
        feedback_text: comment,
        contact_permission: contactPermission,
      };
      await submitFeedback(payload);
      addNotification(t('feedbackSentSuccess'), 'success');
    } catch (error) {
      addNotification(t('errorSendingFeedback'), 'error');
    } finally {
      setIsFeedbackModalOpen(false);
    }
  };

  const handleFeedbackClick = (type) => {
    setFeedbackType(type);
    if (type === 'like') {
      handleFeedbackSubmit('like');
    } else {
      setIsFeedbackModalOpen(true);
    }
  };

  const getContentForCopyAndShare = () => {
    if (!result || !result.content) {
      if (materialType === 'podcast' && job?.status === 'completed') {
        return t('podcastAudioNotCopyable');
      }
      return JSON.stringify(result || job, null, 2);
    }
  
    const { content } = result;
  
    switch (materialType) {
      case 'summary':
      case 'detailed_text':
      case 'slideshow':
        return content.summary || content.detailed_text || content.slideshow_markdown;
  
      case 'flashcards':
        if (!content.flashcards) return '';
        return content.flashcards
          .map((card, index) => `Flashcard ${index + 1}\nFrente: ${card.frente}\nVerso: ${card.verso}`)
          .join('\n\n');
  
      case 'mind_map':
        if (!content.mapa_mental) return '';
        const mindMapToString = (node, depth = 0) => {
          let str = `${'  '.repeat(depth)}- ${node.titulo}\n`;
          if (node.filhos) {
            str += node.filhos.map(child => mindMapToString(child, depth + 1)).join('');
          }
          return str;
        };
        return `${content.mapa_mental.tema_central}\n` + content.mapa_mental.nos.map(node => mindMapToString(node)).join('');
  
      case 'questionnaire_objective':
      case 'questionnaire_subjective':
        let fullText = '';
        const objectiveQuestions = content.questionario_objetivo || [];
        const subjectiveQuestions = content.questionario_subjetivo || [];
  
        if (objectiveQuestions.length > 0) {
          fullText += `${t('objectiveQuestions').toUpperCase()}\n\n`;
          objectiveQuestions.forEach((q, index) => {
            // Número em NEGRITO (não item de lista markdown): caso contrário o
            // markdown reinicia a numeração a cada questão e todas viram "1." no PDF.
            // Dois espaços ao final de cada linha = quebra de linha "hard" no markdown,
            // pondo cada alternativa em sua própria linha (antes vinham em linha corrida).
            fullText += `**${index + 1}.** ${q.pergunta}\n\n`;
            q.alternativas.forEach((alt, i) => {
              fullText += `${String.fromCharCode(97 + i)}) ${alt}  \n`;
            });
            fullText += `\n${t('correctAlternative')}: **${q.resposta_correta.toUpperCase()}**  \n`;
            fullText += `${t('justification')}: ${q.justificativa}\n\n`;
          });
        }
  
        if (subjectiveQuestions.length > 0) {
          fullText += `${t('subjectiveQuestions').toUpperCase()}\n\n`;
          subjectiveQuestions.forEach((q, index) => {
            fullText += `**${index + 1}.** ${q.pergunta}\n\n`;
            fullText += `${t('expectedAnswer')}: ${q.resposta_esperada}\n\n`;
          });
        }
        return fullText;
  
      default:
        return JSON.stringify(content, null, 2);
    }
  };

  const handleCopyToClipboard = () => {
    try {
      const contentToCopy = getContentForCopyAndShare();
      const plainText = convertMarkdownToPlainText(contentToCopy);
      navigator.clipboard.writeText(plainText);
      setActionSuccess('copy');
      setTimeout(() => setActionSuccess(null), 2000);
    } catch (error) {
      addNotification(t('errorCopying'), 'error');
    }
  };

  const handleShareAction = async (shareFn, exportType) => {
    setShareMenuOpen(false);
    const contentToShare = getContentForCopyAndShare();
    try {
      const success = await shareFn(contentToShare, sourceName, t, addNotification, i18n);
      if (success) {
        addNotification(t('exportSuccess'), 'success');
        setActionSuccess('share');
        setTimeout(() => setActionSuccess(null), 2000);
      } else {
        addNotification(t('exportError'), 'error');
      }
    } catch (error) {
      console.error(`Error sharing as ${exportType}:`, error);
      addNotification(t('exportError'), 'error');
    }
  };

  // Unified download logic for any media file.
  const handleDownloadMedia = () => {
    if (job && job.result_path) {
      const mediaUrl = `${API_STATIC_URL}/${job.result_path.replace(/\\/g, '/')}`;
      const link = document.createElement('a');
      link.href = mediaUrl;
      const filename = job.result_path.split('/').pop() || 'media_file';
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addNotification(t('downloadStarted'), 'success');
    }
  };

  const handleDownloadPptx = () => {
    if (result?.content?.slideshow_file_path) {
      const fileUrl = `${API_STATIC_URL}/${result.content.slideshow_file_path}`;
      const link = document.createElement('a');
      link.href = fileUrl;
      link.setAttribute('download', sourceName.replace(/ /g, '_') + '.pptx');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addNotification(t('exportSuccess'), 'success');
    } else {
      addNotification(t('exportError'), 'error');
    }
  };

  const handleExportSlideshowAsPdf = async () => {
    if (!result || !result.id) {
      addNotification(t('exportError'), 'error');
      return;
    }

    try {
      addNotification(t('pdfExportStarted'), 'info');

      const response = await api.post('/export/slideshow-to-pdf', 
        { material_id: result.id }, 
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const safeSourceName = result.content?.slideshow_content?.title
        ?.replace(/ /g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '') || 'presentation';
      
      link.setAttribute('download', `${safeSourceName}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addNotification(t('exportSuccess'), 'success');

    } catch (error) {
      console.error("Error exporting slideshow to PDF:", error);
      addNotification(t('pdfExportError'), 'error');
    }
  };

  const handleExportToAnki = async () => {
    if (!result?.id) {
      addNotification(t('exportError'), 'error');
      return;
    }

    try {
      addNotification(t('ankiExportStarted'), 'info');

      const response = await api.post('/export/flashcards-to-anki',
        { material_id: result.id, deck_name: sourceName || 'Qython Flashcards' },
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(sourceName || 'flashcards').replace(/[^a-zA-Z0-9]/g, '_')}.apkg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      addNotification(t('ankiExportSuccess'), 'success');
    } catch (error) {
      console.error('Anki export error:', error);
      addNotification(t('ankiExportError'), 'error');
    }
  };

  const handleExportFlashcardsPdf = async () => {
    if (!result?.id) {
      addNotification(t('exportError'), 'error');
      return;
    }

    try {
      addNotification(t('pdfExportStarted'), 'info');

      const language = i18n.language.split('-')[0];
      const response = await api.post('/export/flashcards-to-pdf',
        { material_id: result.id, language },
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      window.URL.revokeObjectURL(url);

      addNotification(t('pdfExportSuccess'), 'success');
    } catch (error) {
      console.error('Flashcards PDF export error:', error);
      addNotification(t('pdfExportError'), 'error');
    }
  };

  // Questionário → PDF dedicado (retrato fiel do modo não-quiz: badges, alternativas
  // e Gabarito ao fim). Vai pro renderizador estruturado, não pro markdown genérico.
  const handleExportQuestionnairePdf = async () => {
    if (!result?.id) {
      addNotification(t('exportError'), 'error');
      return;
    }

    try {
      addNotification(t('pdfExportStarted'), 'info');

      const language = i18n.language.split('-')[0];
      const response = await api.post('/export/questionnaire-to-pdf',
        { material_id: result.id, language },
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      window.URL.revokeObjectURL(url);

      addNotification(t('pdfExportSuccess'), 'success');
    } catch (error) {
      console.error('Questionnaire PDF export error:', error);
      addNotification(t('pdfExportError'), 'error');
    }
  };

  const renderSupportText = (q) => {
    const texto = supportTextFor(q);
    if (!texto) return null;
    return (
      <div className={styles.supportText}>
        <div className={styles.supportTextHeader}>{texto.rotulo}</div>
        <div className={styles.supportTextBody}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {texto.conteudo}
          </ReactMarkdown>
        </div>
        {texto.fonte && <div className={styles.supportTextSource}>{texto.fonte}</div>}
      </div>
    );
  };

  const getDifficultyClass = (difficulty) => {
    switch (difficulty) {
      case 'facil': return styles.difficultyEasy;
      case 'dificil': return styles.difficultyHard;
      default: return styles.difficultyMedium;
    }
  };

  const getCategoryLabel = (category) => {
    const labels = {
      'fisiopatologia': 'Fisiopatologia',
      'quadro_clinico': 'Quadro Clínico',
      'diagnostico': 'Diagnóstico',
      'tratamento': 'Tratamento',
      'farmacologia': 'Farmacologia',
      'epidemiologia': 'Epidemiologia',
      'prevencao': 'Prevenção',
      'anatomia': 'Anatomia',
      'fisiologia': 'Fisiologia',
      'semiologia': 'Semiologia',
      // Saúde coletiva / gestão (bibliotecas não-clínicas, ex.: PNAB/APS/SUS)
      'saude_coletiva': 'Saúde Coletiva',
      'politicas_de_saude': 'Políticas de Saúde',
      'atencao_primaria': 'Atenção Primária',
      'gestao_em_saude': 'Gestão em Saúde',
      'financiamento_saude': 'Financiamento',
      'vigilancia_em_saude': 'Vigilância em Saúde',
      'promocao_da_saude': 'Promoção da Saúde',
      'etica_e_legislacao': 'Ética e Legislação'
    };
    // Fallback: humaniza qualquer tópico fora do mapa (snake_case → "Título Limpo")
    // em vez de exibir o valor cru tipo "politicas_de_saude".
    if (labels[category]) return labels[category];
    if (!category) return category;
    // Capitaliza por PALAVRA (split em espaço), não por \b: com regex ASCII, "ç"/"ã" contam
    // como fronteira e viravam "SegurançA Da InformaçãO".
    return String(category)
      .replace(/_/g, ' ')
      .split(' ')
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(' ');
  };

  const getDifficultyLabel = (difficulty) => {
    const labels = {
      'facil': t('easy', 'Fácil'),
      'medio': t('medium', 'Médio'),
      'dificil': t('hard', 'Difícil')
    };
    return labels[difficulty] || difficulty;
  };

  // Shuffle array helper (Fisher-Yates)
  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Shuffle alternatives for a question and track the correct answer mapping
  const shuffleAlternatives = (question) => {
    const alternatives = question.alternativas.map((alt, idx) => ({
      text: alt,
      originalIndex: idx
    }));
    const shuffled = shuffleArray(alternatives);
    const originalCorrectIndex = question.resposta_correta.charCodeAt(0) - 97; // 'a' = 0, 'b' = 1, etc.
    const newCorrectIndex = shuffled.findIndex(a => a.originalIndex === originalCorrectIndex);
    return {
      ...question,
      alternativas: shuffled.map(a => a.text),
      resposta_correta: String.fromCharCode(97 + newCorrectIndex),
      _shuffled: true
    };
  };

  // Start quiz mode
  const startQuizMode = (questions) => {
    let questionsToUse = [...questions];
    if (shuffleEnabled) {
      questionsToUse = shuffleArray(questionsToUse).map(q => shuffleAlternatives(q));
    }
    setShuffledQuestions(questionsToUse);
    setQuizMode(true);
    setQuizAnswers({});
    setRevealedQuestions({});
    setQuizSubmitted(false);
    setCurrentQuizIndex(0);
    setQuizStartTime(Date.now());
    setQuizElapsedTime(0);
  };

  // Submit quiz and calculate score
  const submitQuiz = () => {
    deliverExam(false);
  };

  // Calculate quiz statistics
  const calculateQuizStats = (questions) => {
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    const byTopic = {};
    const byDifficulty = { facil: { correct: 0, total: 0 }, medio: { correct: 0, total: 0 }, dificil: { correct: 0, total: 0 } };

    questions.forEach((q, idx) => {
      const userAnswer = quizAnswers[idx];
      const isCorrect = userAnswer === q.resposta_correta;

      if (userAnswer === undefined) {
        unanswered++;
      } else if (isCorrect) {
        correct++;
      } else {
        incorrect++;
      }

      // Stats by topic
      if (q.topico) {
        if (!byTopic[q.topico]) {
          byTopic[q.topico] = { correct: 0, total: 0 };
        }
        byTopic[q.topico].total++;
        if (isCorrect) byTopic[q.topico].correct++;
      }

      // Stats by difficulty
      if (q.dificuldade && byDifficulty[q.dificuldade]) {
        byDifficulty[q.dificuldade].total++;
        if (isCorrect) byDifficulty[q.dificuldade].correct++;
      }
    });

    return {
      correct,
      incorrect,
      unanswered,
      total: questions.length,
      percentage: Math.round((correct / questions.length) * 100),
      byTopic,
      byDifficulty,
      elapsedTime: quizElapsedTime
    };
  };

  // Entrega da prova (examMode): marca entregue, libera as ferramentas e PERSISTE a
  // tentativa no material (fechar/cronômetro/finalizar — todos entregam por aqui)
  const deliverExam = (autoDelivered) => {
    setQuizSubmitted(true);
    setQuizFinishedOnce(true);
    if (examMode && onSaveAttempt) {
      const qs = shuffledQuestions || [];
      const stats = calculateQuizStats(qs);
      onSaveAttempt({
        answers: quizAnswers,
        correct: stats.correct,
        incorrect: stats.incorrect,
        unanswered: stats.unanswered,
        total: qs.length,
        elapsed_seconds: quizElapsedTime,
        auto_delivered: !!autoDelivered,
      });
    }
  };

  // Pontuação ponderada por bloco (examMode + blueprint): pontos, mínimos por matéria e
  // nota de corte. Sem blueprint, retorna null e a tela segue por acertos.
  const computeScoring = (questions) => {
    const blocks = scoring?.blueprint;
    if (!examMode || !Array.isArray(blocks) || blocks.length === 0) return null;

    const byLabel = new Map();
    blocks.forEach((b) => {
      const label = (b.label || '').trim();
      if (!label) return;
      byLabel.set(label, {
        label,
        weight: b.weight === undefined || b.weight === null || b.weight === '' ? 1 : Number(b.weight) || 0,
        minCorrect: b.min_correct === undefined || b.min_correct === null || b.min_correct === '' ? null : Number(b.min_correct),
        correct: 0,
        total: 0,
      });
    });
    if (byLabel.size === 0) return null;

    questions.forEach((q, idx) => {
      const entry = byLabel.get((q.bloco || '').trim());
      if (!entry) return;
      entry.total += 1;
      if (quizAnswers[idx] === q.resposta_correta) entry.correct += 1;
    });

    const rows = [...byLabel.values()].filter((r) => r.total > 0).map((r) => ({
      ...r,
      points: r.correct * r.weight,
      maxPoints: r.total * r.weight,
      eliminated: r.minCorrect !== null && r.correct < r.minCorrect,
    }));
    if (rows.length === 0) return null;

    const points = rows.reduce((s, r) => s + r.points, 0);
    const maxPoints = rows.reduce((s, r) => s + r.maxPoints, 0);
    const eliminatedIn = rows.filter((r) => r.eliminated);
    const passingScore = scoring?.passingScore ?? null;
    return {
      rows,
      points,
      maxPoints,
      percentage: maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 0,
      eliminatedIn,
      passingScore,
      passed: passingScore === null ? null : (eliminatedIn.length === 0 && points >= passingScore),
    };
  };

  // Format time for display
  const formatQuizTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Copy individual question to clipboard
  const copyQuestionToClipboard = (question, index, isObjective = true) => {
    let text = `${index + 1}. ${question.pergunta}\n`;
    if (isObjective && question.alternativas) {
      question.alternativas.forEach((alt, i) => {
        text += `   ${String.fromCharCode(97 + i)}) ${alt}\n`;
      });
      text += `\n${t('correctAlternative')}: ${question.resposta_correta.toUpperCase()}\n`;
      text += `${t('justification')}: ${question.justificativa}\n`;
    } else {
      text += `\n${t('expectedAnswer')}: ${question.resposta_esperada}\n`;
    }
    if (question.dificuldade) text += `${t('difficulty')}: ${getDifficultyLabel(question.dificuldade)}\n`;
    if (question.topico) text += `${t('topic')}: ${getCategoryLabel(question.topico)}\n`;

    navigator.clipboard.writeText(text);
    addNotification(t('questionCopied', 'Questão copiada!'), 'success');
  };

  const handleHintClick = (e, index) => {
    e.stopPropagation();
    setVisibleHintIndex(visibleHintIndex === index ? null : index);
  };

  const renderFlashcards = (flashcards) => (
    <div className={styles.flashcardsContainer}>
      {flashcards.map((card, index) => (
        <div
          key={index}
          className={`${styles.flashcard} ${flippedCardIndex === index ? styles.flipped : ''} ${getDifficultyClass(card.dificuldade)}`}
          onClick={() => {
            setFlippedCardIndex(flippedCardIndex === index ? null : index);
            setVisibleHintIndex(null);
          }}
        >
          <div className={styles.flashcardInner}>
            <div className={styles.flashcardFront}>
              {/* Header with badges */}
              <div className={styles.flashcardHeader}>
                {card.categoria && (
                  <span className={styles.categoryBadge}>{getCategoryLabel(card.categoria)}</span>
                )}
                {card.dificuldade && (
                  <span className={`${styles.difficultyBadge} ${getDifficultyClass(card.dificuldade)}`}>
                    {card.dificuldade === 'facil' ? '●' : card.dificuldade === 'medio' ? '●●' : '●●●'}
                  </span>
                )}
              </div>

              <p className={styles.flashcardQuestion}>{card.frente}</p>

              {/* Hint button */}
              {card.dica && (
                <button
                  className={styles.hintButton}
                  onClick={(e) => handleHintClick(e, index)}
                  title={t('showHint')}
                >
                  💡
                </button>
              )}

              {/* Hint tooltip */}
              {visibleHintIndex === index && card.dica && (
                <div className={styles.hintTooltip} onClick={(e) => e.stopPropagation()}>
                  <strong>{t('hint')}:</strong> {card.dica}
                </div>
              )}
            </div>
            <div className={styles.flashcardBack}>
              <p className={styles.flashcardAnswer}>{card.verso}</p>

              {/* Mnemonic section */}
              {card.mnemonico && (
                <div className={styles.mnemonicSection}>
                  <span className={styles.mnemonicIcon}>🧠</span>
                  <span className={styles.mnemonicText}>{card.mnemonico}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderMindMap = (mindMapData, mindMapImage) => {
    // If we have an image, use the MindMapImageView component
    if (mindMapImage) {
      return <MindMapImageView mindMapImage={mindMapImage} mindMapData={mindMapData} t={t} />;
    }

    // Fallback to ReactFlow if no image available
    return (
      <div className={styles.mindMapContainer}>
        <ResizableReactFlow
          mindMapData={mindMapData}
          addNotification={addNotification}
          t={t}
          onExportReady={(handler) => setMindMapExportHandler(() => handler)}
        />
      </div>
    );
  };

  // Handler for mind map PNG export
  const handleMindMapPngExport = () => {
    setShareMenuOpen(false);
    if (result?.content?.mind_map_image) {
      // Image-based export
      const link = document.createElement('a');
      link.download = `mapa_mental_${Date.now()}.png`;
      link.href = `data:image/png;base64,${result.content.mind_map_image}`;
      link.click();
      addNotification(t('exportSuccess'), 'success');
    } else if (mindMapExportHandler) {
      // ReactFlow export
      mindMapExportHandler('png');
    }
  };

  // Handler for mind map SVG export (only for ReactFlow)
  const handleMindMapSvgExport = () => {
    setShareMenuOpen(false);
    if (mindMapExportHandler) {
      mindMapExportHandler('svg');
    } else {
      addNotification(t('exportError'), 'error');
    }
  };

  // Handler for mind map PDF export (only for image-based)
  const handleMindMapPdfExport = async () => {
    setShareMenuOpen(false);
    if (!result?.id || !result?.content?.mind_map_image) {
      addNotification(t('exportError'), 'error');
      return;
    }

    try {
      addNotification(t('pdfExportStarted'), 'info');

      const language = i18n.language.split('-')[0];
      const response = await api.post('/export/mind-map-to-pdf',
        { material_id: result.id, language },
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      window.URL.revokeObjectURL(url);

      addNotification(t('pdfExportSuccess'), 'success');
    } catch (error) {
      console.error('Mind map PDF export error:', error);
      addNotification(t('pdfExportError'), 'error');
    }
  };

  // Export table to CSV
  const exportTableToCSV = (tableData) => {
    const rows = normalizeTableRows(tableData);
    const csvContent = [
      tableData.headers.join(','),
      ...rows.map(row => {
        const cells = row.cells || row;
        return cells.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
      })
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableData.title || 'tabela'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addNotification(t('csvExported', 'CSV exportado!'), 'success');
  };

  // Copy table as Markdown
  const copyTableAsMarkdown = (tableData) => {
    const rows = normalizeTableRows(tableData);
    const headerLine = `| ${tableData.headers.join(' | ')} |`;
    const separatorLine = `| ${tableData.headers.map(() => '---').join(' | ')} |`;
    const dataLines = rows.map(row => {
      const cells = row.cells || row;
      return `| ${cells.join(' | ')} |`;
    });

    let markdown = `## ${tableData.title}\n\n${headerLine}\n${separatorLine}\n${dataLines.join('\n')}`;

    if (tableData.footnotes?.length > 0) {
      markdown += '\n\n' + tableData.footnotes.map(n => `_* ${n}_`).join('\n');
    }

    if (tableData.abbreviations && Object.keys(tableData.abbreviations).length > 0) {
      markdown += '\n\n**Abreviações:**\n' + Object.entries(tableData.abbreviations).map(([k, v]) => `- ${k}: ${v}`).join('\n');
    }

    navigator.clipboard.writeText(markdown);
    addNotification(t('markdownCopied', 'Markdown copiado!'), 'success');
  };

  // Normalize table rows (handle both old array format and new object format)
  const normalizeTableRows = (tableData) => {
    if (!tableData.rows || tableData.rows.length === 0) return [];
    // Check if rows are in old format (array of arrays) or new format (array of objects)
    if (Array.isArray(tableData.rows[0])) {
      return tableData.rows.map(cells => ({ cells, category: null, highlights: [] }));
    }
    return tableData.rows;
  };

  // Render cell content with abbreviation tooltips
  const renderCellWithAbbreviations = (cellContent, abbreviations) => {
    if (!abbreviations || Object.keys(abbreviations).length === 0) {
      return cellContent;
    }

    const words = String(cellContent).split(/(\s+)/);
    return words.map((word, idx) => {
      const cleanWord = word.replace(/[.,;:!?]/g, '');
      if (abbreviations[cleanWord]) {
        return (
          <span
            key={idx}
            className={styles.abbreviationWord}
            onMouseEnter={() => setHoveredAbbreviation({ word: cleanWord, meaning: abbreviations[cleanWord] })}
            onMouseLeave={() => setHoveredAbbreviation(null)}
          >
            {word}
          </span>
        );
      }
      return word;
    });
  };

  const renderComparativeTable = (tableData) => {
    const rows = normalizeTableRows(tableData);
    const categories = tableData.categories || [];
    const abbreviations = tableData.abbreviations || {};
    const hasCategories = categories.length > 0 && rows.some(r => r.category);

    // Group rows by category if categories exist
    const groupedRows = hasCategories
      ? categories.map(cat => ({
          category: cat,
          rows: rows.filter(r => r.category === cat)
        })).filter(g => g.rows.length > 0)
      : [{ category: null, rows }];

    return (
      <div className={`${styles.comparativeTableContainer} ${tableFullscreen ? styles.tableFullscreenMode : ''}`}>
        {/* Table Controls */}
        <div className={styles.tableControls}>
          <h3 className={styles.tableTitle}>{tableData.title}</h3>
          <div className={styles.tableActions}>
            <button
              onClick={() => copyTableAsMarkdown(tableData)}
              className={styles.tableActionButton}
              title={t('copyAsMarkdown', 'Copiar como Markdown')}
            >
              <FontAwesomeIcon icon={faCopy} />
            </button>
            <button
              onClick={() => exportTableToCSV(tableData)}
              className={styles.tableActionButton}
              title={t('exportCSV', 'Exportar CSV')}
            >
              <FontAwesomeIcon icon={faFileExport} />
            </button>
            <button
              onClick={() => setTableFullscreen(!tableFullscreen)}
              className={styles.tableActionButton}
              title={tableFullscreen ? t('exitFullscreen') : t('fullscreen')}
            >
              <FontAwesomeIcon icon={tableFullscreen ? faCompress : faExpand} />
            </button>
          </div>
        </div>

        {/* Abbreviation Tooltip */}
        {hoveredAbbreviation && (
          <div className={styles.abbreviationTooltip}>
            <strong>{hoveredAbbreviation.word}:</strong> {hoveredAbbreviation.meaning}
          </div>
        )}

        <div className={styles.tableWrapper} ref={tableRef}>
          <table className={styles.comparativeTable}>
            <thead>
              <tr>
                {tableData.headers.map((header, i) => (
                  <th key={i} className={i === 0 ? styles.stickyColumn : ''}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((group, groupIdx) => (
                <React.Fragment key={`group-${groupIdx}`}>
                  {/* Category Header Row */}
                  {hasCategories && group.category && (
                    <tr className={styles.categoryRow}>
                      <td colSpan={tableData.headers.length} className={styles.categoryCell}>
                        <FontAwesomeIcon icon={faTag} /> {group.category}
                      </td>
                    </tr>
                  )}
                  {/* Data Rows */}
                  {group.rows.map((row, rowIdx) => {
                    const cells = row.cells || row;
                    const highlights = row.highlights || [];
                    return (
                      <tr key={`row-${groupIdx}-${rowIdx}`}>
                        {cells.map((cell, cellIdx) => (
                          <td
                            key={cellIdx}
                            className={`
                              ${cellIdx === 0 ? styles.stickyColumn : ''}
                              ${highlights.includes(cellIdx) ? styles.highlightedCell : ''}
                            `}
                          >
                            {renderCellWithAbbreviations(cell, abbreviations)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footnotes */}
        {tableData.footnotes?.length > 0 && (
          <div className={styles.tableFootnotes}>
            {tableData.footnotes.map((note, i) => (
              <p key={i}>* {note}</p>
            ))}
          </div>
        )}

        {/* Abbreviations Glossary */}
        {Object.keys(abbreviations).length > 0 && (
          <div className={styles.abbreviationsGlossary}>
            <h4><FontAwesomeIcon icon={faListUl} /> {t('abbreviations', 'Abreviações')}</h4>
            <div className={styles.glossaryGrid}>
              {Object.entries(abbreviations).map(([abbr, meaning]) => (
                <div key={abbr} className={styles.glossaryItem}>
                  <span className={styles.glossaryAbbr}>{abbr}</span>
                  <span className={styles.glossaryMeaning}>{meaning}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderQuestionnaire = (result) => {
    const objectiveQuestions = Array.isArray(result.content?.questionario_objetivo)
      ? result.content.questionario_objetivo
      : Object.values(result.content?.questionario_objetivo || {});
    const subjectiveQuestions = Array.isArray(result.content?.questionario_subjetivo)
      ? result.content.questionario_subjetivo
      : Object.values(result.content?.questionario_subjetivo || {});

    const questionsToRender = quizMode && shuffledQuestions ? shuffledQuestions : objectiveQuestions;

    // Quiz Mode Statistics View
    if (quizMode && quizSubmitted && objectiveQuestions.length > 0) {
      const stats = calculateQuizStats(questionsToRender);
      const score = computeScoring(questionsToRender);
      return (
        <div className={styles.quizStatsContainer}>
          <div className={styles.quizStatsHeader}>
            <FontAwesomeIcon icon={faChartBar} className={styles.statsIcon} />
            <h3>{examMode ? t('mcExamResults') : t('quizResults', 'Resultado do Quiz')}</h3>
          </div>

          <div className={styles.quizMainScore}>
            <div className={styles.scoreCircle} style={{
              background: `conic-gradient(var(--accent-color) ${score ? score.percentage : stats.percentage}%, var(--background-tertiary) 0%)`
            }}>
              <div className={styles.scoreCircleInner}>
                <span className={styles.scorePercentage}>{score ? `${score.percentage}%` : `${stats.percentage}%`}</span>
                <span className={styles.scoreLabel}>
                  {score
                    ? `${formatPoints(score.points)}/${formatPoints(score.maxPoints)} ${t('mcPoints')}`
                    : `${stats.correct}/${stats.total}`}
                </span>
              </div>
            </div>
            {/* Pontuação é a nota; acertos contam outra história (ex.: 67% em pontos × 65%
                em acertos quando as matérias de peso 2 vão melhor). Mostrar as duas. */}
            {score && (
              <span className={styles.scoreHitsLine}>
                {t('mcHitsSummary', { correct: stats.correct, total: stats.total, pct: stats.percentage })}
              </span>
            )}
          </div>

          {/* Veredito da prova: eliminação por matéria e/ou nota de corte */}
          {score && (score.eliminatedIn.length > 0 || score.passed !== null) && (
            <div className={`${styles.examVerdict} ${score.eliminatedIn.length > 0 || score.passed === false ? styles.examVerdictFail : styles.examVerdictPass}`}>
              <FontAwesomeIcon icon={score.eliminatedIn.length > 0 || score.passed === false ? faTimesCircle : faCheckCircle} />
              <span>
                {score.eliminatedIn.length > 0
                  ? t('mcVerdictEliminated', { subjects: score.eliminatedIn.map((r) => `${r.label} (${r.correct}/${r.total})`).join(', ') })
                  : score.passed
                    ? t('mcVerdictPassed', { points: formatPoints(score.points), cutoff: formatPoints(score.passingScore) })
                    : t('mcVerdictFailed', { points: formatPoints(score.points), cutoff: formatPoints(score.passingScore) })}
              </span>
            </div>
          )}

          <div className={styles.quizStatsGrid}>
            <div className={`${styles.statCard} ${styles.statCorrect}`}>
              <FontAwesomeIcon icon={faCheckCircle} />
              <span className={styles.statValue}>{stats.correct}</span>
              <span className={styles.statLabel}>{t('correct', 'Corretas')}</span>
            </div>
            <div className={`${styles.statCard} ${styles.statIncorrect}`}>
              <FontAwesomeIcon icon={faTimesCircle} />
              <span className={styles.statValue}>{stats.incorrect}</span>
              <span className={styles.statLabel}>{t('incorrect', 'Incorretas')}</span>
            </div>
            <div className={`${styles.statCard} ${styles.statUnanswered}`}>
              <FontAwesomeIcon icon={faTimes} />
              <span className={styles.statValue}>{stats.unanswered}</span>
              <span className={styles.statLabel}>{t('unanswered', 'Sem resposta')}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{formatQuizTime(stats.elapsedTime)}</span>
              <span className={styles.statLabel}>{t('timeElapsed', 'Tempo')}</span>
            </div>
          </div>

          {/* Por matéria (blocos da prova) — mais fiel que os tópicos gerados pelo modelo */}
          {score && (
            <div className={styles.statsByCategory}>
              <h4>{t('mcBySubject')}</h4>
              <div className={styles.subjectStatsList}>
                {score.rows.map((r) => (
                  <div key={r.label} className={`${styles.subjectStat} ${r.eliminated ? styles.subjectStatEliminated : ''}`}>
                    <span className={styles.subjectName}>{r.label}</span>
                    <span className={styles.subjectNumbers}>
                      <span className={styles.subjectHits}>{r.correct}/{r.total}</span>
                      <span className={styles.subjectPoints}>{formatPoints(r.points)}/{formatPoints(r.maxPoints)} {t('mcPoints')}</span>
                    </span>
                    {r.eliminated && (
                      <span className={styles.subjectEliminatedTag}>{t('mcBelowMinimum', { min: r.minCorrect })}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(stats.byDifficulty).some(k => stats.byDifficulty[k].total > 0) && (
            <div className={styles.statsByCategory}>
              <h4>{t('byDifficulty', 'Por Dificuldade')}</h4>
              <div className={styles.categoryStatsList}>
                {Object.entries(stats.byDifficulty).filter(([_, v]) => v.total > 0).map(([key, value]) => (
                  <div key={key} className={`${styles.categoryStat} ${getDifficultyClass(key)}`}>
                    <span className={styles.categoryName}>{getDifficultyLabel(key)}</span>
                    <span className={styles.categoryScore}>{value.correct}/{value.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(stats.byTopic).length > 0 && (
            <div className={styles.statsByCategory}>
              <h4>{t('byTopic', 'Por Tópico')}</h4>
              <div className={styles.categoryStatsList}>
                {Object.entries(stats.byTopic).map(([key, value]) => (
                  <div key={key} className={styles.categoryStat}>
                    <span className={styles.categoryName}>{getCategoryLabel(key)}</span>
                    <span className={styles.categoryScore}>{value.correct}/{value.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.quizReviewSection}>
            <h4>{t('reviewAnswers', 'Revisar Respostas')}</h4>
            {questionsToRender.map((q, index) => {
              const userAnswer = quizAnswers[index];
              const isCorrect = userAnswer === q.resposta_correta;
              return (
                <div key={`review-${index}`} className={`${styles.reviewQuestion} ${userAnswer === undefined ? styles.reviewUnanswered : isCorrect ? styles.reviewCorrect : styles.reviewIncorrect}`}>
                  <div className={styles.reviewHeader}>
                    <span className={styles.reviewNumber}>{index + 1}</span>
                    <span className={styles.reviewStatus}>
                      {userAnswer === undefined ? <FontAwesomeIcon icon={faTimes} /> : isCorrect ? <FontAwesomeIcon icon={faCheckCircle} /> : <FontAwesomeIcon icon={faTimesCircle} />}
                    </span>
                  </div>
                  {renderSupportText(q)}
                  <p className={styles.reviewQuestion}><InlineMarkdown>{q.pergunta}</InlineMarkdown></p>
                  <div className={styles.reviewAlternatives}>
                    {q.alternativas.map((alt, i) => {
                      const letter = String.fromCharCode(97 + i);
                      const isUserChoice = userAnswer === letter;
                      const isCorrectChoice = q.resposta_correta === letter;
                      return (
                        <div key={i} className={`${styles.reviewAlternative} ${isCorrectChoice ? styles.correctAlt : ''} ${isUserChoice && !isCorrectChoice ? styles.wrongAlt : ''}`}>
                          <span className={styles.altLetter}>{letter.toUpperCase()}</span>
                          <span><InlineMarkdown>{alt}</InlineMarkdown></span>
                          {isCorrectChoice && <FontAwesomeIcon icon={faCheckCircle} className={styles.correctIcon} />}
                          {isUserChoice && !isCorrectChoice && <FontAwesomeIcon icon={faTimesCircle} className={styles.wrongIcon} />}
                        </div>
                      );
                    })}
                  </div>
                  <div className={styles.reviewJustification}>
                    <strong>{t('justification')}:</strong>
                    <InlineMarkdown>{q.justificativa}</InlineMarkdown>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.quizActions}>
            {/* examMode: não há "visualização" — a prova só existe em modo quiz */}
            {!examMode && (
              <button onClick={() => { setQuizMode(false); setQuizSubmitted(false); setQuizAnswers({}); }} className={styles.quizActionButton}>
                <FontAwesomeIcon icon={faEye} /> {t('backToView', 'Voltar à Visualização')}
              </button>
            )}
            <button
              onClick={() => { setQuizFinishedOnce(false); startQuizMode(objectiveQuestions); }}
              className={`${styles.quizActionButton} ${styles.quizActionPrimary}`}
            >
              <FontAwesomeIcon icon={faRedo} /> {examMode ? t('mcRetakeExam') : t('retryQuiz', 'Tentar Novamente')}
            </button>
          </div>
        </div>
      );
    }

    // Quiz Mode Active View
    if (quizMode && objectiveQuestions.length > 0 && !quizSubmitted) {
      const currentQuestion = questionsToRender[currentQuizIndex];
      return (
        <div className={styles.quizModeContainer}>
          <div className={styles.quizHeader}>
            <div className={styles.quizProgress}>
              <span>{currentQuizIndex + 1} / {questionsToRender.length}</span>
              <div className={styles.quizProgressBar}>
                <div className={styles.quizProgressFill} style={{ width: `${((currentQuizIndex + 1) / questionsToRender.length) * 100}%` }} />
              </div>
            </div>
            <div
              className={`${styles.quizTimer} ${countdownRemaining !== null && countdownRemaining <= 60 ? styles.quizTimerDanger : countdownRemaining !== null && countdownRemaining <= 300 ? styles.quizTimerWarning : ''}`}
              title={countdownRemaining !== null ? t('mcTimeRemaining') : undefined}
            >
              {countdownRemaining !== null ? `⏳ ${formatQuizTime(countdownRemaining)}` : formatQuizTime(quizElapsedTime)}
            </div>
          </div>

          <div className={styles.quizQuestionCard}>
            {/* Matéria/bloco da prova (ex.: "Língua Portuguesa") — o cabeçalho que a
                visão de lista mostra entre seções aparece aqui por questão */}
            {currentQuestion.bloco && (
              <div className={styles.quizBlockLabel}>{currentQuestion.bloco}</div>
            )}
            {/* examMode: prova real não mostra dificuldade/tema da questão */}
            {!examMode && (currentQuestion.dificuldade || currentQuestion.topico) && (
              <div className={styles.quizQuestionMeta}>
                {currentQuestion.dificuldade && (
                  <span className={`${styles.metaBadge} ${getDifficultyClass(currentQuestion.dificuldade)}`}>
                    {getDifficultyLabel(currentQuestion.dificuldade)}
                  </span>
                )}
                {currentQuestion.topico && (
                  <span className={styles.metaBadge}>
                    <FontAwesomeIcon icon={faTag} /> {getCategoryLabel(currentQuestion.topico)}
                  </span>
                )}
              </div>
            )}
            {renderSupportText(currentQuestion)}
            <p className={styles.quizQuestionText}><InlineMarkdown>{currentQuestion.pergunta}</InlineMarkdown></p>
            <div className={styles.quizAlternatives}>
              {currentQuestion.alternativas.map((alt, i) => {
                const letter = String.fromCharCode(97 + i);
                const isSelected = quizAnswers[currentQuizIndex] === letter;
                // examMode: NUNCA revela durante a prova — gabarito só após a entrega
                const isRevealed = !examMode && !!revealedQuestions[currentQuizIndex];
                const isCorrect = currentQuestion.resposta_correta === letter;
                // Modo treino: ao confirmar, pinta a correta de verde e a escolha
                // errada de vermelho, e trava as alternativas.
                let stateClass = isSelected ? styles.quizAlternativeSelected : '';
                if (isRevealed) {
                  stateClass = isCorrect ? styles.quizAltCorrect : (isSelected ? styles.quizAltIncorrect : '');
                }
                return (
                  <button
                    key={i}
                    className={`${styles.quizAlternative} ${stateClass}`}
                    onClick={() => { if (!isRevealed) setQuizAnswers(prev => ({ ...prev, [currentQuizIndex]: letter })); }}
                    disabled={isRevealed}
                  >
                    <span className={styles.quizAltLetter}>{letter.toUpperCase()}</span>
                    <span className={styles.quizAltText}><InlineMarkdown>{alt}</InlineMarkdown></span>
                    {isRevealed && isCorrect && <FontAwesomeIcon icon={faCheckCircle} className={styles.correctIcon} />}
                    {isRevealed && isSelected && !isCorrect && <FontAwesomeIcon icon={faTimesCircle} className={styles.wrongIcon} />}
                  </button>
                );
              })}
            </div>

            {/* Modo treino (opcional): confirmar revela acerto/erro + justificativa NA HORA.
                Sem confirmar, "Próximo" adia o gabarito pro fim — igual a um simulado.
                examMode: caminho INEXISTENTE — gabarito só após entregar a prova. */}
            {!examMode && !revealedQuestions[currentQuizIndex] && quizAnswers[currentQuizIndex] !== undefined && (
              <button
                className={styles.quizConfirmButton}
                onClick={() => setRevealedQuestions(prev => ({ ...prev, [currentQuizIndex]: true }))}
              >
                <FontAwesomeIcon icon={faCheck} /> {t('confirmAnswer', 'Confirmar resposta')}
              </button>
            )}
            {!examMode && revealedQuestions[currentQuizIndex] && (
              <div className={`${styles.quizInlineFeedback} ${quizAnswers[currentQuizIndex] === currentQuestion.resposta_correta ? styles.quizInlineCorrect : styles.quizInlineIncorrect}`}>
                <div className={styles.quizInlineFeedbackHead}>
                  <FontAwesomeIcon icon={quizAnswers[currentQuizIndex] === currentQuestion.resposta_correta ? faCheckCircle : faTimesCircle} />
                  <span>
                    {quizAnswers[currentQuizIndex] === currentQuestion.resposta_correta
                      ? t('youGotItRight', 'Você acertou!')
                      : `${t('youGotItWrong', 'Resposta incorreta')} · ${t('correctAnswerShort', 'Correta')}: ${currentQuestion.resposta_correta.toUpperCase()}`}
                  </span>
                </div>
                {currentQuestion.justificativa && (
                  <div className={styles.quizInlineJustification}>
                    <InlineMarkdown>{currentQuestion.justificativa}</InlineMarkdown>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={styles.quizNavigation}>
            <button
              onClick={() => setCurrentQuizIndex(prev => Math.max(0, prev - 1))}
              disabled={currentQuizIndex === 0}
              className={styles.quizNavButton}
            >
              {t('previous')}
            </button>
            <div className={styles.quizQuestionDots}>
              {questionsToRender.map((_, idx) => (
                <button
                  key={idx}
                  className={`${styles.quizDot} ${idx === currentQuizIndex ? styles.quizDotActive : ''} ${quizAnswers[idx] !== undefined ? styles.quizDotAnswered : ''}`}
                  onClick={() => setCurrentQuizIndex(idx)}
                />
              ))}
            </div>
            {currentQuizIndex === questionsToRender.length - 1 ? (
              <button onClick={submitQuiz} className={`${styles.quizNavButton} ${styles.quizSubmitButton}`}>
                {examMode ? t('mcDeliverExam') : t('finishQuiz', 'Finalizar')}
              </button>
            ) : (
              <button
                onClick={() => setCurrentQuizIndex(prev => Math.min(questionsToRender.length - 1, prev + 1))}
                className={styles.quizNavButton}
              >
                {t('next')}
              </button>
            )}
          </div>

          {/* examMode: sem sair no meio da prova (fechar o modal já pede confirmação) */}
          {!examMode && (
            <button onClick={() => setQuizMode(false)} className={styles.quizExitButton}>
              <FontAwesomeIcon icon={faTimes} /> {t('exitQuiz', 'Sair do Quiz')}
            </button>
          )}
        </div>
      );
    }

    // Normal View Mode
    return (
      <div>
        {/* Controls for objective questions */}
        {objectiveQuestions.length > 0 && (
          <div className={styles.questionnaireControls}>
            <button onClick={() => startQuizMode(objectiveQuestions)} className={styles.quizModeButton}>
              <FontAwesomeIcon icon={faPlay} /> {t('startQuizMode', 'Modo Quiz')}
            </button>
            {/* examMode: prova na ordem oficial, sem embaralhar */}
            {!examMode && (
              <label className={styles.shuffleToggle}>
                <input
                  type="checkbox"
                  checked={shuffleEnabled}
                  onChange={(e) => setShuffleEnabled(e.target.checked)}
                />
                <FontAwesomeIcon icon={faShuffle} /> {t('shuffleQuestions', 'Embaralhar')}
              </label>
            )}
          </div>
        )}

        {objectiveQuestions.length > 0 && (
          <>
            <h3>{t('objectiveQuestions')}</h3>
            {objectiveQuestions.map((q, index) => (
              <React.Fragment key={`obj-${index}`}>
                {q.bloco && (index === 0 || objectiveQuestions[index - 1]?.bloco !== q.bloco) && (
                  <h4 style={{ color: 'var(--accent-color)', fontWeight: 700, fontSize: '0.95rem', margin: '22px 0 10px', padding: '6px 10px', background: 'rgba(var(--accent-color-rgb), 0.08)', borderLeft: '3px solid var(--accent-color)', borderRadius: 6 }}>{q.bloco}</h4>
                )}
                <div className={styles.questionBlock}>
                <div className={styles.questionHeader}>
                  <div className={styles.questionMeta}>
                    {q.dificuldade && (
                      <span className={`${styles.metaBadge} ${getDifficultyClass(q.dificuldade)}`}>
                        {getDifficultyLabel(q.dificuldade)}
                      </span>
                    )}
                    {q.topico && (
                      <span className={styles.topicBadge}>
                        <FontAwesomeIcon icon={faTag} /> {getCategoryLabel(q.topico)}
                      </span>
                    )}
                  </div>
                  <button
                    className={styles.copyQuestionButton}
                    onClick={() => copyQuestionToClipboard(q, index, true)}
                    title={t('copyQuestion', 'Copiar questão')}
                  >
                    <FontAwesomeIcon icon={faCopy} />
                  </button>
                </div>
                {renderSupportText(q)}
                <p><strong><InlineMarkdown>{`${index + 1}. ${q.pergunta}`}</InlineMarkdown></strong></p>
                <div className={styles.alternativesList}>
                  {q.alternativas.map((alt, i) => (
                    <div key={i} className={styles.alternativeItem}>{String.fromCharCode(97 + i)}) <InlineMarkdown>{alt}</InlineMarkdown></div>
                  ))}
                </div>
                </div>
              </React.Fragment>
            ))}
            <hr />
            <h3>{t('answerKeyObjective')}</h3>
            {objectiveQuestions.map((q, index) => (
              <div key={`ans-obj-${index}`} className={styles.answerBlock}>
                <p><strong>{index + 1}. {t('correctAlternative')}: {q.resposta_correta.toUpperCase()}</strong></p>
                <p><strong>{t('justification')}:</strong> <InlineMarkdown>{q.justificativa}</InlineMarkdown></p>
              </div>
            ))}
          </>
        )}

        {subjectiveQuestions.length > 0 && (
          <>
            <h3>{t('subjectiveQuestions')}</h3>
            {subjectiveQuestions.map((q, index) => (
              <div key={`subj-${index}`} className={styles.questionBlock}>
                <div className={styles.questionHeader}>
                  <div className={styles.questionMeta}>
                    {q.dificuldade && (
                      <span className={`${styles.metaBadge} ${getDifficultyClass(q.dificuldade)}`}>
                        {getDifficultyLabel(q.dificuldade)}
                      </span>
                    )}
                    {q.topico && (
                      <span className={styles.topicBadge}>
                        <FontAwesomeIcon icon={faTag} /> {getCategoryLabel(q.topico)}
                      </span>
                    )}
                  </div>
                  <button
                    className={styles.copyQuestionButton}
                    onClick={() => copyQuestionToClipboard(q, index, false)}
                    title={t('copyQuestion', 'Copiar questão')}
                  >
                    <FontAwesomeIcon icon={faCopy} />
                  </button>
                </div>
                <p><strong><InlineMarkdown>{`${index + 1}. ${q.pergunta}`}</InlineMarkdown></strong></p>
              </div>
            ))}
            <hr />
            <h3>{t('answerKeySubjective')}</h3>
            {subjectiveQuestions.map((q, index) => (
              <div key={`ans-subj-${index}`} className={styles.answerBlock}>
                <p><strong>{index + 1}. {t('expectedAnswer')}:</strong></p>
                <ReactMarkdown>{q.resposta_esperada}</ReactMarkdown>
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  const formatTime = (timeInSeconds) => {
    if (!timeInSeconds || timeInSeconds === 0) return "--:--";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const renderContent = () => {
    // This is the new logic to handle both podcast and video jobs.
    if ((materialType === 'podcast' || materialType === 'video_lesson') && job) {
      const type = materialType === 'podcast' ? 'podcast' : 'videoLesson';
      switch (job.status) {
        case 'pending':
          return <InlineLoading text={t(`${type}Pending`)} />;
        case 'processing':
          return (
            <div className={styles.processingContainer}>
              <InlineLoading text={job.current_step || t(`${type}Processing`)} />
              {job.progress_percent > 0 && (
                <div className={styles.progressContainer}>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${job.progress_percent}%` }}
                    />
                  </div>
                  <span className={styles.progressText}>{job.progress_percent}%</span>
                </div>
              )}
            </div>
          );
        case 'completed':
          const mediaUrl = `${API_STATIC_URL}/${job.result_path.replace(/\\/g, '/')}`;
          const expiresAt = job.expires_at ? new Date(job.expires_at) : null;
          const hoursRemaining = expiresAt ? Math.max(0, Math.floor((expiresAt - new Date()) / (1000 * 60 * 60))) : null;
          if (type === 'podcast') {
            return (
              <div className={styles.podcastPlayerContainer}>
                {hoursRemaining !== null && hoursRemaining <= 24 && (
                  <div className={styles.expirationBanner}>
                    <FontAwesomeIcon icon={faClock} />
                    <span>{t('contentExpiresIn', { hours: hoursRemaining })}</span>
                  </div>
                )}
                <PodcastPlayer
                  audioUrl={mediaUrl}
                  title={result?.content?.title || t('podcast')}
                  script={podcastScript}
                  onListened={(listened) => console.log('Podcast listened:', listened)}
                />
              </div>
            );
          } else { // Video Lesson
            const srtUrl = job.srt_path ? `${API_STATIC_URL}/${job.srt_path.replace(/\\/g, '/')}` : null;
            return (
              <div className={styles.videoPlayerContainer}>
                {hoursRemaining !== null && hoursRemaining <= 24 && (
                  <div className={styles.expirationBanner}>
                    <FontAwesomeIcon icon={faClock} />
                    <span>{t('contentExpiresIn', { hours: hoursRemaining })}</span>
                  </div>
                )}
                <VideoLessonPlayer
                  videoUrl={mediaUrl}
                  title={result?.content?.title || t('videoLesson')}
                  srtUrl={srtUrl}
                  onWatched={(watched) => console.log('Video watched:', watched)}
                />
              </div>
            );
          }
        case 'expired':
          return (
            <div className={styles.expiredContainer}>
              <FontAwesomeIcon icon={faClock} className={styles.expiredIcon} />
              <h4>{t(`${type}Expired`)}</h4>
              <p>{t('contentExpiredDescription')}</p>
              <button onClick={onRedo} className={styles.regenerateButton}>
                <FontAwesomeIcon icon={faRedo} /> {t('regenerateContent')}
              </button>
            </div>
          );
        case 'error':
          return (
            <div className={styles.errorContainer}>
              <h4>{t(`${type}Failed`)}</h4>
              <p>{job.error_message || t('unknownError')}</p>
            </div>
          );
        default:
          return <InlineLoading text={t('loadingStatus')} />;
      }
    }

    if (materialType === 'slideshow_only' && result?.content?.slideshow_content) {
      return <SlideshowPreview slideshowData={result.content.slideshow_content} />;
    }

    if (result?.content?.questionario_objetivo || result?.content?.questionario_subjetivo) {
        return renderQuestionnaire(result);
    }
    if (materialType === 'mind_map' && result?.content?.mapa_mental) {
      return renderMindMap(result.content.mapa_mental, result.content.mind_map_image);
    }
    if (materialType === 'flashcards' && result?.content?.flashcards) {
      return renderFlashcards(result.content.flashcards);
    }
    if (materialType === 'comparative_table' && result?.content?.table) {
      return renderComparativeTable(result.content.table);
    }
    if (materialType === 'clinical_case' && result?.content?.clinical_case) {
      return <ClinicalCasePlayer caseData={result.content} />;
    }
    if (materialType === 'critical_appraisal' && result?.content?.appraisal) {
      return <CriticalAppraisalViewer data={result.content.appraisal} />;
    }
    const content = result?.content?.summary || result?.content?.detailed_text || result?.content?.slideshow_markdown;
    if (content) {
      return (
        <ReactMarkdown
          rehypePlugins={[rehypeSanitize]}
          remarkPlugins={[remarkGfm]}
        >
          {content}
        </ReactMarkdown>
      );
    }

    return <pre>{JSON.stringify(result || job, null, 2)}</pre>;
  };

  const showFooterActions = !['podcast', 'video_lesson'].includes(materialType) || (job && (job.status === 'completed' || job.status === 'error' || job.status === 'expired'));
  // examMode: compartilhar/exportar só APÓS entregar a prova (simulação do dia da prova).
  // "Copiar" (markdown cru) não serve numa prova — exportar PDF é o caminho útil.
  const examToolsLocked = examMode && !quizFinishedOnce;
  const showCopyButton = !['podcast', 'slideshow_only', 'video_lesson'].includes(materialType) && !examMode;
  const showShareButton = !['podcast', 'video_lesson'].includes(materialType) && !examToolsLocked;
  const showDownloadButton = (materialType === 'podcast' || materialType === 'video_lesson') && job?.status === 'completed';

  // Dados da pílula (estado minimizado): título + progresso do quiz quando ativo.
  const pillObjectiveQuestions = Array.isArray(result?.content?.questionario_objetivo)
    ? result.content.questionario_objetivo
    : Object.values(result?.content?.questionario_objetivo || {});
  const pillQuizTotal = quizMode && shuffledQuestions ? shuffledQuestions.length : pillObjectiveQuestions.length;
  const isQuizActive = quizMode && !quizSubmitted && pillQuizTotal > 0;
  const pillTitle = sourceName || t('materialResult');

  return ReactDOM.createPortal(
    <>
      {isMinimized ? (
        <div
          className={styles.minimizedPill}
          style={{ bottom: `${24 + stackIndex * 68}px` }}
          onClick={onRestore}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRestore?.(); } }}
          title={t('restore', 'Restaurar')}
        >
          <div className={styles.pillIcon}>
            <FontAwesomeIcon icon={isQuizActive ? faGraduationCap : faFileLines} />
          </div>
          <div className={styles.pillInfo}>
            <span className={styles.pillTitle}>{pillTitle}</span>
            <span className={styles.pillProgress}>
              {isQuizActive
                ? `${currentQuizIndex + 1}/${pillQuizTotal} · ${formatQuizTime(quizElapsedTime)}`
                : t('tapToResume', 'Toque para retomar')}
            </span>
          </div>
          <button
            className={styles.pillActionBtn}
            onClick={(e) => { e.stopPropagation(); onRestore?.(); }}
            title={t('restore', 'Restaurar')}
          >
            <FontAwesomeIcon icon={faExpand} />
          </button>
          <button
            className={`${styles.pillActionBtn} ${styles.pillCloseBtn}`}
            onClick={(e) => { e.stopPropagation(); handleAttemptClose(); }}
            title={t('close')}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      ) : (
      <div className={styles.modalOverlay} onClick={onMinimize ? onMinimize : handleAttemptClose}>
        <div 
          ref={modalContentRef} 
          className={`${styles.modalContent} ${isFullScreen ? styles.fullscreen : ''}`} 
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.modalHeader}>
            <div>
              <h3 className={styles.modalTitle}>{t('materialResult')}</h3>
              <p className={styles.modalSubtitle}>
                {examMode
                  ? sourceName
                  : `${t('base')}: ${t(`sourceType_${sourceType}`, sourceType)} - ${sourceName}`}
              </p>
            </div>
            <div className={styles.headerActions}>
              <button
                onClick={toggleFullScreen}
                title={isFullScreen ? t('exitFullScreen') : t('enterFullScreen')}
                className={styles.fullscreenButton}
              >
                <FontAwesomeIcon icon={isFullScreen ? faCompress : faExpand} />
              </button>
              {onMinimize && (
                <button
                  onClick={onMinimize}
                  title={t('minimize', 'Minimizar')}
                  className={styles.fullscreenButton}
                >
                  <FontAwesomeIcon icon={faWindowMinimize} />
                </button>
              )}
              <button onClick={handleAttemptClose} className={styles.closeButton}>×</button>
            </div>
          </div>
          {trainingNote && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: 'rgba(245,158,11,0.12)', color: '#d97706', fontSize: '0.85rem', borderBottom: '1px solid rgba(245,158,11,0.25)' }}>
              <FontAwesomeIcon icon={faGraduationCap} /> <span>{trainingNote}</span>
            </div>
          )}
          <div className={`${styles.modalBody} ${materialType === 'mind_map' ? styles.mindMapBody : ''}`}>
            {renderContent()}
          </div>
          
          {showFooterActions && (
            <div className={styles.modalFooter}>
              <div className={styles.actionsLeft}>
                {/* examMode: refazer = RESPONDER DE NOVO a mesma prova (gerar outra é
                    "Gerar prova" no card). Fora dele, mantém o regenerar material. */}
                <button
                  onClick={() => {
                    if (!examMode) { onRedo?.(); return; }
                    const raw = result?.content?.questionario_objetivo;
                    const objQuestions = Array.isArray(raw) ? raw : Object.values(raw || {});
                    if (objQuestions.length > 0) setConfirmRetakeOpen(true);
                  }}
                  title={examMode ? t('mcRetakeExam') : t('redoMaterial')}
                >
                  <FontAwesomeIcon icon={faRedo} />
                </button>
                {showCopyButton && (
                  <button onClick={handleCopyToClipboard} title={t('copy')}>
                    {actionSuccess === 'copy' ? <FontAwesomeIcon icon={faCheck} className={styles.successIcon} /> : <FontAwesomeIcon icon={faCopy} />}
                  </button>
                )}
                {showDownloadButton && (
                  <button onClick={handleDownloadMedia} title={t('downloadMedia')}>
                    <FontAwesomeIcon icon={faDownload} />
                  </button>
                )}
                {showShareButton && (
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setShareMenuOpen(prev => !prev)} title={t('export')} data-share-button>
                      {actionSuccess === 'share' ? <FontAwesomeIcon icon={faCheck} className={styles.successIcon} /> : <FontAwesomeIcon icon={faShareNodes} />}
                    </button>
                    <div ref={shareMenuRef} className={`${styles.shareMenu} ${shareMenuOpen ? styles.shareMenuOpen : ''}`}>
                      {materialType === 'slideshow_only' ? (
                        <>
                          <button className={styles.shareMenuItem} onClick={handleDownloadPptx}>
                            <FontAwesomeIcon icon={faFileCode} /> {t('exportAsPptx')}
                          </button>
                          <button className={styles.shareMenuItem} onClick={handleExportSlideshowAsPdf}>
                            <FontAwesomeIcon icon={faFilePdf} /> {t('exportAsPdf')}
                          </button>
                        </>
                      ) : materialType === 'flashcards' && result?.id ? (
                        <>
                          <button className={styles.shareMenuItem} onClick={handleExportToAnki}>
                            <FontAwesomeIcon icon={faFileExport} /> {t('exportToAnki')}
                          </button>
                          <button className={styles.shareMenuItem} onClick={handleExportFlashcardsPdf}>
                            <FontAwesomeIcon icon={faFilePdf} /> {t('shareAsPdfLabel')}
                          </button>
                        </>
                      ) : materialType === 'mind_map' ? (
                        <>
                          <button className={styles.shareMenuItem} onClick={handleMindMapPngExport}>
                            <FontAwesomeIcon icon={faImage} /> {t('exportAsPng')}
                          </button>
                          {result?.content?.mind_map_image && (
                            <button className={styles.shareMenuItem} onClick={handleMindMapPdfExport}>
                              <FontAwesomeIcon icon={faFilePdf} /> {t('exportAsPdf')}
                            </button>
                          )}
                          {!result?.content?.mind_map_image && (
                            <button className={styles.shareMenuItem} onClick={handleMindMapSvgExport}>
                              <FontAwesomeIcon icon={faFileCode} /> {t('exportAsSvg')}
                            </button>
                          )}
                        </>
                      ) : (materialType === 'questionnaire_objective' || materialType === 'questionnaire_subjective') && result?.id ? (
                        <>
                          <button
                            className={styles.shareMenuItem}
                            onClick={() => handleShareAction((content, title, t, addNotification) => handleShareAsTxt(content, title, t, addNotification), 'txt')}
                          >
                            <FontAwesomeIcon icon={faFileLines} /> {t('shareAsTxtLabel')}
                          </button>
                          <button className={styles.shareMenuItem} onClick={handleExportQuestionnairePdf}>
                            <FontAwesomeIcon icon={faFilePdf} /> {t('shareAsPdfLabel')}
                          </button>
                          <button
                            className={styles.shareMenuItem}
                            onClick={() => handleShareAction((content, title, t, addNotification) => handleShareAsMarkdown(content, title, t, addNotification), 'md')}
                          >
                            <FontAwesomeIcon icon={faFileCode} /> {t('shareAsMdLabel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={styles.shareMenuItem}
                            onClick={() => handleShareAction((content, title, t, addNotification) => handleShareAsTxt(content, title, t, addNotification), 'txt')}
                          >
                            <FontAwesomeIcon icon={faFileLines} /> {t('shareAsTxtLabel')}
                          </button>
                          <button
                            className={styles.shareMenuItem}
                            onClick={() => handleShareAction((content, title, t, addNotification, i18n) => handleShareAsPdf(content, addNotification, i18n), 'pdf')}
                          >
                            <FontAwesomeIcon icon={faFilePdf} /> {t('shareAsPdfLabel')}
                          </button>
                          <button
                            className={styles.shareMenuItem}
                            onClick={() => handleShareAction((content, title, t, addNotification) => handleShareAsMarkdown(content, title, t, addNotification), 'md')}
                          >
                            <FontAwesomeIcon icon={faFileCode} /> {t('shareAsMdLabel')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className={styles.feedbackRight}>
                <button onClick={() => handleFeedbackClick('like')} title={t('like')}>
                  <FontAwesomeIcon icon={faThumbsUp} />
                </button>
                <button onClick={() => handleFeedbackClick('dislike')} title={t('dislike')}>
                  <FontAwesomeIcon icon={faThumbsDown} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        onSubmit={(comment, contactPermission) =>
          handleFeedbackSubmit(feedbackType, comment, contactPermission)
        }
      />
      <ConfirmationModal
        isOpen={confirmRetakeOpen}
        onClose={() => setConfirmRetakeOpen(false)}
        onConfirm={() => {
          const raw = result?.content?.questionario_objetivo;
          const objQuestions = Array.isArray(raw) ? raw : Object.values(raw || {});
          setConfirmRetakeOpen(false);
          setQuizFinishedOnce(false);
          startQuizMode(objQuestions);
        }}
        title={t('mcRetakeExamTitle')}
        message={t('mcRetakeExamBody')}
        confirmButtonText={t('mcRetakeExam')}
        cancelButtonText={t('cancel')}
        variant="info"
        icon="question"
      />

      <ConfirmationModal
        isOpen={isCloseConfirmationModalOpen}
        onClose={handleCancelClose}
        onConfirm={handleConfirmClose}
        title={examMode && quizMode && !quizSubmitted ? t('mcDeliverOnCloseTitle') : t('confirmCloseMaterialResultTitle')}
        message={examMode && quizMode && !quizSubmitted ? t('mcDeliverOnCloseBody') : t('confirmCloseMaterialResultMessage')}
        confirmButtonText={examMode && quizMode && !quizSubmitted ? t('mcDeliverAndClose') : t('close')}
        cancelButtonText={t('cancel')}
        {...(examMode && quizMode && !quizSubmitted ? { variant: 'warning', icon: 'warning' } : {})}
      />
    </>,
    document.getElementById('modal-portal')
  );
};

export default MaterialResultModal;