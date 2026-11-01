import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../contexts/UserContext';
import './Admin.css';
import qythonLogo from '../../assets/qython-imagotipo.png';
import { FaChartPie, FaChartLine, FaCog, FaSignOutAlt, FaArrowLeft, FaUsers, FaUserEdit, FaStore } from 'react-icons/fa';

const AdminLayout = ({ children }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, setUser } = useUser();

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <FaChartPie />, path: '/admin' },
        { id: 'analytics', label: 'Analytics', icon: <FaChartLine />, path: '/admin/analytics' },
        { id: 'users', label: 'Usuários', icon: <FaUsers />, path: '/admin/users' },
        { id: 'profile-updates', label: 'Atualizações Perfil', icon: <FaUserEdit />, path: '/admin/profile-updates' },
        { id: 'pharmacies', label: 'Farmácias', icon: <FaStore />, path: '/admin/pharmacies' },
        { id: 'settings', label: 'Configurações', icon: <FaCog />, path: '/admin/settings' },
    ];

    const handleLogout = () => {
        localStorage.removeItem('authToken');
        setUser(null);
        navigate('/login');
    };

    return (
        <div className="admin-container">
            <aside className="admin-sidebar">
                <div className="admin-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                    <img src={qythonLogo} alt="Qython" className="admin-logo-img" />
                    <span className="admin-badge">Admin</span>
                </div>

                <nav className="admin-nav">
                    {/* Back to App Button */}
                    <button
                        className="nav-item back-to-app"
                        onClick={() => navigate('/copilot')}
                        style={{
                            marginBottom: '20px',
                            paddingBottom: '15px',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 0,
                            color: '#03dac6'
                        }}
                    >
                        <FaArrowLeft />
                        Voltar ao App
                    </button>

                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                            onClick={() => navigate(item.path)}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="admin-user">
                    <div className="admin-avatar">
                        {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'A'}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: '600', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {user?.full_name || 'Admin'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#a0a0a0' }}>Admin</div>
                    </div>
                    <button
                        onClick={handleLogout}
                        style={{ background: 'none', border: 'none', color: '#a0a0a0', cursor: 'pointer' }}
                        title="Sair da conta"
                    >
                        <FaSignOutAlt />
                    </button>
                </div>
            </aside>

            <main className="admin-content">
                {children}
            </main>
        </div>
    );
};

export default AdminLayout;

