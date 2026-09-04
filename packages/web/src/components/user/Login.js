import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../../contexts/UserContext';
import { API_URL } from '../../config';
import styles from './Login.module.css';
import { useTranslation } from 'react-i18next';
import qythonLogo from '../../assets/qython-imagotipo.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faSpinner, faEnvelope, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from '../../firebaseConfig';

function Login({ setIsLoggedIn }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute('data-force-theme', 'light');
    return () => {
      document.documentElement.removeAttribute('data-force-theme');
    };
  }, []);

  // Handle verification status from URL params (after email verification redirect)
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    if (params.get('verified') === 'true') {
      const status = params.get('status');
      if (status === 'active') {
        setSuccessMessage(t('emailVerifiedActive', 'Email verificado! Sua conta está ativa. Faça login para continuar.'));
      } else if (status === 'waitlist') {
        setSuccessMessage(t('emailVerifiedWaitlist', 'Email verificado! Você entrou na lista de espera. Aguarde seu convite!'));
      }
    }

    if (params.get('already_verified') === 'true') {
      setSuccessMessage(t('alreadyVerified', 'Seu email já foi verificado anteriormente.'));
    }

    if (params.get('password_reset') === 'true') {
      setSuccessMessage(t('passwordResetSuccess', 'Senha redefinida com sucesso! Faça login com sua nova senha.'));
    }

    if (params.get('error')) {
      setError(t('verificationError', 'Erro na verificação. Por favor, tente novamente.'));
    }
  }, [location, t]);

  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showResendLink, setShowResendLink] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { setUser } = useUser();


  // Resend verification email handler
  const handleResendVerification = async () => {
    if (!emailOrUsername) {
      setError(t('enterEmailFirst'));
      return;
    }
    setResendLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailOrUsername }),
      });

      if (response.ok) {
        setSuccessMessage(t('resendEmailSuccess'));
        setError('');
        setShowResendLink(false);
      } else {
        setError(t('resendEmailError'));
      }
    } catch (error) {
      setError(t('connectionError'));
    } finally {
      setResendLoading(false);
    }
  };

  // Google Sign-In Handler
  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const token = await result.user.getIdToken();

      // Send token to backend for validation
      const response = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.action === 'login') {
          // User exists: Login success
          localStorage.setItem('authToken', data.access_token);
          setUser(data.user);
          setIsLoggedIn(true);

          // Redirecionamento inteligente baseado no status
          if (data.user.status === 'waitlist') {
            navigate('/waitlist');
          } else {
            navigate('/copilot');
          }

        } else if (data.action === 'register') {
          // New user: Redirect to register with prefilled data
          // CORREÇÃO CRÍTICA: Passando o token para o registro
          navigate('/register', {
            state: {
              prefilledEmail: data.email,
              prefilledName: data.full_name,
              isGoogleSignup: true,
              googleToken: token  // <--- O PULO DO GATO ESTÁ AQUI
            }
          });
        }
      } else {
        setError(data.detail || t('errorLoggingIn'));
      }

    } catch (error) {
      console.error("Google Login Error:", error);
      if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup, not an error
        return;
      }
      setError(t('googleLoginError', 'Erro ao conectar com Google. Tente novamente.'));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Email/Password Login Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setShowResendLink(false);

    if (password.length < 6) {
      setError(t('passwordMinLength'));
      return;
    }

    setIsLoading(true);
    try {
      const formBody = new URLSearchParams();
      formBody.append('username', emailOrUsername);
      formBody.append('password', password);

      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('authToken', data.access_token);
        setUser(data.user);
        setIsLoggedIn(true);

        // Redirecionamento inteligente baseado no status
        if (data.user.status === 'waitlist') {
          navigate('/waitlist');
        } else {
          navigate('/copilot');
        }
      } else {
        const errorData = await response.json();
        if (response.status === 403) {
          if (errorData.detail && errorData.detail.includes("Verifique seu email")) {
            setError(errorData.detail);
            setShowResendLink(true);
          } else {
            setError(errorData.detail || t('accessDenied'));
          }
        } else {
          setError(errorData.detail || errorData.error || t('invalidCredentials'));
        }
      }
    } catch (error) {
      console.error(t('errorLoggingIn'), error);
      setError(t('serverConnectionError'));
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

          <h2 className={styles.formTitle}>{t('login')}</h2>
          <p className={styles.formSubtitle}>{t('loginFormSubtitle')}</p>

          {error && <div className={styles.errorMessage}>{error}</div>}
          {successMessage && <div className={styles.successMessage}>{successMessage}</div>}

          {/* Resend verification button */}
          {showResendLink && (
            <button
              type="button"
              onClick={handleResendVerification}
              className={styles.resendButton}
              disabled={resendLoading}
            >
              {resendLoading ? (
                <FontAwesomeIcon icon={faSpinner} spin />
              ) : (
                <><FontAwesomeIcon icon={faEnvelope} /> {t('resendVerificationEmail')}</>
              )}
            </button>
          )}

          {/* GOOGLE SIGN-IN BUTTON */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            className={styles.googleButton}
            disabled={isGoogleLoading || isLoading}
          >
            {isGoogleLoading ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faGoogle} />
            )}
            <span>{t('continueWithGoogle', 'Continuar com Google')}</span>
          </button>

          <div className={styles.divider}>
            <span>{t('or', 'ou')}</span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className={styles.inputGroup}>
              <label className={styles.themeLabel}>{t('emailOrUsername')}</label>
              <input
                type="text"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                required
                className={styles.themeInput}
                autoComplete="username"
                placeholder={t('emailOrUsernamePlaceholder')}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.themeLabel}>{t('password')}</label>
              <div className={styles.passwordWrapper}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={styles.themeInput}
                  autoComplete="current-password"
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
            </div>

            <div className={styles.forgotPasswordLink}>
              <a href="/forgot-password">{t('forgotPassword', 'Esqueci minha senha')}</a>
            </div>

            <button type="submit" className={styles.themeButton} disabled={isLoading || isGoogleLoading}>
              {isLoading ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin /> {t('loggingIn')}
                </>
              ) : (
                <>
                  {t('loginButton')} <FontAwesomeIcon icon={faArrowRight} />
                </>
              )}
            </button>

            <div className={styles.registerLink}>
              {t('noAccountYet')}
              <a href="/register">{t('registerNow')}</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
