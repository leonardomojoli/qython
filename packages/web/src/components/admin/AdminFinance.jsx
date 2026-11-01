import React, { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { api } from '../../api';
import { FaArrowLeft, FaDollarSign } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import './UserManager.css';

const AdminFinance = () => {
    const [data, setData] = useState({ transactions: [], product_breakdown: {} });
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        api.get('/admin/details/finance')
            .then(res => setData(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    return (
        <AdminLayout>
            <div className="user-manager">
                <div className="manager-header">
                    <h3>
                        <button
                            onClick={() => navigate('/admin')}
                            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', marginRight: '10px' }}
                        >
                            <FaArrowLeft />
                        </button>
                        <FaDollarSign style={{ marginRight: '10px' }} /> Detalhes Financeiros
                    </h3>
                </div>

                {/* Resumo de Produtos */}
                {Object.keys(data.product_breakdown).length > 0 && (
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', flexWrap: 'wrap', padding: '0 20px' }}>
                        {Object.entries(data.product_breakdown).map(([product, amount]) => (
                            <div
                                key={product}
                                style={{
                                    background: 'rgba(3, 218, 198, 0.1)',
                                    padding: '15px 25px',
                                    borderRadius: '8px',
                                    border: '1px solid #03dac6',
                                    minWidth: '180px'
                                }}
                            >
                                <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>{product}</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>
                                    US$ {amount.toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {loading ? (
                    <div style={{ padding: '20px', color: '#aaa' }}>Carregando...</div>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Usuário</th>
                                <th>Produto</th>
                                <th>Valor</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.transactions.map(t => (
                                <tr key={t.id}>
                                    <td>{t.date ? new Date(t.date).toLocaleDateString() : '-'}</td>
                                    <td>
                                        <div className="user-cell">
                                            <span className="user-name">{t.user_name}</span>
                                            <span className="user-email">{t.user_email}</span>
                                        </div>
                                    </td>
                                    <td>{t.description || '-'}</td>
                                    <td style={{ fontWeight: 'bold', color: '#03dac6' }}>
                                        {t.amount} {t.currency}
                                    </td>
                                    <td>
                                        <span className={`badge ${t.status === 'completed' ? 'status-active' : 'status-pending'}`}>
                                            {t.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {data.transactions.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', color: '#666' }}>
                                        Nenhuma transação encontrada.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </AdminLayout>
    );
};

export default AdminFinance;
