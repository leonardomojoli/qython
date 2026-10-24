import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import PublicPageHeader from '../shared/PublicPageHeader';
import './Contact.css';

function Contact() {
    const { t } = useTranslation();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <>
            <PublicPageHeader />
            <div className="contact-page">
                <div className="contact-hero">
                    <h1>{t('contactUsTitle', 'Fale Conosco')}</h1>
                    <p>{t('contactUsSubtitle', 'Estamos aqui para ajudar você')}</p>
                </div>

                <div className="contact-grid">
                    <div className="contact-card">
                        <div className="contact-icon">📧</div>
                        <h3>{t('support', 'Suporte')}</h3>
                        <p>{t('supportDescription', 'Dúvidas técnicas e ajuda com a plataforma')}</p>
                        <a href="mailto:support@qython.ai" className="contact-email">support@qython.ai</a>
                    </div>

                    <div className="contact-card">
                        <div className="contact-icon">💼</div>
                        <h3>{t('business', 'Negócios e Parcerias')}</h3>
                        <p>{t('businessDescription', 'Propostas comerciais e parcerias')}</p>
                        <a href="mailto:contato@qython.ai" className="contact-email">contato@qython.ai</a>
                    </div>

                    <div className="contact-card">
                        <div className="contact-icon">⚖️</div>
                        <h3>{t('legal', 'Legal')}</h3>
                        <p>{t('legalDescription', 'Questões jurídicas e conformidade')}</p>
                        <a href="mailto:legal@qython.ai" className="contact-email">legal@qython.ai</a>
                    </div>

                    <div className="contact-card">
                        <div className="contact-icon">🔒</div>
                        <h3>{t('security', 'Segurança')}</h3>
                        <p>{t('securityDescription', 'Reporte vulnerabilidades e questões de segurança')}</p>
                        <a href="mailto:security@qython.ai" className="contact-email">security@qython.ai</a>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Contact;

