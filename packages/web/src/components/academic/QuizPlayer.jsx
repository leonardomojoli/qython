// frontend/src/components/academic/QuizPlayer.js
// Complete quiz player with XP system, answer review, progress dots, auto-save

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getSimuladoJobStatus, clearSimuladoJob, submitQuiz } from '../../api';
import styles from './QuizPlayer.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faChevronLeft, faChevronRight, faTimes, faFire,
    faCheck, faTrophy, faArrowUp, faBolt, faClock,
    faChevronDown, faChevronUp as faChevronUpIcon
} from '@fortawesome/free-solid-svg-icons';
import InlineLoading from '../shared/InlineLoading';
import { useNotification } from '../../contexts/NotificationContext';

const QUIZ_DURATION = 4 * 60 * 60; // 4 hours
const AUTOSAVE_KEY = 'qython_quiz_autosave';

const DIFFICULTY_COLORS = {
    facil: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', label: 'Fácil' },
    medio: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', label: 'Médio' },
    dificil: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: 'Difícil' },
};

const QuizPlayer = ({ activeJob, onClose }) => {
    const { t } = useTranslation();
    const { addNotification } = useNotification();
    const startTimeRef = useRef(Date.now());

    const [jobStatus, setJobStatus] = useState(activeJob.status);
    const [errorMessage, setErrorMessage] = useState(activeJob.error_message);
    const [quizQuestions, setQuizQuestions] = useState(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState({});
    const [timeLeft, setTimeLeft] = useState(QUIZ_DURATION);
    const [quizResult, setQuizResult] = useState(null); // XP result screen
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [slideDirection, setSlideDirection] = useState(null); // 'left' or 'right'
    const [expandedReview, setExpandedReview] = useState({}); // which review items are expanded

    // Auto-save: restore progress on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(AUTOSAVE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.jobId === activeJob.id && data.questions) {
                    setQuizQuestions(data.questions);
                    setCurrentQuestionIndex(data.currentIndex || 0);
                    setUserAnswers(data.answers || {});
                    setTimeLeft(data.timeLeft || QUIZ_DURATION);
                    setJobStatus('completed');
                    startTimeRef.current = Date.now() - ((QUIZ_DURATION - (data.timeLeft || QUIZ_DURATION)) * 1000);
                    return; // Skip polling — already have questions
                }
            }
        } catch { /* ignore parse errors */ }
    }, [activeJob.id]);

    // Auto-save: persist on every answer change
    useEffect(() => {
        if (quizQuestions && !quizResult) {
            try {
                localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
                    jobId: activeJob.id,
                    questions: quizQuestions,
                    currentIndex: currentQuestionIndex,
                    answers: userAnswers,
                    timeLeft,
                }));
            } catch { /* storage full — ignore */ }
        }
    }, [userAnswers, currentQuestionIndex, timeLeft, quizQuestions, quizResult, activeJob.id]);

    // Clear auto-save on close or result
    const clearAutosave = useCallback(() => {
        try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
    }, []);

    // Job status polling
    useEffect(() => {
        if (!activeJob || !['pending', 'processing'].includes(jobStatus)) return;

        const interval = setInterval(async () => {
            try {
                const updatedJob = await getSimuladoJobStatus(activeJob.id);
                setJobStatus(updatedJob.status);

                if (updatedJob.status === 'completed') {
                    clearInterval(interval);
                    setQuizQuestions(updatedJob.result_content?.questionario_objetivo || []);
                    startTimeRef.current = Date.now();
                    await clearSimuladoJob(updatedJob.id);
                } else if (updatedJob.status === 'error') {
                    clearInterval(interval);
                    setErrorMessage(updatedJob.error_message || t('unknownError'));
                    await clearSimuladoJob(updatedJob.id);
                }
            } catch (error) {
                setErrorMessage(error.message);
                setJobStatus('error');
                clearInterval(interval);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [activeJob, jobStatus, t]);

    // Quiz timer
    useEffect(() => {
        if (jobStatus !== 'completed' || quizResult) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleSubmit();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [jobStatus, quizResult]); // eslint-disable-line react-hooks/exhaustive-deps

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const totalQuestions = quizQuestions?.length || 0;
    const currentQuestion = quizQuestions ? quizQuestions[currentQuestionIndex] : null;
    const answeredCount = Object.keys(userAnswers).length;

    const handleAnswerSelect = (answerIndex) => {
        setUserAnswers(prev => ({ ...prev, [currentQuestionIndex]: answerIndex }));
    };

    const handleNextQuestion = () => {
        if (currentQuestionIndex < totalQuestions - 1) {
            setSlideDirection('left');
            setTimeout(() => {
                setCurrentQuestionIndex(prev => prev + 1);
                setSlideDirection(null);
            }, 150);
        }
    };

    const handlePreviousQuestion = () => {
        if (currentQuestionIndex > 0) {
            setSlideDirection('right');
            setTimeout(() => {
                setCurrentQuestionIndex(prev => prev - 1);
                setSlideDirection(null);
            }, 150);
        }
    };

    const handleDotClick = (index) => {
        setCurrentQuestionIndex(index);
    };

    const handleSubmit = async () => {
        if (isSubmitting) return;

        const unanswered = totalQuestions - answeredCount;
        if (unanswered > 0 && timeLeft > 0) {
            const confirmed = window.confirm(
                t('unansweredWarning', { count: unanswered }) ||
                `Você tem ${unanswered} questão(ões) sem resposta. Deseja enviar mesmo assim?`
            );
            if (!confirmed) return;
        }

        setIsSubmitting(true);
        try {
            const timeElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
            const result = await submitQuiz({
                specialty: activeJob.exam || 'Geral',
                mode: activeJob.exam || 'challenge',
                answers: userAnswers,
                questions: quizQuestions,
                time_elapsed_seconds: timeElapsed,
            });

            setQuizResult(result);
            clearAutosave();
        } catch (error) {
            addNotification(error.message || t('errorSubmittingQuiz'), 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        // Confirm if quiz is in progress (not on result screen)
        if (quizQuestions && !quizResult) {
            const confirmed = window.confirm(
                t('exitQuizWarning') || 'Tem certeza? Seu progresso será perdido.'
            );
            if (!confirmed) return;
        }
        clearAutosave();
        onClose();
    };

    const toggleReviewItem = (index) => {
        setExpandedReview(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const progressPercentage = totalQuestions > 0 ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;

    // ==================== RENDER: RESULT SCREEN ====================
    const renderResultScreen = () => {
        if (!quizResult) return null;

        const { xp_earned, xp_breakdown, correct_count, incorrect_count, unanswered_count,
            total_questions, accuracy_pct, answers_detail, streak } = quizResult;

        return (
            <div className={styles.resultScreen}>
                <div className={styles.resultHeader}>
                    <div className={styles.resultXpBig}>+{xp_earned} XP</div>
                    <div className={styles.resultAccuracy}>
                        {correct_count}/{total_questions} {t('correct') || 'corretas'} ({accuracy_pct}%)
                    </div>
                </div>

                {/* XP Breakdown */}
                <div className={styles.xpBreakdown}>
                    {xp_breakdown?.quiz_base > 0 && (
                        <div className={styles.xpRow}>
                            <span><FontAwesomeIcon icon={faCheck} /> {t('baseXp') || 'XP Base'}</span>
                            <span>+{xp_breakdown.quiz_base}</span>
                        </div>
                    )}
                    {xp_breakdown?.difficulty_bonus > 0 && (
                        <div className={styles.xpRow}>
                            <span><FontAwesomeIcon icon={faBolt} /> {t('difficultyBonus') || 'Bônus Dificuldade'}</span>
                            <span>+{xp_breakdown.difficulty_bonus}</span>
                        </div>
                    )}
                    {xp_breakdown?.accuracy_bonus > 0 && (
                        <div className={styles.xpRow}>
                            <span><FontAwesomeIcon icon={faTrophy} /> {t('accuracyBonus') || 'Bônus Acurácia'}</span>
                            <span>+{xp_breakdown.accuracy_bonus}</span>
                        </div>
                    )}
                    {xp_breakdown?.streak_bonus > 0 && (
                        <div className={styles.xpRow}>
                            <span><FontAwesomeIcon icon={faFire} /> {t('streakBonus') || 'Bônus Sequência'}</span>
                            <span>+{xp_breakdown.streak_bonus}</span>
                        </div>
                    )}
                    {xp_breakdown?.speed_bonus > 0 && (
                        <div className={styles.xpRow}>
                            <span><FontAwesomeIcon icon={faClock} /> {t('speedBonus') || 'Bônus Velocidade'}</span>
                            <span>+{xp_breakdown.speed_bonus}</span>
                        </div>
                    )}
                    {xp_breakdown?.challenge_bonus > 0 && (
                        <div className={styles.xpRow}>
                            <span>⚔️ {t('challengeBonus') || 'Bônus Desafio'}</span>
                            <span>+{xp_breakdown.challenge_bonus}</span>
                        </div>
                    )}
                </div>

                {/* Streak */}
                <div className={styles.resultMeta}>
                    {streak && streak.current > 0 && (
                        <div className={styles.streakBadge}>
                            <FontAwesomeIcon icon={faFire} />
                            <span>{streak.current} {t('dayStreak') || 'dias'}</span>
                            {streak.is_new_record && <span className={styles.newRecord}>🎉 {t('newRecord') || 'Novo recorde!'}</span>}
                        </div>
                    )}
                </div>

                {/* Ranking Update */}
                {quizResult.ranking_update && (
                    <div className={styles.rankingUpdate}>
                        <FontAwesomeIcon icon={faArrowUp} />
                        <span>#{quizResult.ranking_update.rank_position} — Top {quizResult.ranking_update.percentile}%</span>
                    </div>
                )}

                {/* Answer Review */}
                <div className={styles.reviewSection}>
                    <h4 className={styles.reviewTitle}>{t('answerReview') || 'Revisão de Respostas'}</h4>
                    <div className={styles.reviewList}>
                        {(answers_detail || []).map((item, idx) => {
                            const isExpanded = expandedReview[idx];
                            const diffStyle = DIFFICULTY_COLORS[item.difficulty] || DIFFICULTY_COLORS.medio;
                            const userLetter = item.user_answer != null ? String.fromCharCode(65 + item.user_answer) : '—';
                            const correctLetter = item.correct_answer != null ? String.fromCharCode(65 + item.correct_answer) : '?';

                            return (
                                <div key={idx} className={`${styles.reviewItem} ${item.is_correct ? styles.reviewCorrect : styles.reviewWrong}`}>
                                    <div className={styles.reviewItemHeader} onClick={() => toggleReviewItem(idx)}>
                                        <span className={styles.reviewNumber}>{idx + 1}</span>
                                        <span className={`${styles.reviewStatus} ${item.is_correct ? styles.correct : styles.wrong}`}>
                                            {item.is_correct ? '✓' : '✗'}
                                        </span>
                                        <span className={styles.reviewAnswer}>
                                            {userLetter} {!item.is_correct && `→ ${correctLetter}`}
                                        </span>
                                        <span className={styles.diffBadge} style={{ background: diffStyle.bg, color: diffStyle.text }}>
                                            {diffStyle.label}
                                        </span>
                                        {item.topic && <span className={styles.topicBadge}>{item.topic}</span>}
                                        <FontAwesomeIcon icon={isExpanded ? faChevronUpIcon : faChevronDown} className={styles.reviewChevron} />
                                    </div>
                                    {isExpanded && (
                                        <div className={styles.reviewItemBody}>
                                            <p className={styles.reviewQuestion}>{item.question_text}</p>
                                            <div className={styles.reviewAlternatives}>
                                                {(item.alternatives || []).map((alt, altIdx) => (
                                                    <div key={altIdx} className={`${styles.reviewAlt} ${altIdx === item.correct_answer ? styles.reviewAltCorrect : ''} ${altIdx === item.user_answer && !item.is_correct ? styles.reviewAltWrong : ''}`}>
                                                        <span className={styles.reviewAltLetter}>{String.fromCharCode(65 + altIdx)}</span>
                                                        <span>{alt}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            {item.explanation && (
                                                <div className={styles.reviewExplanation}>
                                                    <strong>{t('explanation') || 'Explicação'}:</strong> {item.explanation}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <button className={styles.resultCloseButton} onClick={handleClose}>
                    {t('close') || 'Fechar'}
                </button>
            </div>
        );
    };

    // ==================== RENDER: QUIZ CONTENT ====================
    const renderQuizContent = () => {
        if (jobStatus === 'pending' || jobStatus === 'processing') {
            return (
                <div className={styles.modalBody}>
                    <InlineLoading text={t('simuladoInQueue')} />
                </div>
            );
        }

        if (jobStatus === 'error') {
            return (
                <div className={styles.modalBody}>
                    <div className={styles.errorContainer}>
                        <h4>{t('simuladoGenerationError')}</h4>
                        <p>{errorMessage}</p>
                    </div>
                </div>
            );
        }

        if (quizResult) {
            return renderResultScreen();
        }

        if (jobStatus === 'completed' && currentQuestion) {
            const difficulty = currentQuestion.dificuldade || 'medio';
            const diffStyle = DIFFICULTY_COLORS[difficulty] || DIFFICULTY_COLORS.medio;
            const topic = currentQuestion.topico;

            return (
                <>
                    <div className={styles.progressBarContainer}>
                        <div className={styles.progressBar} style={{ width: `${progressPercentage}%` }} />
                    </div>

                    <div className={`${styles.questionBody} ${slideDirection ? styles[`slide${slideDirection === 'left' ? 'Left' : 'Right'}`] : ''}`}>
                        {/* Difficulty & Topic badges */}
                        <div className={styles.questionMeta}>
                            <span className={styles.difficultyBadge} style={{ background: diffStyle.bg, color: diffStyle.text }}>
                                {diffStyle.label}
                            </span>
                            {topic && <span className={styles.topicBadgeQuiz}>{topic}</span>}
                        </div>

                        <h4 className={styles.questionText}>
                            <span className={styles.questionCounter}>{`${currentQuestionIndex + 1}. `}</span>
                            {currentQuestion.pergunta}
                        </h4>
                        <ul className={styles.answerList}>
                            {currentQuestion.alternativas.map((alt, index) => {
                                const isSelected = userAnswers[currentQuestionIndex] === index;
                                return (
                                    <li
                                        key={index}
                                        className={`${styles.answerItem} ${isSelected ? styles.selected : ''}`}
                                        onClick={() => handleAnswerSelect(index)}
                                    >
                                        <span className={styles.answerLetter}>{String.fromCharCode(65 + index)}</span>
                                        <span className={styles.answerText}>{alt}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {/* Progress dots */}
                    <div className={styles.progressDots}>
                        {quizQuestions.map((_, idx) => (
                            <button
                                key={idx}
                                className={`${styles.dot} ${idx === currentQuestionIndex ? styles.dotCurrent : ''} ${userAnswers[idx] !== undefined ? styles.dotAnswered : ''}`}
                                onClick={() => handleDotClick(idx)}
                                title={`${idx + 1}`}
                            />
                        ))}
                    </div>

                    <div className={styles.playerFooter}>
                        <button onClick={handlePreviousQuestion} disabled={currentQuestionIndex === 0} className={styles.navButton}>
                            <FontAwesomeIcon icon={faChevronLeft} /> {t('previous')}
                        </button>
                        <span className={styles.progressText}>{`${currentQuestionIndex + 1} / ${totalQuestions}`}</span>
                        {currentQuestionIndex === totalQuestions - 1 ? (
                            <button onClick={handleSubmit} disabled={isSubmitting} className={`${styles.navButton} ${styles.finishButton}`}>
                                {isSubmitting ? '...' : t('finishQuiz')}
                            </button>
                        ) : (
                            <button onClick={handleNextQuestion} className={styles.navButton}>
                                {t('next')} <FontAwesomeIcon icon={faChevronRight} />
                            </button>
                        )}
                    </div>
                </>
            );
        }

        return null;
    };

    const getModalTitle = () => {
        if (quizResult) return t('quizResults') || 'Resultado';
        if (jobStatus === 'completed') return activeJob.exam || 'Quiz';
        if (jobStatus === 'error') return t('error');
        return t('generatingMaterial');
    };

    return ReactDOM.createPortal(
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <div className={styles.playerHeader}>
                    <div className={styles.headerTitle}>
                        <h3>{getModalTitle()}</h3>
                        {jobStatus === 'completed' && !quizResult && (
                            <span className={styles.timer}>{formatTime(timeLeft)}</span>
                        )}
                    </div>
                    <button onClick={handleClose} className={styles.closeButton} title={t('close')}>
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </div>
                {renderQuizContent()}
            </div>
        </div>,
        document.getElementById('modal-portal')
    );
};

export default QuizPlayer;
