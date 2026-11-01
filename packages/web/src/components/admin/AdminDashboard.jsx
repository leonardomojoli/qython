// frontend/src/components/admin/AdminDashboard.js

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import InvitationManager from './InvitationManager';
import FeedbackManager from './FeedbackManager';
import PromptManager from './PromptManager';
import MLDatasetStats from './MLDatasetStats';
import { api } from '../../api';
import { FaUsers, FaUserClock, FaFileMedical, FaDollarSign, FaChartLine, FaBrain, FaDatabase, FaPills, FaStore, FaClipboardList, FaShareAlt } from 'react-icons/fa';
import InlineLoading from '../shared/InlineLoading';

const AdminDashboard = () => {
    const [stats, setStats] = useState(null);
    const [engagement, setEngagement] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const navigate = useNavigate();

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [statsRes, engRes] = await Promise.all([
                    api.get('/admin/stats'),
                    api.get('/admin/analytics/engagement')
                ]);
                setStats(statsRes.data);
                setEngagement(engRes.data);
            } catch (error) {
                console.error("Erro ao carregar dados", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) return <AdminLayout><InlineLoading /></AdminLayout>;

    // Estilo para indicar que é clicável
    const clickableCardStyle = { cursor: 'pointer', transition: 'transform 0.2s' };

    const tabButtonStyle = (isActive) => ({
        padding: '10px 20px',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: '500',
        transition: 'all 0.2s',
        background: isActive ? 'rgba(3, 218, 198, 0.2)' : 'rgba(255,255,255,0.05)',
        color: isActive ? '#03dac6' : '#aaa',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    });

    return (
        <AdminLayout>
            <div className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 style={{ margin: 0 }}>Dashboard Administrativo</h1>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={() => setActiveTab('overview')}
                        style={tabButtonStyle(activeTab === 'overview')}
                    >
                        Visão Geral
                    </button>
                    <button
                        onClick={() => setActiveTab('prompts')}
                        style={{
                            ...tabButtonStyle(activeTab === 'prompts'),
                            background: activeTab === 'prompts' ? 'rgba(187, 134, 252, 0.2)' : 'rgba(255,255,255,0.05)',
                            color: activeTab === 'prompts' ? '#bb86fc' : '#aaa'
                        }}
                    >
                        <FaBrain /> IA & Prompts
                    </button>
                    <button
                        onClick={() => setActiveTab('ml-dataset')}
                        style={{
                            ...tabButtonStyle(activeTab === 'ml-dataset'),
                            background: activeTab === 'ml-dataset' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255,255,255,0.05)',
                            color: activeTab === 'ml-dataset' ? '#4caf50' : '#aaa'
                        }}
                    >
                        <FaDatabase /> ML Dataset
                    </button>
                </div>
            </div>

            {activeTab === 'overview' && (
                <>
                    <div className="stats-grid">
                        {/* 1. Usuários Totais -> Vai para lista geral */}
                        <div
                            className="stat-card"
                            style={clickableCardStyle}
                            onClick={() => navigate('/admin/users')}
                            title="Ver todos os usuários"
                        >
                            <h3><FaUsers /> Usuários Totais</h3>
                            <div className="value">{stats?.total_users || 0}</div>
                            <div className="trend neutral">{stats?.active_users || 0} ativos</div>
                        </div>

                        {/* 2. Fila de Espera -> Vai para lista JÁ FILTRADA */}
                        <div
                            className="stat-card"
                            style={clickableCardStyle}
                            onClick={() => navigate('/admin/users', { state: { initialFilter: 'waitlist' } })}
                            title="Gerenciar fila de espera"
                        >
                            <h3><FaUserClock /> Fila de Espera</h3>
                            <div className="value">{stats?.waitlist_users || 0}</div>
                            <div className="trend positive">Aguardando convite</div>
                        </div>

                        {/* 3. Usuários Ativos -> Vai para Auditoria de Consultas (onde a atividade acontece) */}
                        <div
                            className="stat-card"
                            style={clickableCardStyle}
                            onClick={() => navigate('/admin/consultations')}
                            title="Ver atividade recente"
                        >
                            <h3><FaChartLine /> Usuários Ativos (24h)</h3>
                            <div className="value">{engagement?.dau_proxy || 0}</div>
                            <div className="trend positive">Engajamento</div>
                        </div>

                        {/* 4. Consultas -> Vai para Auditoria de Consultas */}
                        <div
                            className="stat-card"
                            style={clickableCardStyle}
                            onClick={() => navigate('/admin/consultations')}
                            title="Auditar consultas"
                        >
                            <h3><FaFileMedical /> Consultas Geradas</h3>
                            <div className="value">{stats?.total_consultations || 0}</div>
                        </div>

                        {/* 5. Receita -> Vai para Auditoria Financeira */}
                        <div
                            className="stat-card"
                            style={clickableCardStyle}
                            onClick={() => navigate('/admin/finance')}
                            title="Ver detalhes financeiros"
                        >
                            <h3><FaDollarSign /> Receita Total</h3>
                            <div className="value">US$ {stats?.total_revenue?.toFixed(2) || '0.00'}</div>
                        </div>
                    </div>

                    {/* Pharmacy Module Stats */}
                    <h3 style={{ margin: '30px 0 15px', color: '#bb86fc', fontSize: '1rem', fontWeight: '600' }}>
                        <FaPills style={{ marginRight: '8px' }} /> Módulo Farmácia
                    </h3>
                    <div className="stats-grid">
                        <div
                            className="stat-card"
                            style={clickableCardStyle}
                            onClick={() => navigate('/admin/pharmacies')}
                            title="Gerenciar medicamentos"
                        >
                            <h3><FaPills /> Medicamentos</h3>
                            <div className="value">{stats?.total_medications || 0}</div>
                            <div className="trend neutral">Cadastrados</div>
                        </div>

                        <div
                            className="stat-card"
                            style={clickableCardStyle}
                            onClick={() => navigate('/admin/pharmacies')}
                            title="Gerenciar farmácias"
                        >
                            <h3><FaStore /> Farmácias</h3>
                            <div className="value">{stats?.total_pharmacies || 0}</div>
                            <div className="trend neutral">{stats?.total_pharmacy_chains || 0} redes</div>
                        </div>

                        <div
                            className="stat-card"
                            style={clickableCardStyle}
                            onClick={() => navigate('/admin/pharmacies')}
                            title="Ver lista de espera"
                        >
                            <h3><FaClipboardList /> Waitlist Farmácias</h3>
                            <div className="value">{stats?.pending_waitlist || 0}</div>
                            <div className="trend positive">Pendentes</div>
                        </div>

                        <div className="stat-card">
                            <h3><FaShareAlt /> Receitas Compartilhadas</h3>
                            <div className="value">{stats?.total_prescription_shares || 0}</div>
                            <div className="trend neutral">Via QR code / link</div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                        <InvitationManager />
                        <FeedbackManager />
                    </div>
                </>
            )}

            {activeTab === 'prompts' && (
                <PromptManager />
            )}

            {activeTab === 'ml-dataset' && (
                <MLDatasetStats />
            )}

        </AdminLayout>
    );
};

export default AdminDashboard;
