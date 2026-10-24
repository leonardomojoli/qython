// frontend/src/components/admin/InvitationManager.js

import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faPlus, faSync, faTrash } from '@fortawesome/free-solid-svg-icons';
import './InvitationManager.css';

const InvitationManager = () => {
    const [invites, setInvites] = useState([]);
    const [loading, setLoading] = useState(false);
    const { addNotification } = useNotification();

    const fetchInvites = async () => {
        setLoading(true);
        try {
            const response = await api.get('/admin/invitations');
            setInvites(response.data);
        } catch (error) {
            console.error("Erro ao buscar convites", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvites();
    }, []);

    const generateInvites = async (quantity) => {
        try {
            await api.post('/admin/invitations/generate', { quantity });
            addNotification(`${quantity} convites gerados!`, 'success');
            fetchInvites();
        } catch (error) {
            addNotification('Erro ao gerar convites.', 'error');
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        addNotification('Código copiado!', 'success');
    };

    const deleteInvite = async (token) => {
        if (!window.confirm("Tem certeza que deseja excluir este convite?")) return;
        try {
            await api.delete(`/admin/invitations/${token}`);
            addNotification('Convite excluído!', 'success');
            setInvites(prev => prev.filter(inv => inv.token !== token));
        } catch (error) {
            addNotification('Erro ao excluir convite.', 'error');
        }
    };

    return (
        <div className="invitation-manager">
            <div className="manager-header">
                <h3>Gestão de Convites (Waitlist)</h3>
                <div className="actions">
                    <button onClick={() => generateInvites(1)} className="btn-generate">
                        <FontAwesomeIcon icon={faPlus} /> Gerar 1
                    </button>
                    <button onClick={() => generateInvites(5)} className="btn-generate">
                        <FontAwesomeIcon icon={faPlus} /> Gerar 5
                    </button>
                    <button onClick={fetchInvites} className="btn-refresh">
                        <FontAwesomeIcon icon={faSync} spin={loading} />
                    </button>
                </div>
            </div>

            <div className="invites-list">
                <table>
                    <thead>
                        <tr>
                            <th>Token</th>
                            <th>Status</th>
                            <th>Usado Por</th>
                            <th>Criado Em</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invites.map((invite) => (
                            <tr key={invite.token} className={invite.is_used ? 'used' : 'available'}>
                                <td className="token-cell">{invite.token}</td>
                                <td>
                                    <span className={`status-badge ${invite.is_used ? 'red' : 'green'}`}>
                                        {invite.is_used ? 'Usado' : 'Disponível'}
                                    </span>
                                </td>
                                <td>{invite.used_by_email || '-'}</td>
                                <td>{invite.created_at}</td>
                                <td>
                                    <button onClick={() => copyToClipboard(invite.token)} className="btn-copy" title="Copiar">
                                        <FontAwesomeIcon icon={faCopy} />
                                    </button>
                                    {!invite.is_used && (
                                        <button onClick={() => deleteInvite(invite.token)} className="btn-copy" style={{ color: '#ff5252', marginLeft: '8px' }} title="Excluir">
                                            <FontAwesomeIcon icon={faTrash} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default InvitationManager;
