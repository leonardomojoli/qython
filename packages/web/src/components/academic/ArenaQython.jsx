// frontend/src/components/academic/ArenaQython.js
// Arena em DUAS zonas: "Simulados" (um hub por concurso em que você se inscreveu, com o
// catálogo embutido) e "Meus Concursos" (treinar no seu ritmo).
// O catálogo de exames não é uma aba: é a inscrição dentro da zona de simulados
// (card "+ Adicionar concurso"; vira o conteúdo da zona quando não há inscrição).

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    startQuiz,
    getActiveSimuladoJob,
    getAvailableExams,
    getEnrolledExams,
    enrollInExam,
    unenrollFromExam,
    getMyXpProfile,
} from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import QuizPlayer from './QuizPlayer';
import styles from './ArenaQython.module.css';
import InlineLoading from '../shared/InlineLoading';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faTrophy, faGlobe, faPlay,
    faSignOutAlt,
    faMedal, faFire, faBolt, faLayerGroup,
    faPlus, faChevronUp
} from '@fortawesome/free-solid-svg-icons';
import MeusConcursos from './MeusConcursos';

// Card de um exame inscrito: o simulado e a saída. Definido FORA do ArenaQython para ser um
// componente estável entre renders do pai.
const ExamHubCard = ({ exam, onPlay, onUnenroll }) => {
    const { t } = useTranslation();

    return (
        <div className={styles.examCard}>
            <div className={styles.examCardHeader}>
                <div className={styles.examFlag}>{exam.flag}</div>
                <div className={styles.examInfo}>
                    <h3>{t(exam.title_key)}</h3>
                    <span className={styles.examCountry}>{exam.country}</span>
                </div>
            </div>
            <div className={styles.examHubActions}>
                <button className={styles.playButtonWide} onClick={onPlay}>
                    <FontAwesomeIcon icon={faPlay} /> {t('startQuiz')}
                </button>
                <button className={styles.leaveButton} onClick={onUnenroll} title={t('leave')}>
                    <FontAwesomeIcon icon={faSignOutAlt} />
                </button>
            </div>
        </div>
    );
};

const ArenaQython = () => {
    const { t } = useTranslation();
    const { addNotification } = useNotification();
    const [activeSimuladoJob, setActiveSimuladoJob] = useState(null);
    const [availableExams, setAvailableExams] = useState([]);
    const [enrolledExamCodes, setEnrolledExamCodes] = useState([]);
    const [activeView, setActiveView] = useState('simulados');
    const [showCatalog, setShowCatalog] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [xpProfile, setXpProfile] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [examsData, enrolledData, activeJobData, profileData] = await Promise.all([
                getAvailableExams(),
                getEnrolledExams(),
                getActiveSimuladoJob(),
                getMyXpProfile().catch(() => null),
            ]);
            setAvailableExams(examsData || []);
            setEnrolledExamCodes(enrolledData?.enrolled_codes || []);
            if (activeJobData) {
                setActiveSimuladoJob(activeJobData);
            }
            setXpProfile(profileData || null);
        } catch (error) {
            console.error("Erro ao buscar dados da Arena:", error);
            addNotification(t('errorFetchingArenaData'), 'error');
        } finally {
            setIsLoading(false);
        }
    }, [t, addNotification]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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
        fetchData(); // Atualiza o XP depois do simulado
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

    const enrolledExamDetails = enrolledExamCodes
        .map(code => availableExams.find(exam => exam.exam_code === code))
        .filter(Boolean);

    // Sem XP nenhum = ainda não fez simulado: mostra convite, não card zerado
    const hasAnyXp = (xpProfile?.total_xp || 0) > 0 || (xpProfile?.season_xp || 0) > 0;

    // Catálogo de exames = inscrição. Hero quando não há inscrição;
    // revelado pelo "+ Adicionar concurso" quando já há.
    const renderCatalog = (isHero) => (
        <div className={`${styles.catalogSection} ${isHero ? styles.catalogHero : ''}`}>
            <div className={styles.catalogHeader}>
                <FontAwesomeIcon icon={faGlobe} className={styles.catalogIcon} />
                <h3>{t('catalogHeroTitleLocal', 'Escolha o concurso que você vai prestar')}</h3>
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
            {/* Duas zonas: simulados por concurso × treinar no seu ritmo */}
            <div className={styles.modeSwitch}>
                <button
                    className={`${styles.modeButton} ${activeView === 'simulados' ? styles.modeActive : ''}`}
                    onClick={() => setActiveView('simulados')}
                >
                    <FontAwesomeIcon icon={faTrophy} className={styles.modeIcon} />
                    <span className={styles.modeText}>
                        <span className={styles.modeTitle}>{t('arenaSimuladosTitle', 'Simulados')}</span>
                        <span className={styles.modeSub}>{t('arenaModeSimuladosSub', 'Questões no estilo de cada prova')}</span>
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
                {activeView === 'simulados' ? (
                    isLoading ? (
                        <InlineLoading text={t('loadingArena')} />
                    ) : (
                        <div className={styles.rankingsView}>
                            {/* XP Profile Card — convite enquanto não há XP */}
                            {xpProfile && !hasAnyXp && (
                                <div className={`${styles.xpProfileCard} ${styles.xpEmptyCard}`}>
                                    <span className={styles.xpEmptyIcon} aria-hidden="true">🏁</span>
                                    <div className={styles.xpEmptyInfo}>
                                        <span className={styles.xpEmptyTitle}>{t('arenaXpEmptyTitleLocal', 'Comece um simulado')}</span>
                                        <span className={styles.xpEmptyDesc}>{t('arenaXpEmptyDescLocal', 'Complete um simulado para ganhar seus primeiros XP.')}</span>
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
                                                onPlay={() => handleStartQuiz(exam.exam_code, exam.exam_code, exam.language)}
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
        </div>
    );
};

export default ArenaQython;
