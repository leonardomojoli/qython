// frontend/src/components/academic/ArenaQython.js
// Arena em DUAS zonas: "Ligas Nacionais" (disputar com todos — hub por exame com
// posição nacional + catálogo embutido) e "Meus Concursos" (treinar no seu ritmo).
// O catálogo de exames não é mais uma aba: é matrícula dentro da zona de disputa
// (card "+ Adicionar concurso"; vira o conteúdo da zona quando não há inscrição).

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    startQuiz,
    getActiveSimuladoJob,
    getAvailableExams,
    getEnrolledExams,
    getExamRanking,
    enrollInExam,
    unenrollFromExam,
    getCurrentSeason,
    getMyXpProfile,
} from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import { useUser } from '../../contexts/UserContext';
import QuizPlayer from './QuizPlayer';
import styles from './ArenaQython.module.css';
import RankingLeague from './RankingLeague';
import InlineLoading from '../shared/InlineLoading';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faTrophy, faArrowRight, faGlobe, faPlay,
    faSignOutAlt, faCalendarAlt, faClock,
    faMedal, faFire, faUserFriends, faBolt, faLayerGroup,
    faPlus, faChevronDown, faChevronUp
} from '@fortawesome/free-solid-svg-icons';
import ChallengeModal from './ChallengeModal';
import ComingSoonModal from '../shared/ComingSoonModal';
import MeusConcursos from './MeusConcursos';

// Plans that have Arena access
const ARENA_ALLOWED_PLANS = ['resident', 'staff', 'specialist'];

// Mini-hub de um exame inscrito: posição nacional + ações + ranking (preview/completo).
// Definido FORA do ArenaQython — componente estável entre renders do pai (estado próprio
// de ranking/expansão não pode resetar a cada render).
const ExamHubCard = ({ exam, currentUserDisplay, refreshTick, onPlay, onChallenge, onOvertake, onUnenroll }) => {
    const { t } = useTranslation();
    const [ranking, setRanking] = useState(null);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        let alive = true;
        getExamRanking(exam.exam_code)
            .then(res => { if (alive) setRanking(res?.ranking_data || []); })
            .catch(() => { if (alive) setRanking([]); });
        return () => { alive = false; };
    }, [exam.exam_code, refreshTick]);

    const myEntry = ranking?.find(r => r.isRealUser && r.name === currentUserDisplay) || null;
    const total = ranking ? ranking.length : 0;
    const topPct = myEntry && total > 0 ? Math.max(1, Math.round((myEntry.rank / total) * 100)) : null;

    return (
        <div className={styles.examCard}>
            <div className={styles.examCardHeader}>
                <div className={styles.examFlag}>{exam.flag}</div>
                <div className={styles.examInfo}>
                    <h3>{t(exam.title_key)}</h3>
                    <span className={styles.examCountry}>{exam.country}</span>
                </div>
                {myEntry ? (
                    <div className={styles.examPosition}>
                        <span className={styles.examPositionRank}>
                            #{myEntry.rank} <small>{t('rankOfTotal', { total })}</small>
                        </span>
                        {topPct !== null && topPct <= 50 && (
                            <span className={styles.examPositionPct}>{t('topPercent', { pct: topPct })}</span>
                        )}
                    </div>
                ) : (ranking !== null && (
                    <div className={styles.examPosition}>
                        <span className={styles.examPositionHint}>{t('noXpInExam')}</span>
                    </div>
                ))}
            </div>
            <div className={styles.examHubActions}>
                <button className={styles.playButtonWide} onClick={onPlay}>
                    <FontAwesomeIcon icon={faPlay} /> {t('startQuiz')}
                </button>
                <button className={styles.challengeButtonWide} onClick={onChallenge}>
                    <FontAwesomeIcon icon={faUserFriends} /> {t('challenge')}
                </button>
                <button
                    className={styles.rankToggle}
                    onClick={() => setExpanded(v => !v)}
                    aria-expanded={expanded}
                >
                    {t('ranking')} <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} />
                </button>
                <button className={styles.leaveButton} onClick={onUnenroll} title={t('leave')}>
                    <FontAwesomeIcon icon={faSignOutAlt} />
                </button>
            </div>
            {ranking === null ? (
                <InlineLoading size={40} />
            ) : (
                <RankingLeague
                    rankingData={ranking}
                    mode={expanded ? 'full' : 'preview'}
                    currentUserDisplay={currentUserDisplay}
                    onOvertake={onOvertake}
                />
            )}
        </div>
    );
};

