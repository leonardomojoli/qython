// frontend/src/components/user/UsageStatistics.js
// Professional usage statistics view - replaces gamified achievements

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import styles from './Profile.module.css';
import InlineLoading from '../shared/InlineLoading';

const UsageStatistics = () => {
    const { t } = useTranslation();
    const [userStats, setUserStats] = useState(null);
    const [milestones, setMilestones] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                const [statsRes, milestonesRes] = await Promise.all([
                    api.get('/user/stats'),
                    api.get('/user/achievements')  // We keep tracking, just display differently
                ]);
                setUserStats(statsRes.data);
                setMilestones(milestonesRes.data);
            } catch (error) {
                console.error("Error fetching usage statistics:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    if (isLoading) {
        return <InlineLoading text={t('loading')} />;
    }

    // Calculate category totals from milestones
    const getMilestoneCount = (prefix) => {
        return milestones.filter(m => m.badge_code.startsWith(prefix)).length;
    };

    const stats = [
        {
            label: t('consultationsGenerated'),
            value: userStats?.consultations_created || 0,
            icon: '📋',
            color: '#03dac6'
        },
        {
            label: t('copilotConversations'),
            value: userStats?.copilot_conversations || 0,
            icon: '🧠',
            color: '#bb86fc'
        },
        {
            label: t('quizzesCompleted'),
            value: userStats?.quizzes_completed || 0,
            icon: '📚',
            color: '#ffd700'
        },
        {
            label: t('arenaScore'),
            value: userStats?.total_score || 0,
            icon: '🏆',
            color: '#4caf50'
        }
    ];

    // Simple bar chart component
    const ProgressBar = ({ current, max, color }) => {
        const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
        return (
            <div style={{
                width: '100%',
                height: '8px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '4px',
                marginTop: '8px'
            }}>
                <div style={{
                    width: `${percentage}%`,
                    height: '100%',
                    background: color,
                    borderRadius: '4px',
                    transition: 'width 0.5s ease'
                }} />
            </div>
        );
    };

    // Find max value for relative scaling
    const maxValue = Math.max(...stats.map(s => s.value), 1);

    return (
        <div className="profile-section">
            <h3 className={styles['tab-section-title']}>{t('usageStatistics')}</h3>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '16px',
                marginTop: '20px'
            }}>
                {stats.map((stat, index) => (
                    <div key={index} style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '12px',
                        padding: '20px',
                        border: '1px solid rgba(255,255,255,0.08)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '1.5rem' }}>{stat.icon}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: '1.8rem',
                                    fontWeight: '700',
                                    color: stat.color
                                }}>
                                    {stat.value.toLocaleString()}
                                </div>
                                <div style={{
                                    fontSize: '0.85rem',
                                    color: '#888'
                                }}>
                                    {stat.label}
                                </div>
                            </div>
                        </div>
                        <ProgressBar
                            current={stat.value}
                            max={maxValue}
                            color={stat.color}
                        />
                    </div>
                ))}
            </div>

            {/* Summary text */}
            <div style={{
                marginTop: '24px',
                padding: '16px',
                background: 'rgba(3, 218, 198, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(3, 218, 198, 0.2)',
                color: '#888',
                fontSize: '0.9rem',
                textAlign: 'center'
            }}>
                {t('usageStatisticsDescription')}
            </div>
        </div>
    );
};

export default UsageStatistics;
