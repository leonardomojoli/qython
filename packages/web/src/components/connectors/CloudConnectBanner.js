import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudArrowUp, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { useConnectorStatus } from '../../hooks/useConnectorStatus';
import DriveConnectButton from './DriveConnectButton';
import styles from './CloudConnectBanner.module.css';

// Banner de CTA "conecte sua nuvem" para a Biblioteca (estilo Conectores). Some quando já
// conectado. Em 'revoked', vira aviso de reconexão. onConnected propaga o refetch do caller
// (ex.: recarregar as bibliotecas). O bloqueio DURO de ações fica no backend (403 quando a
// flag CLOUD_LIBRARY_REQUIRED liga); aqui é o nudge visível estilo Claude/ChatGPT/Gemini.
export default function CloudConnectBanner({ onConnected }) {
  const { t } = useTranslation();
  const { isConnected, isRevoked, loading, refetch } = useConnectorStatus();

  if (loading || isConnected) return null;

  const handleConnected = (data) => {
    refetch();
    if (typeof onConnected === 'function') onConnected(data);
  };

  return (
    <div className={`${styles.banner} ${isRevoked ? styles.revoked : ''}`}>
      <div className={styles.icon}>
        <FontAwesomeIcon icon={isRevoked ? faTriangleExclamation : faCloudArrowUp} />
      </div>
      <div className={styles.text}>
        <div className={styles.title}>
          {isRevoked
            ? t('cloudReconnectTitle', 'Reconecte seu Google Drive')
            : t('cloudConnectTitle', 'Guarde seus arquivos na sua nuvem')}
        </div>
        <div className={styles.subtitle}>
          {isRevoked
            ? t('cloudReconnectBanner', 'O acesso ao seu Drive expirou. Reconecte para voltar a adicionar e abrir arquivos.')
            : t('cloudConnectSubtitle', 'Conecte o Google Drive: os originais ficam na sua conta, sem limite de arquivos. A inteligência fica no Qython.')}
        </div>
      </div>
      <DriveConnectButton className={styles.cta} onConnected={handleConnected} />
    </div>
  );
}
