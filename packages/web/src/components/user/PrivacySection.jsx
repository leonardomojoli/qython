import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faShieldAlt,
  faDownload,
  faTrash,
  faSpinner,
  faCheck,
  faExclamationTriangle,
  faCopy,
  faPrint,
  faQrcode,
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  listMyConsents,
  grantConsent,
  revokeConsent,
  exportMyData,
  deleteMyAccount,
} from '../../api';
import styles from './PrivacySection.module.css';

const PATIENT_NOTICE_URL = 'https://qython.ai/paciente';

/**
 * Privacy settings panel (LGPD Direitos do Titular).
 *
 * Lets the user:
 * - Toggle 6 granular ML consents (opt-in, default OFF, expire in 12 months)
 * - Export all their personal data as a ZIP (Art. 18 V)
 * - Delete their account with double confirmation (Art. 18 VI)
 *
 * Visual style mirrors the rest of Profile.js settings blocks.
 */

const ML_SCOPES = [
  {
    type: 'ml_training_general',
    label: 'Treinamento do copiloto clínico geral',
    description: 'Permite que conversas e consultas anonimizadas sejam usadas para melhorar o copiloto.',
  },
  {
    type: 'ml_training_specialty',
    label: 'Treinamento por especialidade',
    description: 'Permite que dados anonimizados ajudem a treinar modelos especializados na sua área.',
  },
  {
    type: 'ml_training_image',
    label: 'Treinamento de modelos de imagem médica',
    description: 'Permite uso de imagens médicas anonimizadas (sem identificadores do paciente).',
  },
  {
    type: 'ml_training_voice',
    label: 'Treinamento de modelos de transcrição',
    description: 'Permite que áudios anonimizados ajudem a treinar a transcrição automática.',
  },
  {
    type: 'ml_training_feedback',
    label: 'Uso de feedback para melhorias (DPO)',
    description: 'Permite que seus likes/dislikes ajudem a ajustar as respostas do copiloto.',
  },
  {
    type: 'ml_research_publication',
    label: 'Pesquisa acadêmica anônima publicada',
    description: 'Permite uso em pesquisas acadêmicas publicadas (sempre com dados anonimizados).',
  },
];

const PrivacySection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [consents, setConsents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyScope, setBusyScope] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [deletingStage, setDeletingStage] = useState(null); // null | 'confirm' | 'final' | 'deleting'
  const [deleteError, setDeleteError] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyPatientLink = async () => {
    try {
      await navigator.clipboard.writeText(PATIENT_NOTICE_URL);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Erro ao copiar link:', err);
    }
  };

  const handlePrintQR = () => {
    const svg = document.getElementById('patient-notice-qr');
    if (!svg) return;
    const svgHtml = new XMLSerializer().serializeToString(svg);
    const win = window.open('', '_blank', 'width=420,height=520');
    if (!win) return;
    win.document.write(`
      <html><head><title>Qython — Aviso ao Paciente</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 32px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        p { color: #555; font-size: 13px; margin-top: 4px; }
        .url { margin-top: 16px; font-size: 13px; color: #333; word-break: break-all; }
      </style></head>
      <body>
        <h1>Transparência ao paciente</h1>
        <p>Aponte a câmera para saber como seus dados são protegidos no Qython</p>
        <div>${svgHtml}</div>
        <div class="url">${PATIENT_NOTICE_URL}</div>
        <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `);
    win.document.close();
  };

  const loadConsents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listMyConsents(false);
      setConsents(data);
    } catch (err) {
      console.error('Erro ao carregar consentimentos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConsents();
  }, [loadConsents]);

  const isScopeActive = (type) => {
    return consents.some(c => c.type === type && c.is_active);
  };

  const handleToggle = async (type) => {
    setBusyScope(type);
    try {
      if (isScopeActive(type)) {
        await revokeConsent(type);
      } else {
        await grantConsent(type);
      }
      await loadConsents();
    } catch (err) {
      console.error('Erro ao atualizar consentimento:', err);
      alert('Erro ao atualizar consentimento. Tente novamente.');
    } finally {
      setBusyScope(null);
    }
  };

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
        Você decide o que pode ser usado para melhorar nossos modelos.
        Todas as opções abaixo são opt-in e podem ser revogadas a qualquer momento.
        Dados de pacientes são <strong>sempre</strong> anonimizados antes de qualquer uso para treinamento.
      </p>

      {/* ML Consent Scopes */}
      <div className={styles.consentBlock}>
        <h5 className={styles.subheader}>Consentimentos para treinamento de IA</h5>

        {loading ? (
          <div className={styles.loading}>
            <FontAwesomeIcon icon={faSpinner} spin /> Carregando…
          </div>
        ) : (
          <div className={styles.scopesList}>
            {ML_SCOPES.map(scope => {
              const active = isScopeActive(scope.type);
              const busy = busyScope === scope.type;
              return (
                <div key={scope.type} className={styles.scopeRow}>
                  <label className={styles.toggleSwitch}>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => handleToggle(scope.type)}
                      disabled={busy}
                    />
                    <span className={styles.toggleSlider}></span>
                  </label>
                  <div className={styles.scopeText}>
                    <span className={styles.scopeLabel}>{scope.label}</span>
                    <span className={styles.scopeDescription}>{scope.description}</span>
                  </div>
                  {busy && <FontAwesomeIcon icon={faSpinner} spin className={styles.busyIcon} />}
                  {active && !busy && <FontAwesomeIcon icon={faCheck} className={styles.activeIcon} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

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

      {/* Patient transparency — shareable QR + link */}
      <div className={styles.consentBlock}>
        <h5 className={styles.subheader}>
          <FontAwesomeIcon icon={faQrcode} /> Transparência ao paciente
        </h5>
        <p className={styles.blockDescription}>
          Compartilhe com seus pacientes como os dados deles são tratados e
          protegidos. Imprima o QR code e cole na sala de espera, ou envie o
          link diretamente.
        </p>
        <div className={styles.patientShare}>
          <div className={styles.qrBox}>
            <QRCodeSVG
              id="patient-notice-qr"
              value={PATIENT_NOTICE_URL}
              size={140}
              level="M"
              marginSize={2}
            />
          </div>
          <div className={styles.patientShareActions}>
            <div className={styles.linkRow}>
              <code className={styles.linkText}>{PATIENT_NOTICE_URL}</code>
              <button className={styles.iconButton} onClick={handleCopyPatientLink}>
                <FontAwesomeIcon icon={linkCopied ? faCheck : faCopy} />
                {linkCopied ? ' Copiado' : ' Copiar'}
              </button>
            </div>
            <button className={styles.actionButton} onClick={handlePrintQR}>
              <FontAwesomeIcon icon={faPrint} /> Imprimir QR code
            </button>
            <a className={styles.plainLink} href={PATIENT_NOTICE_URL}
               target="_blank" rel="noopener noreferrer">
              Abrir a página do paciente
            </a>
          </div>
        </div>
      </div>

      <p className={styles.footnote}>
        Dúvidas? Contate o <a href="/encarregado">Encarregado pelo Tratamento de Dados</a>.
        <br />
        Mais informações: <a href="/paciente">Para o paciente</a> · <a href="/subprocessors">Sub-operadores</a>
      </p>
    </div>
  );
};

export default PrivacySection;
