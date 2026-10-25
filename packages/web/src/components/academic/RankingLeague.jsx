// frontend/src/components/academic/RankingLeague.js
// Leaderboard de um exame (apresentação pura — o fetch vive no ExamHubCard).
// mode='preview': top 3 + vizinhança do usuário (a parte emocionalmente relevante).
// mode='full': pódio + lista completa.
// onOvertake: botão "Ultrapassar" na linha imediatamente acima do usuário (só user real).

import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './RankingLeague.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserFriends } from '@fortawesome/free-solid-svg-icons';

const RANK_MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const GAP = { gap: true };

const RankingLeague = ({ rankingData = [], mode = 'full', currentUserDisplay, onOvertake }) => {
    const { t } = useTranslation();

    if (!rankingData.length) {
        return (
            <div className={styles.leagueContainer}>
                <p className={styles.emptyRanking}>{t('noRankingData') || 'Nenhum dado de ranking ainda. Comece um simulado!'}</p>
            </div>
        );
    }

    const myEntry = rankingData.find(p => p.isRealUser && p.name === currentUserDisplay) || null;
    const myRank = myEntry?.rank || null;

    // Preview: top 3 + "···" + [acima de mim, eu, abaixo de mim]; sem posição própria, top 6.
    let rows = rankingData;
    if (mode === 'preview') {
        if (myRank && myRank > 4) {
            const vicinity = rankingData.filter(p => Math.abs(p.rank - myRank) <= 1);
            rows = [...rankingData.slice(0, 3), GAP, ...vicinity];
        } else {
            rows = rankingData.slice(0, 6);
        }
    }

    return (
        <div className={styles.leagueContainer}>
            {/* Podium for top 3 — só na lista completa */}
            {mode === 'full' && rankingData.length >= 3 && (
                <div className={styles.podium}>
                    {[1, 0, 2].map(podiumIdx => {
                        const player = rankingData[podiumIdx];
                        if (!player) return null;
                        const isCurrentUser = player.name === currentUserDisplay;
                        const podiumClass = podiumIdx === 0 ? styles.podiumFirst : podiumIdx === 1 ? styles.podiumSecond : styles.podiumThird;
                        return (
                            <div key={player.rank} className={`${styles.podiumItem} ${podiumClass} ${isCurrentUser ? styles.podiumCurrentUser : ''}`}>
                                <span className={styles.podiumMedal}>{RANK_MEDALS[player.rank]}</span>
                                <span className={styles.podiumName}>{player.name}</span>
                                <span className={styles.podiumXp}>{(player.xp ?? 0).toLocaleString()} XP</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <ul className={`${styles.rankingList} ${mode === 'preview' ? styles.rankingListPreview : ''}`}>
                {rows.map((player, idx) => {
                    if (player.gap) {
                        return <li key={`gap-${idx}`} className={styles.gapRow} aria-hidden="true">···</li>;
                    }
                    const isCurrentUser = player.name === currentUserDisplay;
                    const medal = RANK_MEDALS[player.rank];
                    const canOvertake = Boolean(
                        onOvertake && myRank && player.rank === myRank - 1 &&
                        player.isRealUser && player.name?.startsWith('@') && !isCurrentUser
                    );
                    return (
                        <li
                            key={player.rank}
                            className={`${styles.playerRow} ${isCurrentUser ? styles.currentUser : ''} ${player.isRealUser && !isCurrentUser ? styles.realUser : ''} ${player.rank <= 3 ? styles.topThree : ''}`}
                        >
                            <span className={styles.playerRank}>
                                {medal || player.rank}
                            </span>
                            <span className={styles.playerName}>
                                {player.name}
                                {isCurrentUser && <span className={styles.youBadge}>{t('you') || 'você'}</span>}
                            </span>
                            {canOvertake && (
                                <button
                                    className={styles.overtakeButton}
                                    onClick={() => onOvertake(player.name)}
                                    title={t('challengeOpponent')}
                                >
                                    <FontAwesomeIcon icon={faUserFriends} /> {t('overtake')}
                                </button>
                            )}
                            <span className={styles.playerScore}>{(player.xp ?? 0).toLocaleString()} XP</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export default RankingLeague;
