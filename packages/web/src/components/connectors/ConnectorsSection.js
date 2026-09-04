import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogleDrive, faMicrosoft, faDropbox } from '@fortawesome/free-brands-svg-icons';
import { faCircleCheck, faPlug } from '@fortawesome/free-solid-svg-icons';
import { useConnectorStatus } from '../../hooks/useConnectorStatus';
import { disconnectDrive } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import DriveConnectButton from './DriveConnectButton';
import styles from './ConnectorsSection.module.css';

// Seção "Conectores" do Perfil (estilo Claude/ChatGPT/Gemini): cards por provedor de nuvem.
// v1 = Google Drive (ativo); OneDrive/Dropbox aparecem como "em breve" para sinalizar o roadmap.
export default function ConnectorsSection() {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const { isConnected, isRevoked, accountEmail, loading, refetch } = useConnectorStatus();

  const handleDisconnect = async () => {
    const msg = t('cloudDisconnectConfirm',
      'Desconectar seu Google Drive? Os arquivos permanecem na sua nuvem, mas o Qython perde acesso a eles até você reconectar.');
    if (!window.confirm(msg)) return;
    await disconnectDrive();
    addNotification(t('cloudDisconnected', 'Google Drive desconectado.'), 'info');
    refetch();
  };

  const comingSoon = [
    { name: 'OneDrive', icon: faMicrosoft, color: '#0078D4' },
    { name: 'Dropbox', icon: faDropbox, color: '#0061FF' },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}><FontAwesomeIcon icon={faPlug} /> {t('connectorsTitle', 'Conectores')}</h2>
        <p className={styles.subtitle}>
          {t('connectorsSubtitle', 'Seus arquivos ficam na sua nuvem; a inteligência fica no Qython.')}
        </p>
      </div>

      {/* Google Drive */}
      <div className={`${styles.card} ${isConnected ? styles.cardConnected : ''} ${isRevoked ? styles.cardRevoked : ''}`}>
        <div className={styles.cardIcon} style={{ color: '#0F9D58' }}>
          <FontAwesomeIcon icon={faGoogleDrive} />
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardName}>Google Drive</div>
          {loading ? (
            <div className={styles.cardStatus}>…</div>
          ) : isConnected ? (
            <div className={`${styles.cardStatus} ${styles.statusOk}`}>
              <FontAwesomeIcon icon={faCircleCheck} /> {accountEmail || t('cloudConnected', 'Conectado')}
            </div>
          ) : isRevoked ? (
            <div className={`${styles.cardStatus} ${styles.statusRevoked}`}>
              {t('cloudReconnectNeeded', 'Acesso expirado — reconecte sua conta')}
            </div>
          ) : (
            <div className={styles.cardStatus}>{t('cloudNotConnected', 'Não conectado')}</div>
          )}
        </div>
        <div className={styles.cardAction}>
          {isConnected ? (
            <button type="button" className={styles.disconnectBtn} onClick={handleDisconnect}>
              {t('cloudDisconnect', 'Desconectar')}
            </button>
          ) : (
            <DriveConnectButton className={styles.connectBtn} onConnected={refetch} />
          )}
        </div>
      </div>

      {/* OneDrive / Dropbox — em breve */}
      {comingSoon.map((p) => (
        <div key={p.name} className={`${styles.card} ${styles.cardSoon}`}>
          <div className={styles.cardIcon} style={{ color: p.color }}>
            <FontAwesomeIcon icon={p.icon} />
          </div>
          <div className={styles.cardBody}>
            <div className={styles.cardName}>{p.name}</div>
          </div>
          <div className={styles.cardAction}>
            <span className={styles.soonBadge}>{t('connectorComingSoon', 'Em breve')}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
