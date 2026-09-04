import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../contexts/UserContext';
import LatreoVerificationModal, { LatreoResult } from '../auth/LatreoVerificationModal';
import api from '../../services/api';

// occupation é texto localizado; normaliza p/ decidir o fluxo Latreo (estudante vs médico).
const STUDENT_OCCUPATIONS = [
  'estudante de medicina', 'estudante', 'medical student', 'student',
  'estudiante de medicina', 'estudiante',
];

interface Props {
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  label?: string;
}

// Botão "Verificar agora" REUTILIZÁVEL (paridade com o web): abre o modal Latreo, confirma
// server-side e dá refreshUser — o banner some / a seção do perfil atualiza sem reload.
export default function LatreoVerifyButton({ style, textStyle, label }: Props) {
  const { user, refreshUser } = useUser();
  const { t, i18n } = useTranslation();
  const [visible, setVisible] = useState(false);

  const occ = (user?.occupation || '').trim().toLowerCase();
  const kind: 'doctor' | 'student' = STUDENT_OCCUPATIONS.includes(occ) ? 'student' : 'doctor';

  const handleVerified = async ({ session_id }: LatreoResult) => {
    if (!session_id) return;
    try {
      await api.post('/verification/lastreo/confirm', { session_id });
    } catch {
      // O webhook/scheduler reconcilia mesmo se o confirm falhar.
    } finally {
      await refreshUser();
    }
  };

  return (
    <>
      <TouchableOpacity style={style} onPress={() => setVisible(true)} activeOpacity={0.85}>
        <Text style={textStyle}>{label || t('verifyNow', 'Verificar agora')}</Text>
      </TouchableOpacity>
      <LatreoVerificationModal
        visible={visible}
        onClose={() => setVisible(false)}
        onVerified={handleVerified}
        locale={i18n.language.split('-')[0]}
        kind={kind}
      />
    </>
  );
}
