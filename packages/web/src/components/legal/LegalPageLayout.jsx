import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../contexts/UserContext'; // Importar contexto
import qythonLogo from '../../assets/qython-imagotipo.png';
import StickyCTA from '../shared/StickyCTA'; // Importar o componente compartilhado
import './LegalPageLayout.css';

const LegalPageLayout = ({ children, title }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useUser(); // Verificar estado do usuário

    return (
        <div className="legal-page-layout">
            <header className="legal-header">
                <div className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                    <img src={qythonLogo} alt="Qython" className="logo-img-full" />
                </div>

                <div className="header-actions">
                    {user ? (
                        /* Se logado: Botão para voltar ao sistema */
                        <button className="cta cta-primary" onClick={() => navigate('/copilot')}>
                            {t('goToApp', 'Ir para o App')}
                        </button>
                    ) : (
                        /* Se deslogado: Login e Cadastro */
                        <>
                            <button className="cta cta-secondary" onClick={() => navigate('/login')}>
                                {t('loginButton')}
                            </button>
                            <button className="cta cta-primary" onClick={() => navigate('/register')}>
                                {t('getStarted')}
                            </button>
                        </>
                    )}
                </div>
            </header>

            <main className="legal-content">
                <h1>{title}</h1>
                {children}
            </main>

            {/* O componente já lida com a lógica de esconder se estiver logado */}
            <StickyCTA />
        </div>
    );
};

export default LegalPageLayout;
