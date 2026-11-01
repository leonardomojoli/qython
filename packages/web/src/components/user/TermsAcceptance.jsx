import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileContract, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { getActiveConsentDocuments, grantConsent } from '../../api';
import { useUser } from '../../contexts/UserContext';
import styles from './TermsAcceptance.module.css';

// Bloqueia o app até o usuário aceitar o termo de uso vigente: no primeiro acesso e
// a cada versão nova. O texto vem do backend e o aceite fica gravado com a versão e
// o hash do que foi mostrado aqui (ver backend/seeds/terms_of_use.py).
const TermsAcceptance = () => {
  const { t } = useTranslation();
  const { setUser, refreshUser } = useUser();
  const [terms, setTerms] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    // O termo existe só em pt-BR por enquanto.
    getActiveConsentDocuments('pt-BR')
      .then(docs => {
        const found = docs.find(d => d.type === 'terms_of_use');
        if (found) setTerms(found);
        else setLoadError(t('termsLoadError', 'Não foi possível carregar o termo de uso.'));
      })
      .catch(() => setLoadError(t('termsLoadError', 'Não foi possível carregar o termo de uso.')));
  }, [t]);

  const handleAccept = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await grantConsent('terms_of_use');
      await refreshUser();
    } catch (error) {
      setSaveError(t('termsSaveError', 'Não foi possível registrar o aceite. Tente de novo.'));
      setSaving(false);
    }
  };

  const handleLeave = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <FontAwesomeIcon icon={faFileContract} className={styles.icon} />
          <div>
            <h2>{terms?.title || t('termsTitle', 'Termo de Uso do Qython')}</h2>
            <p>{t('termsIntro', 'Antes de começar, leia o termo de uso. Ele explica o que o Qython é, o que não é e o que acontece com os seus dados.')}</p>
          </div>
        </div>

        <div className={styles.body} tabIndex={0}>
          {terms ? terms.body : (loadError || <FontAwesomeIcon icon={faSpinner} spin />)}
        </div>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={e => setAccepted(e.target.checked)}
            disabled={!terms}
          />
          <span>{t('termsCheckbox', 'Li o termo de uso e concordo com ele.')}</span>
        </label>

        {saveError && <p className={styles.error}>{saveError}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.btnSecondary} onClick={handleLeave} disabled={saving}>
            {t('termsLeave', 'Sair')}
          </button>
          <button type="button" className={styles.btnPrimary} onClick={handleAccept} disabled={!accepted || !terms || saving}>
            {saving ? <FontAwesomeIcon icon={faSpinner} spin /> : t('termsAccept', 'Aceitar e continuar')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermsAcceptance;
