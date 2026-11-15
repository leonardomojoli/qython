import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faShieldAlt,
  faDownload,
  faTrash,
  faSpinner,
  faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import {
  exportMyData,
  deleteMyAccount,
} from '../../api';
import styles from './PrivacySection.module.css';

/**
 * Privacy settings panel (LGPD Direitos do Titular).
 *
 * Lets the user:
 * - Export all their personal data as a ZIP (Art. 18 V)
 * - Delete their account with double confirmation (Art. 18 VI)
 *
 * Visual style mirrors the rest of Profile.js settings blocks.
 */

const PrivacySection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Só exportar e excluir: são direitos do titular (LGPD) e valem em qualquer instalação.
  const [exporting, setExporting] = useState(false);
  const [deletingStage, setDeletingStage] = useState(null); // null | 'confirm' | 'final' | 'deleting'
  const [deleteError, setDeleteError] = useState(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportMyData();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `qython_data_export_${ts}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao exportar dados:', err);
      alert('Erro ao exportar dados. Tente novamente em alguns instantes.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingStage('deleting');
    setDeleteError(null);
    try {
      await deleteMyAccount();
      // After deletion: clear local state and bounce to landing
      window.localStorage.clear();
      window.sessionStorage.clear();
      navigate('/');
      window.location.reload();
    } catch (err) {
      console.error('Erro ao excluir conta:', err);
      setDeleteError('Não foi possível excluir a conta agora. Tente novamente ou contate o suporte.');
      setDeletingStage('final');
    }
  };

  return (
    <div className={styles.privacySection}>
      <h4 className={styles.sectionHeader}>
        <FontAwesomeIcon icon={faShieldAlt} className={styles.sectionIcon} />
        Privacidade e dados (LGPD)
      </h4>
      <p className={styles.sectionDescription}>
        Seus dados ficam no banco desta instalação. Você pode baixar uma cópia de
        tudo ou excluir a sua conta a qualquer momento.
      </p>

      {/* Data Export */}
      <div className={styles.consentBlock}>
        <h5 className={styles.subheader}>Exportar meus dados (Art. 18 V)</h5>
        <p className={styles.blockDescription}>
          Baixe um arquivo ZIP com todos os seus dados pessoais em formato JSON estruturado.
        </p>
        <button
          className={styles.actionButton}
          onClick={handleExport}
          disabled={exporting}
        >
          <FontAwesomeIcon icon={exporting ? faSpinner : faDownload} spin={exporting} />
          {exporting ? ' Gerando arquivo…' : ' Baixar meus dados'}
        </button>
      </div>

      {/* Delete Account */}
      <div className={`${styles.consentBlock} ${styles.danger}`}>
        <h5 className={styles.subheader}>Excluir minha conta (Art. 18 VI)</h5>
        <p className={styles.blockDescription}>
          Remove sua conta e dados associados. Dados anonimizados (sem vínculo
          com você) são preservados conforme Art. 12 da LGPD. Esta ação é
          <strong> irreversível</strong>.
        </p>

        {deletingStage === null && (
          <button
            className={`${styles.actionButton} ${styles.dangerButton}`}
            onClick={() => setDeletingStage('confirm')}
          >
            <FontAwesomeIcon icon={faTrash} /> Excluir minha conta
          </button>
        )}

        {deletingStage === 'confirm' && (
          <div className={styles.confirmBox}>
            <FontAwesomeIcon icon={faExclamationTriangle} className={styles.warnIcon} />
            <p>
              Tem certeza? Suas consultas, pacientes, conversas com o copiloto
              e materiais acadêmicos serão removidos.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setDeletingStage(null)}
              >
                Cancelar
              </button>
              <button
                className={`${styles.actionButton} ${styles.dangerButton}`}
                onClick={() => setDeletingStage('final')}
              >
                Sim, prosseguir
              </button>
            </div>
          </div>
        )}

        {deletingStage === 'final' && (
          <div className={styles.confirmBox}>
            <FontAwesomeIcon icon={faExclamationTriangle} className={styles.warnIcon} />
            <p>
              <strong>Confirmação final.</strong> Após clicar abaixo, sua conta
              será marcada para exclusão imediatamente. O processo completo de
              limpeza pode levar alguns minutos.
            </p>
            {deleteError && <p className={styles.errorMessage}>{deleteError}</p>}
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelButton}
                onClick={() => { setDeletingStage(null); setDeleteError(null); }}
              >
                Cancelar
              </button>
              <button
                className={`${styles.actionButton} ${styles.dangerButton}`}
                onClick={handleDeleteAccount}
              >
                Excluir definitivamente
              </button>
            </div>
          </div>
        )}

        {deletingStage === 'deleting' && (
          <div className={styles.confirmBox}>
            <FontAwesomeIcon icon={faSpinner} spin /> Excluindo…
          </div>
        )}
      </div>
    </div>
  );
};

export default PrivacySection;
