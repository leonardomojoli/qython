// frontend/src/components/common/CookieConsent.js

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import styles from './CookieConsent.module.css';

const COOKIE_CONSENT_KEY = 'qython_cookie_consent';

const CookieConsent = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      // Small delay to avoid flash on page load
      const timer = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      accepted: true,
      analytics: true,
      timestamp: new Date().toISOString(),
    }));
    setVisible(false);
  };

  const handleEssentialOnly = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      accepted: true,
      analytics: false,
      timestamp: new Date().toISOString(),
    }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.banner}>
        <p className={styles.text}>
          {t('cookieConsentText')}{' '}
          <Link to="/privacy-policy" className={styles.privacyLink}>
            {t('cookieConsentPrivacy')}
          </Link>
        </p>
        <div className={styles.actions}>
          <button className={styles.acceptButton} onClick={handleAcceptAll}>
            {t('cookieConsentAccept')}
          </button>
          <button className={styles.essentialButton} onClick={handleEssentialOnly}>
            {t('cookieConsentEssential')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
