import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import styles from './Register.module.css';
import { useTranslation } from 'react-i18next';
import { useNotification } from '../../contexts/NotificationContext';
import { useUser } from '../../contexts/UserContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserAstronaut, faAt, faArrowRight, faMagicWandSparkles, faSpinner, faUpload } from '@fortawesome/free-solid-svg-icons';

const OnboardingPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const { user, setUser, refreshUser } = useUser();

    // Wizard state (1=Avatar, 2=Username) - persist to localStorage
    const getInitialStep = () => {
        const savedStep = localStorage.getItem('onboarding_step');
        return savedStep ? parseInt(savedStep, 10) : 1;
    };
    const [step, setStep] = useState(getInitialStep);

    // Persist step changes
    useEffect(() => {
        localStorage.setItem('onboarding_step', step.toString());
    }, [step]);

    // Auto-detect completed steps based on user data
    useEffect(() => {
        if (user) {
            // If user already has a profile picture (not default), skip to username step
            if (user.profile_picture && user.profile_picture !== 'default-profile.png' && step === 1) {
                setStep(2);
            }
        }
    }, [user, step]);

    // Avatar state
    const [avatarPrompt, setAvatarPrompt] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('professional');
    const [tempAvatar, setTempAvatar] = useState(null);
    const [generatedAvatars, setGeneratedAvatars] = useState([]); // Track all generated avatars
    const [isGenerating, setIsGenerating] = useState(false);
    const [avatarsRemaining, setAvatarsRemaining] = useState(3);

    // Presets state
    const [presets, setPresets] = useState({});
    const [categories, setCategories] = useState([]);
    const [loadingPresets, setLoadingPresets] = useState(true);

    // Username state
    const [username, setUsername] = useState('');
    const [usernameStatus, setUsernameStatus] = useState({ checking: false, available: null, reason: '' });
    const [savingProfile, setSavingProfile] = useState(false);

    // Fetch presets and avatar count on mount
    useEffect(() => {
        const fetchPresets = async () => {
            try {
                const response = await api.get('/user/avatar-presets');
                setPresets(response.data.presets);
                setCategories(response.data.categories);
            } catch (error) {
                console.error('Failed to load avatar presets:', error);
            } finally {
                setLoadingPresets(false);
            }
        };

        const fetchAvatarCount = async () => {
            try {
                const response = await api.get('/user/avatar-count');
                setAvatarsRemaining(response.data.avatars_remaining);
            } catch (error) {
                console.error('Failed to load avatar count:', error);
            }
        };

        const fetchAvatarHistory = async () => {
            try {
                const response = await api.get('/user/avatar-history');
                if (response.data && response.data.length > 0) {
                    setGeneratedAvatars(response.data);
                    setTempAvatar(response.data[response.data.length - 1]); // Select last generated
                }
            } catch (error) {
                console.error('Failed to load avatar history:', error);
            }
        };

        fetchPresets();
        fetchAvatarCount();
        fetchAvatarHistory();
    }, []);

    // Initialize suggested username based on email (only on first mount)
    const hasInitializedUsername = React.useRef(false);
    useEffect(() => {
        if (user && !hasInitializedUsername.current) {
            const suggested = user.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 20);
            setUsername(suggested);
            hasInitializedUsername.current = true;
        }
    }, [user]);

    // Check username availability with debounce
    const checkUsername = useCallback(async (value) => {
        if (value.length < 3) {
            setUsernameStatus({ checking: false, available: false, reason: 'Mínimo 3 caracteres' });
            return;
        }

        setUsernameStatus({ checking: true, available: null, reason: '' });

        try {
            const response = await api.get(`/user/check-username/${value}`);
            setUsernameStatus({
                checking: false,
                available: response.data.available,
                reason: response.data.reason
            });
        } catch (error) {
            setUsernameStatus({ checking: false, available: null, reason: 'Erro ao verificar' });
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (username.length >= 3) {
                checkUsername(username);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [username, checkUsername]);

    // --- STEP 1: AVATAR ---
    const handleGenerateAvatar = async () => {
        if (!avatarPrompt) {
            addNotification('Descreva como você quer seu avatar', 'warning');
            return;
        }

        setIsGenerating(true);
        try {
            const response = await api.post('/user/generate-avatar-temp', {
                prompt: avatarPrompt,
                category: selectedCategory
            });
            const newAvatarUrl = response.data.temp_avatar_url;
            setTempAvatar(newAvatarUrl);
            setGeneratedAvatars(prev => [...prev, newAvatarUrl]); // Add to history
            setAvatarsRemaining(response.data.avatars_remaining);

            if (response.data.is_free) {
                const remaining = response.data.avatars_remaining;
                const msg = remaining === 1
                    ? t('onboarding.avatarGeneratedSingular', { count: remaining })
                    : t('onboarding.avatarGeneratedPlural', { count: remaining });
                addNotification(msg, 'success');
            } else {
                addNotification(t('onboarding.avatarGeneratedPaid'), 'success');
            }
        } catch (error) {
            const msg = error.response?.data?.detail || 'Erro ao gerar avatar';
            addNotification(msg, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    // Select a preset avatar
    const handleSelectPreset = (presetUrl) => {
        setTempAvatar(presetUrl);
        addNotification('Avatar selecionado!', 'success');
    };

    const handleSaveAvatar = async () => {
        if (!tempAvatar) {
            setStep(2);
            return;
        }

        try {
            // For presets, send the full path; for generated avatars, send only filename
            const isPreset = tempAvatar.includes('/images/avatars/presets/') || tempAvatar.includes('/assets/images/avatars/presets/');
            const filename = isPreset ? tempAvatar : tempAvatar.split('/').pop();

            await api.post('/user/save-avatar', { filename });
            addNotification('Avatar salvo!', 'success');
            setStep(2);
        } catch (error) {
            addNotification('Erro ao salvar avatar', 'error');
        }
    };

    // --- STEP 2: USERNAME ---
    const handleSaveUsername = async (e) => {
        e.preventDefault();

        if (!username || username.length < 3) {
            addNotification('Username deve ter pelo menos 3 caracteres', 'warning');
            return;
        }

        if (!usernameStatus.available) {
            addNotification('Este username não está disponível', 'warning');
            return;
        }

        setSavingProfile(true);
        try {
            await api.put('/user/update', { username: username.toLowerCase() });
            await refreshUser();
            addNotification('Perfil configurado!', 'success');
            await finishOnboarding('/pricing');
        } catch (error) {
            const msg = error.response?.data?.detail || 'Erro ao salvar';
            addNotification(msg, 'error');
        } finally {
            setSavingProfile(false);
        }
    };

    // Marca o onboarding como concluído (backend + update OTIMISTA no contexto) e navega.
    // O update otimista evita que o ProtectedRoute, lendo onboarding_completed=false
    // obsoleto, role o usuário de volta pro /onboarding (loop) ao chegar no destino.
    const finishOnboarding = async (destination) => {
        try {
            await api.post('/user/onboarding/complete');
        } catch (e) {
            // Não-fatal: o update otimista abaixo já libera a navegação; o backend
            // reconcilia no próximo /user/info.
        }
        if (typeof setUser === 'function') {
            setUser(prev => (prev ? { ...prev, onboarding_completed: true } : prev));
        }
        localStorage.removeItem('onboarding_step');
        navigate(destination);
    };

    const handleSkipToPlans = () => {
        finishOnboarding('/pricing');
    };

    return (
        <div className={styles.splitScreen}>
            {/* Left Pane */}
            <div className={styles.leftPane}>
                <div className={styles.bgPattern}></div>
                <div className={styles.leftPaneContent}>
                    {step === 1 ? (
                        <>
                            <h1>Sua Identidade Visual</h1>
                            <p>Crie um avatar único com inteligência artificial para representar você na plataforma Qython.</p>
                        </>
                    ) : (
                        <>
                            <h1>Identidade Profissional</h1>
                            <p>Escolha um @username único. Ele será usado em rankings, compartilhamentos e na comunidade.</p>
                        </>
                    )}
                </div>

                {/* Step Indicator */}
                <div style={{ position: 'relative', zIndex: 2, marginTop: 'auto', display: 'flex', gap: '10px' }}>
                    <div style={{ height: '4px', width: '40px', background: step >= 1 ? '#03dac6' : '#333', borderRadius: '2px', transition: 'background 0.3s' }} />
                    <div style={{ height: '4px', width: '40px', background: step >= 2 ? '#03dac6' : '#333', borderRadius: '2px', transition: 'background 0.3s' }} />
                </div>
            </div>

            {/* Right Pane */}
            <div className={styles.rightPane}>
                <div className={styles.formWrapper}>

                    {/* --- STEP 1: AVATAR --- */}
                    {step === 1 && (
                        <>
                            <div style={{ marginBottom: '20px', fontSize: '3rem', color: '#bb86fc' }}>
                                <FontAwesomeIcon icon={faUserAstronaut} />
                            </div>
                            <h2 className={styles.formTitle}>{t('onboarding.chooseAvatar')}</h2>
                            <p className={styles.formSubtitle}>
                                {t('onboarding.chooseAvatarSubtitle')}
                                {avatarsRemaining > 0 && (
                                    <span style={{ display: 'block', marginTop: '5px', color: '#03dac6', fontSize: '0.85rem' }}>
                                        ✨ {t('onboarding.freeGenerationsRemaining', { count: avatarsRemaining })}
                                    </span>
                                )}
                            </p>

                            {/* === PRESET GALLERY === */}
                            {!loadingPresets && Object.values(presets).some(arr => arr.length > 0) && (
                                <div style={{ marginBottom: '25px' }}>
                                    <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '10px' }}>📷 {t('onboarding.selectPreset')}</p>
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                        {Object.entries(presets).flatMap(([category, items]) =>
                                            items.map((preset) => (
                                                <div
                                                    key={preset.id}
                                                    onClick={() => handleSelectPreset(preset.url)}
                                                    style={{
                                                        width: '70px',
                                                        height: '70px',
                                                        borderRadius: '50%',
                                                        overflow: 'hidden',
                                                        cursor: 'pointer',
                                                        border: tempAvatar === preset.url ? '3px solid #03dac6' : '2px solid #333',
                                                        transition: 'all 0.2s',
                                                        transform: tempAvatar === preset.url ? 'scale(1.1)' : 'scale(1)'
                                                    }}
                                                >
                                                    <img
                                                        src={preset.url}
                                                        alt={preset.name}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* === DIVIDER === */}
                            <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: '#666' }}>
                                <div style={{ flex: 1, height: '1px', background: '#333' }} />
                                <span style={{ padding: '0 15px', fontSize: '0.85rem' }}>{t('onboarding.orGenerateWithAI')}</span>
                                <div style={{ flex: 1, height: '1px', background: '#333' }} />
                            </div>

                            {/* === PROMPT TEMPLATES === */}
                            <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '10px', textAlign: 'center' }}>
                                {t('onboarding.chooseStyleOrDescribe')}
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '15px', justifyContent: 'center' }}>
                                {[
                                    { labelKey: 'classicDoctor', promptKey: 'classicDoctorPrompt' },
                                    { labelKey: 'modernDoctor', promptKey: 'modernDoctorPrompt' },
                                    { labelKey: 'animeHero', promptKey: 'animeHeroPrompt' },
                                    { labelKey: 'cyberpunkMedic', promptKey: 'cyberpunkMedicPrompt' },
                                    { labelKey: 'futuristicRobot', promptKey: 'futuristicRobotPrompt' },
                                    { labelKey: 'renaissance', promptKey: 'renaissancePrompt' }
                                ].map((item, idx) => {
                                    const label = t(`onboarding.promptTemplates.${item.labelKey}`);
                                    const prompt = t(`onboarding.promptTemplates.${item.promptKey}`);
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setAvatarPrompt(prompt)}
                                            title={prompt}
                                            style={{
                                                padding: '10px 16px',
                                                fontSize: '0.85rem',
                                                background: avatarPrompt === prompt ? 'rgba(3, 218, 198, 0.2)' : 'rgba(255,255,255,0.05)',
                                                border: avatarPrompt === prompt ? '1px solid #03dac6' : '1px solid #333',
                                                borderRadius: '20px',
                                                color: avatarPrompt === prompt ? '#03dac6' : '#aaa',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                fontWeight: avatarPrompt === prompt ? '600' : '400'
                                            }}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Generated avatars gallery - moved above input for better UX */}
                            {generatedAvatars.length > 0 && (
                                <div style={{ marginBottom: '20px' }}>
                                    <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '10px', textAlign: 'center' }}>
                                        🎨 {t('onboarding.yourGeneratedAvatars')} ({generatedAvatars.length}/3):
                                    </p>
                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                        {generatedAvatars.map((avatarUrl, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => setTempAvatar(avatarUrl)}
                                                style={{
                                                    width: '80px',
                                                    height: '80px',
                                                    borderRadius: '50%',
                                                    overflow: 'hidden',
                                                    cursor: 'pointer',
                                                    border: tempAvatar === avatarUrl ? '3px solid #03dac6' : '2px solid #444',
                                                    transition: 'all 0.2s',
                                                    transform: tempAvatar === avatarUrl ? 'scale(1.1)' : 'scale(1)'
                                                }}
                                            >
                                                <img
                                                    src={avatarUrl}
                                                    alt={`Avatar ${idx + 1}`}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    onError={(e) => { e.target.src = '/assets/images/avatars/presets/default/monalisa_medica.png'; }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {tempAvatar && (
                                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                                    <p style={{ color: '#03dac6', fontSize: '0.9rem' }}>
                                        {t('onboarding.avatarSelected')}
                                    </p>
                                </div>
                            )}

                            <div className={styles.inputGroup}>
                                <input
                                    type="text"
                                    value={avatarPrompt}
                                    onChange={(e) => setAvatarPrompt(e.target.value)}
                                    className={styles.themeInput}
                                    placeholder={t('onboarding.describeYourAvatar')}
                                    disabled={isGenerating}
                                />
                            </div>

                            {avatarsRemaining > 0 ? (
                                <button
                                    onClick={handleGenerateAvatar}
                                    className={styles.themeButton}
                                    disabled={isGenerating || !avatarPrompt}
                                    style={{ marginBottom: '15px' }}
                                >
                                    {isGenerating ? (
                                        <><FontAwesomeIcon icon={faSpinner} spin /> {t('onboarding.generating')}</>
                                    ) : (
                                        <><FontAwesomeIcon icon={faMagicWandSparkles} /> {t('onboarding.generateWithAIFree')}</>
                                    )}
                                </button>
                            ) : (
                                <div style={{
                                    background: 'rgba(3, 218, 198, 0.1)',
                                    border: '1px solid rgba(3, 218, 198, 0.3)',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    marginBottom: '15px',
                                    textAlign: 'center'
                                }}>
                                    <p style={{ color: '#03dac6', margin: 0, fontSize: '0.9rem' }}>
                                        ✨ {t('onboarding.allFreeAvatarsUsed')}
                                    </p>
                                </div>
                            )}

                            {/* === DIVIDER === */}
                            <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: '#666' }}>
                                <div style={{ flex: 1, height: '1px', background: '#333' }} />
                                <span style={{ padding: '0 15px', fontSize: '0.85rem' }}>{t('onboarding.orDivider')}</span>
                                <div style={{ flex: 1, height: '1px', background: '#333' }} />
                            </div>

                            {/* Upload option */}
                            <label className={styles.fileUploadLabel} style={{ marginBottom: '20px' }}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className={styles.fileInputHidden}
                                    onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onload = (evt) => setTempAvatar(evt.target.result);
                                            reader.readAsDataURL(file);
                                        }
                                    }}
                                />
                                <FontAwesomeIcon icon={faUpload} style={{ marginRight: '8px' }} />
                                {t('onboarding.uploadPhoto')}
                            </label>



                            <button
                                onClick={handleSaveAvatar}
                                className={`${styles.themeButton} ${!tempAvatar ? styles.themeButtonSecondary : ''}`}
                            >
                                {tempAvatar ? t('onboarding.saveAndContinue') : t('onboarding.skipStep')} <FontAwesomeIcon icon={faArrowRight} />
                            </button>
                        </>
                    )}

                    {/* --- STEP 2: USERNAME --- */}
                    {step === 2 && (
                        <form onSubmit={handleSaveUsername}>
                            <div style={{ marginBottom: '20px', fontSize: '3rem', color: '#03dac6' }}>
                                <FontAwesomeIcon icon={faAt} />
                            </div>
                            <h2 className={styles.formTitle}>{t('onboarding.createUsername')}</h2>
                            <p className={styles.formSubtitle}>{t('onboarding.usernameDesc')}</p>

                            <div className={styles.inputGroup}>
                                <div style={{ position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: '15px', top: '14px', color: '#888', fontSize: '1.1rem' }}>@</span>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase().slice(0, 30))}
                                        className={styles.themeInput}
                                        style={{ paddingLeft: '35px' }}
                                        placeholder="usuario.exemplo"
                                    />
                                </div>

                                {/* Username validation checklist */}
                                <div style={{
                                    marginTop: '12px',
                                    padding: '12px',
                                    background: 'rgba(0,0,0,0.2)',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem'
                                }}>
                                    {[
                                        { check: username.length >= 3, label: t('usernameRuleLength') },
                                        { check: username.length > 0 && /^[a-zA-Z0-9_.]+$/.test(username), label: t('usernameRuleChars') },
                                        { check: !username.includes('..'), label: t('usernameRuleNoConsecutiveDots') },
                                        { check: usernameStatus.available === true, label: usernameStatus.checking ? t('usernameRuleChecking', 'Verificando disponibilidade...') : (usernameStatus.available === true ? t('usernameRuleAvailable', 'Disponível!') : usernameStatus.available === false ? usernameStatus.reason : t('usernameRuleAvailability', 'Disponibilidade')) }
                                    ].map((rule, idx) => (
                                        <div key={idx} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            marginBottom: idx < 3 ? '6px' : 0,
                                            color: rule.check ? '#03dac6' : (username.length === 0 ? '#666' : '#ff5252')
                                        }}>
                                            <span>{rule.check ? '✓' : '○'}</span>
                                            <span>{rule.label}</span>
                                            {idx === 3 && usernameStatus.checking && <FontAwesomeIcon icon={faSpinner} spin style={{ marginLeft: '5px' }} />}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="submit"
                                className={styles.themeButton}
                                disabled={
                                    savingProfile ||
                                    username.length < 3 ||
                                    !/^[a-zA-Z0-9_.]+$/.test(username) ||
                                    username.includes('..') ||
                                    !usernameStatus.available
                                }
                                style={{
                                    opacity: (username.length < 3 || !usernameStatus.available) ? 0.5 : 1,
                                    cursor: (username.length < 3 || !usernameStatus.available) ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {savingProfile ? 'Salvando...' : <>Finalizar e Ver Planos <FontAwesomeIcon icon={faArrowRight} /></>}
                            </button>

                            <button
                                type="button"
                                onClick={handleSkipToPlans}
                                className={`${styles.themeButton} ${styles.themeButtonSecondary}`}
                                style={{ marginTop: '10px' }}
                            >
                                Pular e configurar depois
                            </button>
                        </form>
                    )}

                    {/* Skip All Button - Always visible */}
                    <div style={{
                        marginTop: '40px',
                        paddingTop: '20px',
                        borderTop: '1px solid #333',
                        textAlign: 'center'
                    }}>
                        <button
                            type="button"
                            onClick={() => finishOnboarding('/copilot')}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#666',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                transition: 'color 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.color = '#aaa'}
                            onMouseLeave={(e) => e.target.style.color = '#666'}
                        >
                            Pular tudo e ir direto para o Dashboard →
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default OnboardingPage;
