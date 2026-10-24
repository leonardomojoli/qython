import React from 'react';
import PublicPageHeader from '../shared/PublicPageHeader';
import { useTranslation } from 'react-i18next';
import { createSafeHTML } from '../../utils/textUtils';
import './LegalPage.css';

const TermsOfUse = () => {
    const { t } = useTranslation();

    return (
        <>
            <PublicPageHeader />
            <div className="legal-page-container">
                <div className="legal-content">
                    <h1>{t('termsOfUseTitle')}</h1>
                    <p className="legal-last-updated">{t('termsLastUpdated')}</p>

                    <div className="legal-intro">
                        <p>{t('termsIntro')}</p>
                    </div>

                    <section className="legal-section medical-disclaimer">
                        <h2>{t('termsMedicalDisclaimerTitle')}</h2>
                        <div className="legal-section-content disclaimer-box" dangerouslySetInnerHTML={createSafeHTML(t('termsMedicalDisclaimerContent'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection1Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection1Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection2Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection2Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection3Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection3Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection4Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection4Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection5Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection5Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection6Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection6Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection7Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection7Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection8Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection8Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection9Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection9Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection10Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection10Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection11Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection11Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection12Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection12Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection13Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection13Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('termsSection14Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('termsSection14Content'))} />
                    </section>
                </div>
            </div>
        </>
    );
};

export default TermsOfUse;
