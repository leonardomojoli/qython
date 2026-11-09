// Serviço que só existe enquanto há trabalho: o app escuta numa porta fixa, sobe o
// processo de verdade no primeiro pedido, repassa as requisições e o desliga depois de
// um tempo parado. É assim que o llama-server (15 GB de modelo na RAM) e o Chroma ficam
// fora da memória enquanto o médico não usa a IA.
//
// O backend sempre fala com a porta pública, que não muda: ele nem sabe que o serviço
// atrás dela vai e vem.
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { waitForHttp } from './health.js';

const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer']);

function jsonError(res, status, message) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = JSON.stringify({ error: { message, type: 'service_unavailable', code: status } });
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

export class OnDemandService extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.name
   * @param {number} o.publicPort porta que o backend usa (fixa)
   * @param {number} o.privatePort porta do processo de verdade
   * @param {() => import('./supervisor.js').ManagedProcess | null} o.createProcess null = não dá para iniciar
   * @param {string} o.readyPath caminho HTTP que responde 200 quando o processo está pronto
   * @param {number} [o.readyTimeoutMs]
   * @param {number} [o.idleMs] parado por tanto tempo, desliga (0 = nunca)
   * @param {() => string | null} [o.unavailable] motivo de não poder atender agora
   */
  constructor(o) {
    super();
    Object.assign(this, { name: o.name, publicPort: o.publicPort, privatePort: o.privatePort, createProcess: o.createProcess, readyPath: o.readyPath });
    this.readyTimeoutMs = o.readyTimeoutMs ?? 10 * 60 * 1000;
    this.idleMs = o.idleMs ?? 10 * 60 * 1000;
    this.unavailable = o.unavailable ?? (() => null);
    this.log = o.logger;
    this.server = null;
    this.proc = null;
    this.state = 'idle'; // idle | starting | running
    this.starting = null;
    this.stopping = null;
    this.inflight = 0;
    this.idleTimer = null;
    this.lastError = null;
  }

  _setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.emit('state', state);
  }

  async listen() {
    this.server = http.createServer((req, res) => this._handle(req, res));
    // Respostas de LLM em CPU levam minutos: sem prazo de requisição.
    this.server.requestTimeout = 0;
    this.server.timeout = 0;
    this.server.keepAliveTimeout = 65000;
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.publicPort, '127.0.0.1', resolve);
    });
  }

  async ensureRunning() {
    // Um pedido que chega enquanto o processo antigo ainda está morrendo espera o fim dele:
    // o novo usaria a mesma porta privada.
    if (this.stopping) await this.stopping.catch(() => {});
    if (this.state === 'running' && this.proc?.isAlive()) return;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const proc = this.createProcess();
      if (!proc) throw new Error(this.unavailable() ?? `${this.name} indisponível`);
      this._setState('starting');
      this.proc = proc;
      proc.start();
      try {
        await waitForHttp(`http://127.0.0.1:${this.privatePort}${this.readyPath}`, {
          timeoutMs: this.readyTimeoutMs,
          intervalMs: 400,
          isAlive: () => proc.isAlive(),
        });
      } catch (err) {
        await proc.stop();
        proc.dispose();
        this.proc = null;
        this._setState('idle');
        this.lastError = err.message;
        throw err;
      }
      this._setState('running');
      this.log?.info(`[${this.name}] pronto.`);
      // Se o processo cair depois de pronto, volta a "idle" e o próximo pedido o sobe de novo.
      proc.once('stopped', () => this._onChildGone(proc));
      proc.once('crash', () => this._onChildGone(proc));
    })().finally(() => { this.starting = null; });
    return this.starting;
  }

  _onChildGone(proc) {
    if (this.proc === proc) {
      this.proc = null;
      this._setState('idle');
    }
  }

  async _handle(req, res) {
    const blocked = this.unavailable();
    if (blocked) return jsonError(res, 503, blocked);

    this.inflight += 1;
    clearTimeout(this.idleTimer);
    let closed = false;
    let upstream = null;
    const finish = () => {
      if (closed) return;
      closed = true;
      this.inflight -= 1;
      if (upstream && !upstream.destroyed) upstream.destroy(); // o cliente desistiu: o modelo para de gerar
      this._scheduleIdle();
    };
    res.on('close', finish);

    try {
      await this.ensureRunning();
    } catch (err) {
      return jsonError(res, 503, `${this.name} não iniciou: ${err.message}`);
    }
    if (closed) return;

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k)) headers[k] = v;
    headers.host = `127.0.0.1:${this.privatePort}`;
    upstream = http.request({
      host: '127.0.0.1', port: this.privatePort, method: req.method, path: req.url, headers, agent: false,
    }, (up) => {
      const outHeaders = {};
      for (const [k, v] of Object.entries(up.headers)) if (!HOP.has(k)) outHeaders[k] = v;
      res.writeHead(up.statusCode, outHeaders);
      up.pipe(res);
    });
    upstream.on('error', (err) => jsonError(res, 502, `${this.name}: ${err.message}`));
    req.pipe(upstream);
  }

  _scheduleIdle() {
    clearTimeout(this.idleTimer);
    if (!this.idleMs || this.inflight > 0 || this.state !== 'running') return;
    this.idleTimer = setTimeout(() => {
      if (this.inflight === 0) this.stopChild().catch(() => {});
    }, this.idleMs);
    this.idleTimer.unref?.();
  }

  async stopChild() {
    clearTimeout(this.idleTimer);
    if (this.stopping) return this.stopping;
    const proc = this.proc;
    if (!proc) return;
    this.proc = null;
    this.log?.info(`[${this.name}] parado há ${Math.round(this.idleMs / 1000)} s; desligando para liberar memória.`);
    this.stopping = (async () => {
      await proc.stop();
      proc.dispose();
      this._setState('idle');
    })().finally(() => { this.stopping = null; });
    return this.stopping;
  }

  async stop() {
    clearTimeout(this.idleTimer);
    if (this.starting) await this.starting.catch(() => {});
    await this.stopChild();
    if (this.server) {
      this.server.closeAllConnections?.();
      await new Promise((resolve) => this.server.close(resolve));
      this.server = null;
    }
  }
}
