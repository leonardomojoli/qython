import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { FaThumbsUp, FaThumbsDown } from 'react-icons/fa';
import './Admin.css';

const FeedbackManager = () => {
    const [feedbacks, setFeedbacks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadFeedbacks = async () => {
            try {
                const res = await api.get('/admin/feedbacks');
                setFeedbacks(res.data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        loadFeedbacks();
    }, []);

    if (loading) return <div style={{ padding: '20px', color: '#aaa' }}>Carregando feedbacks...</div>;

    return (
        <div className="blog-manager-container" style={{ marginTop: '0' }}>
            <h3 style={{ padding: '20px', margin: 0, borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '1rem' }}>
                Feedbacks Recentes da IA
            </h3>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="drafts-list" style={{ fontSize: '0.85rem' }}>
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Usuário</th>
                            <th>Comentário</th>
                            <th>Data</th>
                        </tr>
                    </thead>
                    <tbody>
                        {feedbacks.map(fb => (
                            <tr key={fb.id}>
                                <td>
                                    {fb.feedback_type === 'like' ?
                                        <span style={{ color: '#4ade80' }}><FaThumbsUp /> Gostei</span> :
                                        <span style={{ color: '#ef4444' }}><FaThumbsDown /> Não Gostei</span>
                                    }
                                </td>
                                <td>{fb.user?.full_name || 'Anônimo'}</td>
                                <td style={{ maxWidth: '200px', whiteSpace: 'normal', fontSize: '0.8rem' }}>
                                    {fb.feedback_text || <em style={{ opacity: 0.5 }}>Sem comentário</em>}
                                </td>
                                <td style={{ fontSize: '0.8rem' }}>
                                    {fb.created_at ? new Date(fb.created_at).toLocaleDateString() : '-'}
                                </td>
                            </tr>
                        ))}
                        {feedbacks.length === 0 && (
                            <tr><td colSpan="4" style={{ textAlign: 'center', color: '#666' }}>Nenhum feedback recebido ainda.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FeedbackManager;
