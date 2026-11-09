// ChromaDB (a busca da biblioteca) sob demanda: o mesmo `chroma run` da imagem do Docker,
// vindo do executável do backend (modo `chroma`), subindo só quando alguém usa a biblioteca.
import { ManagedProcess } from './supervisor.js';
import { OnDemandService } from './ondemand.js';
import { pickPort } from './ports.js';
import { processCommand } from './stack-command.js';

export class LocalChroma {
  /**
   * @param {object} o
   * @param {{backend:string}} o.resources
   * @param {string} o.dataPath pasta dos dados do Chroma
   * @param {import('./settings.js').Settings} o.settings
   * @param {any} o.logger
   * @param {number} [o.idleSeconds]
   */
  constructor(o) {
    Object.assign(this, { resources: o.resources, dataPath: o.dataPath, settings: o.settings, log: o.logger });
    this.idleSeconds = o.idleSeconds ?? 10 * 60;
    this.service = null;
    this.publicPort = null;
  }

  async listen(exclude = []) {
    this.publicPort = await pickPort(this.settings.get('chromaPort'), { exclude });
    this.settings.set('chromaPort', this.publicPort);
    const privatePort = await pickPort(undefined, { exclude: [...exclude, this.publicPort] });
    this.service = new OnDemandService({
      name: 'chroma',
      publicPort: this.publicPort,
      privatePort,
      readyPath: '/api/v2/heartbeat',
      readyTimeoutMs: 120000,
      idleMs: this.idleSeconds * 1000,
      logger: this.log,
      createProcess: () => {
        const cmd = processCommand(this.resources, ['chroma', '--path', this.dataPath, '--port', String(privatePort)]);
        return new ManagedProcess({
          name: 'chroma', command: cmd.command, args: cmd.args, cwd: cmd.cwd,
          env: { ANONYMIZED_TELEMETRY: 'False', PYTHONUTF8: '1' },
          logger: this.log, restart: null, gracefulStdin: false, stopTimeoutMs: 15000,
        });
      },
    });
    await this.service.listen();
  }

  /** O backend acha o Chroma pela porta fixa. */
  backendEnv() {
    return { CHROMA_SERVER_HOST: '127.0.0.1', CHROMA_SERVER_PORT: String(this.publicPort) };
  }

  get state() {
    return this.service?.state ?? 'idle';
  }

  async stop() {
    await this.service?.stop();
  }
}
