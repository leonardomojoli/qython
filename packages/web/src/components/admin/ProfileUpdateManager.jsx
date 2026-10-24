// frontend/src/components/admin/ProfileUpdateManager.js

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    getPendingProfileUpdateRequests,
    getAllProfileUpdateRequests,
    reviewProfileUpdateRequest
} from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import { WEB_URL } from '../../config';
import { FaCheck, FaTimes, FaFilter, FaGraduationCap, FaUniversity, FaUserMd, FaEye } from 'react-icons/fa';
import AdminLayout from './AdminLayout';
import ConfirmationModal from '../shared/ConfirmationModal';
import './ProfileUpdateManager.css';

const ProfileUpdateManager = () => {
    const { t } = useTranslation();
    const { addNotification } = useNotification();

    const [requests, setRequests] = useState([]);
    const [filter, setFilter] = useState('pending');
    const [loading, setLoading] = useState(true);

    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [actionType, setActionType] = useState(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [detailsRequest, setDetailsRequest] = useState(null);

    const REJECTION_TEMPLATES = [
        { label: 'Documento ilegível', text: 'O documento enviado está ilegível ou de baixa qualidade. Por favor, envie uma nova imagem nítida.' },
        { label: 'Documento incorreto', text: 'O documento enviado não corresponde ao tipo de atualização solicitada.' },
        { label: 'Informações inconsistentes', text: 'As informações fornecidas não correspondem ao documento enviado.' },
        { label: 'Documento vencido', text: 'O documento apresentado está vencido. Por favor, envie um documento válido.' },
    ];

    const fetchRequests = async () => {
        setLoading(true);
        try {
            let data;
            if (filter === 'pending') {
                data = await getPendingProfileUpdateRequests();
            } else if (filter === 'all') {
                data = await getAllProfileUpdateRequests();
            } else {
                data = await getAllProfileUpdateRequests(filter);
            }
            setRequests(data);
        } catch (error) {
            console.error("Erro ao buscar solicitações:", error);
            addNotification('Erro ao carregar solicitações.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [filter]);

    const getRequestTypeIcon = (type) => {
        switch (type) {
            case 'period_change':
                return <FaGraduationCap />;
            case 'university_change':
                return <FaUniversity />;
            case 'occupation_upgrade':
                return <FaUserMd />;
            default:
                return null;
        }
    };

    const getRequestTypeLabel = (type) => {
        switch (type) {
            case 'period_change':
                return 'Mudança de Período';
            case 'university_change':
                return 'Mudança de Universidade';
            case 'occupation_upgrade':
                return 'Upgrade para Médico';
            default:
                return type;
        }
    };

    const getStatusBadge = (status) => {
        const statusClasses = {
            pending: 'status-pending',
            approved: 'status-approved',
            rejected: 'status-rejected'
        };
        const statusLabels = {
            pending: 'Pendente',
            approved: 'Aprovado',
            rejected: 'Rejeitado'
        };
        return (
            <span className={`status-badge ${statusClasses[status]}`}>
                {statusLabels[status]}
            </span>
        );
    };

    const requestAction = (request, action) => {
        setSelectedRequest(request);
        setActionType(action);
        setAdminNotes('');
        setIsModalOpen(true);
    };

    const handleConfirmAction = async () => {
        if (!selectedRequest || !actionType) return;

        try {
            await reviewProfileUpdateRequest(
                selectedRequest.id,
                actionType,
                adminNotes || null
            );

            addNotification(
                `Solicitação ${actionType === 'approve' ? 'aprovada' : 'rejeitada'} com sucesso!`,
                'success'
            );

            fetchRequests();
        } catch (error) {
            addNotification('Erro ao processar solicitação.', 'error');
        } finally {
            setIsModalOpen(false);
            setSelectedRequest(null);
            setActionType(null);
            setAdminNotes('');
        }
    };

    const openDetails = (request) => {
        setDetailsRequest(request);
        setDetailsModalOpen(true);
    };

    const renderValueDiff = (current, requested) => {
        const keys = [...new Set([...Object.keys(current || {}), ...Object.keys(requested || {})])];

        return (
            <div className="value-diff">
                {keys.map(key => (
                    <div key={key} className="diff-row">
                        <span className="diff-label">{key}:</span>
                        <span className="diff-old">{current?.[key] || '-'}</span>
                        <span className="diff-arrow">→</span>
                        <span className="diff-new">{requested?.[key] || '-'}</span>
                    </div>
                ))}
            </div>
        );
    };

    const getModalTitle = () => {
        if (actionType === 'approve') {
            return 'Aprovar Solicitação';
        } else if (actionType === 'reject') {
            return 'Rejeitar Solicitação';
        }
        return '';
    };

    const getModalMessage = () => {
        if (!selectedRequest) return '';

        if (actionType === 'approve') {
            return `Tem certeza que deseja aprovar esta solicitação de ${getRequestTypeLabel(selectedRequest.request_type).toLowerCase()}? O perfil do usuário será atualizado automaticamente.`;
        } else if (actionType === 'reject') {
            return `Tem certeza que deseja rejeitar esta solicitação? O usuário será notificado.`;
        }
        return '';
    };

    return (
        <AdminLayout>
            <div className="profile-update-manager">
                <header className="manager-header">
                    <h1>Solicitações de Atualização de Perfil</h1>
                    <p className="manager-description">
                        Gerencie solicitações de mudança de período, universidade ou upgrade para médico.
                    </p>
                </header>

                {/* Filters */}
                <div className="manager-filters">
                    <div className="filter-group">
                        <FaFilter />
                        <button
                            className={filter === 'pending' ? 'active' : ''}
                            onClick={() => setFilter('pending')}
                        >
                            Pendentes
                        </button>
                        <button
                            className={filter === 'approved' ? 'active' : ''}
                            onClick={() => setFilter('approved')}
                        >
                            Aprovados
                        </button>
                        <button
                            className={filter === 'rejected' ? 'active' : ''}
                            onClick={() => setFilter('rejected')}
                        >
                            Rejeitados
                        </button>
                        <button
                            className={filter === 'all' ? 'active' : ''}
                            onClick={() => setFilter('all')}
                        >
                            Todos
                        </button>
                    </div>
                </div>

                {/* Requests List */}
                <div className="requests-container">
                    {loading ? (
                        <div className="loading-state">Carregando...</div>
                    ) : requests.length === 0 ? (
                        <div className="empty-state">
                            Nenhuma solicitação encontrada.
                        </div>
                    ) : (
                        <table className="requests-table">
                            <thead>
                                <tr>
                                    <th>Tipo</th>
                                    <th>Usuário</th>
                                    <th>Data</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requests.map((request) => (
                                    <tr key={request.id}>
                                        <td>
                                            <div className="request-type">
                                                {getRequestTypeIcon(request.request_type)}
                                                <span>{getRequestTypeLabel(request.request_type)}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="user-info">
                                                <strong>{request.user_full_name}</strong>
                                                <span>{request.user_email}</span>
                                            </div>
                                        </td>
                                        <td>{new Date(request.created_at).toLocaleDateString('pt-BR')}</td>
                                        <td>{getStatusBadge(request.status)}</td>
                                        <td>
                                            <div className="action-buttons">
                                                <button
                                                    className="btn-view"
                                                    onClick={() => openDetails(request)}
                                                    title="Ver detalhes"
                                                >
                                                    <FaEye />
                                                </button>
                                                {request.status === 'pending' && (
                                                    <>
                                                        <button
                                                            className="btn-approve"
                                                            onClick={() => requestAction(request, 'approve')}
                                                            title="Aprovar"
                                                        >
                                                            <FaCheck />
                                                        </button>
                                                        <button
                                                            className="btn-reject"
                                                            onClick={() => requestAction(request, 'reject')}
                                                            title="Rejeitar"
                                                        >
                                                            <FaTimes />
                                                        </button>
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

                {/* Action Confirmation Modal */}
                <ConfirmationModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onConfirm={handleConfirmAction}
                    title={getModalTitle()}
                    message={getModalMessage()}
                    confirmButtonText={actionType === 'approve' ? 'Aprovar' : 'Rejeitar'}
                    cancelButtonText="Cancelar"
                    variant={actionType === 'approve' ? 'info' : 'danger'}
                    icon={actionType === 'approve' ? 'success' : 'warning'}
                >
                    {actionType === 'reject' && (
                        <div className="rejection-notes">
                            <label>Motivo da rejeição (opcional):</label>
                            <div className="rejection-templates">
                                {REJECTION_TEMPLATES.map((template, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        className={`template-btn ${adminNotes === template.text ? 'active' : ''}`}
                                        onClick={() => setAdminNotes(template.text)}
                                    >
                                        {template.label}
                                    </button>
                                ))}
                            </div>
                            <textarea
                                value={adminNotes}
                                onChange={(e) => setAdminNotes(e.target.value)}
                                placeholder="Descreva o motivo da rejeição..."
                                rows={3}
                            />
                        </div>
                    )}
                </ConfirmationModal>

                {/* Details Modal */}
                {detailsModalOpen && detailsRequest && (
                    <div className="details-modal-overlay" onClick={() => setDetailsModalOpen(false)}>
                        <div className="details-modal" onClick={(e) => e.stopPropagation()}>
                            <button className="close-btn" onClick={() => setDetailsModalOpen(false)}>
                                <FaTimes />
                            </button>

                            <h2>Detalhes da Solicitação</h2>

                            <div className="detail-section">
                                <h3>Tipo de Solicitação</h3>
                                <div className="request-type-detail">
                                    {getRequestTypeIcon(detailsRequest.request_type)}
                                    <span>{getRequestTypeLabel(detailsRequest.request_type)}</span>
                                </div>
                            </div>

                            <div className="detail-section">
                                <h3>Usuário</h3>
                                <p><strong>{detailsRequest.user_full_name}</strong></p>
                                <p>{detailsRequest.user_email}</p>
                            </div>

                            <div className="detail-section">
                                <h3>Alterações Solicitadas</h3>
                                {renderValueDiff(detailsRequest.current_value, detailsRequest.requested_value)}
                            </div>

                            {detailsRequest.documents && detailsRequest.documents.length > 0 && (
                                <div className="detail-section">
                                    <h3>Documentos Anexados</h3>
                                    <div className="documents-list">
                                        {detailsRequest.documents.map((doc, idx) => (
                                            <a
                                                key={idx}
                                                href={`${WEB_URL}/static/uploads/profile_update_docs/${doc}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="document-link"
                                            >
                                                Documento {idx + 1}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="detail-section">
                                <h3>Status</h3>
                                {getStatusBadge(detailsRequest.status)}
                                {detailsRequest.reviewed_at && (
                                    <p className="reviewed-info">
                                        Revisado em: {new Date(detailsRequest.reviewed_at).toLocaleString('pt-BR')}
                                        {detailsRequest.reviewer_name && ` por ${detailsRequest.reviewer_name}`}
                                    </p>
                                )}
                            </div>

                            {detailsRequest.admin_notes && (
                                <div className="detail-section">
                                    <h3>Notas do Admin</h3>
                                    <p className="admin-notes">{detailsRequest.admin_notes}</p>
                                </div>
                            )}

                            {detailsRequest.status === 'pending' && (
                                <div className="detail-actions">
                                    <button
                                        className="btn-approve-large"
                                        onClick={() => {
                                            setDetailsModalOpen(false);
                                            requestAction(detailsRequest, 'approve');
                                        }}
                                    >
                                        <FaCheck /> Aprovar
                                    </button>
                                    <button
                                        className="btn-reject-large"
                                        onClick={() => {
                                            setDetailsModalOpen(false);
                                            requestAction(detailsRequest, 'reject');
                                        }}
                                    >
                                        <FaTimes /> Rejeitar
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
};

export default ProfileUpdateManager;
