import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import qythonLogo from '../../assets/qython-imagotipo.png';
import './LegalPageLayout.css';

const LegalPageLayout = ({ children, title }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <div className="legal-page-layout">
            <header className="legal-header">
                <div className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                    <img src={qythonLogo} alt="Qython" className="logo-img-full" />
                </div>
                <button className="cta cta-secondary" onClick={() => navigate('/register')}>
                    {t('getStarted')}
                </button>
            </header>

            <main className="legal-content">
                <h1>{title}</h1>
                {children}
            </main>

            <div className="sticky-cta-bar">
                <div className="cta-content">
                    <span>{t('readyToRevolutionize')}</span>
                    <button className="cta cta-glow" onClick={() => navigate('/register')}>
                        {t('getStarted')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LegalPageLayout;
