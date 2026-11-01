// frontend/src/components/library/LibraryChat.js
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faThumbsUp,
  faThumbsDown,
  faBook,
  faShieldAlt,
  faLightbulb
} from '@fortawesome/free-solid-svg-icons';
import { sendLibraryChatMessage, submitFeedback } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import FeedbackModal from '../shared/FeedbackModal';
import styles from './LibraryChat.module.css';

const LibraryChat = ({ library, onBack }) => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const [chatHistory, setChatHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState({ type: '', content: '', id: null });
  const [showWelcome, setShowWelcome] = useState(true);
  const chatHistoryRef = useRef(null);
  const textareaRef = useRef(null);

  // Suggested questions
  const suggestedQuestions = [
    t('librarySuggestion1'),
    t('librarySuggestion2'),
    t('librarySuggestion3'),
  ];

  useEffect(() => {
    // Scroll to bottom on new message
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatHistory]);

  useEffect(() => {
    const adjustTextareaHeight = () => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = '24px';
        const scrollHeight = textarea.scrollHeight;
        textarea.style.height = `${Math.min(scrollHeight, 150)}px`;
      }
    };
    adjustTextareaHeight();
  }, [message]);

  // Hide welcome when user sends first message
  useEffect(() => {
    if (chatHistory.length > 0) {
      setShowWelcome(false);
    }
  }, [chatHistory]);

  const handleSendMessage = async (customMessage) => {
    const msgToSend = customMessage || message;
    if (!msgToSend.trim() || isLoading) return;

    const userMessage = { sender: 'user', content: msgToSend };
    setChatHistory(prev => [...prev, userMessage]);
    setMessage('');
    setIsLoading(true);

    try {
      const historyForApi = chatHistory.map(msg => ({
        sender: msg.sender,
        content: msg.content,
      }));

      const response = await sendLibraryChatMessage(library.id, msgToSend, historyForApi);
      const botMessage = { sender: 'bot', content: response.response, training_data_id: response.training_data_id };
      setChatHistory(prev => [...prev, botMessage]);
    } catch (error) {
      const errorMessage = { sender: 'bot', content: t('errorSendingMessage') };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    handleSendMessage(suggestion);
  };

  const handleKeyUp = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // --- Feedback Handlers ---
  const handleLike = async (msgIndex) => {
    const likedMessage = chatHistory[msgIndex];
    const userPrompt = msgIndex > 0 ? chatHistory[msgIndex - 1].content : "N/A";
    const conversationContext = chatHistory.slice(0, msgIndex + 1).map(m => ({ sender: m.sender, content: m.content }));

    try {
      await submitFeedback({
        feedback_type: 'like',
        content_type: 'library_rag_chat',
        content_id: `lib_${library.id}_msg_${msgIndex}`,
        training_data_id: likedMessage.training_data_id,
        original_content: likedMessage.content,
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

  const handleDislike = (msgIndex) => {
    const dislikedMessage = chatHistory[msgIndex];
    const userPrompt = msgIndex > 0 ? chatHistory[msgIndex - 1].content : "N/A";
    const conversationContext = chatHistory.slice(0, msgIndex + 1).map(m => ({ sender: m.sender, content: m.content }));

    setCurrentFeedback({
      type: 'dislike',
      content: dislikedMessage.content,
      id: `lib_${library.id}_msg_${msgIndex}`,
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
        content_type: 'library_rag_chat',
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

  return (
    <div className={styles.chatContainer}>
      {/* Header with badge */}
      <div className={styles.chatHeader}>
        <button onClick={onBack} className={styles.backButton}>
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <div className={styles.headerCenter}>
          <h3 className={styles.chatTitle}>{t('chatWithLibrary', { name: library.name })}</h3>
          <span className={styles.libraryModeBadge}>
            <FontAwesomeIcon icon={faBook} />
            {t('libraryModeLabel')}
          </span>
        </div>
      </div>

      {/* Chat body */}
      <div className={styles.chatBody} ref={chatHistoryRef}>
        {/* Welcome message - only shows before first message */}
        {showWelcome && chatHistory.length === 0 && (
          <div className={styles.welcomeContainer}>
            <div className={styles.welcomeIcon}>
              <FontAwesomeIcon icon={faBook} />
            </div>
            <h4 className={styles.welcomeTitle}>{t('libraryWelcomeTitle')}</h4>
            <p className={styles.welcomeDescription}>{t('libraryWelcomeDesc')}</p>

            {/* Trust indicator */}
            <div className={styles.trustBadge}>
              <FontAwesomeIcon icon={faShieldAlt} />
              <span>{t('libraryTrustBadge')}</span>
            </div>

            {/* Suggested questions */}
            <div className={styles.suggestionsSection}>
              <p className={styles.suggestionsLabel}>
                <FontAwesomeIcon icon={faLightbulb} />
                {t('trySuggestions')}
              </p>
              <div className={styles.suggestionsGrid}>
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={index}
                    className={styles.suggestionChip}
                    onClick={() => handleSuggestionClick(question)}
                    disabled={isLoading}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Chat messages */}
        {chatHistory.map((msg, index) => (
          <div key={index} className={`${styles.messageWrapper} ${msg.sender === 'user' ? styles.userMessageWrapper : styles.botMessageWrapper}`}>
            <div className={`${styles.messageBubble} ${msg.sender === 'user' ? styles.userMessageBubble : styles.botMessageBubble}`}>
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{msg.content}</ReactMarkdown>
            </div>
            {msg.sender === 'bot' && (
              <div className={styles.messageActions}>
                <button onClick={() => handleLike(index)} title={t('like')} className={styles.feedbackBtn}>
                  <FontAwesomeIcon icon={faThumbsUp} />
                </button>
                <button onClick={() => handleDislike(index)} title={t('dislike')} className={styles.feedbackBtn}>
                  <FontAwesomeIcon icon={faThumbsDown} />
                </button>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className={`${styles.messageWrapper} ${styles.botMessageWrapper}`}>
            <div className={`${styles.messageBubble} ${styles.botMessageBubble}`}>
              <div className={styles.loadingAnimationContainer}>
                <svg viewBox="0 0 75 25" className={styles.neuralWaveAnimation}>
                  <path d="M0 12.5 C 15 5 25 20 37.5 12.5 S 55 5 65 15 L 75 12.5" className={styles.neuralWavePath1} />
                  <path d="M0 12.5 C 20 20 30 5 42.5 12.5 S 60 20 70 10 L 75 12.5" className={styles.neuralWavePath2} />
                  <path d="M0 8 C 10 15 25 2 37.5 8 S 50 15 60 5 L 75 8" className={styles.neuralWavePath3} />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className={styles.inputAreaWrapper}>
        <div className={styles.inputArea}>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyUp={handleKeyUp}
            placeholder={t('askAboutYourDocs')}
            rows={1}
            disabled={isLoading}
          />
          <div className={styles.chatInputButtonsWrapper}>
            <button
              onClick={() => handleSendMessage()}
              className={`${styles.chatIconButton} ${styles.sendButton}`}
              disabled={isLoading || !message.trim()}
              title={t('sendMessageHint')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        onSubmit={handleFeedbackSubmit}
      />
    </div>
  );
};

export default LibraryChat;
