// Embeddings e reranking da biblioteca (multilingual-e5 em ONNX) sob demanda: o mesmo
// processo que o backend chama pelo EMBED_SERVER_URL no Docker, aqui vindo do executável do
// backend (modo `embed`), sem torch. Sobe quando alguém indexa ou busca e desliga parado.
import { ManagedProcess } from './supervisor.js';
import { OnDemandService } from './ondemand.js';
import { pickPort } from './ports.js';
import { processCommand } from './stack-command.js';
import { defaultThreads } from './hardware.js';

export const EMBED_ID = 'e5-base-int8';
export const RERANK_ID = 'rerank-mmarco-int8';

export class LocalEmbedder {
  /**
   * @param {object} o
   * @param {{backend:string}} o.resources
   * @param {import('./models.js').ModelManager} o.models
   * @param {import('./settings.js').Settings} o.settings
   * @param {any} o.logger
   * @param {() => string|null} [o.notReady] motivo extra (ex.: baixando)
   * @param {number} [o.idleSeconds]
   */
  constructor(o) {
    Object.assign(this, { resources: o.resources, models: o.models, settings: o.settings, log: o.logger });
    this.notReady = o.notReady ?? (() => null);
    this.idleSeconds = o.idleSeconds ?? 10 * 60;
    this.service = null;
    this.publicPort = null;
  }

  unavailableReason() {
    if (this.models.isInstalled(EMBED_ID)) return null;
    return this.notReady() ?? 'O modelo de busca da biblioteca ainda não foi baixado. Abra o menu Ajuda > Escolher a IA.';
  }

  async listen(exclude = []) {
    this.publicPort = await pickPort(this.settings.get('embedPort'), { exclude });
    this.settings.set('embedPort', this.publicPort);
    const privatePort = await pickPort(undefined, { exclude: [...exclude, this.publicPort] });
    this.service = new OnDemandService({
      name: 'embeddings',
      publicPort: this.publicPort,
      privatePort,
      readyPath: '/health',
      readyTimeoutMs: 180000,
      idleMs: this.idleSeconds * 1000,
      logger: this.log,
      unavailable: () => this.unavailableReason(),
      createProcess: () => {
        const cmd = processCommand(this.resources, ['embed', '--port', String(privatePort)]);
        const env = {
          EMBED_MODEL_DIR: this.models.dirOf(EMBED_ID),
          EMBED_CPU_THREADS: String(this.settings.get('llmThreads', defaultThreads())),
          PYTHONUTF8: '1',
        };
        // O reranker é opcional: sem ele a busca usa a ordem da fusão (BM25 + vetores).
        if (this.models.isInstalled(RERANK_ID)) env.RERANK_MODEL_DIR = this.models.dirOf(RERANK_ID);
        return new ManagedProcess({
          name: 'embeddings', command: cmd.command, args: cmd.args, cwd: cmd.cwd, env,
          logger: this.log, restart: null, gracefulStdin: false, stopTimeoutMs: 8000,
        });
      },
    });
    await this.service.listen();
  }

  /** Liga o RAG v2 do backend (e5 + busca híbrida + reranker) pela porta fixa. */
  backendEnv() {
    return { EMBED_SERVER_URL: `http://127.0.0.1:${this.publicPort}` };
  }

  get state() {
    return this.service?.state ?? 'idle';
  }

  async stop() {
    await this.service?.stop();
  }
}
