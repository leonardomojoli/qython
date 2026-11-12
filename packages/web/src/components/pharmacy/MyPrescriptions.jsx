// frontend/src/components/pharmacy/MyPrescriptions.js
import React, { useState, useEffect, useCallback } from 'react';
import styles from './MyPrescriptions.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFilePrescription, faSpinner, faShareFromSquare
} from '@fortawesome/free-solid-svg-icons';
import { useNotification } from '../../contexts/NotificationContext';
import { getPrescriptions, getPrescriptionPdf } from '../../api';

function MyPrescriptions() {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharingId, setSharingId] = useState(null);

  const fetchPrescriptions = useCallback(async () => {
    try {
      const data = await getPrescriptions();
      setPrescriptions(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrescriptions();
  }, [fetchPrescriptions]);


  // Folha de compartilhar do sistema (WhatsApp, e-mail...) quando o navegador aceita
  // arquivo; senão, baixa o PDF para o médico anexar onde quiser.
  const handleSharePdf = async (rxId) => {
    setSharingId(rxId);
    try {
      const blob = await getPrescriptionPdf(rxId);
      const file = new File([blob], `receita_${rxId}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${t('prescription')} #${rxId}` });
        } catch (err) {
          if (err?.name !== 'AbortError') throw err;
        }
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        addNotification(t('prescriptionPdfDownloaded', 'PDF da receita baixado.'), 'success');
      }
    } catch (err) {
      console.error(err);
      addNotification(t('error'), 'error');
    } finally {
      setSharingId(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <FontAwesomeIcon icon={faSpinner} spin />
        <span>{t('loading')}...</span>
      </div>
    );
  }

  if (prescriptions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <FontAwesomeIcon icon={faFilePrescription} className={styles.emptyIcon} />
        <p>{t('noPrescriptions')}</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {prescriptions.map(rx => (
        <div key={rx.id} className={styles.rxCard}>
          <div className={styles.rxHeader}>
            <div className={styles.rxInfo}>
              <h4 className={styles.rxTitle}>
                {t('prescription')} #{rx.id}
              </h4>
              <span className={styles.rxDate}>{formatDate(rx.created_at)}</span>
              <span className={styles.rxType}>{rx.prescription_type}</span>
            </div>
            <div className={styles.rxMeds}>
              {(rx.items || []).slice(0, 3).map((item, i) => (
                <span key={i} className={styles.medPill}>{item.medication}</span>
              ))}
              {(rx.items || []).length > 3 && (
                <span className={styles.medMore}>+{rx.items.length - 3}</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className={styles.rxActions}>
              <button
                className={styles.actionBtn}
                onClick={() => handleSharePdf(rx.id)}
                disabled={sharingId === rx.id}
              >
                <FontAwesomeIcon icon={sharingId === rx.id ? faSpinner : faShareFromSquare} spin={sharingId === rx.id} />
                <span>{t('sharePrescriptionPdf', 'Compartilhar PDF')}</span>
              </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default MyPrescriptions;
