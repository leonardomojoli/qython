// frontend/src/components/pharmacy/PublicPrescription.js
// Public page for patients - no auth required. Mobile-first.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './PublicPrescription.module.css';
import qythonImagotipo from '../../assets/qython-imagotipo.png';
import { getPublicPrescription, getNearbyPharmaciesPublic } from '../../api';
import { WEB_URL } from '../../config';

const LANG_TO_LOCALE = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
};

function PublicPrescription() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const dateLocale = useMemo(
    () => LANG_TO_LOCALE[i18n.language] || 'pt-BR',
    [i18n.language]
  );

  // Detect language from URL query param, then browser, default to 'pt'
  useEffect(() => {
    const langParam = searchParams.get('lang');
    if (langParam && ['pt', 'en', 'es'].includes(langParam)) {
      i18n.changeLanguage(langParam);
    } else if (!['pt', 'en', 'es'].includes(i18n.language)) {
      // If browser language is not one of our supported languages, default to 'pt'
      const browserLang = navigator.language?.slice(0, 2);
      if (browserLang && ['pt', 'en', 'es'].includes(browserLang)) {
        i18n.changeLanguage(browserLang);
      } else {
        i18n.changeLanguage('pt');
      }
    }
  }, [searchParams, i18n]);

  const fetchPrescription = useCallback(async (lat, lng) => {
    try {
      const params = {};
      if (lat && lng) {
        params.lat = lat;
        params.lng = lng;
      }
      const result = await getPublicPrescription(token, params);
      setData(result);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('not_found');
      } else if (err.response?.status === 410) {
        setError('expired');
      } else {
        setError('generic');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch prescription immediately WITHOUT auto-requesting geolocation
  useEffect(() => {
    fetchPrescription();
  }, [fetchPrescription]);

  // Request geolocation only on explicit user consent
  const handleRequestLocation = () => {
    if (!navigator.geolocation) return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocationLoading(false);
        try {
          const pharmacies = await getNearbyPharmaciesPublic(
            pos.coords.latitude,
            pos.coords.longitude,
            15
          );
          setData(prev => prev ? { ...prev, nearby_pharmacies: pharmacies } : prev);
        } catch (err) {
          console.error(err);
        }
      },
      () => setLocationLoading(false),
      { timeout: 5000 }
    );
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>{t('publicRxLoading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <img src={qythonImagotipo} alt="Qython" className={styles.logo} />
        </header>
        <div className={styles.errorContainer}>
          {error === 'not_found' && (
            <>
              <h2>{t('publicRxNotFound')}</h2>
              <p>{t('publicRxNotFoundDesc')}</p>
            </>
          )}
          {error === 'expired' && (
            <>
              <h2>{t('publicRxExpired')}</h2>
              <p>{t('publicRxExpiredDesc')}</p>
            </>
          )}
          {error === 'generic' && (
            <>
              <h2>{t('publicRxError')}</h2>
              <p>{t('publicRxErrorDesc')}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const rx = data?.prescription;
  const pharmacies = data?.nearby_pharmacies;
  const shareInfo = data?.share_info;
  const hasGovProgram = rx?.medications?.some(med => med.farmacia_popular);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <img src={qythonImagotipo} alt="Qython" className={styles.logo} />
        <a href={`${WEB_URL}/register`} className={styles.ctaLink}>
          {t('publicRxSignUp')}
        </a>
      </header>

      {/* Prescription card */}
      <div className={styles.rxCard}>
        <div className={styles.rxCardHeader}>
          <h2 className={styles.rxTitle}>{t('publicRxTitle')}</h2>
          <span className={styles.rxDate}>
            {rx?.created_at ? new Date(rx.created_at).toLocaleDateString(dateLocale) : ''}
          </span>
        </div>

        <div className={styles.rxMeta}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>{t('publicRxPrescribedBy')}</span>
            <span className={styles.metaValue}>
              Dr(a). {rx?.doctor_name}
              {rx?.doctor_identifier && ` — ${rx.doctor_identifier}`}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>{t('publicRxPatient')}</span>
            <span className={styles.metaValue}>{rx?.patient_first_name}</span>
          </div>
          {rx?.prescription_type && rx.prescription_type !== 'simple' && (
            <div className={styles.typeBadge}>
              {rx.prescription_type.toUpperCase()}
            </div>
          )}
        </div>

        <div className={styles.medsSection}>
          <h3 className={styles.medsTitle}>{t('publicRxMedications')}</h3>
          {rx?.medications?.map((med, i) => (
            <div key={i} className={styles.medItem}>
              <div className={styles.medHeader}>
                <span className={styles.medName}>{med.medication}</span>
                {med.farmacia_popular && (
                  <span className={styles.fpBadge}>
                    {med.farmacia_popular_copay === null || med.farmacia_popular_copay === 0
                      ? t('publicRxFreePopular')
                      : `${t('publicRxPopularCopay')} - R$${Number(med.farmacia_popular_copay).toFixed(2)}`}
                  </span>
                )}
              </div>
              <div className={styles.medDetails}>
                <span>{med.dosage}</span>
                <span>{med.frequency}</span>
                <span>{med.duration}</span>
              </div>
              {med.quantity && <p className={styles.medQuantity}>{t('publicRxQuantity')}: {med.quantity}</p>}
              {med.instructions && <p className={styles.medInstructions}>{med.instructions}</p>}
            </div>
          ))}
          {hasGovProgram && (
            <p className={styles.govDisclaimer}>{t('publicRxGovDisclaimer')}</p>
          )}
        </div>

        {rx?.notes && (
          <div className={styles.notesSection}>
            <h4 className={styles.notesTitle}>{t('publicRxNotes')}</h4>
            <p className={styles.notesText}>{rx.notes}</p>
          </div>
        )}
      </div>

      {/* Nearby pharmacies */}
      <div className={styles.pharmaciesSection}>
        <h3 className={styles.sectionTitle}>{t('publicRxNearbyPharmacies')}</h3>

        {!pharmacies && (
          <div className={styles.locationPrompt}>
            <p>{t('publicRxLocationPrompt')}</p>
            <p className={styles.locationConsent}>
              {t('publicRxLocationConsent')}{' '}
              <a href="/privacy-policy" className={styles.privacyLink}>{t('publicRxPrivacyPolicy')}</a>.
            </p>
            <button className={styles.locationBtn} onClick={handleRequestLocation} disabled={locationLoading}>
              {locationLoading ? t('publicRxSearching') : t('publicRxEnableLocation')}
            </button>
          </div>
        )}

        {pharmacies && pharmacies.length === 0 && (
          <p className={styles.noPharmacies}>{t('publicRxNoPharmacies')}</p>
        )}

        {pharmacies && pharmacies.length > 0 && (
          <div className={styles.pharmacyList}>
            {pharmacies.map((p, i) => (
              <div key={i} className={styles.pharmacyCard}>
                <div className={styles.pharmacyInfo}>
                  <h4 className={styles.pharmacyName}>{p.chain_name || p.name}</h4>
                  {p.unit_count > 1 && (
                    <span className={styles.unitCount}>{p.unit_count} {t('publicRxNearbyUnits')}</span>
                  )}
                  <p className={styles.pharmacyAddress}>{p.address}</p>
                  {p.distance_km && (
                    <span className={styles.distance}>{p.distance_km.toFixed(1)} km</span>
                  )}
                </div>
                <div className={styles.pharmacyActions}>
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className={styles.callBtn}>{t('publicRxCall')}</a>
                  )}
                  {p.latitude && p.longitude && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.directionsBtn}
                    >
                      {t('publicRxDirections')}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <p>{t('publicRxFooter')} <a href={WEB_URL} className={styles.footerLink}>Qython</a></p>
        {shareInfo && (
          <p className={styles.footerMeta}>
            {t('publicRxViews')}: {shareInfo.view_count} &middot; {t('publicRxValidUntil')}: {new Date(shareInfo.expires_at).toLocaleDateString(dateLocale)}
          </p>
        )}
        <a href="/privacy-policy" className={styles.footerPrivacyLink}>{t('publicRxPrivacyPolicy')}</a>
      </footer>
    </div>
  );
}

export default PublicPrescription;