const ArenaQython = () => {
    const { t } = useTranslation();
    const { addNotification } = useNotification();
    const { user } = useUser();
    const [activeSimuladoJob, setActiveSimuladoJob] = useState(null);
    const [availableExams, setAvailableExams] = useState([]);
    const [enrolledExamCodes, setEnrolledExamCodes] = useState([]);
    const [activeView, setActiveView] = useState('ligas');
    const [showCatalog, setShowCatalog] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [currentSeason, setCurrentSeason] = useState(null);
    const [challengeTarget, setChallengeTarget] = useState(null); // { exam, opponent? }
    const [showComingSoon, setShowComingSoon] = useState(false);
    const [xpProfile, setXpProfile] = useState(null);
    const [refreshTick, setRefreshTick] = useState(0);

    // Check if user has Arena access (plan-based or admin)
    const hasArenaAccess = ARENA_ALLOWED_PLANS.includes(user?.subscription_plan) || user?.is_admin;
    const currentUserDisplay = user?.username ? `@${user.username}` : user?.full_name;

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [examsData, enrolledData, activeJobData, seasonData, profileData] = await Promise.all([
                getAvailableExams(),
                getEnrolledExams(),
                getActiveSimuladoJob(),
                getCurrentSeason().catch(() => null),
                getMyXpProfile().catch(() => null),
            ]);
            setAvailableExams(examsData || []);
            setEnrolledExamCodes(enrolledData?.enrolled_codes || []);
            if (activeJobData) {
                setActiveSimuladoJob(activeJobData);
            }
            setCurrentSeason(seasonData?.season || null);
            setXpProfile(profileData || null);
            setRefreshTick(tick => tick + 1);
        } catch (error) {
            console.error("Erro ao buscar dados da Arena:", error);
            addNotification(t('errorFetchingArenaData'), 'error');
        } finally {
            setIsLoading(false);
        }
    }, [t, addNotification]);

    useEffect(() => {
        if (hasArenaAccess) {
            fetchData();
        } else {
            setIsLoading(false);
        }
    }, [fetchData, hasArenaAccess]);

    const handleStartQuiz = async (examCode, mode, language) => {
        try {
            const jobData = await startQuiz(examCode, mode, language);
            setActiveSimuladoJob(jobData);
        } catch (error) {
            console.error("Erro ao iniciar o simulado:", error);
            addNotification(error.message || t('errorStartingSimulado'), 'error');
        }
    };

    const handleCloseQuizPlayer = () => {
        setActiveSimuladoJob(null);
        fetchData(); // Refresh rankings and XP after quiz
    };

    const handleEnroll = async (examCode) => {
        try {
            await enrollInExam(examCode);
            addNotification(t('enrollSuccess'), 'success');
            setShowCatalog(false);
            fetchData();
        } catch (error) {
            addNotification(error.message || t('errorEnrolling'), 'error');
        }
    };

    const handleUnenroll = async (examCode) => {
        try {
            await unenrollFromExam(examCode);
            addNotification(t('unenrollSuccess'), 'info');
            fetchData();
        } catch (error) {
            addNotification(error.message || t('errorUnenrolling'), 'error');
        }
    };

    // Upgrade banner for users without Arena access
    if (!hasArenaAccess) {
        return (
            <div className={styles.arenaContainer}>
                <div className={styles.upgradeBanner}>
                    <div className={styles.upgradeBannerIcon}>
                        <FontAwesomeIcon icon={faTrophy} />
                    </div>
                    <h2>{t('arenaUpgradeTitle')}</h2>
                    <p>{t('arenaUpgradeDesc')}</p>
                    <ul className={styles.upgradeBenefits}>
                        <li>🏆 {t('arenaFeature1')}</li>
                        <li>📊 {t('arenaFeature2')}</li>
                        <li>🎯 {t('arenaFeature3')}</li>
                    </ul>
                    <button
                        className={styles.upgradeButton}
                        onClick={() => setShowComingSoon(true)}
                    >
                        {t('upgradeNow')} <FontAwesomeIcon icon={faArrowRight} />
                    </button>
                </div>

                <ComingSoonModal
                    isOpen={showComingSoon}
                    onClose={() => setShowComingSoon(false)}
                    userEmail={user?.email}
                />
            </div>
        );
    }

    const enrolledExamDetails = enrolledExamCodes
        .map(code => availableExams.find(exam => exam.exam_code === code))
        .filter(Boolean);

    // Sem XP nenhum = ainda não entrou na disputa: mostra convite, não card zerado
    const hasAnyXp = (xpProfile?.total_xp || 0) > 0 || (xpProfile?.season_xp || 0) > 0;

    // Catálogo de exames = matrícula na disputa. Hero quando não há inscrição;
    // revelado pelo "+ Adicionar concurso" quando já há.
    const renderCatalog = (isHero) => (
        <div className={`${styles.catalogSection} ${isHero ? styles.catalogHero : ''}`}>
            <div className={styles.catalogHeader}>
                <FontAwesomeIcon icon={faGlobe} className={styles.catalogIcon} />
                <h3>{t('catalogHeroTitle')}</h3>
                {!isHero && (
                    <button
                        className={styles.catalogClose}
                        onClick={() => setShowCatalog(false)}
                        title={t('minimize')}
                    >
                        <FontAwesomeIcon icon={faChevronUp} />
                    </button>
                )}
            </div>
            <div className={styles.exploreGrid}>
                {availableExams.map(exam => {
                    const isEnrolled = enrolledExamCodes.includes(exam.exam_code);
                    return (
                        <div key={exam.exam_code} className={`${styles.exploreCard} ${isEnrolled ? styles.enrolled : ''}`}>
                            <div className={styles.exploreCardFlag}>{exam.flag}</div>
                            <div className={styles.exploreCardContent}>
                                <h3>{t(exam.title_key)}</h3>
                                <p className={styles.examCountryExplore}>{exam.country}</p>
                                <p className={styles.examDesc}>{t(exam.description_key)}</p>
                            </div>
                            <button
                                onClick={() => handleEnroll(exam.exam_code)}
                                disabled={isEnrolled}
                                className={styles.enrollButton}
                            >
                                {isEnrolled ? (
                                    <><FontAwesomeIcon icon={faMedal} /> {t('enrolled')}</>
                                ) : (
                                    <><FontAwesomeIcon icon={faFire} /> {t('enroll')}</>
                                )}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div className={styles.arenaContainer}>
            {/* Duas zonas: disputar com todos × treinar no seu ritmo */}
            <div className={styles.modeSwitch}>
                <button
                    className={`${styles.modeButton} ${activeView === 'ligas' ? styles.modeActive : ''}`}
                    onClick={() => setActiveView('ligas')}
                >
                    <FontAwesomeIcon icon={faTrophy} className={styles.modeIcon} />
                    <span className={styles.modeText}>
                        <span className={styles.modeTitle}>{t('myRankings')}</span>
                        <span className={styles.modeSub}>{t('arenaModeLigasSub')}</span>
                    </span>
                </button>
                <button
                    className={`${styles.modeButton} ${activeView === 'mycards' ? styles.modeActive : ''}`}
                    onClick={() => setActiveView('mycards')}
                >
                    <FontAwesomeIcon icon={faLayerGroup} className={styles.modeIcon} />
                    <span className={styles.modeText}>
                        <span className={styles.modeTitle}>{t('mcTitle')}</span>
                        <span className={styles.modeSub}>{t('arenaModeTreinoSub')}</span>
                    </span>
                </button>
            </div>

            <div className={styles.arenaContent}>
                {activeView === 'ligas' ? (
                    isLoading ? (
                        <InlineLoading text={t('loadingArena')} />
                    ) : (
                        <div className={styles.rankingsView}>
                            {/* Season Banner — a temporada pertence à disputa */}
                            {currentSeason && (
                                <div className={styles.seasonBanner}>
                                    <div className={styles.seasonInfo}>
                                        <FontAwesomeIcon icon={faCalendarAlt} className={styles.seasonIcon} />
                                        <div className={styles.seasonText}>
                                            <span className={styles.seasonLabel}>{t('currentSeason')}</span>
                                            <span className={styles.seasonName}>{currentSeason.name}</span>
                                        </div>
                                    </div>
                                    <div className={styles.seasonTimer}>
                                        <FontAwesomeIcon icon={faClock} />
                                        <span>
                                            {currentSeason.is_active
                                                ? `${currentSeason.days_remaining} ${t('daysRemaining')}`
                                                : `${t('startsIn')} ${currentSeason.days_until_start} ${t('days')}`
                                            }
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* XP Profile Card — convite p/ a disputa enquanto não há XP */}
                            {xpProfile && !hasAnyXp && (
                                <div className={`${styles.xpProfileCard} ${styles.xpEmptyCard}`}>
                                    <span className={styles.xpEmptyIcon} aria-hidden="true">🏁</span>
                                    <div className={styles.xpEmptyInfo}>
                                        <span className={styles.xpEmptyTitle}>{t('arenaXpEmptyTitle')}</span>
                                        <span className={styles.xpEmptyDesc}>{t('arenaXpEmptyDesc')}</span>
                                    </div>
                                </div>
                            )}
                            {xpProfile && hasAnyXp && (
                                <div className={styles.xpProfileCard}>
                                    <div className={styles.xpProfileMain}>
                                        <div className={styles.xpProfileLeague}>
                                            <FontAwesomeIcon icon={faBolt} className={styles.xpSeasonIcon} />
                                            <div className={styles.xpLeagueInfo}>
                                                <span className={styles.xpSeasonLabel}>{t('seasonXpLabel')}</span>
                                                <span className={styles.xpSeasonXp}>{(xpProfile.season_xp || 0).toLocaleString()} XP</span>
                                            </div>
                                        </div>
                                        <div className={styles.xpProfileStats}>
                                            {xpProfile.current_streak > 0 && (
                                                <div className={styles.xpStat}>
                                                    <FontAwesomeIcon icon={faFire} className={styles.xpStatIconFire} />
                                                    <span>{xpProfile.current_streak} {t('dayStreak') || 'dias'}</span>
                                                </div>
                                            )}
                                            <div className={styles.xpStat}>
                                                <FontAwesomeIcon icon={faBolt} className={styles.xpStatIconXp} />
                                                <span>{(xpProfile.total_xp || 0).toLocaleString()} XP {t('total') || 'total'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {enrolledExamDetails.length === 0 ? (
                                renderCatalog(true)
                            ) : (
                                <>
                                    <div className={styles.rankingsGrid}>
                                        {enrolledExamDetails.map(exam => (
                                            <ExamHubCard
                                                key={exam.exam_code}
                                                exam={exam}
                                                currentUserDisplay={currentUserDisplay}
                                                refreshTick={refreshTick}
                                                onPlay={() => handleStartQuiz(exam.exam_code, exam.exam_code, exam.language)}
                                                onChallenge={() => setChallengeTarget({ exam })}
                                                onOvertake={(opponentName) => setChallengeTarget({ exam, opponent: opponentName })}
                                                onUnenroll={() => handleUnenroll(exam.exam_code)}
                                            />
                                        ))}
                                    </div>
                                    {showCatalog ? renderCatalog(false) : (
                                        <button className={styles.addExamCard} onClick={() => setShowCatalog(true)}>
                                            <FontAwesomeIcon icon={faPlus} /> {t('addExam')}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )
                ) : (
                    <MeusConcursos />
                )}
            </div>

            {activeSimuladoJob && (
                <QuizPlayer
                    activeJob={activeSimuladoJob}
                    onClose={handleCloseQuizPlayer}
                />
            )}

            {challengeTarget && (
                <ChallengeModal
                    isOpen={!!challengeTarget}
                    onClose={() => setChallengeTarget(null)}
                    examCode={challengeTarget.exam.exam_code}
                    examName={t(challengeTarget.exam.title_key)}
                    examFlag={challengeTarget.exam.flag}
                    initialOpponent={challengeTarget.opponent}
                />
            )}
        </div>
    );
};

export default ArenaQython;
