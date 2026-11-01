import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotification } from '../../contexts/NotificationContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogleDrive } from '@fortawesome/free-brands-svg-icons';
import { getConnectDriveUrl } from '../../api';

// Botão "Conectar Google Drive" REUTILIZÁVEL: abre a tela de consentimento numa popup e
// escuta o postMessage do callback (qython.connector.connected). Ao conectar, chama
// onConnected (refetch do status) — sem reload. Origem travada em window.location.origin
// (o callback é servido do mesmo domínio, qython.ai). Estilo vem por className do caller.
export default function DriveConnectButton({ className, style, children, onConnected }) {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const popupRef = useRef(null);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return; // trava a origem
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'qython.connector.connected') {
        setLoading(false);
        try { popupRef.current?.close(); } catch (e) { /* noop */ }
        addNotification(t('cloudConnectedToast', 'Google Drive conectado!'), 'success');
        if (typeof onConnected === 'function') onConnected(data);
      } else if (data.type === 'qython.connector.error') {
        setLoading(false);
        addNotification(data.message || t('cloudConnectError', 'Não foi possível conectar sua nuvem.'), 'error');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [t, addNotification, onConnected]);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    try {
      const authUrl = await getConnectDriveUrl();
      if (!authUrl) throw new Error('no auth url');
      const w = 520, h = 640;
      const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
      popupRef.current = window.open(
        authUrl, 'qython_connect_drive',
        `width=${w},height=${h},left=${left},top=${top},noopener=no`
      );
      if (!popupRef.current) {
        setLoading(false);
        addNotification(t('cloudPopupBlocked', 'Permita popups para conectar sua nuvem.'), 'error');
      }
    } catch (e) {
      setLoading(false);
      addNotification(t('cloudConnectError', 'Não foi possível iniciar a conexão.'), 'error');
    }
  }, [t, addNotification]);

  return (
    <button type="button" className={className} style={style} onClick={handleConnect} disabled={loading}>
      {children || (
        <>
          <FontAwesomeIcon icon={faGoogleDrive} />{' '}
          {loading ? t('cloudConnecting', 'Conectando…') : t('cloudConnectCta', 'Conectar Google Drive')}
        </>
      )}
    </button>
  );
}
