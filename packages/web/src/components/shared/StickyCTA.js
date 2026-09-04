import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useUser } from '../../contexts/UserContext';
import './StickyCTA.css';

function StickyCTA() {
    const { t } = useTranslation();
    const { user } = useUser();

    if (user) return null;

    return (
        <div className="sticky-cta">
            <div className="sticky-cta-content">
                <h3>{t('readyToRevolutionize', 'Pronto para revolucionar sua prática?')}</h3>
                <Link to="/register" className="sticky-cta-button">
                    {t('startNowFree', 'Criar Conta Grátis')}
                </Link>
            </div>
        </div>
    );
}

export default StickyCTA;
