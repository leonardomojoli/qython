// frontend/src/components/user/ComprehensiveStatistics.js

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faStethoscope, faGraduationCap, faTrophy,
    faChartLine, faExclamationTriangle, faBookOpen
} from '@fortawesome/free-solid-svg-icons';
import { getComprehensiveStatistics } from '../../api';
import styles from './ComprehensiveStatistics.module.css';

// Cores do Design System
const CHART_COLORS = {
    primary: '#bb86fc',
    secondary: '#03dac6',
    success: '#4caf50',
    warning: '#ffc107',
    error: '#cf6679',
    info: '#7e57c2',
    muted: '#6c757d'
};

const PIE_COLORS = ['#03dac6', '#bb86fc', '#ffc107', '#4caf50', '#cf6679', '#7e57c2'];

function ComprehensiveStatistics() {
    const { t } = useTranslation();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadStatistics();
    }, []);

    const loadStatistics = async () => {
        try {
            setLoading(true);
            const data = await getComprehensiveStatistics();
            setStats(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <p>{t('loading', 'Carregando...')}</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.error}>
                <FontAwesomeIcon icon={faExclamationTriangle} />
                <p>{t('errorLoadingStats', 'Erro ao carregar estatísticas')}</p>
            </div>
        );
    }

    if (!stats) return null;

    // Defensive defaults: the backend may omit sections (e.g. a brand-new user with
    // no data, or a section the API no longer computes). Destructuring without
    // defaults and then dereferencing a missing object throws during render — and
    // with no error boundary that blanks the whole screen. Keep every section
    // optional and guard each access.
    const { overview = {}, consultations = {}, academic = {} } = stats;

    // Preparar dados para gráficos
    const specialtyData = Object.entries(consultations.by_specialty || {}).map(([name, value]) => ({
        name: name.length > 15 ? name.substring(0, 15) + '...' : name,
        value
    }));

    const hasData =
        overview.total_consultations > 0 ||
        overview.total_materials > 0 ||
        academic.quizzes_completed > 0;

    return (
        <div className={styles.container}>
            {/* ========== OVERVIEW SECTION ========== */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                    <FontAwesomeIcon icon={faChartLine} />
                    {t('stats.overview', 'Visão Geral')}
                </h2>
                <div className={styles.overviewGrid}>
                    <OverviewCard
                        icon={faStethoscope}
                        label={t('stats.consultations', 'Consultas')}
                        value={overview.total_consultations || 0}
                        color={CHART_COLORS.secondary}
                    />
                    <OverviewCard
                        icon={faBookOpen}
                        label={t('stats.materialsGenerated', 'Materiais Gerados')}
                        value={overview.total_materials || 0}
                        color={CHART_COLORS.warning}
                    />
                    <OverviewCard
                        icon={faTrophy}
                        label={t('stats.arenaScore', 'Score Arena')}
                        value={overview.arena_score || 0}
                        color={CHART_COLORS.success}
                    />
                </div>
            </section>

            {!hasData && (
                <div className={styles.emptyState}>
                    <FontAwesomeIcon icon={faChartLine} className={styles.emptyIcon} />
                    <h3>{t('stats.noDataYet', 'Sem dados ainda')}</h3>
                    <p>{t('stats.startUsing', 'Comece a usar o Qython para ver suas estatísticas aqui.')}</p>
                </div>
            )}

            {/* ========== CONSULTATIONS SECTION ========== */}
            {overview.total_consultations > 0 && (
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <FontAwesomeIcon icon={faStethoscope} />
                        {t('stats.ambulatory', 'Ambulatório')}
                    </h2>

                    <div className={styles.chartsRow}>
                        {/* Consultations by Month */}
                        <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>{t('stats.consultationsByMonth', 'Consultas por Mês')}</h3>
                            <div className={styles.chartContainer}>
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={consultations.by_month || []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis dataKey="month" stroke="#a0a0a0" fontSize={12} />
                                        <YAxis stroke="#a0a0a0" fontSize={12} />
                                        <Tooltip
                                            contentStyle={{
                                                background: 'rgba(30,30,40,0.95)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '8px'
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="count"
                                            stroke={CHART_COLORS.secondary}
                                            strokeWidth={3}
                                            dot={{ fill: CHART_COLORS.secondary, strokeWidth: 2 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Specialty Distribution */}
                        {specialtyData.length > 0 && (
                            <div className={styles.chartCard}>
                                <h3 className={styles.chartTitle}>{t('stats.bySpecialty', 'Por Especialidade')}</h3>
                                <div className={styles.chartContainer}>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <PieChart>
                                            <Pie
                                                data={specialtyData}
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={80}
                                                dataKey="value"
                                                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                                            >
                                                {specialtyData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{
                                                    background: 'rgba(30,30,40,0.95)',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    borderRadius: '8px'
                                                }}
                                            />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* ========== ACADEMIC SECTION ========== */}
            {academic.quizzes_completed > 0 && (
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <FontAwesomeIcon icon={faGraduationCap} />
                        {t('stats.academicCenter', 'Centro Acadêmico')}
                    </h2>

                    <div className={styles.academicGrid}>
                        <div className={styles.academicCard}>
                            <div className={styles.academicValue}>{academic.quizzes_completed}</div>
                            <div className={styles.academicLabel}>{t('stats.quizzesCompleted', 'Quizzes Realizados')}</div>
                        </div>

                        <div className={styles.academicCard}>
                            <div className={styles.academicValue} style={{ color: CHART_COLORS.success }}>
                                {((academic.correct_rate || 0) * 100).toFixed(1)}%
                            </div>
                            <div className={styles.academicLabel}>{t('stats.correctRate', 'Taxa de Acertos')}</div>
                            <div className={styles.progressBar}>
                                <div
                                    className={styles.progressFill}
                                    style={{
                                        width: `${(academic.correct_rate || 0) * 100}%`,
                                        background: CHART_COLORS.success
                                    }}
                                />
                            </div>
                        </div>

                        {academic.season_rank && (
                            <div className={styles.academicCard}>
                                <div className={styles.academicValue} style={{ color: CHART_COLORS.warning }}>
                                    #{academic.season_rank}
                                </div>
                                <div className={styles.academicLabel}>{t('stats.seasonRank', 'Ranking da Temporada')}</div>
                                {academic.season_percentile && (
                                    <div className={styles.percentileBadge}>
                                        Top {academic.season_percentile}%
                                    </div>
                                )}
                            </div>
                        )}

                        <div className={styles.academicCard}>
                            <div className={styles.academicValue} style={{ color: CHART_COLORS.primary }}>
                                {overview.arena_score || 0}
                            </div>
                            <div className={styles.academicLabel}>{t('stats.totalScore', 'Pontuação Total')}</div>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}

// Sub-components
function OverviewCard({ icon, label, value, color }) {
    return (
        <div className={styles.overviewCard}>
            <div className={styles.overviewIcon} style={{ color }}>
                <FontAwesomeIcon icon={icon} />
            </div>
            <div className={styles.overviewInfo}>
                <span className={styles.overviewValue}>{value}</span>
                <span className={styles.overviewLabel}>{label}</span>
            </div>
        </div>
    );
}

export default ComprehensiveStatistics;
