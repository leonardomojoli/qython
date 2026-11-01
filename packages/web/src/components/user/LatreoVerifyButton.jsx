import React, { useState } from 'react';
import { useUser } from '../../contexts/UserContext';
import { useTranslation } from 'react-i18next';
import { useNotification } from '../../contexts/NotificationContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldAlt } from '@fortawesome/free-solid-svg-icons';
import { API_URL as API_BASE_URL } from '../../config';
import LatreoVerificationModal from './LatreoVerificationModal';

// Ocupação é texto localizado (sem enum); normaliza p/ decidir o fluxo Latreo:
// estudante reabre o fluxo acadêmico (kind=student), os demais o de registro (médico).
const STUDENT_OCCUPATIONS = [
  'estudante de medicina', 'estudante', 'medical student', 'student',
  'estudiante de medicina', 'estudiante',
];

// Botão "Verificar agora" REUTILIZÁVEL: abre o LatreoVerificationModal, confirma o resultado
// server-side (fonte da verdade) e atualiza o usuário no contexto — então o banner some / a
// seção do perfil atualiza e as features destravam sem reload. Usado no VerificationBanner
// (global) e na VerificationSection (perfil). Estilo vem por className/style/children do caller.
export default function LatreoVerifyButton({ className, style, children, onDone }) {
  const { user, setUser } = useUser();
  const { t, i18n } = useTranslation();
  const { addNotification } = useNotification();
  const [open, setOpen] = useState(false);

  const occ = (user?.occupation || '').trim().toLowerCase();
  const kind = STUDENT_OCCUPATIONS.includes(occ) ? 'student' : 'doctor';

  const handleVerified = async ({ session_id }) => {
    if (!session_id) return;
    try {
      const token = localStorage.getItem('authToken');
      const resp = await fetch(`${API_BASE_URL}/verification/lastreo/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ session_id }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.verification_status) {
        setUser(prev => ({
          ...prev,
          verification_status: data.verification_status,
          verification_tier: data.verification_tier,
          verification_notes: null,
        }));
        if (data.verification_status !== 'verified') {
          // Webhook / scheduler reconcilia logo (ex.: corrida do tier do estudante).
          addNotification(t('verifyProcessing', 'Verificação em processamento. Suas funções serão liberadas em instantes.'), 'info');
        }
        if (typeof onDone === 'function') onDone(data);
      } else {
        addNotification(t('latreoVerifyError', 'Não foi possível confirmar a verificação.'), 'error');
      }
    } catch (error) {
      // O webhook reconcilia o status mesmo se o confirm falhar.
      addNotification(t('verifyProcessing', 'Verificação em processamento. Suas funções serão liberadas em instantes.'), 'info');
    }
  };

  return (
    <>
      <button type="button" className={className} style={style} onClick={() => setOpen(true)}>
        {children || (<><FontAwesomeIcon icon={faShieldAlt} /> {t('verifyNow', 'Verificar agora')}</>)}
      </button>
      <LatreoVerificationModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onVerified={handleVerified}
        locale={i18n.language.split('-')[0]}
        kind={kind}
      />
    </>
  );
}
