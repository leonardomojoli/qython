// frontend/src/components/pharmacy/MyPrescriptions.js
import React, { useState, useEffect, useCallback } from 'react';
import styles from './MyPrescriptions.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faQrcode, faCopy, faPaperPlane, faEye, faCheck,
  faFilePrescription, faExternalLinkAlt, faSpinner
} from '@fortawesome/free-solid-svg-icons';
import { useNotification } from '../../contexts/NotificationContext';
import {
  getPrescriptions, createPrescriptionShareLink,
  getPrescriptionPharmacySends
} from '../../api';

const STATUS_LABELS = {
  sent: { label: 'prescriptionSent', color: '#3498db' },
  viewed: { label: 'prescriptionViewed', color: '#f1c40f' },
  fulfilled: { label: 'prescriptionFulfilled', color: '#27ae60' },
  cancelled: { label: 'cancelled', color: '#e74c3c' },
};

function MyPrescriptions() {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRx, setExpandedRx] = useState(null);
  const [pharmacySends, setPharmacySends] = useState({});
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

  const handleGenerateShareLink = async (rxId) => {
    setSharingId(rxId);
    try {
      const data = await createPrescriptionShareLink(rxId);
      if (data?.share_url) {
        await navigator.clipboard.writeText(data.share_url);
        addNotification(t('shareLinkCopied'), 'success');
      }
    } catch (err) {
      console.error(err);
      addNotification(t('error'), 'error');
    } finally {
      setSharingId(null);
    }
  };

  const handleToggleExpand = async (rxId) => {
    if (expandedRx === rxId) {
      setExpandedRx(null);
      return;
    }
    setExpandedRx(rxId);

    // Fetch pharmacy sends if not cached
    if (!pharmacySends[rxId]) {
      try {
        const sends = await getPrescriptionPharmacySends(rxId);
        setPharmacySends(prev => ({ ...prev, [rxId]: sends || [] }));
      } catch (err) {
        console.error(err);
      }
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
          <div className={styles.rxHeader} onClick={() => handleToggleExpand(rx.id)}>
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
              onClick={() => handleGenerateShareLink(rx.id)}
              disabled={sharingId === rx.id}
              title={t('generateShareLink')}
            >
              <FontAwesomeIcon icon={sharingId === rx.id ? faSpinner : faQrcode} spin={sharingId === rx.id} />
              <span>{t('shareLink')}</span>
            </button>
          </div>

          {/* Expanded: pharmacy sends */}
          {expandedRx === rx.id && (
            <div className={styles.expandedSection}>
              <h5 className={styles.sendsTitle}>{t('pharmacySends')}</h5>
              {pharmacySends[rx.id]?.length > 0 ? (
                <div className={styles.sendsList}>
                  {pharmacySends[rx.id].map(send => {
                    const statusConfig = STATUS_LABELS[send.status] || STATUS_LABELS.sent;
                    return (
                      <div key={send.id} className={styles.sendCard}>
                        <div className={styles.sendInfo}>
                          <span className={styles.sendPharmacy}>{send.pharmacy_name}</span>
                          {send.pharmacy_address && (
                            <span className={styles.sendAddress}>{send.pharmacy_address}</span>
                          )}
                        </div>
                        <div className={styles.sendStatus}>
                          <span
                            className={styles.statusBadge}
                            style={{ color: statusConfig.color, borderColor: statusConfig.color }}
                          >
                            {t(statusConfig.label)}
                          </span>
                          <span className={styles.sendDate}>{formatDate(send.sent_at)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.noSends}>{t('noPharmacySends')}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default MyPrescriptions;
