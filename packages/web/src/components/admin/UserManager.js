import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api';
import { WEB_URL } from '../../config';
import { useNotification } from '../../contexts/NotificationContext';
import { FaCheck, FaTimes, FaUsers, FaEnvelope, FaDownload, FaShieldAlt, FaBan, FaUnlock } from 'react-icons/fa';
import AdminLayout from './AdminLayout';
import ConfirmationModal from '../shared/ConfirmationModal';
import './UserManager.css';

const UserManager = () => {
    const location = useLocation();
    const [users, setUsers] = useState([]);
    // Se vier um filtro na navegação, usa ele. Se não, usa 'all'.
    const [filter, setFilter] = useState(location.state?.initialFilter || 'all');
    const [loading, setLoading] = useState(true);
    const { addNotification } = useNotification();

    // Estados para o Modal de Confirmação
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [actionType, setActionType] = useState(null);
    const [banReasonKey, setBanReasonKey] = useState('terms_violation');

    // Lista de motivos jurídicos para banimento
    const BAN_REASONS = [
        { key: 'terms_violation', label: 'Violação dos Termos de Uso (Geral)' },
        { key: 'security_risk', label: 'Risco de Segurança / Atividade Suspeita' },
        { key: 'payment_issue', label: 'Irregularidade no Pagamento / Chargeback' },
        { key: 'medical_misuse', label: 'Uso Indevido da IA (Risco Médico)' },
        { key: 'fraud', label: 'Identidade não verificada / Fraude' },
        { key: 'abuse', label: 'Comportamento Abusivo' }
    ];

    // Estado e Templates para Rejeição de Documento
    const [rejectionReason, setRejectionReason] = useState('');
    const KYC_REJECTION_TEMPLATES = [
        { label: 'Imagem Ilegível / Borrada', text: 'A imagem enviada está borrada, escura ou ilegível. Por favor, envie uma nova foto nítida em ambiente bem iluminado.' },
        { label: 'Documento Incompleto (Cortes)', text: 'O documento aparece cortado na foto. Precisamos ver o documento inteiro, incluindo bordas e todos os dados.' },
        { label: 'Falta Verso', text: 'Você enviou apenas a frente do documento. Precisamos também de uma foto do verso para validação.' },
        { label: 'Documento Vencido', text: 'O documento apresentado está fora do prazo de validade. Por favor, envie um documento atualizado.' },
        { label: 'Tipo Incorreto', text: 'O documento enviado não é aceito (ex: crachá não serve como CRM/Diploma).' },
        { label: 'Nome Divergente', text: 'O nome no documento não coincide com o nome do cadastro.' }
    ];

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const params = filter !== 'all' ? { filter_status: filter } : {};
            const response = await api.get('/admin/users', { params });
            setUsers(response.data);
        } catch (error) {
            console.error("Erro ao buscar usuários", error);
            addNotification('Erro ao carregar usuários.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [filter]);

    // Abre o modal em vez de window.confirm
    const requestAction = (user, action) => {
        setSelectedUser(user);
        setActionType(action);
        setBanReasonKey('terms_violation');
        setRejectionReason('');
        setIsModalOpen(true);
    };

    const handleConfirmAction = async () => {
        if (!selectedUser || !actionType) return;

        try {
            if (actionType === 'invite') {
                await api.post(`/admin/users/${selectedUser.id}/send-invite`);
                addNotification('Convite enviado e usuário ativado!', 'success');
            } else if (actionType === 'ban') {
                await api.post(`/admin/users/${selectedUser.id}/ban`, { reason: banReasonKey });
                addNotification('Usuário suspenso e notificado.', 'success');
            } else if (actionType === 'unban') {
                await api.post(`/admin/users/${selectedUser.id}/unban`);
                addNotification('Usuário reativado.', 'success');
            } else {
                await api.post(`/admin/users/${selectedUser.id}/verify`, {
                    action: actionType,
                    reason: actionType === 'reject' ? (rejectionReason || 'Documento inválido.') : null
                });
                addNotification(
                    `Usuário ${actionType === 'approve' ? 'aprovado' : 'rejeitado'} com sucesso!`,
                    'success'
                );
            }

            fetchUsers();
        } catch (error) {
            addNotification('Erro ao processar ação.', 'error');
        } finally {
            setIsModalOpen(false);
            setSelectedUser(null);
            setActionType(null);
        }
    };

    const handleSendInvite = async (user) => {
        // Usa modal para confirmar
        setSelectedUser(user);
        setActionType('invite');
        setIsModalOpen(true);
    };

    // FUNÇÃO DE EXPORTAÇÃO DE LEADS DE MARKETING
    const handleExportLeads = async () => {
        try {
            const response = await api.get('/admin/export/marketing-leads', {
                responseType: 'blob', // Importante para download de arquivo
            });

            // Criar link invisível para download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `qython_leads_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            addNotification('Lista de leads exportada com sucesso!', 'success');
        } catch (error) {
            console.error(error);
            addNotification('Erro ao exportar leads.', 'error');
        }
    };

    return (
        <AdminLayout>
            <div className="user-manager">
                <div className="manager-header">
                    <h3><FaUsers style={{ marginRight: '10px' }} /> Gerenciar Usuários</h3>
                    <div className="filter-controls">
                        {/* BOTÃO DE EXPORTAÇÃO DE LEADS */}
                        <button
                            onClick={handleExportLeads}
                            style={{
                                background: 'rgba(187, 134, 252, 0.1)',
                                color: '#bb86fc',
                                border: '1px solid #bb86fc',
                                marginRight: '15px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                            title="Baixar lista de leads de marketing (CSV)"
                        >
                            <FaDownload /> Leads (CSV)
                        </button>
                        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
                            Todos
                        </button>
                        <button className={filter === 'manual_review' ? 'active' : ''} onClick={() => setFilter('manual_review')}>
                            Pendentes Revisão
                        </button>
                        <button className={filter === 'waitlist' ? 'active' : ''} onClick={() => setFilter('waitlist')}>
                            Waitlist
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="loading-state">Carregando...</div>
                ) : users.length === 0 ? (
                    <div className="empty-state">Nenhum usuário encontrado com este filtro.</div>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Ocupação</th>
                                <th>País</th>
                                <th>Status</th>
                                <th>KYC</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id}>
                                    <td>
                                        <div className="user-cell">
                                            <span className="user-name">
                                                {u.full_name}
                                                {u.is_admin && <FaShieldAlt style={{ marginLeft: '5px', color: '#ffd700' }} title="Admin" />}
                                            </span>
                                            <span className="user-email">{u.email}</span>
                                        </div>
                                    </td>
                                    <td>{u.occupation || '-'}</td>
                                    <td>{u.country ? u.country.toUpperCase() : '-'}</td>
                                    <td>
                                        <span className={`badge status-${u.status}`}>{u.status}</span>
                                    </td>
                                    <td>
                                        <span className={`badge kyc-${u.verification_status}`}>
                                            {u.verification_status}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="action-buttons">
                                            {/* LÓGICA CONDICIONAL DE BOTÕES */}

                                            {/* 1. Se for ADMIN: Sem ações (intocável) */}
                                            {u.is_admin ? (
                                                <span style={{ fontSize: '0.8rem', color: '#ffd700', fontStyle: 'italic' }}>Admin</span>
                                            ) : (
                                                <>
                                                    {/* 2. Se for WAITLIST: Botão de Convite */}
                                                    {u.status === 'waitlist' && (
                                                        <button
                                                            onClick={() => handleSendInvite(u)}
                                                            className="btn-icon"
                                                            style={{ color: '#03dac6', backgroundColor: 'rgba(3, 218, 198, 0.1)' }}
                                                            title="Enviar Convite VIP"
                                                        >
                                                            <FaEnvelope />
                                                        </button>
                                                    )}

                                                    {/* 3. Conceder Acesso (só se ainda não tem acesso e não banido).
                                                        NÃO mexe na verificação Latreo — é só a política de acesso do Qython. */}
                                                    {!u.access_granted && u.verification_status !== 'verified' && u.status !== 'banned' && (
                                                        <button onClick={() => requestAction(u, 'approve')} className="btn-approve" title="Conceder Acesso">
                                                            <FaCheck />
                                                        </button>
                                                    )}

                                                    {/* 4. Revogar Acesso (só se o Qython concedeu acesso; não revoga verificação Latreo) */}
                                                    {u.access_granted && u.status !== 'banned' && (
                                                        <button onClick={() => requestAction(u, 'reject')} className="btn-reject" title="Revogar Acesso">
                                                            <FaTimes />
                                                        </button>
                                                    )}

                                                    {/* 4. Botão de Banir/Desbanir */}
                                                    {u.status === 'banned' ? (
                                                        <button onClick={() => requestAction(u, 'unban')} className="btn-icon" style={{ color: '#4ade80' }} title="Reativar Conta">
                                                            <FaUnlock />
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => requestAction(u, 'ban')} className="btn-icon" style={{ color: '#ff5252' }} title="Suspender Conta">
                                                            <FaBan />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modal de Confirmação */}
            <ConfirmationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleConfirmAction}
                title={
                    actionType === 'ban' ? "Suspender Usuário" :
                        actionType === 'unban' ? "Reativar Usuário" :
                            actionType === 'invite' ? "Enviar Convite VIP" :
                                actionType === 'approve' ? "Conceder Acesso" : "Revogar Acesso"
                }
                message={
                    actionType === 'ban' ? (
                        <div>
                            <p>Tem certeza que deseja <strong>suspender</strong> {selectedUser?.full_name}?</p>
                            <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '10px' }}>Selecione o motivo legal:</p>
                            <select
                                value={banReasonKey}
                                onChange={(e) => setBanReasonKey(e.target.value)}
                                className="admin-select"
                            >
                                {BAN_REASONS.map(r => (
                                    <option key={r.key} value={r.key}>{r.label}</option>
                                ))}
                            </select>
                        </div>
                    ) : actionType === 'reject' ? (
                        <div>
                            <p><strong>ATENÇÃO:</strong> Revogar o acesso de <strong>{selectedUser?.full_name}</strong>?</p>
                            <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '10px' }}>O usuário receberá este motivo por e-mail:</p>
                            <select
                                onChange={(e) => setRejectionReason(e.target.value)}
                                className="admin-select"
                                defaultValue=""
                            >
                                <option value="" disabled>-- Selecione um motivo comum --</option>
                                {KYC_REJECTION_TEMPLATES.map((t, i) => (
                                    <option key={i} value={t.text}>{t.label}</option>
                                ))}
                                <option value="">Outro (escrever)</option>
                            </select>
                            <textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Descreva o motivo da rejeição..."
                                className="admin-textarea"
                                rows={3}
                            />
                        </div>
                    ) :
                        actionType === 'unban' ? `Reativar a conta de ${selectedUser?.full_name}?` :
                            actionType === 'invite' ? `Enviar convite por e-mail para ${selectedUser?.full_name}?` :
                                actionType === 'approve' ? `Conceder acesso à plataforma para ${selectedUser?.full_name}?` :
                                    `Confirmar ação?`
                }
                confirmButtonText="Confirmar"
                cancelButtonText="Cancelar"
            />
        </AdminLayout>
    );
};

export default UserManager;
