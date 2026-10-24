// frontend/src/components/user/LatreoVerificationModal.js
/**
 * Latreo medical-identity verification.
 *
 * Loads the Latreo drop-in SDK, asks our backend to create a hosted verification
 * session (the backend holds the Latreo client_admin credentials), then opens the
 * Latreo modal. The doctor declares CRM/UF and uploads their CRM card + selfie
 * straight to Latreo — that media never touches Qython. On completion the SDK
 * fires onComplete({ session_id, tier, status }), which we hand back to the parent
 * so it can include `latreo_session_id` in the registration payload.
 */
import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faExclamationTriangle, faTimes } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { API_URL as API_BASE_URL, LATREO_SDK_URL } from '../../config';
import styles from './LatreoVerificationModal.module.css';

// O SDK (lastreo.com) expõe window.Lastreo.
function _sdkGlobal() {
  return (typeof window !== 'undefined') ? window.Lastreo : null;
}
let _sdkPromise = null;
function loadLatreoSdk() {
  const g = _sdkGlobal();
  if (g) return Promise.resolve(g);
  if (_sdkPromise) return _sdkPromise;
  _sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-latreo-sdk]');
    if (existing) {
      existing.addEventListener('load', () => resolve(_sdkGlobal()));
      existing.addEventListener('error', () => { _sdkPromise = null; reject(new Error('sdk load failed')); });
      return;
    }
    const s = document.createElement('script');
    s.src = LATREO_SDK_URL;
    s.async = true;
    s.setAttribute('data-latreo-sdk', '1');
    s.onload = () => { const gg = _sdkGlobal(); return gg ? resolve(gg) : reject(new Error('Lastreo/Latreo global missing')); };
    s.onerror = () => { _sdkPromise = null; reject(new Error('sdk load failed')); };
    document.head.appendChild(s);
  });
  return _sdkPromise;
}

const LatreoVerificationModal = ({ isOpen, onClose, onVerified, captchaToken, locale, kind = 'doctor' }) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState('preparing'); // preparing | active | error
  const [error, setError] = useState('');
  const modalRef = useRef(null);   // handle returned by SDK openModal()
  const runningRef = useRef(false);

  const closeAll = () => {
    try { modalRef.current?.close?.(); } catch (_) { /* noop */ }
    modalRef.current = null;
    runningRef.current = false;
    if (typeof onClose === 'function') onClose();
  };

  const startFlow = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPhase('preparing');
    setError('');
    try {
      const Latreo = await loadLatreoSdk();
      const resp = await fetch(`${API_BASE_URL}/verification/lastreo/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captcha_token: captchaToken || null, locale: locale || null, kind }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.detail || 'session');
      setPhase('active');
      modalRef.current = Latreo({ embedUrl: data.embed_url }).openModal({
        onComplete: (r) => { if (typeof onVerified === 'function') onVerified(r); closeAll(); },
        onClose: () => closeAll(),
        onError: () => { setError(t('latreoVerifyError')); setPhase('error'); },
      });
    } catch (e) {
      setError(t('latreoVerifyError'));
      setPhase('error');
      runningRef.current = false;
    }
  };

  useEffect(() => {
    if (isOpen) {
      startFlow();
    } else {
      runningRef.current = false;
      setPhase('preparing');
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // While the SDK renders its own full-screen overlay we show nothing of our own.
  if (!isOpen || phase === 'active') return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <button className={styles.btnClose} onClick={closeAll} aria-label={t('cancel', 'Cancelar')}>
          <FontAwesomeIcon icon={faTimes} />
        </button>
        {phase === 'error' ? (
          <div className={styles.stateBox}>
            <FontAwesomeIcon icon={faExclamationTriangle} size="2x" className={styles.errorIcon} />
            <p>{error || t('latreoVerifyError')}</p>
            <button className={styles.actionBtn} onClick={() => { runningRef.current = false; startFlow(); }}>
              {t('tryAgain', 'Tentar novamente')}
            </button>
          </div>
        ) : (
          <div className={styles.stateBox}>
            <FontAwesomeIcon icon={faSpinner} spin size="2x" className={styles.spinnerIcon} />
            <p>{t('latreoVerifyPreparing')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LatreoVerificationModal;
