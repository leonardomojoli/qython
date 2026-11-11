// Acesso do celular pela rede local.
//
// O app só abre esta porta quando o médico liga "Permitir o celular nesta rede". Ela fala HTTPS com
// um certificado autoassinado, gerado uma vez por instalação (a chave privada fica no cofre do
// sistema), e repassa à API local o que a política deixa passar (lan-policy.js). Quem garante que é
// mesmo o computador do médico é a impressão digital do certificado, que o celular lê no QR code.
import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { decide, Throttle, throttleKey, lanAddresses } from './lan-policy.js';
import { verifyDeviceToken } from './device-token.js';
import { isPortFree, randomFreePort } from './ports.js';
import { processCommand } from './stack-command.js';

const SECRET_KEY_NAME = 'LAN_TLS_KEY';
const DEFAULT_PORT = 8443;

function reply(res, status, message) {
  const body = JSON.stringify({ detail: message });
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

/** Servidor HTTPS que repassa ao backend local o que a política permite. */
export class LanServer extends EventEmitter {
  /**
   * @param {object} o
   * @param {() => number} o.backendPort porta do backend em 127.0.0.1
   * @param {(token:string) => Promise<boolean>|boolean} [o.verifyToken] confere o acesso do aparelho antes de
   *   repassar a requisição (sem ele, qualquer Bearer passa; só os testes dispensam)
   * @param {{info:Function, warn:Function, error:Function}} o.logger
   * @param {() => number} [o.now]
   */
  constructor({ backendPort, logger, verifyToken = null, now = () => Date.now() }) {
    super();
    this.backendPort = backendPort;
    this.verifyToken = verifyToken;
    this.log = logger;
    this.server = null;
    this.port = null;
    this.upgraded = new Set(); // WebSockets repassados: o http.Server não os conta em closeAllConnections
    this.throttles = { claim: new Throttle({ limit: 10, windowMs: 60_000, now }), token: new Throttle({ limit: 60, windowMs: 60_000, now }) };
  }

  get listening() {
    return !!this.server?.listening;
  }

  async start({ port, host = '0.0.0.0', cert, key }) {
    if (this.server) await this.stop();
    const server = https.createServer(
      { cert, key, minVersion: 'TLSv1.2', handshakeTimeout: 10_000 },
      (req, res) => { this._handle(req, res).catch((err) => this._fail(res, err)); },
    );
    // Quem está na rede não pode segurar a porta aberta sem falar nada nem lotá-la de conexões ociosas.
    server.headersTimeout = 15_000;
    server.keepAliveTimeout = 5_000;
    server.maxConnections = 256;
    server.on('upgrade', (req, socket, head) => { this._upgrade(req, socket, head).catch(() => socket.destroy()); });
    server.on('tlsClientError', () => {}); // celular com certificado errado, sondas: nada a registrar
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    server.on('error', (err) => this.log.error(`Porta da rede local: ${err.message}`));
    this.server = server;
    this.port = server.address().port;
    this.log.info(`Porta da rede local aberta em ${host}:${this.port}`);
    this.emit('listening', this.port);
  }

  async stop() {
    const server = this.server;
    this.server = null;
    if (!server) return;
    server.closeAllConnections?.();
    for (const socket of this.upgraded) socket.destroy();
    this.upgraded.clear();
    await new Promise((resolve) => server.close(() => resolve()));
    this.log.info('Porta da rede local fechada.');
    this.emit('closed');
  }

  _remote(req) {
    return (req.socket.remoteAddress || 'desconhecido').replace(/^::ffff:/, '');
  }

  _fail(res, err) {
    this.log.error(`Porta da rede local: ${err.message}`);
    if (!res.headersSent) reply(res, 500, 'Erro interno.');
    else res.destroy();
  }

  /** O acesso do aparelho é de verdade (assinado, válido, de pareamento)? Sem conferente, só exige que exista. */
  async _authorized(token) {
    if (token === undefined || !this.verifyToken) return true;
    try {
      return !!(await this.verifyToken(token));
    } catch (err) {
      this.log.warn(`Porta da rede local: falha ao conferir o acesso (${err.message}).`);
      return false;
    }
  }

  async _handle(req, res) {
    const verdict = decide({ method: req.method, url: req.url, headers: req.headers });
    if (!verdict.ok) return reply(res, verdict.status, verdict.message);
    if (!(await this._authorized(verdict.token))) {
      return reply(res, 401, 'Acesso do aparelho inválido ou vencido. Pareie o celular de novo.');
    }
    const kind = throttleKey(req.method, verdict.path);
    if (kind && !this.throttles[kind].allow(`${kind}:${this._remote(req)}`)) {
      return reply(res, 429, 'Tentativas demais. Espere um minuto.');
    }
    const port = this.backendPort();
    const headers = { ...req.headers, host: `127.0.0.1:${port}`, 'x-forwarded-for': this._remote(req) };
    delete headers['x-real-ip'];
    const upstream = http.request({ host: '127.0.0.1', port, method: req.method, path: verdict.path, headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on('error', (err) => {
      this.log.warn(`Porta da rede local: o backend não respondeu (${err.message}).`);
      if (!res.headersSent) reply(res, 502, 'O Qython não respondeu.');
      else res.destroy();
    });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  }

  async _upgrade(req, socket, head) {
    const verdict = decide({ method: req.method, url: req.url, headers: req.headers, upgrade: true });
    if (!verdict.ok) {
      socket.end(`HTTP/1.1 ${verdict.status} ${http.STATUS_CODES[verdict.status] ?? 'Erro'}\r\nConnection: close\r\n\r\n`);
      return;
    }
    if (!(await this._authorized(verdict.token))) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return;
    }
    const port = this.backendPort();
    const upstream = net.connect(port, '127.0.0.1', () => {
      const headers = { ...req.headers, host: `127.0.0.1:${port}`, 'x-forwarded-for': this._remote(req) };
      const lines = Object.entries(headers).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
      upstream.write(`${req.method} ${verdict.path} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
      if (head?.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    this.upgraded.add(socket);
    this.upgraded.add(upstream);
    const close = () => {
      socket.destroy();
      upstream.destroy();
      this.upgraded.delete(socket);
      this.upgraded.delete(upstream);
    };
    upstream.on('error', close);
    socket.on('error', close);
    socket.on('close', close);
    upstream.on('close', close);
  }
}

/** Roda o backend empacotado num modo curto (como `gencert`) e devolve a saída em JSON. */
export function runBackendJson(resources, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const cmd = processCommand(resources, args, env);
    const child = spawn(cmd.command, cmd.args, { cwd: cmd.cwd, env: { ...env, PYTHONUTF8: '1' }, windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`${args[0]} saiu com código ${code}: ${err.slice(-300)}`));
      try {
        resolve(JSON.parse(out.trim().split('\n').pop()));
      } catch (e) {
        reject(new Error(`${args[0]} não devolveu JSON: ${e.message}`));
      }
    });
  });
}

/**
 * O acesso do celular como o app o enxerga: ligado ou não, certificado, porta e endereços.
 * O estado (ligado, porta, certificado público) fica no settings.json; a chave privada, no cofre.
 */
export class LanAccess extends EventEmitter {
  /**
   * @param {object} o
   * @param {import('./settings.js').Settings} o.settings
   * @param {import('./secrets.js').SecretStore} o.secrets
   * @param {{backend:string}} o.resources
   * @param {() => number} o.backendPort
   * @param {object} o.logger
   * @param {() => Promise<{cert_pem:string,key_pem:string,fingerprint:string}>} [o.makeCertificate]
   * @param {() => string[]} [o.addresses]
   * @param {string} [o.host] onde escutar (0.0.0.0; os testes usam 127.0.0.1)
   */
  constructor(o) {
    super();
    Object.assign(this, {
      settings: o.settings, secrets: o.secrets, resources: o.resources, log: o.logger, host: o.host ?? '0.0.0.0',
    });
    this.makeCertificate = o.makeCertificate ?? (() => runBackendJson(this.resources, ['gencert']));
    this.addresses = o.addresses ?? (() => lanAddresses());
    this.jwtSecret = null;
    this.server = new LanServer({
      backendPort: o.backendPort, logger: o.logger,
      verifyToken: async (token) => verifyDeviceToken(token, await this._secret()),
    });
    this.lastError = null;
  }

  get enabled() {
    return this.settings.get('lanEnabled', false) === true;
  }

  /** A chave que assina o acesso dos aparelhos (a do backend). Guardada em memória; ver invalidate(). */
  async _secret() {
    if (!this.jwtSecret) this.jwtSecret = (await this.secrets.load(['JWT_SECRET_KEY'])).JWT_SECRET_KEY;
    return this.jwtSecret;
  }

  /** As chaves do app mudaram (restauração de backup): relê a chave de assinatura na próxima conferência. */
  invalidate() {
    this.jwtSecret = null;
  }

  /** Certificado desta instalação: cria na primeira vez e reaproveita depois (o pareamento depende dele). */
  async certificate() {
    const cert = this.settings.get('lanCert');
    const fingerprint = this.settings.get('lanFingerprint');
    const key = cert && fingerprint ? await this.secrets.getItem(SECRET_KEY_NAME) : null;
    if (cert && fingerprint && key) return { cert, key, fingerprint };
    const made = await this.makeCertificate();
    await this.secrets.setItem(SECRET_KEY_NAME, made.key_pem);
    this.settings.set('lanCert', made.cert_pem);
    this.settings.set('lanFingerprint', made.fingerprint);
    return { cert: made.cert_pem, key: made.key_pem, fingerprint: made.fingerprint };
  }

  /** Porta lembrada entre aberturas: o QR code e o celular pareado dependem dela. */
  async _port() {
    const saved = this.settings.get('lanPort');
    const port = saved && (await isPortFree(saved, this.host)) ? saved
      : (await isPortFree(DEFAULT_PORT, this.host)) ? DEFAULT_PORT : await randomFreePort(this.host);
    this.settings.set('lanPort', port);
    return port;
  }

  /** Abre a porta se o médico a ligou. Chamado quando o app sobe e quando ele muda a escolha. */
  async apply() {
    this.lastError = null;
    if (!this.enabled) {
      await this.server.stop();
      return this.status();
    }
    try {
      if (this.server.listening) return this.status();
      const { cert, key } = await this.certificate();
      await this.server.start({ port: await this._port(), host: this.host, cert, key });
    } catch (err) {
      this.lastError = `Não foi possível abrir a porta da rede local: ${err.message}`;
      this.log.error(this.lastError);
    }
    return this.status();
  }

  async setEnabled(value) {
    this.settings.set('lanEnabled', !!value);
    return this.apply();
  }

  /** Para o app fechando. Não muda a escolha do médico. */
  async close() {
    await this.server.stop();
  }

  /** O que a tela mostra e o QR code leva. */
  status() {
    const listening = this.server.listening;
    const port = listening ? this.server.port : this.settings.get('lanPort') ?? null;
    return {
      enabled: this.enabled,
      listening,
      port,
      fingerprint: this.settings.get('lanFingerprint') ?? null,
      addresses: listening ? this.addresses().map((ip) => `https://${ip}:${port}`) : [],
      error: this.lastError,
    };
  }
}
