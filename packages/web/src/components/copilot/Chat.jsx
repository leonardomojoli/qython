// frontend/src/components/copilot/Chat.js

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import styles from './Chat.module.css';
import { sendChatMessage, getChatMessages, submitFeedback, deleteChatSession, getLibraries, API_STATIC_URL } from '../../api';
import ConfirmationModal from '../shared/ConfirmationModal';
import UpgradeModal from '../shared/UpgradeModal';
import CopilotEmptyState from './CopilotEmptyState';
import { useNotification } from '../../contexts/NotificationContext';
import { useUser } from '../../contexts/UserContext';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faThumbsUp,
  faThumbsDown,
  faCopy,
  faImage,
  faShareNodes,
  faPenToSquare,
  faArrowRotateRight,
  faCheck,
  faXmark,
  faStop,
  faFileLines,
  faFilePdf,
  faBook,
  faFileCode,
  faBrain,
  faQuoteLeft,
  faExternalLinkAlt
} from '@fortawesome/free-solid-svg-icons';
import { handleShareAsTxt, handleShareAsPdf, convertMarkdownToPlainText, handleShareAsMarkdown } from '../shared/ShareComponent';
import FeedbackModal from '../shared/FeedbackModal';
import ConversationNavBar from './ConversationNavBar';
import LibrarySelectionModal from '../library/LibrarySelectionModal';
import ConsultationPickerModal from './ConsultationPickerModal';
import PatientPickerModal from '../consultation/PatientPickerModal';
import { faStethoscope, faUser } from '@fortawesome/free-solid-svg-icons';
import { referenceBadgeI18nKey, linkifyCitations } from '@qython/shared/src/references';
import { hasPlatformAccess } from '../../utils/access';

/**
 * Note: We no longer insert inline citations programmatically.
 * Gemini with Google Search Grounding already includes citation markers in the response text.
 * We just display the references section at the end with the source links.
 * The source.title from Google contains the domain name (e.g., "pubmed.gov", "nih.gov").
 */

// getSourceIndicator foi movido p/ @qython/shared (referenceBadge): badge confiável por
// pmid/source_type canônico (não só pelo domínio da URL, que falhava em redirect opaco).

// linkifyCitations: [n] → [n](#qref-n) (chips de citação clicáveis com a badge do tipo da
// fonte). Movido p/ @qython/shared (fonte única web+mobile) — ver import acima.

/**
 * Truncates a title intelligently at word boundaries
 * @param {string} title - The full title
 * @param {number} maxLength - Maximum characters before truncation
 * @returns {string} - Truncated title with ellipsis if needed
 */
const truncateTitle = (title, maxLength = 80) => {
  if (!title || title.length <= maxLength) return title;

  // Find the last space before maxLength
  const truncated = title.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  // If there's a space, cut at word boundary; otherwise, cut at maxLength
  const cutPoint = lastSpace > maxLength * 0.5 ? lastSpace : maxLength;
  return title.substring(0, cutPoint).trim() + '...';
};

