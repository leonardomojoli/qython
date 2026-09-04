import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../../contexts/UserContext';
import { useNotification } from '../../contexts/NotificationContext';
import { api, getUserInfo } from '../../api';
import styles from './Register.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
import qythonLogo from '../../assets/qython-imagotipo.png';
import { useTranslation } from 'react-i18next';

const WaitlistPage = () => {
    const { t } = useTranslation();
    const [inviteToken, setInviteToken] = useState('');
    const [loading, setLoading] = useState(false);
    const { user, setUser } = useUser();
    const { addNotification } = useNotification();
    const navigate = useNavigate();

    const handleValidateInvite = async () => {
        if (!inviteToken.trim()) return;
        setLoading(true);

        try {
            await api.post('/user/activate-invite', { token: inviteToken });

            addNotification(t('inviteValidatedSuccess'), 'success');

            const updatedUser = await getUserInfo();
            setUser(updatedUser);

            navigate('/onboarding');

        } catch (error) {
            console.error(error);
            addNotification(error.response?.data?.detail || t('errorValidatingToken'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('authToken');
        setUser(null);
        navigate('/login');
    };

    return (
        <div className={styles.splitScreen}>
            <div className={styles.leftPane}>
                <div className={styles.bgPattern}></div>
                <div className={styles.leftPaneContent}>
                    <h1>{t('waitlistTitle')}</h1>
                    <p>{t('waitlistSubtitle')}</p>
                </div>
            </div>

            <div className={styles.rightPane}>
                <div className={styles.formWrapper} style={{ textAlign: 'center' }}>
                    <div className={styles.logoHeader}>
                        <img src={qythonLogo} alt="Qython" className={styles.logoImg} />
                    </div>

                    <div style={{ marginBottom: '30px', fontSize: '4rem' }}>
                        ⏳
                    </div>

                    <h2 className={styles.formTitle}>{t('youAreOnWaitlist')}</h2>
                    <p className={styles.formSubtitle}>
                        {t('waitlistMessage', { name: user?.full_name || t('user') })}
                    </p>

                    <div className={styles.inviteContainer} style={{ marginTop: '30px' }}>
                        <h3 style={{ color: 'white', fontSize: '1.1rem', marginBottom: '15px' }}>
                            {t('gotInvite')}
                        </h3>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input
                                type="text"
                                placeholder={t('pasteCodeHere')}
                                value={inviteToken}
                                onChange={(e) => setInviteToken(e.target.value)}
                                className={styles.themeInput}
                                autoFocus
                            />
                            <button
                                className={styles.themeButton}
                                style={{ marginTop: 0, width: 'auto' }}
                                onClick={handleValidateInvite}
                                disabled={loading}
                            >
                                {loading ? '...' : <FontAwesomeIcon icon={faCheck} />}
                            </button>
                        </div>
                    </div>

                    <button onClick={handleLogout} className={styles.backButton} style={{ marginTop: '40px' }}>
                        <FontAwesomeIcon icon={faSignOutAlt} /> {t('logoutAndWait')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WaitlistPage;
