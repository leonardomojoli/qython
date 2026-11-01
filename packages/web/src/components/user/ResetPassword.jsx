import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './Login.module.css';
import { useTranslation } from 'react-i18next';
import qythonLogo from '../../assets/qython-imagotipo.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faSpinner, faEye, faEyeSlash, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import { API_URL } from '../../config';

function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);


  useEffect(() => {
    document.documentElement.setAttribute('data-force-theme', 'light');
    return () => {
      document.documentElement.removeAttribute('data-force-theme');
    };
  }, []);

  const validatePassword = (pwd) => {
    return pwd.length >= 8 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError(t('invalidResetToken', 'Link inválido ou expirado.'));
      return;
    }

    if (!validatePassword(newPassword)) {
      setError(t('passwordRequirements', 'Mínimo 8 caracteres, 1 letra maiúscula e 1 número.'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('passwordsDoNotMatch', 'As senhas não coincidem.'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/login?password_reset=true');
        }, 2000);
      } else {
        const data = await response.json();
        setError(data.detail || t('invalidResetToken', 'Link inválido ou expirado.'));
      }
    } catch (err) {
      setError(t('connectionError', 'Erro de conexão.'));
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className={styles.splitScreen}>
        <div className={styles.leftPane}>
          <div className={styles.bgPattern}></div>
          <div className={styles.leftPaneContent}>
            <h1>{t('loginHeroTitle')}</h1>
            <p>{t('loginHeroSubtitle')}</p>
          </div>
        </div>
        <div className={styles.rightPane}>
          <div className={styles.formWrapper}>
            <div className={styles.logoHeader} onClick={() => navigate('/')}>
              <img src={qythonLogo} alt="Qython" className={styles.logoImg} />
            </div>
            <div className={styles.errorMessage}>
              {t('invalidResetToken', 'Link inválido ou expirado. Solicite um novo link de recuperação.')}
            </div>
            <div className={styles.registerLink}>
              <a href="/forgot-password">{t('forgotPassword', 'Esqueci minha senha')}</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

          <h2 className={styles.formTitle}>{t('resetPasswordTitle', 'Redefinir Senha')}</h2>
          <p className={styles.formSubtitle}>{t('resetPasswordSubtitle', 'Crie uma nova senha para sua conta.')}</p>

          {error && <div className={styles.errorMessage}>{error}</div>}

          {success ? (
            <>
              <div className={styles.successMessage}>
                <FontAwesomeIcon icon={faCheckCircle} style={{ marginRight: 8 }} />
                {t('passwordResetSuccess', 'Senha redefinida!')}
              </div>
              <p className={styles.formSubtitle} style={{ marginBottom: 0 }}>
                {t('passwordResetSuccessDesc', 'Sua senha foi alterada com sucesso. Redirecionando...')}
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className={styles.inputGroup}>
                <label className={styles.themeLabel}>{t('newPasswordPlaceholder', 'Nova senha')}</label>
                <div className={styles.passwordWrapper}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className={styles.themeInput}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    style={{ paddingRight: '45px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={styles.eyeButton}
                    tabIndex="-1"
                  >
                    <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                  </button>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#888', marginTop: 4, display: 'block' }}>
                  {t('passwordRequirements', 'Mínimo 8 caracteres, 1 letra maiúscula e 1 número.')}
                </span>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.themeLabel}>{t('confirmPasswordPlaceholder', 'Confirmar nova senha')}</label>
                <div className={styles.passwordWrapper}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className={styles.themeInput}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    style={{ paddingRight: '45px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className={styles.eyeButton}
                    tabIndex="-1"
                  >
                    <FontAwesomeIcon icon={showConfirmPassword ? faEyeSlash : faEye} />
                  </button>
                </div>
              </div>

              <button type="submit" className={styles.themeButton} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin /> {t('resettingPassword', 'Redefinindo...')}
                  </>
                ) : (
                  <>
                    {t('resetPasswordButton', 'Redefinir Senha')} <FontAwesomeIcon icon={faArrowRight} />
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

export default ResetPassword;
