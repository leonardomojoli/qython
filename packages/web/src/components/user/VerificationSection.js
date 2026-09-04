import React from 'react';
import { useUser } from '../../contexts/UserContext';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faShieldHalved, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import LatreoVerifyButton from './LatreoVerifyButton';

// Seção de verificação de identidade no Perfil — ponto de entrada PERMANENTE (além do banner).
// Mostra o estado (verificado / acesso concedido / pendente / rejeitado) e oferece o mesmo
// fluxo Latreo via LatreoVerifyButton.
export default function VerificationSection() {
    const { user } = useUser();
    const { t } = useTranslation();
    if (!user || user.is_admin) return null;

    const vs = user.verification_status;
    const isVerified = vs === 'verified';
    const isRejected = vs === 'rejected';
    const granted = !!user.access_granted;

    const card = {
        background: 'rgba(30, 30, 40, 0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '14px',
        padding: '18px 20px',
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    };
    const header = { display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '1.05rem' };
    const desc = { color: '#b8b8c0', fontSize: '0.92rem', lineHeight: 1.5, margin: 0 };
    const cta = {
        alignSelf: 'flex-start',
        marginTop: '6px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        background: 'linear-gradient(135deg, #bb86fc 0%, #9a67ea 100%)',
        color: '#fff',
        border: 'none',
        borderRadius: '10px',
        padding: '10px 18px',
        fontSize: '0.9rem',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 4px 15px rgba(187, 134, 252, 0.35)',
    };

    if (isVerified) {
        return (
            <div style={card}>
                <div style={{ ...header, color: '#4caf50' }}>
                    <FontAwesomeIcon icon={faCircleCheck} />
                    {t('verificationVerifiedTitle', 'Identidade verificada')}
                </div>
                <p style={desc}>
                    {t('verificationVerifiedDesc', 'Seu registro médico está confirmado. Acesso completo liberado.')}
                    {user.verification_tier ? ` · ${user.verification_tier}` : ''}
                </p>
            </div>
        );
    }

    return (
        <div style={card}>
            <div style={{ ...header, color: isRejected ? '#ff7043' : '#bb86fc' }}>
                <FontAwesomeIcon icon={isRejected ? faTriangleExclamation : faShieldHalved} />
                {t('verificationSectionTitle', 'Verificação de identidade médica')}
            </div>
            <p style={desc}>
                {granted
                    ? t('verificationGrantedDesc', 'Seu acesso já está liberado. Verificar sua identidade médica adiciona o selo verificado ao seu perfil.')
                    : isRejected
                        ? t('latreoRejectedDesc', 'Não foi possível confirmar seu registro profissional. Tente novamente.')
                        : t('verificationPendingDesc', 'Verifique sua identidade médica (rápido: CRM + UF) para liberar copiloto, materiais e consultas.')}
            </p>
            {isRejected && user.verification_notes && (
                <div style={{ ...desc, color: '#ff8a65', background: 'rgba(255,112,67,0.08)', padding: '8px 12px', borderRadius: '8px' }}>
                    <strong>{t('reasonLabel', 'Motivo')}:</strong> {user.verification_notes}
                </div>
            )}
            <LatreoVerifyButton style={cta} />
        </div>
    );
}
