import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../../contexts/UserContext';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faTimes } from '@fortawesome/free-solid-svg-icons';
import { hasPlatformAccess } from '../../utils/access';
import LatreoVerifyButton from '../user/LatreoVerifyButton';

// Dispensar é POR SESSÃO (sessionStorage): some o banner até o usuário fechar a aba/navegador,
// e volta a cobrar na próxima sessão. A verificação em si continua acessível pela seção do Perfil.
const DISMISS_KEY = 'qython_verifybanner_dismissed';

const VerificationBanner = () => {
    const { user, loadingUser } = useUser();
    const location = useLocation();
    const { t } = useTranslation();
    const [dismissed, setDismissed] = useState(() => {
        try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch (_) { return false; }
    });

    // Páginas onde o banner NÃO deve aparecer
    const hiddenRoutes = ['/waitlist', '/login', '/register', '/', '/pricing', '/terms-of-use', '/privacy-policy'];

    if (loadingUser || dismissed) {
        return null;
    }
    if (hiddenRoutes.some(route => location.pathname.startsWith(route) || location.pathname === route)) {
        return null;
    }
    // Não mostrar se: não houver usuário, já tem ACESSO (admin / Latreo-verificado / acesso
    // concedido pelo Qython), ou foi rejeitado (rejeitado tem sua própria tela).
    if (!user || hasPlatformAccess(user) || user.verification_status === 'rejected') {
        return null;
    }

    const dismiss = () => {
        try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (_) { /* noop */ }
        setDismissed(true);
    };

    // Estilos inline para simplicidade e garantia de z-index alto
    const styles = {
        container: {
            backgroundColor: '#ff9800',
            color: '#121212',
            padding: '8px 16px',
            fontWeight: '600',
            fontSize: '0.9rem',
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            zIndex: 9999,
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            flexWrap: 'wrap',
            boxSizing: 'border-box',
        },
        button: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: '#121212',
            color: '#fff',
            border: 'none',
            borderRadius: '20px',
            padding: '6px 16px',
            fontSize: '0.85rem',
            fontWeight: '700',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        },
        close: {
            background: 'transparent',
            border: 'none',
            color: '#121212',
            cursor: 'pointer',
            fontSize: '1rem',
            padding: '4px 8px',
            lineHeight: 1,
            opacity: 0.7,
        },
    };

    return (
        <div style={styles.container}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <FontAwesomeIcon icon={faClock} />
                {t('verifyBannerPrompt', 'Conclua sua verificação para liberar as funções de IA (geração de conteúdo, copiloto e consultas).')}
            </span>
            <LatreoVerifyButton style={styles.button} />
            <button type="button" style={styles.close} onClick={dismiss} aria-label={t('dismiss', 'Dispensar')} title={t('dismiss', 'Dispensar')}>
                <FontAwesomeIcon icon={faTimes} />
            </button>
        </div>
    );
};

export default VerificationBanner;
