// frontend/src/components/academic/ChallengeModal.js
// Modal for creating challenges with random matchmaking support

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createChallenge, getMyChallenges, respondToChallenge, findRandomOpponent } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import styles from './ChallengeModal.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faTimes, faUserFriends, faPaperPlane, faCheck,
    faBan, faSpinner, faTrophy, faClock, faExclamationTriangle,
    faDice, faBolt
} from '@fortawesome/free-solid-svg-icons';

const ChallengeModal = ({ isOpen, onClose, examCode, examName, examFlag, initialOpponent }) => {
    const { t } = useTranslation();
    const { addNotification } = useNotification();
    const [activeTab, setActiveTab] = useState('create');
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isMatchmaking, setIsMatchmaking] = useState(false);
    const [challenges, setChallenges] = useState({ sent: [], received: [], pending_count: 0 });

    useEffect(() => {
        if (isOpen) {
            fetchChallenges();
            // "Ultrapassar" no ranking abre o modal já mirando o oponente
            if (initialOpponent) {
                setUsername(initialOpponent.replace(/^@/, ''));
                setActiveTab('create');
            }
        }
    }, [isOpen, initialOpponent]);

    const fetchChallenges = async () => {
        try {
            const data = await getMyChallenges();
            setChallenges(data || { sent: [], received: [], pending_count: 0 });
        } catch (err) {
            console.error('Error fetching challenges:', err);
        }
    };

    const handleCreateChallenge = async () => {
        if (!username.trim()) {
            addNotification(t('enterUsername'), 'warning');
            return;
        }

        setIsLoading(true);
        try {
            const result = await createChallenge({
                opponent_username: username.trim(),
                exam_code: examCode,
                exam_name: examName
            });

            if (result.success) {
                addNotification(t('challengeSent'), 'success');
                setUsername('');
                fetchChallenges();
                setActiveTab('sent');
            }
        } catch (err) {
            addNotification(err.message || t('errorCreatingChallenge'), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleMatchmaking = async () => {
        setIsMatchmaking(true);
        try {
            const result = await findRandomOpponent(examCode);
            if (result.challenge_id) {
                addNotification(
                    (t('matchFound') || 'Oponente encontrado!') + ` @${result.opponent_username}`,
                    'success'
                );
                fetchChallenges();
                setActiveTab('sent');
            }
        } catch (err) {
            addNotification(err.message || (t('noOpponentsFound') || 'Nenhum oponente disponível no momento'), 'warning');
        } finally {
            setIsMatchmaking(false);
        }
    };

    const handleRespond = async (challengeId, accept) => {
        try {
            const result = await respondToChallenge(challengeId, accept);
            if (result.success) {
                addNotification(result.message, accept ? 'success' : 'info');
                fetchChallenges();
            }
        } catch (err) {
            addNotification(err.message || t('errorRespondingChallenge'), 'error');
        }
    };

    const getStatusBadge = (status, isWinner) => {
        const badges = {
            pending: { icon: faClock, text: t('pending'), class: 'pending' },
            accepted: { icon: faCheck, text: t('accepted'), class: 'accepted' },
            declined: { icon: faBan, text: t('declined'), class: 'declined' },
            completed: { icon: faTrophy, text: isWinner ? t('won') : t('completed'), class: isWinner ? 'won' : 'completed' },
            expired: { icon: faExclamationTriangle, text: t('expired'), class: 'expired' }
        };
        const badge = badges[status] || badges.pending;
        return (
            <span className={`${styles.statusBadge} ${styles[badge.class]}`}>
                <FontAwesomeIcon icon={badge.icon} /> {badge.text}
            </span>
        );
    };

    if (!isOpen) return null;

    const pendingReceived = challenges.received.filter(c => c.status === 'pending');

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>
                    <FontAwesomeIcon icon={faTimes} />
                </button>

                <div className={styles.modalHeader}>
                    <FontAwesomeIcon icon={faUserFriends} className={styles.headerIcon} />
                    <h2>{t('challengeOpponent')}</h2>
                    <p>{examFlag} {examName}</p>
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                    <button
                        className={`${styles.tabButton} ${activeTab === 'create' ? styles.active : ''}`}
                        onClick={() => setActiveTab('create')}
                    >
                        {t('newChallenge')}
                    </button>
                    <button
                        className={`${styles.tabButton} ${activeTab === 'received' ? styles.active : ''}`}
                        onClick={() => setActiveTab('received')}
                    >
                        {t('received')} {pendingReceived.length > 0 && <span className={styles.badge}>{pendingReceived.length}</span>}
                    </button>
                    <button
                        className={`${styles.tabButton} ${activeTab === 'sent' ? styles.active : ''}`}
                        onClick={() => setActiveTab('sent')}
                    >
                        {t('sent')}
                    </button>
                </div>

                {/* Content */}
                <div className={styles.tabContent}>
                    {activeTab === 'create' && (
                        <div className={styles.createForm}>
                            {/* Random matchmaking */}
                            <button
                                className={styles.matchmakingButton}
                                onClick={handleMatchmaking}
                                disabled={isMatchmaking}
                            >
                                {isMatchmaking ? (
                                    <><FontAwesomeIcon icon={faSpinner} spin /> {t('searchingOpponent') || 'Buscando oponente...'}</>
                                ) : (
                                    <><FontAwesomeIcon icon={faDice} /> {t('findRandomOpponent') || 'Encontrar Oponente Aleatório'}</>
                                )}
                            </button>

                            <div className={styles.xpRewardHint}>
                                <FontAwesomeIcon icon={faBolt} />
                                <span>{t('challengeXpReward') || 'Desafios dão +20 XP por participar e +30 XP por vencer!'}</span>
                            </div>

                            <div className={styles.divider}>
                                <span>{t('or') || 'ou'}</span>
                            </div>

                            <label>{t('opponentUsername')}</label>
                            <div className={styles.inputGroup}>
                                <span className={styles.atSymbol}>@</span>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder={t('enterUsername')}
                                    className={styles.usernameInput}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateChallenge()}
                                />
                            </div>
                            <button
                                className={styles.sendButton}
                                onClick={handleCreateChallenge}
                                disabled={isLoading || !username.trim()}
                            >
                                {isLoading ? (
                                    <FontAwesomeIcon icon={faSpinner} spin />
                                ) : (
                                    <><FontAwesomeIcon icon={faPaperPlane} /> {t('sendChallenge')}</>
                                )}
                            </button>
                            <p className={styles.hint}>{t('challengeHint')}</p>
                        </div>
                    )}

                    {activeTab === 'received' && (
                        <div className={styles.challengeList}>
                            {challenges.received.length === 0 ? (
                                <p className={styles.emptyText}>{t('noChallengesReceived')}</p>
                            ) : (
                                challenges.received.map(c => (
                                    <div key={c.id} className={styles.challengeCard}>
                                        <div className={styles.challengeInfo}>
                                            <strong>{c.exam_name}</strong>
                                            {getStatusBadge(c.status, c.is_winner)}
                                        </div>
                                        {c.status === 'pending' && (
                                            <div className={styles.challengeActions}>
                                                <button
                                                    className={styles.acceptButton}
                                                    onClick={() => handleRespond(c.id, true)}
                                                >
                                                    <FontAwesomeIcon icon={faCheck} /> {t('accept')}
                                                </button>
                                                <button
                                                    className={styles.declineButton}
                                                    onClick={() => handleRespond(c.id, false)}
                                                >
                                                    <FontAwesomeIcon icon={faBan} /> {t('decline')}
                                                </button>
                                            </div>
                                        )}
                                        {c.status === 'completed' && (
                                            <div className={styles.scores}>
                                                {t('you')}: {c.opponent_xp || c.opponent_score} XP | {t('opponent')}: {c.challenger_xp || c.challenger_score} XP
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'sent' && (
                        <div className={styles.challengeList}>
                            {challenges.sent.length === 0 ? (
                                <p className={styles.emptyText}>{t('noChallengesSent')}</p>
                            ) : (
                                challenges.sent.map(c => (
                                    <div key={c.id} className={styles.challengeCard}>
                                        <div className={styles.challengeInfo}>
                                            <strong>@{c.opponent_username}</strong>
                                            <span className={styles.examName}>{c.exam_name}</span>
                                            {getStatusBadge(c.status, c.is_winner)}
                                        </div>
                                        {c.status === 'completed' && (
                                            <div className={styles.scores}>
                                                {t('you')}: {c.challenger_xp || c.challenger_score} XP | @{c.opponent_username}: {c.opponent_xp || c.opponent_score} XP
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChallengeModal;
