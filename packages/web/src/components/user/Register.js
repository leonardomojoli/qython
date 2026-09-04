import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { generateAvatar } from '../../api';
import Turnstile from 'react-turnstile';
import AvatarGeneratorModal from './AvatarGeneratorModal';
import PhoneVerificationModal from './PhoneVerificationModal';
import LatreoVerificationModal from './LatreoVerificationModal';
import styles from './Register.module.css';
import qythonLogo from '../../assets/qython-imagotipo.png';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../contexts/LanguageContext';
import { useUser } from '../../contexts/UserContext';
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from '../../firebaseConfig';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faCheck, faTicketAlt, faClock, faShieldAlt, faEye, faEyeSlash, faEnvelopeOpenText, faSpinner, faCircle } from '@fortawesome/free-solid-svg-icons';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import phoneLocale from 'react-phone-number-input/locale/pt';

import { API_URL as API_BASE_URL, WEB_URL } from '../../config';

// RECEBENDO A PROP setIsLoggedIn
function Register({ setIsLoggedIn }) {
  const { t, i18n } = useTranslation();
  const { currentLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useUser();

  useEffect(() => {
    document.documentElement.setAttribute('data-force-theme', 'light');
    if (currentLanguage && currentLanguage !== i18n.language) {
      i18n.changeLanguage(currentLanguage);
    }
    return () => {
      document.documentElement.removeAttribute('data-force-theme');
    };
  }, [currentLanguage, i18n]);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    email: '', password: '', full_name: '', occupation: '', specialty: '', country: '',
    phone_number: '', university: '', period: '', matricula: '',
    identifier_number: '',
    referral_source_option: '', referral_source_other: ''
  });

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [captchaError, setCaptchaError] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [hasInvite, setHasInvite] = useState(null);
  // Waitlist/convite é toggle de admin (require_invite). Default false = sem fricção:
  // quem verifica entra direto. Fail-open (se a busca falhar, assume sem convite).
  const [inviteRequired, setInviteRequired] = useState(false);
  const [username, setUsername] = useState('');
  const [avatarPrompt, setAvatarPrompt] = useState('');
  const [tempAvatar, setTempAvatar] = useState(null);
  const [phoneVerificationToken, setPhoneVerificationToken] = useState(null);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  // Latreo medical verification (doctors only)
  const [showLatreoModal, setShowLatreoModal] = useState(false);
  const [latreoSessionId, setLatreoSessionId] = useState(null);
  const [latreoTier, setLatreoTier] = useState(null);
  const [isLatreoVerified, setIsLatreoVerified] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [passwordCriteria, setPasswordCriteria] = useState({ length: false, upper: false, lower: false, number: false, special: false });

  // Google Logic
  const [isGoogleSignup, setIsGoogleSignup] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleIdToken, setGoogleIdToken] = useState(null);

  // Refs for auto-scroll
  const occupationRef = useRef(null);

  useEffect(() => {
    const savedData = sessionStorage.getItem('qython_register_form');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        setFormData(prevData => ({ ...prevData, ...parsedData, password: '' }));
      } catch (e) { console.error(e); }
    }

    if (location.state?.prefilledEmail) {
      setFormData(prevData => ({
        ...prevData,
        email: location.state.prefilledEmail,
        full_name: location.state.prefilledName || prevData.full_name
      }));
      setIsGoogleSignup(true);
      if (location.state?.googleToken) {
        setGoogleIdToken(location.state.googleToken);
      }
    }
  }, [location]);

  useEffect(() => {
    const dataToSave = { ...formData };
    delete dataToSave.password;
    sessionStorage.setItem('qython_register_form', JSON.stringify(dataToSave));
  }, [formData]);

  const validatePassword = (pwd) => {
    const criteria = {
      length: pwd.length >= 8,
      upper: /[A-Z]/.test(pwd),
      lower: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(pwd)
    };
    setPasswordCriteria(criteria);
    return Object.values(criteria).every(Boolean);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({ ...prevData, [name]: value }));
    if (name === 'password') validatePassword(value);
  };

  const handlePhoneChange = (value) => {
    setFormData(prevData => ({ ...prevData, phone_number: value || '' }));
    if (isPhoneVerified) { setIsPhoneVerified(false); setPhoneVerificationToken(null); }
  };

  const handlePhoneVerified = (token) => {
    setPhoneVerificationToken(token);
    setIsPhoneVerified(true);
  };

  const handleLatreoVerified = ({ session_id, tier }) => {
    setLatreoSessionId(session_id || null);
    setLatreoTier(tier || null);
    // "Verified" only when a tier was actually granted. A basic-tier submission
    // completes pending Latreo admin review (tier still null) — treated as submitted.
    setIsLatreoVerified(!!tier);
  };

  const isDoctor = formData.occupation === t('doctor');
  const isStep1Valid = () => {
    const basicValid = formData.full_name && formData.email && formData.occupation && formData.phone_number && isPhoneVerified && termsAccepted && captchaToken;
    const passwordValid = Object.values(passwordCriteria).every(Boolean);
    let conditionalValid = true;
    if (formData.occupation) {
      if (isDoctor) {
        // Doctors verify via the Latreo embed (optional — they can skip and finish
        // verification later from their profile). No document upload in Qython.
        conditionalValid = formData.country && formData.identifier_number;
      } else {
        // Students verify via the Latreo embed too (kind=student) — enrollment is
        // optional at signup, just like doctors. We still collect their academic
        // profile fields; the matrícula/selfie themselves go to Latreo, not Qython.
        conditionalValid = formData.country && formData.university && formData.period && formData.matricula;
      }
    }
    return basicValid && passwordValid && conditionalValid;
  };

  // Human-readable list of what's still blocking the submit button, shown under it
  // so users aren't stuck guessing (e.g. unverified phone, missing special char).
  const getMissingRequirements = () => {
    const m = [];
    if (!formData.full_name) m.push(t('fullName', 'nome completo'));
    if (!formData.email) m.push(t('email', 'e-mail'));
    if (!Object.values(passwordCriteria).every(Boolean)) m.push(t('missingPassword', 'uma senha que cumpra todos os critérios'));
    if (!formData.occupation) m.push(t('occupation', 'ocupação'));
    if (formData.occupation && !formData.country) m.push(t('country', 'país'));
    if (formData.occupation && isDoctor && !formData.identifier_number) m.push(t('medicalLicenseLabel', 'CRM'));
    if (formData.occupation && !isDoctor) {
      if (!formData.university) m.push(t('university', 'universidade'));
      if (!formData.period) m.push(t('period', 'período'));
      if (!formData.matricula) m.push(t('studentIdLabel', 'matrícula'));
    }
    if (!formData.phone_number) m.push(t('phone', 'telefone'));
    else if (!isPhoneVerified) m.push(t('missingPhoneVerify', 'verificar o telefone por SMS'));
    if (!termsAccepted) m.push(t('missingTerms', 'aceitar os termos'));
    if (!captchaToken) m.push(t('missingCaptcha', 'a verificação de segurança'));
    return m;
  };

  const handleGoogleSignup = async () => {
    setIsGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const token = await result.user.getIdToken();
      setGoogleIdToken(token);

      const response = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();

      if (response.ok) {
        if (data.action === 'login') {
          localStorage.setItem('authToken', data.access_token);
          setUser(data.user);
          if (setIsLoggedIn) setIsLoggedIn(true); // Atualiza estado global
          navigate('/copilot');
        } else if (data.action === 'register') {
          setFormData(prev => ({ ...prev, email: data.email, full_name: data.full_name }));
          setIsGoogleSignup(true);
          // Auto-scroll to occupation field after Google auth
          setTimeout(() => {
            occupationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 400);
        }
      } else {
        alert(data.detail || t('googleConnectionError'));
      }
    } catch (error) {
      console.error("Google Signup Error:", error);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Lê o toggle de convite (público) uma vez. Falha → mantém false (sem fricção).
  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/settings/public`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && typeof d.require_invite !== 'undefined') setInviteRequired(!!d.require_invite); })
      .catch(() => {});
  }, []);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!isStep1Valid()) return;
    // Convite exigido → tela de convite/waitlist. Senão (default) → finaliza direto.
    if (inviteRequired) {
      setStep(1.5);
    } else {
      handleFinalSubmit(null);
    }
  };

  const handleFinalSubmit = async (tokenValue = null) => {
    const dataToSend = new FormData();
    Object.keys(formData).forEach(key => {
      if (key !== 'referral_source_other' && key !== 'referral_source_option') dataToSend.append(key, formData[key]);
    });

    const idTypePrefix = isDoctor ? 'LICENSE' : 'STUDENT_ID';
    dataToSend.append('identifier_type', `${idTypePrefix}_${formData.country ? formData.country.toUpperCase() : 'XX'}`);
    dataToSend.append('captcha_token', captchaToken);
    dataToSend.append('language', i18n.language.split('-')[0]);

    if (tokenValue) dataToSend.append('invite_token', tokenValue);
    if (phoneVerificationToken) dataToSend.append('phone_verification_token', phoneVerificationToken);
    if (latreoSessionId) dataToSend.append('latreo_session_id', latreoSessionId);

    if (googleIdToken) dataToSend.append('google_id_token', googleIdToken);
    dataToSend.append('marketing_consent', marketingConsent);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register/step1`, {
        method: 'POST',
        body: dataToSend,
      });
      const result = await response.json();

      if (response.ok) {
        sessionStorage.removeItem('qython_register_form');
        setUsername(result.email);

        // --- AUTO-LOGIN CRÍTICO ---
        if (result.access_token) {
          localStorage.setItem('authToken', result.access_token);
          setUser(result.user);
          // AQUI ESTÁ A CORREÇÃO: Avisa o App.js que estamos logados
          if (setIsLoggedIn) setIsLoggedIn(true);
        }

        if (tokenValue) {
          setStep(2);
        } else {
          setStep(3);
        }
      } else {
        alert(result.detail || "Erro ao realizar cadastro.");
        setStep(1);
      }
    } catch (error) {
      alert(t('errorSendingData'));
      setStep(1);
    }
  };

  const handleGenerateAvatar = async () => {
    if (!avatarPrompt) return alert(t('enterPromptForAvatar'));
    try {
      const avatarData = await generateAvatar(avatarPrompt);
      setTempAvatar(`${WEB_URL}/static/uploads/profile_pictures/${avatarData.profile_picture}`);
    } catch (error) {
      alert(t('errorGeneratingAvatar'));
    }
  };

  const handleSaveAvatar = async () => { setStep(3); };

  return (
    <div className={styles.splitScreen}>
      <div className={styles.leftPane}>
        <div className={styles.bgPattern}></div>
        <div className={styles.leftPaneContent}>
          <h1>{t('registerHeroTitle')}</h1>
          <p>{t('registerHeroSubtitle')}</p>
        </div>
        <div className={styles.testimonial}>
          <p>{t('registerTestimonial')}</p>
          <span className={styles.testimonialAuthor}>{t('registerTestimonialAuthor')}</span>
        </div>
      </div>

      <div className={styles.rightPane}>
        <div className={styles.formWrapper}>
          <div className={styles.logoHeader} onClick={() => navigate('/')}>
            <img src={qythonLogo} alt="Qython" className={styles.logoImg} />
          </div>

          {step === 1 && (
            <>
              <h2 className={styles.formTitle}>{t('createAccount')}</h2>
              <p className={styles.formSubtitle}>{t('fillDataToStart')}</p>

              <button type="button" onClick={handleGoogleSignup} className={styles.googleButton} disabled={isGoogleLoading}>
                {isGoogleLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faGoogle} /> {t('continueWithGoogle')}</>}
              </button>

              <div className={styles.divider}>{t('or')}</div>

              <form onSubmit={handleFormSubmit}>
                <div className={styles.inputGroup}>
                  <label className={styles.themeLabel}>{t('fullName')}</label>
                  <input type="text" name="full_name" value={formData.full_name} onChange={handleInputChange} placeholder="Ex: João Silva" required className={styles.themeInput} />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.themeLabel}>{t('email')}</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="seu@email.com" required className={styles.themeInput} disabled={isGoogleSignup} style={isGoogleSignup ? { opacity: 0.7, cursor: 'not-allowed' } : {}} />
                  {isGoogleSignup && (
                    <div className={styles.googleSuccessBanner}>
                      <FontAwesomeIcon icon={faCheck} /> {t('googleConnected')}
                    </div>
                  )}
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.themeLabel}>{t('password')}</label>
                  <div className={styles.passwordWrapper}>
                    <input type={showPassword ? "text" : "password"} name="password" value={formData.password} onChange={handleInputChange} onFocus={() => setIsPasswordFocused(true)} placeholder="••••••••" required className={styles.themeInput} style={{ paddingRight: '45px' }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className={styles.eyeButton} tabIndex="-1"><FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} /></button>
                  </div>
                  {(isPasswordFocused || formData.password) && (
                    <div className={styles.passwordCriteria}>
                      <span className={styles.criteriaTitle}>{t('passwordRequirements')}</span>
                      <ul className={styles.criteriaList}>
                        <li className={`${styles.criteriaItem} ${passwordCriteria.length ? styles.valid : styles.invalid}`}><FontAwesomeIcon icon={passwordCriteria.length ? faCheck : faCircle} className={styles.criteriaIcon} /> {t('pwdMinLength')}</li>
                        <li className={`${styles.criteriaItem} ${passwordCriteria.upper ? styles.valid : styles.invalid}`}><FontAwesomeIcon icon={passwordCriteria.upper ? faCheck : faCircle} className={styles.criteriaIcon} /> {t('pwdUppercase')}</li>
                        <li className={`${styles.criteriaItem} ${passwordCriteria.lower ? styles.valid : styles.invalid}`}><FontAwesomeIcon icon={passwordCriteria.lower ? faCheck : faCircle} className={styles.criteriaIcon} /> {t('pwdLowercase')}</li>
                        <li className={`${styles.criteriaItem} ${passwordCriteria.number ? styles.valid : styles.invalid}`}><FontAwesomeIcon icon={passwordCriteria.number ? faCheck : faCircle} className={styles.criteriaIcon} /> {t('pwdNumber')}</li>
                        <li className={`${styles.criteriaItem} ${passwordCriteria.special ? styles.valid : styles.invalid}`}><FontAwesomeIcon icon={passwordCriteria.special ? faCheck : faCircle} className={styles.criteriaIcon} /> {t('pwdSpecial')}</li>
                      </ul>
                    </div>
                  )}
                </div>

                {isGoogleSignup && (
                  <small className={styles.passwordNote}>{t('passwordNote')}</small>
                )}

                <div className={styles.inputGroup} ref={occupationRef}>
                  <label className={styles.themeLabel}>{t('occupation')}</label>
                  <select name="occupation" value={formData.occupation} onChange={handleInputChange} required className={styles.themeSelect}>
                    <option value="">{t('selectOccupation')}</option>
                    <option value={t('medicalStudent')}>{t('medicalStudent')}</option>
                    <option value={t('doctor')}>{t('doctor')}</option>
                  </select>
                </div>

                {/* Especialidade - Opcional para Médicos */}
                {isDoctor && (
                  <div className={styles.inputGroup} style={{ animation: 'fadeIn 0.3s' }}>
                    <label className={styles.themeLabel}>{t('specialty') || 'Especialidade'} <span style={{ color: '#666', fontWeight: 400 }}>({t('optional') || 'Opcional'})</span></label>
                    <select name="specialty" value={formData.specialty} onChange={handleInputChange} className={styles.themeSelect}>
                      <option value="">{t('selectSpecialty') || 'Selecione sua especialidade...'}</option>
                      <option value="Clínica Médica">Clínica Médica</option>
                      <option value="Cardiologia">Cardiologia</option>
                      <option value="Pediatria">Pediatria</option>
                      <option value="Ginecologia e Obstetrícia">Ginecologia e Obstetrícia</option>
                      <option value="Cirurgia Geral">Cirurgia Geral</option>
                      <option value="Ortopedia e Traumatologia">Ortopedia e Traumatologia</option>
                      <option value="Neurologia">Neurologia</option>
                      <option value="Psiquiatria">Psiquiatria</option>
                      <option value="Dermatologia">Dermatologia</option>
                      <option value="Oftalmologia">Oftalmologia</option>
                      <option value="Otorrinolaringologia">Otorrinolaringologia</option>
                      <option value="Anestesiologia">Anestesiologia</option>
                      <option value="Medicina do Trabalho">Medicina do Trabalho</option>
                      <option value="Medicina de Família e Comunidade">Medicina de Família e Comunidade</option>
                      <option value="Endocrinologia">Endocrinologia</option>
                      <option value="Gastroenterologia">Gastroenterologia</option>
                      <option value="Pneumologia">Pneumologia</option>
                      <option value="Nefrologia">Nefrologia</option>
                      <option value="Urologia">Urologia</option>
                      <option value="Reumatologia">Reumatologia</option>
                      <option value="Infectologia">Infectologia</option>
                      <option value="Geriatria">Geriatria</option>
                      <option value="Oncologia">Oncologia</option>
                      <option value="Hematologia">Hematologia</option>
                      <option value="Medicina Intensiva">Medicina Intensiva</option>
                      <option value="Medicina de Emergência">Medicina de Emergência</option>
                      <option value="Radiologia">Radiologia</option>
                      <option value="Patologia">Patologia</option>
                      <option value="Medicina Legal">Medicina Legal</option>
                      <option value="Neurocirurgia">Neurocirurgia</option>
                      <option value="Cirurgia Cardiovascular">Cirurgia Cardiovascular</option>
                      <option value="Cirurgia Plástica">Cirurgia Plástica</option>
                      <option value="Cirurgia Pediátrica">Cirurgia Pediátrica</option>
                      <option value="Coloproctologia">Coloproctologia</option>
                      <option value="Medicina Esportiva">Medicina Esportiva</option>
                      <option value="Medicina Física e Reabilitação">Medicina Física e Reabilitação</option>
                      <option value="Nutrologia">Nutrologia</option>
                      <option value="Acupuntura">Acupuntura</option>
                      <option value="Homeopatia">Homeopatia</option>
                      <option value="Outra">Outra</option>
                    </select>
                  </div>
                )}

                {formData.occupation && (
                  <div style={{ animation: 'fadeIn 0.3s' }}>
                    <div className={styles.inputGroup}>
                      <label className={styles.themeLabel}>{t('country')}</label>
                      <select name="country" value={formData.country} onChange={handleInputChange} required className={styles.themeSelect}>
                        <option value="">{t('selectCountry')}</option>
                        {/* ══════ AMÉRICA LATINA ══════ */}
                        <option value="br">🇧🇷 Brasil</option>
                        <option value="ar">🇦🇷 Argentina</option>
                        <option value="mx">🇲🇽 México</option>
                        <option value="co">🇨🇴 Colombia</option>
                        <option value="cl">🇨🇱 Chile</option>
                        <option value="pe">🇵🇪 Perú</option>
                        <option value="ve">🇻🇪 Venezuela</option>
                        <option value="ec">🇪🇨 Ecuador</option>
                        <option value="bo">🇧🇴 Bolivia</option>
                        <option value="py">🇵🇾 Paraguay</option>
                        <option value="uy">🇺🇾 Uruguay</option>
                        <option value="cr">🇨🇷 Costa Rica</option>
                        <option value="pa">🇵🇦 Panamá</option>
                        <option value="gt">🇬🇹 Guatemala</option>
                        <option value="cu">🇨🇺 Cuba</option>
                        <option value="do">🇩🇴 Rep. Dominicana</option>
                        <option value="hn">🇭🇳 Honduras</option>
                        <option value="sv">🇸🇻 El Salvador</option>
                        <option value="ni">🇳🇮 Nicaragua</option>
                        <option value="pr">🇵🇷 Puerto Rico</option>
                        {/* ══════ AMÉRICA DO NORTE ══════ */}
                        <option value="us">🇺🇸 United States</option>
                        <option value="ca">🇨🇦 Canada</option>
                        {/* ══════ EUROPA OCIDENTAL ══════ */}
                        <option value="pt">🇵🇹 Portugal</option>
                        <option value="es">🇪🇸 España</option>
                        <option value="fr">🇫🇷 France</option>
                        <option value="it">🇮🇹 Italia</option>
                        <option value="de">🇩🇪 Deutschland</option>
                        <option value="uk">🇬🇧 United Kingdom</option>
                        <option value="ie">🇮🇪 Ireland</option>
                        <option value="nl">🇳🇱 Nederland</option>
                        <option value="be">🇧🇪 België</option>
                        <option value="ch">🇨🇭 Schweiz</option>
                        <option value="at">🇦🇹 Österreich</option>
                        <option value="lu">🇱🇺 Luxembourg</option>
                        {/* ══════ EUROPA DO NORTE ══════ */}
                        <option value="se">🇸🇪 Sverige</option>
                        <option value="no">🇳🇴 Norge</option>
                        <option value="dk">🇩🇰 Danmark</option>
                        <option value="fi">🇫🇮 Suomi</option>
                        <option value="is">🇮🇸 Ísland</option>
                        {/* ══════ EUROPA DO SUL ══════ */}
                        <option value="gr">🇬🇷 Ελλάδα (Greece)</option>
                        <option value="mt">🇲🇹 Malta</option>
                        <option value="cy">🇨🇾 Κύπρος (Cyprus)</option>
                        {/* ══════ EUROPA ORIENTAL ══════ */}
                        <option value="pl">🇵🇱 Polska</option>
                        <option value="cz">🇨🇿 Česko</option>
                        <option value="ro">🇷🇴 România</option>
                        <option value="hu">🇭🇺 Magyarország</option>
                        <option value="ua">🇺🇦 Україна</option>
                        <option value="ru">🇷🇺 Россия</option>
                        {/* ══════ ORIENTE MÉDIO ══════ */}
                        <option value="ae">🇦🇪 الإمارات (UAE)</option>
                        <option value="sa">🇸🇦 السعودية (Saudi Arabia)</option>
                        <option value="il">🇮🇱 ישראל (Israel)</option>
                        <option value="tr">🇹🇷 Türkiye</option>
                        {/* ══════ ÁSIA ══════ */}
                        <option value="jp">🇯🇵 日本 (Japan)</option>
                        <option value="cn">🇨🇳 中国 (China)</option>
                        <option value="kr">🇰🇷 한국 (South Korea)</option>
                        <option value="in">🇮🇳 भारत (India)</option>
                        <option value="sg">🇸🇬 Singapore</option>
                        <option value="ph">🇵🇭 Pilipinas</option>
                        <option value="th">🇹🇭 ประเทศไทย (Thailand)</option>
                        <option value="my">🇲🇾 Malaysia</option>
                        <option value="id">🇮🇩 Indonesia</option>
                        <option value="vn">🇻🇳 Việt Nam</option>
                        {/* ══════ OCEANIA ══════ */}
                        <option value="au">🇦🇺 Australia</option>
                        <option value="nz">🇳🇿 New Zealand</option>
                        {/* ══════ ÁFRICA ══════ */}
                        <option value="za">🇿🇦 South Africa</option>
                        <option value="ao">🇦🇴 Angola</option>
                        <option value="mz">🇲🇿 Moçambique</option>
                        <option value="cv">🇨🇻 Cabo Verde</option>
                        <option value="gw">🇬🇼 Guiné-Bissau</option>
                        <option value="st">🇸🇹 São Tomé e Príncipe</option>
                        <option value="eg">🇪🇬 مصر (Egypt)</option>
                        <option value="ma">🇲🇦 المغرب (Morocco)</option>
                        <option value="ng">🇳🇬 Nigeria</option>
                        <option value="ke">🇰🇪 Kenya</option>
                        {/* ══════ OUTROS ══════ */}
                        <option value="other">🌍 Outro / Other</option>
                      </select>
                    </div>

                    {isDoctor ? (
                      <div className={styles.inputGroup}>
                        <label className={styles.themeLabel}>{isDoctor ? t('medicalLicenseLabel') : t('studentIdLabel')}</label>
                        <input type="text" name="identifier_number" placeholder={isDoctor ? t('medicalLicensePlaceholder') : t('studentIdPlaceholder')} value={formData.identifier_number} onChange={handleInputChange} required className={styles.themeInput} />
                      </div>
                    ) : (
                      <>
                        <div className={styles.inputGroup}>
                          <label className={styles.themeLabel}>{t('university')}</label>
                          <input type="text" name="university" value={formData.university} onChange={handleInputChange} required className={styles.themeInput} />
                        </div>
                        <div className={styles.rowLayout}>
                          <div style={{ flex: 1 }}>
                            <label className={styles.themeLabel}>{t('period')}</label>
                            <input type="text" name="period" value={formData.period} onChange={handleInputChange} required className={styles.themeInput} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className={styles.themeLabel}>{t('studentIdLabel')}</label>
                            <input type="text" name="matricula" value={formData.matricula} onChange={handleInputChange} required className={styles.themeInput} />
                          </div>
                        </div>
                      </>
                    )}

                    {(
                      /* Verificação de identidade via Latreo — médico (registro CFM+CNES) ou
                         estudante (vínculo acadêmico: e-mail institucional ou matrícula+selfie).
                         Documentos/biometria vão direto pro Latreo, nunca pelo Qython.
                         Opcional — pode concluir depois pelo perfil. */
                      <div className={styles.inputGroup} style={{ animation: 'fadeIn 0.3s' }}>
                        <div className={styles.verificationCard}>
                          <FontAwesomeIcon icon={faShieldAlt} className={styles.verificationCardIcon} />
                          <div className={styles.verificationCardContent}>
                            <p>{t(isDoctor ? 'latreoVerifyIntro' : 'latreoVerifyIntroStudent')}</p>
                            <span className={styles.verificationTime}>{t('latreoVerifyTime')}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowLatreoModal(true)}
                          className={`${styles.themeButton} ${(isLatreoVerified || latreoSessionId) ? '' : styles.themeButtonSecondary}`}
                          style={{ background: (isLatreoVerified || latreoSessionId) ? 'linear-gradient(135deg, #03dac6, #00b4a0)' : undefined, border: (isLatreoVerified || latreoSessionId) ? 'none' : undefined }}
                          disabled={isLatreoVerified || !!latreoSessionId}
                        >
                          {isLatreoVerified
                            ? <><FontAwesomeIcon icon={faCheck} /> {t('latreoVerifiedBadge')}</>
                            : latreoSessionId
                              ? <><FontAwesomeIcon icon={faCheck} /> {t('latreoSubmittedBadge')}</>
                              : <><FontAwesomeIcon icon={faShieldAlt} /> {t(isDoctor ? 'latreoVerifyButton' : 'latreoVerifyButtonStudent')}</>}
                        </button>
                        {isLatreoVerified && latreoTier && (
                          <small className={styles.uploadHelp}>{t(`latreoTier_${latreoTier}`, '')}</small>
                        )}
                        {!isLatreoVerified && !latreoSessionId && (
                          <small className={styles.uploadHelp}>{t('latreoVerifyOptional')}</small>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className={styles.inputGroup}>
                  <label className={styles.themeLabel}>{t('phone')}</label>
                  <div className={styles.phoneWrapper}>
                    <PhoneInput international defaultCountry="BR" value={formData.phone_number} onChange={handlePhoneChange} labels={phoneLocale} className={styles.phoneInputCustom} placeholder="(99) 99999-9999" />
                    <button type="button" onClick={() => setShowPhoneModal(true)} className={`${styles.themeButton} ${isPhoneVerified ? '' : styles.themeButtonSecondary}`} style={{ width: 'auto', marginTop: 0, padding: '14px 18px', whiteSpace: 'nowrap', height: '50px', background: isPhoneVerified ? 'linear-gradient(135deg, #03dac6, #00b4a0)' : undefined, border: isPhoneVerified ? 'none' : undefined }} disabled={!formData.phone_number || isPhoneVerified}>
                      {isPhoneVerified ? <><FontAwesomeIcon icon={faCheck} /> Verificado</> : <><FontAwesomeIcon icon={faShieldAlt} /> Verificar</>}
                    </button>
                  </div>
                  {!isPhoneVerified && (
                    <small className={styles.uploadHelp} style={{ color: '#ffb74d', display: 'block', marginTop: '6px' }}>
                      {t('phoneVerifyRequired', 'Obrigatório: confirme seu número por SMS para concluir o cadastro.')}
                    </small>
                  )}
                </div>

                {/* SEÇÃO DE CONSENTIMENTOS */}
                <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                  {/* CHECKBOX DE MARKETING */}
                  <div className={styles.marketingGroup}>
                    <input
                      type="checkbox"
                      id="marketing"
                      checked={marketingConsent}
                      onChange={(e) => setMarketingConsent(e.target.checked)}
                    />
                    <label htmlFor="marketing">
                      {t('marketingConsentLabel')}
                    </label>
                  </div>

                  {/* CHECKBOX DE TERMOS E PRIVACIDADE */}
                  <div className={styles.termsGroup}>
                    <input
                      type="checkbox"
                      id="terms"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      required
                    />
                    <label htmlFor="terms">
                      {t('iAcceptThe')} <a href="/terms-of-use" target="_blank" rel="noopener noreferrer">{t('termsOfUse')}</a> {t('andThe')} <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">{t('privacyPolicy')}</a>.
                    </label>
                  </div>
                </div>

                {termsAccepted && (
                  <div style={{ marginBottom: '20px' }}>
                    <Turnstile
                      sitekey={import.meta.env.VITE_CLOUDFLARE_SITE_KEY}
                      onVerify={(token) => { setCaptchaToken(token); setCaptchaError(''); }}
                      onError={(err) => {
                        setCaptchaToken(null);
                        setCaptchaError(t('captchaLoadError', 'Não foi possível carregar a verificação de segurança. Recarregue a página e tente novamente.'));
                        console.warn('[Turnstile] error', err);
                      }}
                      onExpire={() => setCaptchaToken(null)}
                    />
                    {captchaError && <p style={{ color: '#ff5252', marginTop: '8px', fontSize: '0.85rem' }}>{captchaError}</p>}
                  </div>
                )}

                <button type="submit" className={styles.themeButton} disabled={!isStep1Valid()} style={{ opacity: isStep1Valid() ? 1 : 0.5, cursor: isStep1Valid() ? 'pointer' : 'not-allowed' }}>
                  {t('continue')} <FontAwesomeIcon icon={faArrowRight} style={{ marginLeft: '8px' }} />
                </button>
                {!isStep1Valid() && getMissingRequirements().length > 0 && (
                  <small className={styles.uploadHelp} style={{ display: 'block', marginTop: '10px', color: '#a0a0a0', textAlign: 'center' }}>
                    {t('missingToContinue', 'Para continuar, falta')}: {getMissingRequirements().join(' · ')}
                  </small>
                )}
              </form>
            </>
          )}

          {step === 1.5 && (
            <div className={styles.inviteContainer}>
              <div style={{ marginBottom: '20px', color: '#03dac6', fontSize: '3rem' }}><FontAwesomeIcon icon={faTicketAlt} /></div>
              <h2 className={styles.formTitle}>{t('haveInvite')}</h2>
              <p className={styles.formSubtitle}>{t('inviteDescription')}</p>
              <div className={styles.inviteOptions}>
                {!hasInvite && <button className={styles.themeButton} onClick={() => setHasInvite(true)}>{t('yesHaveCode')}</button>}
                {hasInvite && (
                  <div style={{ animation: 'fadeIn 0.3s' }}>
                    <input type="text" placeholder={t('pasteCodeHere')} value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} className={styles.themeInput} autoFocus />
                    <button className={styles.themeButton} style={{ marginTop: '10px' }} onClick={() => handleFinalSubmit(inviteToken)}>Validar e Entrar <FontAwesomeIcon icon={faCheck} /></button>
                  </div>
                )}
                {!hasInvite && <div className={styles.divider}>{t('or')}</div>}
                {!hasInvite && (
                  <button className={`${styles.themeButton} ${styles.themeButtonSecondary}`} onClick={() => handleFinalSubmit(null)}>
                    <FontAwesomeIcon icon={faClock} style={{ marginRight: '8px' }} /> {t('noCodeJoinWaitlist')}
                  </button>
                )}
              </div>
              <button onClick={() => setStep(1)} className={styles.backButton}>← {t('backAndEdit')}</button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className={styles.formTitle}>{t('personalizeProfile')}</h2>
              <AvatarGeneratorModal isOpen={true} onClose={() => setStep(3)} prompt={avatarPrompt} setPrompt={setAvatarPrompt} handleGenerateAvatar={handleGenerateAvatar} isGenerating={false} tempAvatar={tempAvatar} setTempAvatar={setTempAvatar} handleSaveAvatar={handleSaveAvatar} handleDiscardAvatar={() => setTempAvatar(null)} avatarHistory={[]} handleRemoveAvatar={() => { }} addNotification={alert} />
              <button onClick={() => setStep(3)} className={`${styles.themeButton} ${styles.themeButtonSecondary}`} style={{ marginTop: '20px' }}>{t('skipStep')}</button>
            </div>
          )}

          {step === 3 && (
            <div className={styles.confirmationStep}>
              {/* Ícone: Check se tiver convite ou Google, Envelope se for manual */}
              <div style={{
                marginBottom: '20px',
                color: (googleIdToken || inviteToken) ? '#03dac6' : '#bb86fc',
                fontSize: '3.5rem'
              }}>
                <FontAwesomeIcon
                  icon={
                    (googleIdToken || inviteToken)
                      ? faCheck
                      : faEnvelopeOpenText
                  }
                />
              </div>

              <h2 className={styles.formTitle}>
                {googleIdToken
                  ? (inviteToken ? t('accountActivated') : t('registrationCompleted'))
                  : (inviteToken ? t('accountActivated') : t('almostThere'))
                }
              </h2>

              {googleIdToken ? (
                // --- FLUXO GOOGLE (Auto-Logado) ---
                <>
                  <p style={{ color: '#e0e0e0', fontSize: '1.1rem', marginBottom: '20px' }}>
                    {inviteToken
                      ? t('vipAccessGranted')
                      : (inviteRequired ? t('registrationConfirmedWaitlist') : t('accountActiveWelcome'))
                    }
                  </p>

                  {/* BOTÃO INTELIGENTE - navega diretamente */}
                  <button
                    onClick={() => {
                      if (inviteToken) navigate('/pricing'); // VIP -> Upsell para Planos
                      else if (!inviteRequired) navigate('/copilot'); // sem convite exigido -> entra direto
                      else navigate('/waitlist'); // Waitlist -> Tela de Espera
                    }}
                    className={styles.themeButton}
                    style={{ marginTop: '30px' }}
                  >
                    {(inviteToken || !inviteRequired) ? t('accessPlatform') : t('trackStatus')}
                  </button>
                </>
              ) : (
                // --- FLUXO EMAIL (Precisa verificar) ---
                <>
                  <p>{t('sentConfirmationTo')} <strong>{username || formData.email}</strong>.</p>
                  <p style={{ fontSize: '0.9rem' }}>
                    {(inviteToken || !inviteRequired)
                      ? t('emailConfirmationImmediateAccess')
                      : t('emailConfirmationWaitlist')
                    }
                  </p>
                  <button onClick={() => navigate('/login')} className={styles.themeButton} style={{ marginTop: '30px' }}>
                    {t('goToLogin')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <PhoneVerificationModal isOpen={showPhoneModal} onClose={() => setShowPhoneModal(false)} phoneNumber={formData.phone_number} onVerified={handlePhoneVerified} />
      <LatreoVerificationModal isOpen={showLatreoModal} onClose={() => setShowLatreoModal(false)} onVerified={handleLatreoVerified} captchaToken={captchaToken} locale={i18n.language.split('-')[0]} kind={isDoctor ? 'doctor' : 'student'} />
    </div>
  );
}

export default Register;
