import React from 'react';
import PublicPageHeader from '../shared/PublicPageHeader';
import { useTranslation } from 'react-i18next';
import { createSafeHTML } from '../../utils/textUtils';
import './LegalPage.css';

const PrivacyPolicy = () => {
    const { t } = useTranslation();

    return (
        <>
            <PublicPageHeader />
            <div className="legal-page-container">
                <div className="legal-content">
                    <h1>{t('privacyPolicyTitle')}</h1>
                    <p className="legal-last-updated">{t('privacyLastUpdated')}</p>

                    <div className="legal-intro">
                        <p>{t('privacyIntro')}</p>
                    </div>

                    <section className="legal-section">
                        <h2>{t('privacySection1Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection1Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection2Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection2Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection3Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection3Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection4Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection4Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection5Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection5Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection6Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection6Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection7Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection7Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection8Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection8Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection9Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection9Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection10Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection10Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection11Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection11Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection12Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection12Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection13Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection13Content'))} />
                    </section>

                    <section className="legal-section">
                        <h2>{t('privacySection14Title')}</h2>
                        <div className="legal-section-content" dangerouslySetInnerHTML={createSafeHTML(t('privacySection14Content'))} />
                    </section>
                </div>
            </div>
        </>
    );
};

export default PrivacyPolicy;
