import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PublicPageHeader from '../shared/PublicPageHeader';
import { API_URL } from '../../config';
import './LegalPage.css';

// Termo de uso da instalação local, lido do backend: é o mesmo texto, com a mesma
// versão, que a pessoa aceita no primeiro acesso (backend/seeds/terms_of_use.py).
// Substitui as páginas legais do SaaS, que descreviam a empresa como controladora.
const LocalTerms = () => {
    const { t } = useTranslation();
    const [terms, setTerms] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        fetch(`${API_URL}/public/terms`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
            .then(setTerms)
            .catch(() => setError(true));
    }, []);

    return (
        <>
            <PublicPageHeader />
            <div className="legal-page-container">
                <div className="legal-content">
                    <h1>{terms?.title || t('termsTitle', 'Termo de Uso do Qython')}</h1>
                    {error && <p>{t('termsLoadError', 'Não foi possível carregar o termo de uso.')}</p>}
                    {terms && (
                        <div className="legal-section-content" style={{ whiteSpace: 'pre-wrap' }}>
                            {terms.body}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default LocalTerms;
