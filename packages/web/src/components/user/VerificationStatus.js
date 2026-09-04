import React, { useState } from 'react';
import { useUser } from '../../contexts/UserContext';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faShieldAlt } from '@fortawesome/free-solid-svg-icons';
import styles from './VerificationStatus.module.css';
import LatreoVerificationModal from './LatreoVerificationModal';

import { API_URL as API_BASE_URL } from '../../config';
import { hasPlatformAccess } from '../../utils/access';

const VerificationStatus = ({ children }) => {
    const { user, setUser } = useUser();
    const { t, i18n } = useTranslation();
    const [message, setMessage] = useState('');
    const [showLatreoModal, setShowLatreoModal] = useState(false);

    // 1. Se não tiver usuário, ou já tem ACESSO (admin / Latreo-verificado / acesso
    // concedido pelo Qython), libera tudo — inclusive quem foi rejeitado pelo Latreo
    // mas teve acesso concedido manualmente.
    if (!user || hasPlatformAccess(user)) {
        return children;
    }

    // 2. Em análise (pending ou manual_review): LIBERA a navegação. O bloqueio das
    // features de IA é feito nos componentes individuais (via hasPlatformAccess).
    if (user.verification_status === 'pending' || user.verification_status === 'manual_review') {
        return children;
    }

    // 3. REJEITADO: a re-verificação é SÓ via Latreo (o Latreo é a única autoridade
    // de verificação — não há mais upload/KYC interno). Estudante reabre o fluxo
    // acadêmico (kind=student); os demais, o fluxo de registro profissional.
    if (user.verification_status === 'rejected') {
        const _occ = (user.occupation || '').trim().toLowerCase();
        const reverifyKind = ['estudante de medicina', 'estudante', 'medical student', 'student', 'estudiante de medicina', 'estudiante'].includes(_occ) ? 'student' : 'doctor';

        const handleLatreoVerified = async ({ session_id }) => {
            if (!session_id) return;
            try {
                const token = localStorage.getItem('authToken');
                const resp = await fetch(`${API_BASE_URL}/verification/lastreo/confirm`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ session_id }),
                });
                const data = await resp.json();
                if (resp.ok) {
                    setUser(prev => ({
                        ...prev,
                        verification_status: data.verification_status,
                        verification_tier: data.verification_tier,
                        verification_notes: null,
                    }));
                } else {
                    setMessage(t('latreoVerifyError', 'Não foi possível confirmar a verificação.'));
                }
            } catch (error) {
                // The webhook will reconcile the status shortly.
                setMessage(t('latreoVerifyError', 'Não foi possível confirmar a verificação.'));
            }
        };

        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <FontAwesomeIcon icon={faExclamationTriangle} className={styles.iconError} />
                    <h2>{t('verificationNotAcceptedTitle', 'Verificação Não Concluída')}</h2>
                    <p>{t('latreoRejectedDesc', 'Não foi possível confirmar seu registro profissional. Tente novamente.')}</p>

                    {user.verification_notes && (
                        <div className={styles.reasonBox}>
                            <strong>Motivo:</strong> {user.verification_notes}
                        </div>
                    )}

                    <div className={styles.uploadArea}>
                        <button onClick={() => setShowLatreoModal(true)} className={styles.btnSubmit}>
                            <FontAwesomeIcon icon={faShieldAlt} /> {t('latreoVerifyButton', 'Verificar identidade médica')}
                        </button>
                        {message && <p style={{ color: '#ff5252', marginTop: '10px' }}>{message}</p>}
                    </div>
                </div>
                <LatreoVerificationModal
                    isOpen={showLatreoModal}
                    onClose={() => setShowLatreoModal(false)}
                    onVerified={handleLatreoVerified}
                    locale={i18n.language.split('-')[0]}
                    kind={reverifyKind}
                />
            </div>
        );
    }

    return children;
};

export default VerificationStatus;
