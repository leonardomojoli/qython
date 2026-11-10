// Conectar o celular: o médico liga o acesso pela rede local (app desktop), gera um código e
// escaneia o QR code no app do celular. O contrato está em docs/PAREAMENTO.md.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMobileScreenButton, faTrash } from '@fortawesome/free-solid-svg-icons';
import { api } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import styles from './PrivacySection.module.css';
import local from './PairingSection.module.css';

/** O que o QR code leva (docs/PAREAMENTO.md): endereços, impressão digital do certificado e código. */
export function pairingPayload({ addresses, fingerprint, code }) {
  return JSON.stringify({ t: 'qython-pair', v: 1, a: addresses, f: fingerprint || null, c: code });
}

/** "AB12 CD34 EF56 7890 1A2B": o que o celular mostra no pareamento digitado, para o médico conferir. */
export function formatFingerprint(fingerprint) {
  return (String(fingerprint).slice(0, 20).toUpperCase().match(/.{1,4}/g) || []).join(' ');
}

function formatDate(iso) {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'nunca' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatRemaining(seconds) {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const PairingSection = () => {
  const { addNotification } = useNotification();
  const bridge = typeof window !== 'undefined' ? window.qythonDesktop?.lan : undefined;

  // No app desktop o acesso vem da porta da rede local; num servidor, do próprio endereço da página
  // (que só serve se for HTTPS: o celular não fala com um endereço sem criptografia).
  const [lan, setLan] = useState(null);
  const [devices, setDevices] = useState([]);
  const [pairing, setPairing] = useState(null); // {code, displayCode, expiresAt}
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const knownDevices = useRef(null);

  const serverAccess = useMemo(() => {
    if (bridge) return null;
    const secure = window.location.protocol === 'https:';
    return { enabled: true, listening: secure, addresses: secure ? [window.location.origin] : [], fingerprint: null, secure };
  }, [bridge]);

  const access = bridge ? lan : serverAccess;
  const ready = !!access?.listening && access.addresses?.length > 0;

  const loadDevices = useCallback(async () => {
    try {
      const { data } = await api.get('/pairing/devices');
      setDevices(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!bridge) return undefined;
    let alive = true;
    bridge.status().then((s) => { if (alive) setLan(s); }).catch(() => {});
    return () => { alive = false; };
  }, [bridge]);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // Com um código na tela, acompanha o relógio e avisa quando um celular entrar.
  useEffect(() => {
    if (!pairing) return undefined;
    knownDevices.current = new Set(devices.map((d) => d.id));
    const tick = () => {
      const left = Math.round((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) setPairing(null);
    };
    tick();
    const clock = setInterval(tick, 1000);
    const poll = setInterval(async () => {
      const list = await loadDevices();
      if (list && list.some((d) => !knownDevices.current.has(d.id))) {
        setPairing(null);
        addNotification('Celular pareado.', 'success');
      }
    }, 3000);
    return () => { clearInterval(clock); clearInterval(poll); };
    // O relógio depende só do código atual; a lista de aparelhos é relida pelo próprio intervalo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairing?.code]);

  const toggle = async (value) => {
    setBusy(true);
    try {
      setLan(await bridge.setEnabled(value));
      if (!value) setPairing(null);
    } catch (err) {
      addNotification(err?.message || 'Não foi possível mudar o acesso do celular.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const startPairing = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/pairing/start');
      setPairing({ code: data.code, displayCode: data.display_code, expiresAt: data.expires_at });
    } catch (err) {
      addNotification(err?.response?.data?.detail || 'Não foi possível gerar o código.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (device) => {
    if (!window.confirm(`Remover "${device.name}"? O celular perde o acesso na hora e precisa ser pareado de novo.`)) return;
    try {
      await api.delete(`/pairing/devices/${device.id}`);
      setDevices((list) => list.filter((d) => d.id !== device.id));
      addNotification('Celular removido.', 'success');
    } catch (err) {
      addNotification(err?.response?.data?.detail || 'Não foi possível remover o celular.', 'error');
    }
  };

  const qrValue = pairing && ready
    ? pairingPayload({ addresses: access.addresses, fingerprint: access.fingerprint, code: pairing.code })
    : null;

  return (
    <div className={styles.privacySection} data-testid="pairing-section">
      <h4 className={styles.sectionHeader}>
        <FontAwesomeIcon icon={faMobileScreenButton} className={styles.sectionIcon} />
        Conectar o celular
      </h4>
      <p className={local.description}>
        Use o Qython no celular com os dados deste computador, sem enviar nada para a internet: o celular
        conversa direto com o computador, na mesma rede Wi-Fi. Nada fica guardado em servidor nenhum.
      </p>

      {bridge && (
        <label className={local.switchRow}>
          <input
            type="checkbox"
            checked={!!lan?.enabled}
            disabled={busy || !lan}
            onChange={(e) => toggle(e.target.checked)}
          />
          <span>Permitir o celular nesta rede</span>
        </label>
      )}
      {bridge && lan?.enabled && !lan.listening && (
        <p className={local.warning}>{lan.error || 'Abrindo a porta da rede…'}</p>
      )}
      {bridge && lan?.listening && (
        <p className={local.hint}>
          Se o sistema perguntar sobre o firewall, permita o acesso em <strong>redes privadas</strong>.
          O celular só consegue entrar se estiver no mesmo Wi-Fi e com o código abaixo.
        </p>
      )}
      {!bridge && serverAccess && !serverAccess.secure && (
        <p className={local.warning}>
          Este servidor está em um endereço sem HTTPS, e o celular só fala com endereços criptografados.
          Configure o HTTPS do servidor (certificado de uma autoridade) para parear o celular.
        </p>
      )}

      {ready && !pairing && (
        <div>
          <button type="button" className={styles.actionButton} onClick={startPairing} disabled={busy}>
            Parear um celular
          </button>
        </div>
      )}

      {ready && pairing && qrValue && (
        <div className={local.pairBox}>
          <div className={styles.qrBox}>
            <QRCodeSVG value={qrValue} size={200} level="M" marginSize={2} />
          </div>
          <div className={local.pairSteps}>
            <ol>
              <li>Abra o Qython no celular e escolha <strong>Parear com o computador</strong>.</li>
              <li>Aponte a câmera para este QR code.</li>
            </ol>
            <p className={local.hint}>
              Sem câmera? Digite o endereço <code>{access.addresses[0]}</code> e o código
              {' '}<code className={local.code}>{pairing.displayCode}</code>.
            </p>
            {access.fingerprint && (
              <p className={local.hint}>
                Nesse caso o celular mostra uma impressão digital do computador, e ela precisa ser igual a
                {' '}<code className={local.code}>{formatFingerprint(access.fingerprint)}</code>. Se for diferente,
                não continue.
              </p>
            )}
            <p className={local.hint}>
              O código vale por <strong>{formatRemaining(remaining)}</strong> e só funciona uma vez.
            </p>
            <button type="button" className={local.secondaryButton} onClick={() => setPairing(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div>
        <h5 className={styles.subheader}>Celulares pareados</h5>
        {devices.length === 0 ? (
          <p className={local.description}>Nenhum celular pareado ainda.</p>
        ) : (
          <ul className={local.devices}>
            {devices.map((device) => (
              <li key={device.id} className={local.device}>
                <div>
                  <strong>{device.name}</strong>
                  <span className={local.meta}>
                    pareado em {formatDate(device.created_at)} · último acesso {formatDate(device.last_seen_at)}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Remover este celular"
                  aria-label={`Remover ${device.name}`}
                  onClick={() => revoke(device)}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PairingSection;