function Chat({
  isSidebarOpen,
  sidebarWidth,
  sessions,
  activeChatId,
  onSelectChat,
  onNewChat,
  onNewChatCreated,
  onTitleUpdate,
  refreshSessions,
  onSessionAnimationEnd
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [oldestSessionForDeletion, setOldestSessionForDeletion] = useState(null);
  const [messageToRetry, setMessageToRetry] = useState('');
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  // Each item: { file: File, type: 'text'|'image', name: string, preview?: string }
  const [showFileOptions, setShowFileOptions] = useState(false);

  const MAX_FILES = 5;
  const MAX_TOTAL_SIZE_MB = 20;
  const MAX_IMAGES = 3;
  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const { addNotification } = useNotification();
  const { user } = useUser();
  // "Tem acesso às features" — verificado no Latreo OU acesso concedido pelo Qython.
  const isVerified = hasPlatformAccess(user);
  const textareaRef = useRef(null);
  const chatHistoryRef = useRef(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const dropdownRef = useRef(null);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState({ type: '', content: '', id: null });
  const [shareMenu, setShareMenu] = useState({ open: false, messageId: null });
  const [shareState, setShareState] = useState({ step: 'SCOPE', scope: null });
  const abortControllerRef = useRef(null);
  const typingIntervalRef = useRef(null);
  const shareMenuRef = useRef(null);
  const [actionSuccess, setActionSuccess] = useState({ id: null, type: null });
  const [sessionToRefresh, setSessionToRefresh] = useState(null);
  const [libraries, setLibraries] = useState([]);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState(null);
  const [isConsultationPickerOpen, setIsConsultationPickerOpen] = useState(false);
  const [consultationContext, setConsultationContext] = useState(null);
  const [isPatientPickerOpen, setIsPatientPickerOpen] = useState(false);
  const [patientContext, setPatientContext] = useState(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeFeatureMessage, setUpgradeFeatureMessage] = useState('');
  const [upgradeFeatureType, setUpgradeFeatureType] = useState('premium');

  // Defer library fetch until modal is opened (performance optimization)
  const fetchLibrariesIfNeeded = useCallback(async () => {
    if (libraries.length === 0) {
      try {
        const userLibraries = await getLibraries();
        setLibraries(userLibraries);
      } catch (error) {
        console.error("Failed to fetch libraries:", error);
      }
    }
  }, [libraries.length]);

  useEffect(() => {
    if (!sessionToRefresh || !chatHistory.length) return;

    const lastMessage = chatHistory[chatHistory.length - 1];

    if (
      lastMessage.sender === 'bot' &&
      !lastMessage.isLoading &&
      lastMessage.fullBotResponse &&
      lastMessage.text.length >= lastMessage.fullBotResponse.length &&
      lastMessage.sessionId === sessionToRefresh
    ) {
      if (refreshSessions) {
        refreshSessions();
      }
      setSessionToRefresh(null);
    }
  }, [chatHistory, sessionToRefresh, refreshSessions]);


  const handleDeleteConversation = async (conversationId) => {
    try {
      await deleteChatSession(conversationId);
      addNotification(t('conversationDeletedSuccess'), 'success');
      refreshSessions();
      if (activeChatId === conversationId) {
        onSelectChat(null);
      }
    } catch (error) {
      addNotification(t('errorDeletingConversation'), 'error');
      console.error("Failed to delete conversation", error);
    }
  };

  const extractMeaningfulContent = (text) => {
    const parts = text.split('\n\n');
    if (parts.length > 1 && parts[0].startsWith('Olá! Sou Qython')) {
      return parts.slice(1).join('\n\n');
    }
    return text;
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (shareMenu.open && shareMenuRef.current && !shareMenuRef.current.contains(event.target) && !event.target.closest('[data-share-button]')) {
        setShareMenu({ open: false, messageId: null });
        setShareState({ step: 'SCOPE', scope: null });
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowFileOptions(false);
      }
    }

    if (showFileOptions || shareMenu.open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showFileOptions, shareMenu]);

  const scrollToBottom = () => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (chatHistoryRef.current) {
      const { scrollHeight, clientHeight, scrollTop } = chatHistoryRef.current;
      const SCROLL_THRESHOLD = 50;
      const isUserNearBottom = scrollHeight - clientHeight <= scrollTop + SCROLL_THRESHOLD;

      // Auto-scroll during bot typing animation (response being built character by character)
      const lastMsg = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;
      const isBotTyping = lastMsg && lastMsg.sender === 'bot' &&
        (lastMsg.isLoading || (lastMsg.fullBotResponse && lastMsg.text.length < lastMsg.fullBotResponse.length));

      if (isBotTyping || isUserNearBottom || (editingMessageId && chatHistory.length > 0 && chatHistory[chatHistory.length - 1].id === editingMessageId)) {
        chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
      }
    }
  }, [chatHistory, editingMessageId]);

  useEffect(() => {
    const loadConversation = async () => {
      if (activeChatId) {
        if (chatHistory.length > 0 && chatHistory.some(m => m.sessionId === activeChatId)) {
          return;
        }
        setChatHistory([]);
        try {
          const messages = await getChatMessages(activeChatId);
          const formattedHistory = messages.map((msg, index) => ({
            sender: msg.sender,
            text: msg.content,
            image: msg.image_url,
            fileNames: (() => {
              if (!msg.file_name) return null;
              try { return JSON.parse(msg.file_name); } catch { return [msg.file_name]; }
            })(),
            fullBotResponse: msg.sender === 'bot' ? msg.content : null,
            isLoading: false,
            id: msg.id || `${activeChatId}-${index}`,
            sessionId: activeChatId,
            sources: msg.sources,
          }));
          setChatHistory(formattedHistory);
        } catch (error) {
          addNotification(t('errorLoadingChat'), 'error');
          console.error("Erro ao carregar mensagens:", error);
        }
      } else {
        // New conversation - clear all related states
        setChatHistory([]);
        setSelectedLibrary(null);
        setConsultationContext(null);
        setAttachedFiles([]);
        setMessage('');
        setIsNewConversation(false);
        setEditingMessageId(null);
        setEditingText('');
      }
    };
    loadConversation();
  }, [activeChatId, addNotification, t]);

  const handleSendMessage = async (messageContent, isRetry = false) => {
    const messageToSend = messageContent || message;
    if (!messageToSend.trim() && attachedFiles.length === 0) {
      addNotification(t('pleaseTypeMessage'), 'warning');
      return;
    }

    const filesList = attachedFiles.length > 0 ? attachedFiles : null;
    const capturedImagePreview = attachedFiles.find(f => f.type === 'image')?.preview || null;
    let userMessageId = null;

    if (!isRetry) {
      userMessageId = Date.now() + '-user';
      const newUserMessage = {
        sender: 'user',
        text: messageToSend,
        image: capturedImagePreview,
        fileNames: attachedFiles.length > 0 ? attachedFiles.map(f => f.name) : null,
        isLoading: false,
        id: userMessageId,
      };
      setChatHistory(prev => [...prev, newUserMessage]);

      setMessage('');
      setAttachedFiles([]);
      setShowFileOptions(false);
    }

    const botMessagePlaceholder = {
      sender: 'bot',
      text: '',
      fullBotResponse: null,
      isLoading: true,
      id: Date.now() + '-bot',
    };
    setChatHistory(prev => [...prev, botMessagePlaceholder]);

    let localIsNewConversation = false;
    if (!activeChatId) {
      setIsNewConversation(true);
      localIsNewConversation = true;
    }

    // Build ephemeral history from off-topic exchanges (no session was created)
    // This gives the AI context when user follows up after an off-topic rejection
    let ephemeralHistory = null;
    if (!activeChatId && chatHistory.length > 0) {
      const ephemeralMessages = chatHistory
        .filter(msg => msg.id !== botMessagePlaceholder.id) // Exclude the loading placeholder
        .map(msg => ({ sender: msg.sender, content: msg.fullBotResponse || msg.text }))
        .filter(msg => msg.content && msg.content.length > 0);
      if (ephemeralMessages.length > 0) {
        ephemeralHistory = ephemeralMessages;
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const responseData = await sendChatMessage(
        messageToSend,
        false,
        filesList,
        controller.signal,
        activeChatId,
        selectedLibrary ? selectedLibrary.id : null,
        false,
        consultationContext,
        null,
        patientContext ? patientContext.id : null,
        ephemeralHistory
      );

      if (localIsNewConversation && responseData.session_id) {
        onNewChatCreated(responseData.session_id, responseData.new_title || 'Nova Conversa');
        setIsNewConversation(false);
        setSessionToRefresh(responseData.session_id);
      } else if (!localIsNewConversation && responseData.new_title) {
        onTitleUpdate(responseData.session_id, responseData.new_title);
      }

      // if (fileDetails) {
      //   setIsClinicalReasoningActive(true);
      // }

      const fullResponseText = responseData.response;
      const newSessionId = responseData.session_id;
      const responseSources = responseData.sources || null;

      setChatHistory(prev =>
        prev.map(msg =>
          msg.id === botMessagePlaceholder.id
            ? { ...msg, isLoading: false, fullBotResponse: fullResponseText, text: '', sessionId: newSessionId, sources: responseSources, training_data_id: responseData.training_data_id }
            : msg
        )
      );

    } catch (err) {
      if (err.response?.data?.detail?.limit_reached === true) {
        setChatHistory(prev => prev.filter(msg => msg.id !== botMessagePlaceholder.id));
        setMessageToRetry(messageToSend);

        const oldestSession = sessions && sessions.length > 0 ? sessions[sessions.length - 1] : null;
        if (oldestSession) {
          setOldestSessionForDeletion(oldestSession);
          setIsLimitModalOpen(true);
        } else {
          addNotification(t('conversationNotCreatedLimitReached'), 'info');
        }
      } else if (err.response?.data?.detail?.error === 'plan_upgrade_required') {
        // Plan upgrade required - show friendly upgrade modal
        // Remove both bot placeholder and user message (with image that triggered the error)
        setChatHistory(prev => prev.filter(msg =>
          msg.id !== botMessagePlaceholder.id && msg.id !== userMessageId
        ));
        setUpgradeFeatureMessage(err.response.data.detail.message);
        setUpgradeFeatureType(err.response.data.detail.feature || 'premium');
        setIsUpgradeModalOpen(true);
      } else if (axios.isCancel(err)) {
        console.log('Geração interrompida pelo usuário.');
        // Remove the loading bot message instead of showing cancelled text
        setChatHistory(prev => prev.filter(msg => !(msg.isLoading && msg.sender === 'bot')));
      } else {
        // User-friendly error messages - don't show technical details
        const statusCode = err.response?.status;
        let userMessage;
        if (statusCode >= 500) {
          userMessage = t('serverErrorGeneric', 'Ops! Algo deu errado no servidor. Por favor, tente novamente em alguns instantes.');
        } else if (statusCode === 429) {
          userMessage = t('rateLimitError', 'Muitas requisições. Aguarde um momento antes de tentar novamente.');
        } else if (statusCode >= 400) {
          userMessage = err.response?.data?.detail || t('requestError', 'Erro ao processar sua solicitação.');
        } else if (err.message?.includes('Network Error')) {
          userMessage = t('networkError', 'Erro de conexão. Verifique sua internet e tente novamente.');
        } else {
          userMessage = t('errorSendingMessage', 'Erro ao enviar mensagem. Tente novamente.');
        }
        addNotification(userMessage, 'error');
        console.error('Erro no chat:', err);
        setChatHistory(prev =>
          prev.map(msg =>
            msg.isLoading && msg.sender === 'bot'
              ? { ...msg, isLoading: false, text: t('errorLoadingResponse'), fullBotResponse: t('error') }
              : msg
          )
        );
      }
    } finally {
      abortControllerRef.current = null;
      setSelectedLibrary(null); // Limpa a biblioteca após o envio
    }
  };

  const handleConfirmDeleteOldestAndRetry = async () => {
    if (!oldestSessionForDeletion) return;

    setIsLimitModalOpen(false);
    await handleDeleteConversation(oldestSessionForDeletion.id);

    setTimeout(() => {
      handleSendMessage(messageToRetry, true);
    }, 500);

    setOldestSessionForDeletion(null);
    setMessageToRetry('');
  };

  const handleCancelDeleteOldest = () => {
    setIsLimitModalOpen(false);
    setOldestSessionForDeletion(null);
    setMessageToRetry('');
    addNotification(t('conversationNotCreatedLimitReached'), 'info');
  };

  const handleStartEdit = (messageId, currentText) => {
    setEditingMessageId(messageId);
    setEditingText(currentText);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleConfirmEdit = async () => {
    if (!editingText.trim()) {
      addNotification(t('pleaseTypeMessage'), 'warning');
      return;
    }

    const userMessageIndex = chatHistory.findIndex(msg => msg.id === editingMessageId);
    if (userMessageIndex === -1) return;

    const newChatHistory = chatHistory.slice(0, userMessageIndex + 1).map((msg, index) => {
      if (index === userMessageIndex) {
        return { ...msg, text: editingText, isLoading: false };
      }
      return msg;
    });

    const botMessagePlaceholder = {
      sender: 'bot', text: '', fullBotResponse: null, isLoading: true, id: Date.now() + '-bot',
    };
    newChatHistory.push(botMessagePlaceholder);

    setChatHistory(newChatHistory);
    const messageToSend = editingText;

    setEditingMessageId(null);
    setEditingText('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const responseData = await sendChatMessage(messageToSend, false, null, controller.signal, activeChatId, null, true);
      const fullResponseText = responseData.response;
      const responseSources = responseData.sources || null;

      setChatHistory(prev =>
        prev.map(msg =>
          msg.id === botMessagePlaceholder.id
            ? { ...msg, isLoading: false, fullBotResponse: fullResponseText, text: '', sources: responseSources }
            : msg
        )
      );
    } catch (err) {
      if (axios.isCancel(err)) {
        console.log('Geração da edição interrompida pelo usuário.');
        setChatHistory(prev =>
          prev.map(msg =>
            msg.isLoading && msg.sender === 'bot'
              ? { ...msg, isLoading: false, text: t('responseInterrupted'), fullBotResponse: t('responseInterrupted') }
              : msg
          )
        );
      } else {
        addNotification(err.message || t('errorSendingMessage'), 'error');
        setChatHistory(prev =>
          prev.map(msg =>
            msg.isLoading && msg.sender === 'bot'
              ? { ...msg, isLoading: false, text: t('errorLoadingResponse'), fullBotResponse: t('error') }
              : msg
          )
        );
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      return;
    }

    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
      setChatHistory(prev =>
        prev.map(msg => {
          if (msg.sender === 'bot' && !msg.isLoading && msg.fullBotResponse && msg.text.length < msg.fullBotResponse.length) {
            return { ...msg, fullBotResponse: msg.text };
          }
          return msg;
        })
      );
    }
  };

  const handleFileSelected = (event) => {
    const newFiles = Array.from(event.target.files);
    setAttachedFiles(prev => {
      const combined = [...prev];
      for (const file of newFiles) {
        if (combined.length >= MAX_FILES) {
          addNotification(t('maxFilesReached'), 'warning');
          break;
        }
        const totalSize = combined.reduce((sum, f) => sum + f.file.size, 0) + file.size;
        if (totalSize > MAX_TOTAL_SIZE_MB * 1024 * 1024) {
          addNotification(t('totalSizeExceeded'), 'warning');
          break;
        }
        const isImage = IMAGE_TYPES.includes(file.type);
        if (isImage && combined.filter(f => f.type === 'image').length >= MAX_IMAGES) {
          addNotification(t('maxImagesReached'), 'warning');
          continue;
        }
        combined.push({
          file,
          type: isImage ? 'image' : 'text',
          name: file.name,
          preview: isImage ? URL.createObjectURL(file) : null,
        });
      }
      return combined;
    });
    event.target.value = '';
    setShowFileOptions(false);
  };

  const handleRemoveFile = (index) => {
    setAttachedFiles(prev => {
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, 150)}px`;
    }
  };

  const handleInputChange = (e) => setMessage(e.target.value);

  useEffect(adjustTextareaHeight, [message]);

  const handleKeyDown = (e) => {
    // Enter sends message, Shift+Enter or Ctrl+Enter inserts line break
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      if (message.trim() || attachedFiles.length > 0) {
        handleSendMessage(message);
      }
    }
  };

  useEffect(() => {
    const lastBotMessage = chatHistory.find(
      (msg) =>
        msg.sender === 'bot' &&
        !msg.isLoading &&
        msg.fullBotResponse &&
        msg.text.length < msg.fullBotResponse.length
    );

    if (!lastBotMessage) {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      return;
    }

    if (typingIntervalRef.current) return;

    typingIntervalRef.current = setInterval(() => {
      setChatHistory((prevHistory) => {
        const msgIndex = prevHistory.findIndex((m) => m.id === lastBotMessage.id);
        if (msgIndex === -1) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
          return prevHistory;
        }

        const newHistory = [...prevHistory];
        const currentMsg = newHistory[msgIndex];
        const currentLength = currentMsg.text.length;
        const fullLength = currentMsg.fullBotResponse.length;

        if (currentLength < fullLength) {
          const chunkSize = 8; // Increased from 5 for 1.5x faster rendering
          const nextChunk = currentMsg.fullBotResponse.substring(currentLength, Math.min(currentLength + chunkSize, fullLength));
          newHistory[msgIndex] = { ...currentMsg, text: currentMsg.text + nextChunk };
          return newHistory;
        } else {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
          newHistory[msgIndex] = { ...currentMsg, text: currentMsg.fullBotResponse };
          return newHistory;
        }
      });
    }, 20);

    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    };
  }, [chatHistory]);

  const formatListContent = (text) => {
    if (!text) return '';
    // Junta APENAS um marcador de lista ÓRFÃO (sozinho na própria linha, ex.: "1." durante o
    // streaming) com a linha de conteúdo seguinte. Ancorado a início de linha e exigindo que o
    // marcador esteja SÓ → não toca em `**bold**` (fechamento `*\n`), nem em `---` (regra horizontal),
    // nem em marcadores que já têm conteúdo na mesma linha (que o regex antigo manglava → blob em negrito).
    return text.replace(/^([ \t]*(?:\d+\.|[-*+]))[ \t]*\n(?=\S)/gm, '$1 ');
  };

  const originalLeftCalculation = (isSidebarOpen ? sidebarWidth : 80) + 20 + (isSidebarOpen ? 10 : 20);
  const adjustedLeft = originalLeftCalculation - 2;

  const inputAreaWrapperStyle = {
    left: `${adjustedLeft}px`,
    right: `${20 + 8}px`,
  };

  const handleLike = async (likedMessage) => {
    const botMessageIndex = chatHistory.findIndex(m => m.id === likedMessage.id);
    const userPrompt = botMessageIndex > 0 ? chatHistory[botMessageIndex - 1].text : "N/A";
    const conversationContext = chatHistory.slice(0, botMessageIndex + 1).map(m => ({ sender: m.sender, text: m.text }));

    try {
      await submitFeedback({
        feedback_type: 'like',
        content_type: 'chat_response',
        content_id: likedMessage.id,
        training_data_id: likedMessage.training_data_id,
        original_content: likedMessage.fullBotResponse || likedMessage.text,
        user_prompt: userPrompt,
        conversation_context: conversationContext,
        feedback_text: '',
        contact_permission: false,
      });
      addNotification(t('feedbackSentSuccess'), 'success');
    } catch (error) {
      console.error("Failed to submit like feedback:", error);
      addNotification(t('feedbackSentError'), 'error');
    }
  };

  const handleDislike = (dislikedMessage) => {
    const botMessageIndex = chatHistory.findIndex(m => m.id === dislikedMessage.id);
    const userPrompt = botMessageIndex > 0 ? chatHistory[botMessageIndex - 1].text : "N/A";
    const conversationContext = chatHistory.slice(0, botMessageIndex + 1).map(m => ({ sender: m.sender, text: m.text }));

    setCurrentFeedback({
      type: 'dislike',
      content: dislikedMessage.fullBotResponse || dislikedMessage.text,
      id: dislikedMessage.id,
      training_data_id: dislikedMessage.training_data_id,
      user_prompt: userPrompt,
      conversation_context: conversationContext,
    });
    setIsFeedbackModalOpen(true);
  };

  const handleFeedbackSubmit = async (comment, contactPermission) => {
    try {
      await submitFeedback({
        feedback_type: currentFeedback.type,
        content_type: 'chat_response',
        content_id: currentFeedback.id,
        training_data_id: currentFeedback.training_data_id,
        original_content: currentFeedback.content,
        user_prompt: currentFeedback.user_prompt,
        conversation_context: currentFeedback.conversation_context,
        feedback_text: comment,
        contact_permission: contactPermission,
      });
      addNotification(t('feedbackSentSuccess'), 'success');
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      addNotification(t('feedbackSentError'), 'error');
    } finally {
      setIsFeedbackModalOpen(false);
    }
  };

  const handleCopy = (markdownText, messageId) => {
    const plainText = convertMarkdownToPlainText(markdownText);
    navigator.clipboard.writeText(plainText)
      .then(() => {
        setActionSuccess({ id: messageId, type: 'copy' });
        setTimeout(() => setActionSuccess({ id: null, type: null }), 2000);
      })
      .catch(err => {
        console.error("Erro ao copiar para a área de transferência:", err);
        addNotification(t('errorCopying'), 'error');
      });
  };

  const getConversationUntil = (messageId) => {
    const messageIndex = chatHistory.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return '';

    return chatHistory
      .slice(0, messageIndex + 1)
      .map(msg => `${msg.sender === 'user' ? 'Você' : 'Quíron'}:\n${convertMarkdownToPlainText(msg.text)}`)
      .join('\n\n');
  };

  const handleShareAction = async (shareFn, messageId, scope) => {
    setShareMenu({ open: false, messageId: null });
    setShareState({ step: 'SCOPE', scope: null });

    const message = chatHistory.find(m => m.id === messageId);
    if (!message) return;

    const content = scope === 'CONVERSATION'
      ? getConversationUntil(messageId)
      : extractMeaningfulContent(message.text);

    const userMessageIndex = chatHistory.findIndex(m => m.id === messageId) - 1;
    const title = userMessageIndex >= 0 ? chatHistory[userMessageIndex].text : t('qython');

    const success = await shareFn(content, title);
    if (success) {
      setActionSuccess({ id: messageId, type: 'share' });
      setTimeout(() => setActionSuccess({ id: null, type: null }), 2000);
    }
  };

  const handleRedo = async (messageId) => {
    const botMessageIndex = chatHistory.findIndex(m => m.id === messageId);
    if (botMessageIndex < 1) {
      addNotification(t('cannotRedoThisMessage'), 'warning');
      return;
    }

    const userMessageIndex = botMessageIndex - 1;
    const userMessage = chatHistory[userMessageIndex];

    if (!userMessage || userMessage.sender !== 'user') {
      addNotification(t('cannotRedoWithoutPreviousUserMessage'), 'warning');
      return;
    }

    const messageToSend = userMessage.text;
    const botMessagePlaceholder = {
      sender: 'bot', text: '', fullBotResponse: null, isLoading: true, id: Date.now() + '-bot',
    };

    // Keep all messages up to (but not including) the bot message, then add new placeholder
    // This preserves the user message and only replaces the bot response
    const updatedHistory = [
      ...chatHistory.slice(0, botMessageIndex),
      botMessagePlaceholder,
    ];

    setChatHistory(updatedHistory);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const responseData = await sendChatMessage(messageToSend, false, null, controller.signal, activeChatId, null, true);
      const fullResponseText = responseData.response;
      const responseSources = responseData.sources || null;

      setChatHistory(prev =>
        prev.map(msg =>
          msg.id === botMessagePlaceholder.id
            ? { ...msg, isLoading: false, fullBotResponse: fullResponseText, text: '', sources: responseSources }
            : msg
        )
      );
    } catch (err) {
      const errorMessage = err.response?.status === 500
        ? t('redoFailedServerError')
        : err.message || t('errorSendingMessage');

      addNotification(errorMessage, 'error');

      setChatHistory(prev =>
        prev.map(msg =>
          msg.id === botMessagePlaceholder.id
            ? { ...msg, isLoading: false, text: t('errorLoadingResponse'), fullBotResponse: t('error') }
            : msg
        )
      );
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleShare = (e, messageId) => {
    e.stopPropagation();
    const isOpen = shareMenu.open && shareMenu.messageId === messageId;
    setShareMenu({
      open: !isOpen,
      messageId: isOpen ? null : messageId,
    });
    if (isOpen) {
      setShareState({ step: 'SCOPE', scope: null });
    }
  };

  return (
    <div className={`${styles.chatWrapper} ${!isSidebarOpen ? styles.adjustedForClosedSidebar : ''}`}>
      <div className={styles.chatHeader}>
        <div className={styles.headerTitleWrapper}>
          <FontAwesomeIcon icon={faBrain} className={styles.headerIcon} />
          <h2 className={styles.chatTitle}>{t('copilotTitle')}</h2>
        </div>
        <ConversationNavBar
          data-tour="copilot-conversations"
          conversations={sessions}
          activeConversation={activeChatId}
          onSelectConversation={onSelectChat}
          onNewChat={onNewChat}
          onDeleteConversation={handleDeleteConversation}
          onSessionAnimationEnd={onSessionAnimationEnd}
        />
      </div>

      <div className={styles.chatBody} ref={chatHistoryRef}>
        <div className={styles.chatHistory}>
          {chatHistory.length === 0 && (
            <CopilotEmptyState
              onPick={(opener) => setMessage(opener)}
              name={user?.name || user?.full_name}
              treatment={user?.treatment}
            />
          )}
          {chatHistory.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.messageWrapper} ${msg.sender === 'user' ? styles.userMessageWrapper : styles.botMessageWrapper}`}
            >
              {msg.sender === 'user' && editingMessageId === msg.id ? (
                <div className={`${styles.messageBubble} ${styles.editingBubble}`}>
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    className={styles.editingTextarea}
                    autoFocus
                  />
                  <div className={styles.editActions}>
                    <button onClick={handleConfirmEdit} className={`${styles.editActionButton} ${styles.confirmButton}`} title={t('saveChanges')}>
                      <FontAwesomeIcon icon={faCheck} />
                    </button>
                    <button onClick={handleCancelEdit} className={`${styles.editActionButton} ${styles.cancelButton}`} title={t('cancel')}>
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`${styles.messageBubble} ${msg.sender === 'user' ? styles.userMessageBubble : styles.botMessageBubble}`}
                >
                  {msg.sender === 'user' && msg.image && (
                    <div className={styles.messageImageContainer}>
                      <img
                        src={msg.image.startsWith('blob:') ? msg.image : `${API_STATIC_URL}${msg.image}`}
                        alt={t('imagePreview')}
                        className={styles.messageImage}
                      />
                    </div>
                  )}
                  {msg.sender === 'user' && msg.fileNames && msg.fileNames.length > 0 && (
                    <div className={styles.attachmentBadgeRow}>
                      {msg.fileNames.map((name, idx) => {
                        const ext = name.split('.').pop().toLowerCase();
                        const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
                        return (
                          <div key={idx} className={styles.attachmentBadge}>
                            <FontAwesomeIcon icon={isImg ? faImage : faFileLines} className={styles.attachmentIcon} />
                            <span className={styles.attachmentName}>{name}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {msg.isLoading && msg.sender === 'bot' ? (
                    <div className={styles.loadingAnimationContainer}>
                      <svg viewBox="0 0 75 25" className={styles.neuralWaveAnimation}>
                        <path d="M0 12.5 C 15 5 25 20 37.5 12.5 S 55 5 65 15 L 75 12.5" className={styles.neuralWavePath1} />
                        <path d="M0 12.5 C 20 20 30 5 42.5 12.5 S 60 20 70 10 L 75 12.5" className={styles.neuralWavePath2} />
                        <path d="M0 8 C 10 15 25 2 37.5 8 S 50 15 60 5 L 75 8" className={styles.neuralWavePath3} />
                      </svg>
                    </div>
                  ) : (
                    <>
                      <div className={styles.messageText}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeSanitize]}
                          components={{
                            p: ({ node, ...props }) => <p style={{ margin: 0 }} {...props} />,
                            // Imagem vinda da biblioteca do usuário (resolvida no backend a partir
                            // de [IMAGEM: ...]). Abre em nova aba no clique para o médico ampliar.
                            img: ({ node, src, alt, ...props }) => (
                              <a href={src} target="_blank" rel="noopener noreferrer" className={styles.answerImageLink}>
                                <img src={src} alt={alt || ''} className={styles.answerImage} loading="lazy" {...props} />
                              </a>
                            ),
                            a: ({ node, href, children, ...props }) => {
                              const m = /^#qref-(\d+)$/.exec(href || '');
                              if (m && msg.sources) {
                                const n = parseInt(m[1], 10);
                                const src = msg.sources[n - 1];
                                const badgeLabel = src ? t(referenceBadgeI18nKey(src)) : null;
                                return (
                                  <button
                                    type="button"
                                    className={styles.citeChip}
                                    title={src?.title || src?.uri || ''}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      const el = document.getElementById(`qref-${n}`);
                                      if (el) {
                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        el.classList.add(styles.refFlash);
                                        setTimeout(() => el.classList.remove(styles.refFlash), 1600);
                                      }
                                    }}
                                  >
                                    {/* tipo + número: "Web 6" → o médico sabe QUAL fonte (badge sozinho era ambíguo) */}
                                    {badgeLabel ? (<>{badgeLabel}<span className={styles.citeNum}>{n}</span></>) : `[${n}]`}
                                  </button>
                                );
                              }
                              return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
                            },
                          }}
                        >
                          {msg.sender === 'bot' ?
                            linkifyCitations(msg.fullBotResponse && msg.text.length < msg.fullBotResponse.length ? formatListContent(msg.text) + '▍' : formatListContent(msg.text), msg.sources) :
                            msg.text
                          }
                        </ReactMarkdown>
                      </div>
                      {/* Render sources section for bot messages with grounding data - academic style */}
                      {msg.sender === 'bot' && msg.sources && msg.sources.length > 0 && msg.fullBotResponse && msg.text.length >= msg.fullBotResponse.length && (
                        <div className={styles.sourcesSection}>
                          <div className={styles.sourcesHeader}>
                            <FontAwesomeIcon icon={faQuoteLeft} />
                            <span>{t('references')}</span>
                          </div>
                          <div className={styles.sourcesList}>
                            {msg.sources.map((source, idx) => {
                              const sourceUrl = source.uri || source.url;
                              const sourceIndicator = t(referenceBadgeI18nKey(source));
                              // Build fallback title from author/year if title is missing
                              let fullTitle = source.title;
                              if (!fullTitle || fullTitle === 'null' || fullTitle === 'None') {
                                const parts = [];
                                if (source.author) parts.push(`${source.author} et al.`);
                                if (source.year) parts.push(`(${source.year})`);
                                fullTitle = parts.length > 0 ? parts.join(' ') : t('untitledSource');
                              }
                              const displayTitle = truncateTitle(fullTitle, 70);

                              return (
                                <div key={idx} id={`qref-${idx + 1}`} className={styles.sourceItem}>
                                  <span className={styles.sourceNumber}>[{idx + 1}]</span>
                                  <a
                                    href={sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.sourceLink}
                                    title={fullTitle}
                                  >
                                    {sourceIndicator && (
                                      <span className={styles.sourceBadge}>{sourceIndicator}</span>
                                    )}
                                    <span className={styles.sourceTitle}>{displayTitle}</span>
                                    {source.author && (
                                      <span className={styles.sourceAuthor}> — {source.author}</span>
                                    )}
                                    {source.year && (
                                      <span className={styles.sourceYear}> ({source.year})</span>
                                    )}
                                    <FontAwesomeIcon icon={faExternalLinkAlt} className={styles.sourceLinkIcon} />
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {msg.sender === 'user' && !editingMessageId && !msg.isLoading && (
                <div className={styles.messageActions}>
                  <button
                    onClick={() => handleStartEdit(msg.id, msg.text)}
                    title={t('editMessage')}
                  >
                    <FontAwesomeIcon icon={faPenToSquare} />
                  </button>
                </div>
              )}

              {msg.sender === 'bot' && !msg.isLoading && msg.fullBotResponse && msg.text.length >= msg.fullBotResponse.length && (
                <div className={styles.messageActions}>
                  <button onClick={() => handleLike(msg)} title={t('like')}><FontAwesomeIcon icon={faThumbsUp} /></button>
                  <button onClick={() => handleDislike(msg)} title={t('dislike')}><FontAwesomeIcon icon={faThumbsDown} /></button>
                  <button onClick={() => handleCopy(msg.text, msg.id)} title={t('copy')}>
                    {actionSuccess.id === msg.id && actionSuccess.type === 'copy' ? <FontAwesomeIcon icon={faCheck} className={styles.successIcon} /> : <FontAwesomeIcon icon={faCopy} />}
                  </button>
                  <button onClick={() => handleRedo(msg.id)} title={t('redoResponse')}><FontAwesomeIcon icon={faArrowRotateRight} /></button>

                  <div style={{ position: 'relative' }}>
                    <button onClick={(e) => handleShare(e, msg.id)} title={t('share')} data-share-button>
                      {actionSuccess.id === msg.id && actionSuccess.type === 'share' ? <FontAwesomeIcon icon={faCheck} className={styles.successIcon} /> : <FontAwesomeIcon icon={faShareNodes} />}
                    </button>
                    {shareMenu.open && shareMenu.messageId === msg.id && (
                      <div ref={shareMenuRef} className={`${styles.shareMenu} ${styles.shareMenuOpen}`}>
                        {shareState.step === 'SCOPE' ? (
                          <>
                            <button className={styles.shareMenuItem} onClick={() => setShareState({ ...shareState, step: 'FORMAT', scope: 'CONVERSATION' })}>
                              <span>{t('shareConversationUntilHere')}</span>
                            </button>
                            <button className={styles.shareMenuItem} onClick={() => setShareState({ ...shareState, step: 'FORMAT', scope: 'SINGLE' })}>
                              <span>{t('shareOnlyThisResponse')}</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className={styles.shareMenuItem}
                              onClick={() => handleShareAction((content, title) => handleShareAsTxt(content, title, t, addNotification), msg.id, shareState.scope)}
                              title={t('shareAsTxtTooltip')}
                            >
                              <FontAwesomeIcon icon={faFileLines} />
                              <span>{t('shareAsTxtLabel')}</span>
                            </button>
                            <button
                              className={styles.shareMenuItem}
                              onClick={() => handleShareAction((content) => handleShareAsPdf(content, addNotification, i18n), msg.id, shareState.scope)}
                              title={t('shareAsPdfTooltip')}
                            >
                              <FontAwesomeIcon icon={faFilePdf} />
                              <span>{t('shareAsPdfLabel')}</span>
                            </button>
                            <button
                              className={styles.shareMenuItem}
                              onClick={() => handleShareAction((content, title) => handleShareAsMarkdown(content, title, t, addNotification), msg.id, shareState.scope)}
                              title={t('shareAsMdTooltip')}
                            >
                              <FontAwesomeIcon icon={faFileCode} />
                              <span>{t('shareAsMdLabel')}</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div
        className={styles.inputAreaFixedWrapper}
        style={inputAreaWrapperStyle}
      >
        {selectedLibrary && (
          <div className={styles.libraryTag}>
            <FontAwesomeIcon icon={faBook} />
            <span>{t('libraryAttached')}: {selectedLibrary.name}</span>
            <button onClick={() => setSelectedLibrary(null)} title={t('removeLibrary')}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        )}
        {consultationContext && (
          <div className={styles.libraryTag}>
            <FontAwesomeIcon icon={faStethoscope} />
            <span>{t('consultationAttached')}: {consultationContext.specialty}</span>
            <button onClick={() => setConsultationContext(null)} title={t('removeConsultation')}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        )}
        {patientContext && (
          <div className={styles.libraryTag}>
            <FontAwesomeIcon icon={faUser} />
            <span>{t('patientAttached')}: {patientContext.full_name}</span>
            <button onClick={() => setPatientContext(null)} title={t('removePatient')}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        )}
        <div className={styles.chatInputContainer}>
          {attachedFiles.length > 0 && (
            <div className={styles.filePreviewRow}>
              {attachedFiles.map((f, idx) => (
                <div key={idx} className={styles.filePreviewChip}>
                  {f.type === 'image' ? (
                    <img src={f.preview} alt={f.name} className={styles.chipPreviewImage} />
                  ) : (
                    <FontAwesomeIcon icon={faFileLines} className={styles.chipFileIcon} />
                  )}
                  <span className={styles.chipFileName}>{f.name}</span>
                  <button onClick={() => handleRemoveFile(idx)} className={styles.chipRemoveButton}>×</button>
                </div>
              ))}
              <span className={styles.fileCount}>{attachedFiles.length}/{MAX_FILES}</span>
            </div>
          )}
          <div className={styles.inputArea}>
            <div className={styles.textareaWrapper} data-tour="copilot-input">
              <textarea
                ref={textareaRef}
                className={styles.chatInput}
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={!isVerified || chatHistory.some(m => m.isLoading)}
                placeholder={!isVerified ? "Aguardando verificação de conta para liberar o chat..." : t('chatPlaceholder')}
              />
            </div>
            <div className={styles.chatInputButtonsWrapper}>
              <div className={styles.fileUploadDropdown} ref={dropdownRef} data-tour="copilot-attachments">
                <button
                  className={`${styles.chatIconButton} ${styles.fileUploadButton} ${(showFileOptions || attachedFiles.length > 0 || selectedLibrary || patientContext) ? styles.active : ''}`}
                  title={t('attachFile')}
                  onClick={() => setShowFileOptions(!showFileOptions)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49" />
                  </svg>
                </button>
                {showFileOptions && (
                  <div className={styles.dropdownContent}>
                    <button
                      onClick={() => {
                        document.getElementById('textFile-input').click();
                      }}
                    >
                      <FontAwesomeIcon icon={faFileLines} className={styles.dropdownIcon} />
                      <span>{t('textFile')}</span>
                    </button>
                    <button
                      onClick={() => {
                        document.getElementById('imageExam-input').click();
                      }}
                    >
                      <FontAwesomeIcon icon={faImage} className={styles.dropdownIcon} />
                      <span>{t('imageFile')}</span>
                    </button>
                    <button
                      onClick={() => {
                        fetchLibrariesIfNeeded();
                        setIsLibraryModalOpen(true);
                        setShowFileOptions(false);
                      }}
                      data-tour="copilot-library"
                    >
                      <FontAwesomeIcon icon={faBook} className={styles.dropdownIcon} />
                      <span>{t('selectLibrary')}</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsConsultationPickerOpen(true);
                        setShowFileOptions(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faStethoscope} className={styles.dropdownIcon} />
                      <span>{t('selectConsultation')}</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsPatientPickerOpen(true);
                        setShowFileOptions(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faUser} className={styles.dropdownIcon} />
                      <span>{t('selectPatient')}</span>
                    </button>
                  </div>
                )}
                <input type="file" id="textFile-input" style={{ display: 'none' }} onChange={handleFileSelected} accept=".txt,.pdf,.docx,.md,.csv,.json,.xml,.html" multiple />
                <input type="file" id="imageExam-input" style={{ display: 'none' }} onChange={handleFileSelected} accept="image/png,image/jpeg,image/gif,image/webp" multiple />
              </div>
              {chatHistory.some(m => m.isLoading || (m.sender === 'bot' && m.fullBotResponse && m.text.length < m.fullBotResponse.length)) ? (
                <button
                  onClick={handleStopGeneration}
                  className={`${styles.chatIconButton} ${styles.stopButton}`}
                  title={t('stopGeneration')}
                >
                  <FontAwesomeIcon icon={faStop} />
                </button>
              ) : (
                <button
                  onClick={() => handleSendMessage(message)}
                  disabled={!isVerified || (!message.trim() && attachedFiles.length === 0)}
                  className={`${styles.chatIconButton} ${styles.sendButton}`}
                  title={!isVerified ? "Aguarde a verificação da conta" : t('sendMessageHint')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
        <div className={styles.chatInfoText}>{t('bibliographicalReferencesHealthNote')}</div>
      </div>
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        onSubmit={handleFeedbackSubmit}
        feedbackType={currentFeedback.type}
      />
      <ConfirmationModal
        isOpen={isLimitModalOpen}
        onClose={handleCancelDeleteOldest}
        onConfirm={handleConfirmDeleteOldestAndRetry}
        title={t('conversationLimitReachedTitle')}
        message={t('conversationLimitReachedMessage', {
          limit: 20,
          title: oldestSessionForDeletion?.title
        })}
        confirmButtonText={t('deleteOldestAndContinue')}
        cancelButtonText={t('cancel')}
      />
      <LibrarySelectionModal
        isOpen={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        onSelectLibrary={(library) => setSelectedLibrary(library)}
      />
      <ConsultationPickerModal
        isOpen={isConsultationPickerOpen}
        onClose={() => setIsConsultationPickerOpen(false)}
        onSelect={(context) => setConsultationContext(context)}
      />
      <PatientPickerModal
        isOpen={isPatientPickerOpen}
        onClose={() => setIsPatientPickerOpen(false)}
        onSelect={(patient) => setPatientContext({ id: patient.id, full_name: patient.full_name })}
      />
      {/* Upgrade Modal for plan-restricted features */}
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        onUpgrade={() => {
          setIsUpgradeModalOpen(false);
          navigate('/pricing');
        }}
        feature={upgradeFeatureType}
        message={upgradeFeatureMessage}
      />
    </div>
  );
}

export default Chat;