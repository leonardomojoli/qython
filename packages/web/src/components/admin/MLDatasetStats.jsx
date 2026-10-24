// frontend/src/components/admin/MLDatasetStats.js

import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import InlineLoading from '../shared/InlineLoading';
import { FaDatabase, FaChartBar, FaHeartbeat, FaShieldAlt } from 'react-icons/fa';

const MLDatasetStats = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await api.get('/admin/ml-dataset-stats');
                setStats(res.data);
            } catch (err) {
                setError('Erro ao carregar estatísticas');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (loading) return <InlineLoading />;
    if (error) return <div style={{ color: '#ff6b6b', padding: '20px' }}>{error}</div>;

    const cardStyle = {
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid rgba(255,255,255,0.08)'
    };

    const headerStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '15px',
        color: '#03dac6',
        fontSize: '1.1rem',
        fontWeight: '600'
    };

    const metricStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)'
    };

    const bigNumberStyle = {
        fontSize: '2.5rem',
        fontWeight: '700',
        color: '#fff',
        marginBottom: '5px'
    };

    const labelStyle = {
        color: '#888',
        fontSize: '0.9rem'
    };

    const qualityColors = {
        'platinum': '#e5e4e2',
        'gold': '#ffd700',
        'like': '#4caf50',
        'neutral': '#888',
        'dislike': '#ff6b6b',
        'rejected': '#ff4444'
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Security Notice */}
            <div style={{
                background: 'rgba(3, 218, 198, 0.1)',
                border: '1px solid rgba(3, 218, 198, 0.3)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
                <FaShieldAlt style={{ color: '#03dac6' }} />
                <span style={{ color: '#03dac6', fontSize: '0.9rem' }}>
                    Exibindo apenas estatísticas agregadas. Dados brutos permanecem seguros no servidor.
                </span>
            </div>

            {/* Top Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                <div style={cardStyle}>
                    <div style={bigNumberStyle}>{stats.training_data.total_entries.toLocaleString()}</div>
                    <div style={labelStyle}>Total Samples (LLM)</div>
                </div>
                <div style={cardStyle}>
                    <div style={{ ...bigNumberStyle, color: '#4caf50' }}>
                        {stats.training_data.ready_for_training.toLocaleString()}
                    </div>
                    <div style={labelStyle}>Prontos para Treinamento</div>
                </div>
                <div style={cardStyle}>
                    <div style={bigNumberStyle}>{stats.surgical_outcomes.total_outcomes_recorded}</div>
                    <div style={labelStyle}>Casos Cirúrgicos (ML Preditivo)</div>
                </div>
            </div>

            {/* Training Data by Source */}
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <FaDatabase /> Samples por Fonte
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {Object.entries(stats.training_data.by_source).map(([source, count]) => (
                        <div key={source} style={metricStyle}>
                            <span style={{ color: '#ccc' }}>{source.replace(/_/g, ' ')}</span>
                            <span style={{ fontWeight: '600', color: '#fff' }}>{count.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quality Distribution */}
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <FaChartBar /> Distribuição de Qualidade
                </div>
                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                    {Object.entries(stats.training_data.by_quality).map(([quality, count]) => (
                        <div key={quality} style={{
                            background: 'rgba(0,0,0,0.3)',
                            padding: '12px 20px',
                            borderRadius: '8px',
                            textAlign: 'center',
                            minWidth: '100px'
                        }}>
                            <div style={{
                                fontSize: '1.5rem',
                                fontWeight: '700',
                                color: qualityColors[quality] || '#fff'
                            }}>
                                {count.toLocaleString()}
                            </div>
                            <div style={{
                                color: qualityColors[quality] || '#888',
                                fontSize: '0.8rem',
                                textTransform: 'capitalize'
                            }}>
                                {quality}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Surgical Outcomes */}
            {stats.surgical_outcomes.total_outcomes_recorded > 0 && (
                <div style={cardStyle}>
                    <div style={{ ...headerStyle, color: '#bb86fc' }}>
                        <FaHeartbeat /> Taxas de Complicação (Modelo Preditivo)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                        {Object.entries(stats.surgical_outcomes.complication_rates).map(([comp, rate]) => (
                            <div key={comp} style={{
                                background: rate > 0.1 ? 'rgba(255,107,107,0.1)' : 'rgba(0,0,0,0.2)',
                                padding: '15px',
                                borderRadius: '8px',
                                border: rate > 0.1 ? '1px solid rgba(255,107,107,0.3)' : '1px solid transparent'
                            }}>
                                <div style={{
                                    fontSize: '1.3rem',
                                    fontWeight: '700',
                                    color: rate > 0.1 ? '#ff6b6b' : '#4caf50'
                                }}>
                                    {(rate * 100).toFixed(1)}%
                                </div>
                                <div style={{ color: '#888', fontSize: '0.8rem' }}>
                                    {comp.replace(/_/g, ' ')}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{
                        marginTop: '15px',
                        padding: '15px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-around'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: '600', color: '#fff' }}>
                                {stats.surgical_outcomes.averages.blood_loss_ml} mL
                            </div>
                            <div style={{ color: '#888', fontSize: '0.8rem' }}>Sangramento Médio</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: '600', color: '#fff' }}>
                                {stats.surgical_outcomes.averages.duration_minutes} min
                            </div>
                            <div style={{ color: '#888', fontSize: '0.8rem' }}>Duração Média</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Outcome Classes */}
            {Object.keys(stats.surgical_outcomes.by_outcome_class).length > 0 && (
                <div style={cardStyle}>
                    <div style={headerStyle}>
                        Classificação de Desfechos
                    </div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                        {Object.entries(stats.surgical_outcomes.by_outcome_class).map(([cls, count]) => (
                            <div key={cls} style={{
                                flex: 1,
                                background: cls === 'uneventful' ? 'rgba(76,175,80,0.1)' :
                                    cls === 'minor_complication' ? 'rgba(255,193,7,0.1)' : 'rgba(255,107,107,0.1)',
                                padding: '15px',
                                borderRadius: '8px',
                                textAlign: 'center'
                            }}>
                                <div style={{
                                    fontSize: '1.5rem',
                                    fontWeight: '700',
                                    color: cls === 'uneventful' ? '#4caf50' :
                                        cls === 'minor_complication' ? '#ffc107' : '#ff6b6b'
                                }}>
                                    {count}
                                </div>
                                <div style={{ color: '#888', fontSize: '0.8rem' }}>
                                    {cls.replace(/_/g, ' ')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MLDatasetStats;
