import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import PublicPageHeader from '../shared/PublicPageHeader';
import './Careers.css';

function Careers() {
    const { t } = useTranslation();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <>
            <PublicPageHeader />
            <div className="careers-page">
                <div className="careers-hero">
                    <h1>{t('careersTitle', 'Carreiras')}</h1>
                    <p>{t('careersHeroText', 'Junte-se a nós e faça parte do futuro da medicina')}</p>
                </div>

                <div className="careers-content">
                    <div className="careers-info">
                        <h2>{t('whyJoinUs', 'Por que trabalhar conosco?')}</h2>
                        <p>{t('careersText', 'Estamos sempre em busca de talentos excepcionais. Envie seu CV para:')}</p>

                        <div className="careers-benefits">
                            <div className="benefit-item">
                                <div className="benefit-icon">💡</div>
                                <h3>{t('innovation', 'Inovação')}</h3>
                                <p>{t('innovationText', 'Trabalhe com tecnologias de ponta em IA médica')}</p>
                            </div>
                            <div className="benefit-item">
                                <div className="benefit-icon">🚀</div>
                                <h3>{t('growth', 'Crescimento')}</h3>
                                <p>{t('growthText', 'Oportunidades constantes de desenvolvimento profissional')}</p>
                            </div>
                            <div className="benefit-item">
                                <div className="benefit-icon">🤝</div>
                                <h3>{t('team', 'Time')}</h3>
                                <p>{t('teamText', 'Colabore com profissionais incríveis e apaixonados')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="careers-cta">
                        <h2>{t('readyToJoin', 'Pronto para fazer a diferença?')}</h2>
                        <p>{t('sendYourCV', 'Envie seu currículo e portfólio para:')}</p>
                        <a href="mailto:careers@qython.ai" className="careers-email-button">
                            careers@qython.ai
                        </a>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Careers;

