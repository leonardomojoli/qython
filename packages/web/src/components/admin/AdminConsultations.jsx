import React, { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { api } from '../../api';
import { FaArrowLeft, FaFileMedical } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import './UserManager.css';

const AdminConsultations = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        api.get('/admin/details/consultations')
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
                        <FaFileMedical style={{ marginRight: '10px' }} /> Auditoria de Consultas
                    </h3>
                </div>

                {loading ? (
                    <div style={{ padding: '20px', color: '#aaa' }}>Carregando...</div>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Médico/Estudante</th>
                                <th>Especialidade</th>
                                <th>Tipo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(c => (
                                <tr key={c.id}>
                                    <td>{c.created_at ? new Date(c.created_at).toLocaleString() : '-'}</td>
                                    <td>
                                        <div className="user-cell">
                                            <span className="user-name">{c.user_name}</span>
                                            <span className="user-email">{c.user_email}</span>
                                        </div>
                                    </td>
                                    <td>{c.specialty || '-'}</td>
                                    <td>
                                        <span className={`badge ${c.is_first ? 'status-active' : 'status-pending'}`}>
                                            {c.is_first ? 'Primeira' : 'Retorno'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {data.length === 0 && (
                                <tr>
                                    <td colSpan="4" style={{ textAlign: 'center', color: '#666' }}>
                                        Nenhuma consulta encontrada.
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

export default AdminConsultations;
