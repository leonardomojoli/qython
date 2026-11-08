// Mantém um processo filho de pé: sobe, registra a saída, reinicia se cair e o encerra
// com educação (e à força, se precisar).
import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class ManagedProcess extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.name
   * @param {string} o.command
   * @param {string[]} [o.args]
   * @param {object} [o.env]
   * @param {string} [o.cwd]
   * @param {{info:Function,warn:Function,error:Function,sink:(n:string)=>{write:Function,close:Function}}} o.logger
   * @param {boolean} [o.gracefulStdin] encerra fechando o stdin (o backend Python faz isso)
   * @param {number} [o.stopTimeoutMs]
   * @param {{max:number, windowMs:number, backoffMs:number[]}|null} [o.restart]
   * @param {string} [o.pidFile]
   */
  constructor(o) {
    super();
    this.name = o.name;
    this.command = o.command;
    this.args = o.args ?? [];
    this.env = o.env ?? {};
    this.cwd = o.cwd;
    this.log = o.logger;
    this.sink = o.logger.sink(o.name);
    this.gracefulStdin = o.gracefulStdin ?? false;
    this.stopTimeoutMs = o.stopTimeoutMs ?? 15000;
    this.restartPolicy = o.restart === undefined
      ? { max: 5, windowMs: 120000, backoffMs: [1000, 3000, 8000, 15000, 30000] }
      : o.restart;
    this.pidFile = o.pidFile;
    this.child = null;
    this.state = 'stopped'; // stopped | running | backoff | failed
    this.wantRunning = false;
    this.crashes = [];
    this._exitWaiters = [];
  }

  get pid() {
    return this.child?.pid ?? null;
  }

  isAlive() {
    return this.child !== null && this.child.exitCode === null && this.child.signalCode === null;
  }

  start() {
    this.wantRunning = true;
    this._spawn();
  }

  _spawn() {
    // A chave de API da IA local é argumento do processo: não vai para o log.
    const shown = this.args.map((a, i) => (/^--(api-key|key)$/.test(this.args[i - 1] ?? '') ? '***' : a));
    this.log.info(`[${this.name}] iniciando: ${path.basename(this.command)} ${shown.join(' ')}`);
    const child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    this.state = 'running';
    const forward = (chunk) => this.sink.write(chunk);
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    // Escrever num stdin já fechado levantaria EPIPE; o processo pode morrer a qualquer hora.
    child.stdin.on('error', () => {});
    child.on('error', (err) => {
      this.log.error(`[${this.name}] não foi possível executar: ${err.message}`);
    });
    if (this.pidFile && child.pid) {
      try {
        fs.mkdirSync(path.dirname(this.pidFile), { recursive: true });
        fs.writeFileSync(this.pidFile, String(child.pid));
      } catch {
        // só ajuda a limpar sobras; não é essencial
      }
    }
    child.on('exit', (code, signal) => this._onExit(child, code, signal));
  }

  _onExit(child, code, signal) {
    if (this.child !== child) return;
    if (this.pidFile) fs.rmSync(this.pidFile, { force: true });
    const waiters = this._exitWaiters.splice(0);
    waiters.forEach((w) => w());
    if (!this.wantRunning) {
      this.state = 'stopped';
      this.log.info(`[${this.name}] encerrado (código ${code ?? signal}).`);
      this.emit('stopped');
      return;
    }
    this.log.warn(`[${this.name}] caiu (código ${code ?? signal}).`);
    this.emit('crash', { code, signal });
    const now = Date.now();
    if (this.restartPolicy) {
      this.crashes = this.crashes.filter((t) => now - t < this.restartPolicy.windowMs);
      this.crashes.push(now);
    }
    if (!this.restartPolicy || this.crashes.length > this.restartPolicy.max) {
      this.state = 'failed';
      this.wantRunning = false;
      this.log.error(`[${this.name}] ${this.restartPolicy ? 'caiu vezes demais; desisti de reiniciar.' : 'caiu.'}`);
      this.emit('failed');
      return;
    }
    const delay = this.restartPolicy.backoffMs[Math.min(this.crashes.length - 1, this.restartPolicy.backoffMs.length - 1)];
    this.state = 'backoff';
    setTimeout(() => {
      if (!this.wantRunning) return;
      this.log.info(`[${this.name}] reiniciando...`);
      this._spawn();
      this.emit('restart');
    }, delay);
  }

  /** Encerra o processo. Primeiro o jeito educado; passado o prazo, à força. */
  async stop() {
    this.wantRunning = false;
    const child = this.child;
    if (!child || !this.isAlive()) {
      this.state = 'stopped';
      return;
    }
    const exited = new Promise((resolve) => this._exitWaiters.push(resolve));
    if (this.gracefulStdin) {
      try {
        child.stdin.end();
      } catch {
        // já fechado
      }
    } else {
      this._terminate(child, false);
    }
    const winner = await Promise.race([exited.then(() => 'exit'), sleep(this.stopTimeoutMs).then(() => 'timeout')]);
    if (winner === 'timeout' && this.isAlive()) {
      this.log.warn(`[${this.name}] não encerrou em ${this.stopTimeoutMs} ms; forçando.`);
      this._terminate(child, true);
      await Promise.race([exited, sleep(5000)]);
    }
    this.state = 'stopped';
  }

  _terminate(child, force) {
    if (process.platform === 'win32') {
      // /T leva junto os netos (o llama-server e o chroma abrem filhos).
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', ...(force ? ['/F'] : [])], { windowsHide: true });
    } else {
      child.kill(force ? 'SIGKILL' : 'SIGTERM');
    }
  }

  dispose() {
    this.sink.close();
  }
}

/**
 * Mata o processo que um pidfile antigo aponta, se ele ainda existir. Cobre o Electron
 * que foi morto à força e deixou o backend (e a porta) para trás.
 */
export function killStale(pidFile, log) {
  let pid;
  try {
    pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  } catch {
    return false;
  }
  fs.rmSync(pidFile, { force: true });
  if (!pid) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  log?.warn(`Processo antigo (pid ${pid}) ainda vivo; encerrando.`);
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    else process.kill(pid, 'SIGTERM');
  } catch {
    return false;
  }
  return true;
}
