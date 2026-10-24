import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { api } from '../../api';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { FaChartLine, FaUsers, FaRocket, FaCog, FaFlask, FaCoins } from 'react-icons/fa';
import styles from './AnalyticsDashboard.module.css';

const PERIODS = ['7d', '30d', '90d'];

const FEATURE_COLORS = {
    copilot: '#bb86fc',
    consultation: '#03dac6',
    academic: '#ffab40',
    pharmacy: '#42a5f5',
};

const PIE_COLORS = ['#bb86fc', '#03dac6', '#ffab40', '#e91e63', '#42a5f5', '#ff5722', '#7c4dff', '#00e676'];

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
        <div className={styles.customTooltip}>
            <div className={styles.label}>{label}</div>
            {payload.map((entry, i) => (
                <div key={i} className={styles.value} style={{ color: entry.color }}>
                    {entry.name}: {entry.value}
                </div>
            ))}
        </div>
    );
};

const AnalyticsDashboard = () => {
    const [period, setPeriod] = useState('30d');
    const [loading, setLoading] = useState(true);
    const [dauMau, setDauMau] = useState(null);
    const [growth, setGrowth] = useState(null);
    const [featureUsage, setFeatureUsage] = useState(null);
    const [aiUsage, setAiUsage] = useState(null);

    const daysMap = { '7d': 7, '30d': 30, '90d': 90 };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const days = daysMap[period];
            const [dauRes, growthRes, featureRes, aiRes] = await Promise.all([
                api.get(`/admin/analytics/dau-mau?days=${days}`),
                api.get(`/admin/analytics/growth?period=${period}`),
                api.get(`/admin/analytics/feature-usage?days=${days}`),
                api.get(`/admin/analytics/ai-usage?days=${days}`),
            ]);
            setDauMau(dauRes.data);
            setGrowth(growthRes.data);
            setFeatureUsage(featureRes.data);
            setAiUsage(aiRes.data);
        } catch (err) {
            console.error('Failed to load analytics:', err);
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const formatChangeIndicator = (value) => {
        if (value > 0) return { text: `+${value}`, className: styles.metricChangePositive };
        if (value < 0) return { text: `${value}`, className: styles.metricChangeNegative };
        return { text: '0', className: styles.metricChangeNeutral };
    };

    if (loading) {
        return (
            <AdminLayout>
                <div className={styles.loading}>Carregando analytics...</div>
            </AdminLayout>
        );
    }

    const wauChange = dauMau ? formatChangeIndicator(dauMau.wau_change) : null;

    // Prepare pie data from feature usage
    const pieData = featureUsage?.features?.map(f => ({
        name: f.feature,
        value: f.total_events,
    })) || [];

    return (
        <AdminLayout>
            <div className={styles.container}>
                {/* Header with period selector */}
                <div className={styles.header}>
                    <h1>Analytics</h1>
                    <div className={styles.periodSelector}>
                        {PERIODS.map(p => (
                            <button
                                key={p}
                                className={`${styles.periodBtn} ${period === p ? styles.periodBtnActive : ''}`}
                                onClick={() => setPeriod(p)}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Metric Cards */}
                {dauMau && (
                    <div className={styles.metricsGrid}>
                        <div className={styles.metricCard}>
                            <span className={styles.metricLabel}>DAU (24h)</span>
                            <span className={styles.metricValue}>{dauMau.dau}</span>
                        </div>
                        <div className={styles.metricCard}>
                            <span className={styles.metricLabel}>WAU (7d)</span>
                            <span className={styles.metricValue}>{dauMau.wau}</span>
                            {wauChange && (
                                <span className={`${styles.metricChange} ${wauChange.className}`}>
                                    {wauChange.text} vs semana anterior
                                </span>
                            )}
                        </div>
                        <div className={styles.metricCard}>
                            <span className={styles.metricLabel}>MAU (30d)</span>
                            <span className={styles.metricValue}>{dauMau.mau}</span>
                        </div>
                        <div className={styles.metricCard}>
                            <span className={styles.metricLabel}>Total Ativos</span>
                            <span className={styles.metricValue}>{dauMau.total_active}</span>
                        </div>
                    </div>
                )}

                {/* Charts */}
                <div className={styles.chartsGrid}>

                    {/* DAU over time */}
                    <div className={`${styles.chartCard} ${styles.chartCardFull}`}>
                        <h3 className={styles.chartTitle}>
                            <FaChartLine /> Usuarios Ativos por Dia
                        </h3>
                        {dauMau?.daily?.length > 0 ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={dauMau.daily}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#666"
                                        fontSize={11}
                                        tickFormatter={v => v?.slice(5)}
                                    />
                                    <YAxis stroke="#666" fontSize={11} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Line
                                        type="monotone"
                                        dataKey="count"
                                        name="DAU"
                                        stroke="#bb86fc"
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4, fill: '#bb86fc' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className={styles.emptyState}>Sem dados para o periodo selecionado</div>
                        )}
                    </div>

                    {/* Growth: Registrations per day */}
                    <div className={styles.chartCard}>
                        <h3 className={styles.chartTitle}>
                            <FaRocket /> Registros por Dia
                        </h3>
                        {growth?.registrations?.length > 0 ? (
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={growth.registrations}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#666"
                                        fontSize={11}
                                        tickFormatter={v => v?.slice(5)}
                                    />
                                    <YAxis stroke="#666" fontSize={11} allowDecimals={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="count" name="Registros" fill="#03dac6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className={styles.emptyState}>Sem dados de registro</div>
                        )}
                    </div>

                    {/* Feature Adoption Pie */}
                    <div className={styles.chartCard}>
                        <h3 className={styles.chartTitle}>
                            <FaCog /> Adocao de Features
                        </h3>
                        {pieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={90}
                                        innerRadius={45}
                                        paddingAngle={2}
                                        dataKey="value"
                                        label={({ name, percent }) =>
                                            `${name} ${(percent * 100).toFixed(0)}%`
                                        }
                                        labelLine={{ stroke: '#666' }}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell
                                                key={entry.name}
                                                fill={FEATURE_COLORS[entry.name] || PIE_COLORS[index % PIE_COLORS.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className={styles.emptyState}>Sem dados de uso</div>
                        )}
                    </div>

                    {/* AI Usage bar chart */}
                    <div className={styles.chartCard}>
                        <h3 className={styles.chartTitle}>
                            <FaFlask /> Uso de IA por Tipo
                        </h3>
                        {aiUsage?.usage?.length > 0 ? (
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart
                                    data={aiUsage.usage.slice(0, 8)}
                                    layout="vertical"
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis type="number" stroke="#666" fontSize={11} />
                                    <YAxis
                                        type="category"
                                        dataKey="action"
                                        stroke="#666"
                                        fontSize={11}
                                        width={110}
                                        tick={{ fill: '#a0a0a0' }}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="count" name="Eventos" radius={[0, 4, 4, 0]}>
                                        {aiUsage.usage.slice(0, 8).map((entry, index) => (
                                            <Cell
                                                key={index}
                                                fill={FEATURE_COLORS[entry.feature] || PIE_COLORS[index % PIE_COLORS.length]}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className={styles.emptyState}>Sem dados de uso de IA</div>
                        )}
                    </div>

                    {/* Feature Usage Table */}
                    <div className={styles.chartCard}>
                        <h3 className={styles.chartTitle}>
                            <FaUsers /> Feature Adoption (detalhe)
                        </h3>
                        {featureUsage?.features?.length > 0 ? (
                            <table className={styles.featureTable}>
                                <thead>
                                    <tr>
                                        <th>Feature</th>
                                        <th>Eventos</th>
                                        <th>Usuarios</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {featureUsage.features.map(f => (
                                        <tr key={f.feature}>
                                            <td>
                                                <span className={styles.featureBadge} data-feature={f.feature}>
                                                    {f.feature}
                                                </span>
                                            </td>
                                            <td>{f.total_events.toLocaleString()}</td>
                                            <td>{f.unique_users.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className={styles.emptyState}>Sem dados de features</div>
                        )}
                    </div>

                    {/* Dracma consumption summary */}
                    <div className={styles.chartCard}>
                        <h3 className={styles.chartTitle}>
                            <FaCoins /> Consumo de Dracmas
                        </h3>
                        <div style={{ padding: '20px 0', textAlign: 'center' }}>
                            <div className={styles.metricValue} style={{ fontSize: '2.5rem', marginBottom: '8px' }}>
                                {aiUsage ? Math.round(aiUsage.total_dracmas_consumed).toLocaleString() : '0'}
                            </div>
                            <div className={styles.metricLabel}>
                                dracmas consumidos nos ultimos {aiUsage?.period_days || 30} dias
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </AdminLayout>
    );
};

export default AnalyticsDashboard;
