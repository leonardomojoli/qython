// frontend/src/components/user/PhoneVerificationModal.js
/**
 * Phone Verification Modal using Firebase Authentication
 * 
 * This component provides SMS verification using Firebase's invisible reCAPTCHA.
 * After successful verification, it returns a Firebase ID Token (JWT) that the
 * backend can use to cryptographically verify the phone number ownership.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { auth } from '../../firebaseConfig';
import styles from './PhoneVerificationModal.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCommentSms, faSpinner, faCheck, faExclamationTriangle, faTimes, faClock } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

const PhoneVerificationModal = ({ isOpen, onClose, phoneNumber, onVerified }) => {
    const { t, i18n } = useTranslation();
    const [step, setStep] = useState('init'); // init, input, success
    const [loading, setLoading] = useState(false);
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [confirmationResult, setConfirmationResult] = useState(null);

    // Resend countdown timer (60 seconds)
    const [timer, setTimer] = useState(0);

    // Countdown effect
    useEffect(() => {
        let interval;
        if (timer > 0) {
            interval = setInterval(() => {
                setTimer((prev) => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [timer]);

    // Cleanup reCAPTCHA on unmount or close
    const cleanupRecaptcha = useCallback(() => {
        if (window.recaptchaVerifier) {
            try {
                window.recaptchaVerifier.clear();
            } catch (e) {
                // Ignore cleanup errors
            }
            window.recaptchaVerifier = null;
        }
    }, []);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            // Sync Firebase language with i18n
            auth.languageCode = i18n.language.split('-')[0];

            setStep('init');
            setCode('');
            setError('');
            setConfirmationResult(null);
            setTimer(0); // Reset timer when modal opens
        } else {
            cleanupRecaptcha();
        }

        return () => cleanupRecaptcha();
    }, [isOpen, cleanupRecaptcha, i18n.language]);

    // Setup invisible reCAPTCHA
    const setupRecaptcha = useCallback(() => {
        if (!window.recaptchaVerifier) {
            try {
                window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                    'size': 'invisible',
                    'callback': () => {
                        // reCAPTCHA solved, will allow signInWithPhoneNumber
                    },
                    'expired-callback': () => {
                        setError('reCAPTCHA expirou. Clique em "Enviar" novamente.');
                        cleanupRecaptcha();
                    }
                });
            } catch (e) {
                console.error('Error setting up reCAPTCHA:', e);
                setError('Erro ao configurar verificação. Recarregue a página.');
            }
        }
        return window.recaptchaVerifier;
    }, [cleanupRecaptcha]);

    if (!isOpen) return null;

    // Format phone number to E.164 format
    const formatPhoneNumber = (phone) => {
        // Remove all non-digit characters except +
        let cleaned = phone.replace(/[^\d+]/g, '');

        // If doesn't start with +, assume Brazil (+55)
        if (!cleaned.startsWith('+')) {
            // Remove leading zeros
            cleaned = cleaned.replace(/^0+/, '');
            // Add Brazil DDI
            cleaned = '+55' + cleaned;
        }

        return cleaned;
    };

    const handleSendCode = async () => {
        setLoading(true);
        setError('');

        try {
            const appVerifier = setupRecaptcha();
            const formattedPhone = formatPhoneNumber(phoneNumber);

            console.log('Sending SMS to:', formattedPhone);

            const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
            setConfirmationResult(confirmation);
            setStep('input');
            setTimer(60); // Start 60-second countdown

        } catch (err) {
            console.error('Error sending SMS:', err);

            // Handle specific Firebase errors
            let errorMessage = 'Erro ao enviar SMS. Verifique o número e tente novamente.';

            if (err.code === 'auth/invalid-phone-number') {
                errorMessage = 'Número de telefone inválido. Use o formato: +55 11 99999-9999';
            } else if (err.code === 'auth/too-many-requests') {
                errorMessage = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
            } else if (err.code === 'auth/quota-exceeded') {
                errorMessage = 'Limite de SMS excedido. Tente novamente mais tarde.';
            } else if (err.code === 'auth/captcha-check-failed') {
                errorMessage = 'Verificação de segurança falhou. Recarregue a página.';
            }

            setError(errorMessage);
            cleanupRecaptcha();

        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        if (!confirmationResult || code.length !== 6) return;

        setLoading(true);
        setError('');

        try {
            // Confirm the SMS code
            const result = await confirmationResult.confirm(code);

            // ULTRA-SECURITY: Get the Firebase ID Token (JWT) signed by Google
            const idToken = await result.user.getIdToken();

            setStep('success');

            // Wait for success animation, then pass token to parent
            setTimeout(() => {
                onVerified(idToken);
                onClose();
            }, 1500);

        } catch (err) {
            console.error('Error verifying code:', err);

            if (err.code === 'auth/invalid-verification-code') {
                setError('Código incorreto. Verifique e tente novamente.');
            } else if (err.code === 'auth/code-expired') {
                setError('Código expirado. Solicite um novo código.');
                setStep('init');
            } else {
                setError('Erro na verificação. Tente novamente.');
            }

        } finally {
            setLoading(false);
        }
    };

    const handleResend = () => {
        if (timer > 0 || loading) return; // Block if timer is running

        cleanupRecaptcha();
        setCode('');
        setError('');
        handleSendCode(); // Resend immediately instead of going to init
    };

    const handleCodeChange = (e) => {
        // Only allow digits, max 6 characters
        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
        setCode(value);
    };

    // Handle Enter key to submit code
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && code.length === 6 && !loading) {
            handleVerify();
        }
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <button className={styles.btnClose} onClick={onClose} aria-label="Fechar">
                    <FontAwesomeIcon icon={faTimes} />
                </button>

                <h3 className={styles.title}>
                    {step === 'success' ? t('verifiedBtn') : t('phoneModalTitle')}
                </h3>
                <p className={styles.subtitle}>{formatPhoneNumber(phoneNumber)}</p>

                {/* Required container for Firebase reCAPTCHA */}
                <div id="recaptcha-container"></div>

                {step === 'init' && (
                    <div className={styles.options}>
                        <p style={{ fontSize: '0.9rem', color: '#a0a0a0', marginBottom: '10px' }}>
                            {t('phoneModalHelp')}
                        </p>
                        <button
                            onClick={handleSendCode}
                            className={`${styles.btn} ${styles.btnSms}`}
                            disabled={loading}
                        >
                            {loading ? (
                                <FontAwesomeIcon icon={faSpinner} spin />
                            ) : (
                                <>
                                    <FontAwesomeIcon icon={faCommentSms} />
                                    Enviar Código SMS
                                </>
                            )}
                        </button>
                        <button onClick={onClose} className={styles.btnBack}>
                            {t('cancel', 'Cancelar')}
                        </button>
                    </div>
                )}

                {step === 'input' && (
                    <div className={styles.inputContainer}>
                        <p>{t('phoneModalInputLabel')}</p>
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength="6"
                            value={code}
                            onChange={handleCodeChange}
                            onKeyDown={handleKeyDown}
                            className={styles.codeInput}
                            placeholder="000000"
                            autoFocus
                        />
                        <button
                            onClick={handleVerify}
                            className={styles.btnVerify}
                            disabled={loading || code.length !== 6}
                        >
                            {loading ? (
                                <FontAwesomeIcon icon={faSpinner} spin />
                            ) : (
                                t('phoneModalConfirmBtn')
                            )}
                        </button>
                        <button
                            onClick={handleResend}
                            className={styles.btnBack}
                            disabled={timer > 0 || loading}
                            style={{ opacity: timer > 0 ? 0.5 : 1, cursor: timer > 0 ? 'default' : 'pointer' }}
                        >
                            {timer > 0 ? (
                                <span><FontAwesomeIcon icon={faClock} /> {t('phoneModalResendIn', { seconds: timer })}</span>
                            ) : (
                                t('phoneModalResendBtn')
                            )}
                        </button>
                    </div>
                )}

                {step === 'success' && (
                    <div className={styles.success}>
                        <FontAwesomeIcon icon={faCheck} size="3x" color="#03dac6" />
                        <p style={{ marginTop: '15px' }}>{t('phoneModalSuccess')}</p>
                    </div>
                )}

                {error && (
                    <div className={styles.error}>
                        <FontAwesomeIcon icon={faExclamationTriangle} />
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PhoneVerificationModal;
