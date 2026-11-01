import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Login.module.css';
import { useTranslation } from 'react-i18next';
import qythonLogo from '../../assets/qython-imagotipo.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faSpinner, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import { API_URL } from '../../config';

function ForgotPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);


  useEffect(() => {
    document.documentElement.setAttribute('data-force-theme', 'light');
    return () => {
      document.documentElement.removeAttribute('data-force-theme');
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError(t('enterEmailFirst', 'Digite seu email primeiro.'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (response.ok) {
        setSent(true);
      } else {
        const data = await response.json();
        setError(data.detail || t('connectionError', 'Erro de conexão.'));
      }
    } catch (err) {
      setError(t('connectionError', 'Erro de conexão.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.splitScreen}>
      {/* LADO ESQUERDO: MARKETING */}
      <div className={styles.leftPane}>
        <div className={styles.bgPattern}></div>
        <div className={styles.leftPaneContent}>
          <h1>{t('loginHeroTitle')}</h1>
          <p>{t('loginHeroSubtitle')}</p>
        </div>
        <div className={styles.testimonial}>
          <p>{t('loginTestimonial')}</p>
          <span className={styles.testimonialAuthor}>{t('loginTestimonialAuthor')}</span>
        </div>
      </div>

      {/* LADO DIREITO: FORMULÁRIO */}
      <div className={styles.rightPane}>
        <div className={styles.formWrapper}>
          <div className={styles.logoHeader} onClick={() => navigate('/')}>
            <img src={qythonLogo} alt="Qython" className={styles.logoImg} />
          </div>

          <h2 className={styles.formTitle}>{t('forgotPasswordTitle', 'Recuperar Senha')}</h2>
          <p className={styles.formSubtitle}>{t('forgotPasswordSubtitle', 'Insira seu email e enviaremos um link para redefinir sua senha.')}</p>

          {error && <div className={styles.errorMessage}>{error}</div>}

          {sent ? (
            <>
              <div className={styles.successMessage}>
                <FontAwesomeIcon icon={faCheckCircle} style={{ marginRight: 8 }} />
                {t('resetLinkSent', 'Link enviado!')}
              </div>
              <p className={styles.formSubtitle} style={{ marginBottom: 0 }}>
                {t('resetLinkSentDesc', 'Se o email estiver cadastrado, você receberá um link de recuperação.')}
              </p>
              <div className={styles.registerLink} style={{ marginTop: 30 }}>
                <a href="/login">{t('backToLogin', 'Voltar ao login')}</a>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className={styles.inputGroup}>
                <label className={styles.themeLabel}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={styles.themeInput}
                  autoComplete="email"
                  placeholder="seu@email.com"
                />
              </div>

              <button type="submit" className={styles.themeButton} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin /> {t('sendingResetLink', 'Enviando...')}
                  </>
                ) : (
                  <>
                    {t('sendResetLink', 'Enviar link de recuperação')} <FontAwesomeIcon icon={faArrowRight} />
                  </>
                )}
              </button>

              <div className={styles.registerLink}>
                <a href="/login">{t('backToLogin', 'Voltar ao login')}</a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
