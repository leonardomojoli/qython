import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogleDrive } from '@fortawesome/free-brands-svg-icons';
import { useNotification } from '../../contexts/NotificationContext';
import { getPickerToken } from '../../api';
import { loadPickerApi } from './googlePickerLoader';

// Botão "Importar do Google Drive": mint de token curto no backend (getPickerToken) →
// abre o Google Picker (scope drive.file: grant-on-pick dá acesso aos arquivos escolhidos)
// → devolve os file_ids via onPicked. O caller chama importDocumentsFromDrive.
export default function DrivePickerButton({ className, style, onPicked, disabled }) {
  const { t, i18n } = useTranslation();
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(false);

  const handleOpen = useCallback(async () => {
    setLoading(true);
    try {
      const { access_token, api_key, app_id } = await getPickerToken();
      await loadPickerApi();

      const picker = window.google.picker;
      const view = new picker.DocsView(picker.ViewId.DOCS)
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);

      const builder = new picker.PickerBuilder()
        .enableFeature(picker.Feature.MULTISELECT_ENABLED)
        .setDeveloperKey(api_key)
        .setAppId(app_id)
        .setOAuthToken(access_token)
        .addView(view)
        .setLocale((i18n.language || 'pt').split('-')[0])
        .setCallback((data) => {
          const action = data[picker.Response.ACTION];
          if (action === picker.Action.PICKED) {
            const ids = (data[picker.Response.DOCUMENTS] || [])
              .map((d) => d[picker.Document.ID])
              .filter(Boolean);
            if (ids.length && typeof onPicked === 'function') onPicked(ids);
          }
          if (action === picker.Action.PICKED || action === picker.Action.CANCEL) {
            setLoading(false);
          }
        });

      builder.build().setVisible(true);
    } catch (e) {
      setLoading(false);
      const code = e?.response?.data?.detail?.code;
      if (code === 'CLOUD_NOT_CONNECTED' || code === 'CLOUD_REAUTH_REQUIRED') {
        addNotification(t('cloudReconnectNeeded', 'Conecte seu Google Drive primeiro.'), 'error');
      } else {
        addNotification(t('cloudPickerError', 'Não foi possível abrir o Google Drive.'), 'error');
      }
    }
  }, [t, i18n, addNotification, onPicked]);

  return (
    <button type="button" className={className} style={style} onClick={handleOpen} disabled={disabled || loading}>
      <FontAwesomeIcon icon={faGoogleDrive} />{' '}
      {loading ? t('cloudPickerLoading', 'Abrindo…') : t('cloudImportFromDrive', 'Importar do Drive')}
    </button>
  );
}
