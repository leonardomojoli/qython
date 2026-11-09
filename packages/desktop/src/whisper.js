// Transcrição de áudio e vídeo da biblioteca (faster-whisper) sob demanda. É o mesmo serviço do
// servidor (backend/whisper_server.py, POST /transcribe) rodando como modo `whisper` do executável
// do backend, sem torch: o ctranslate2 faz a inferência e o PyAV traz o ffmpeg dentro da roda, então
// não há ffmpeg para instalar. Sobe quando alguém transcreve e desliga parado, devolvendo a RAM.
import { ManagedProcess } from './supervisor.js';
import { OnDemandService } from './ondemand.js';
import { pickPort } from './ports.js';
import { processCommand } from './stack-command.js';
import { defaultThreads } from './hardware.js';

export class LocalWhisper {
  /**
   * @param {object} o
   * @param {{backend:string}} o.resources
   * @param {import('./models.js').ModelManager} o.models
   * @param {import('./settings.js').Settings} o.settings
   * @param {any} o.logger
   * @param {string} [o.modelId] qual modelo (padrão: o do manifesto)
   * @param {() => string|null} [o.notReady] motivo extra (ex.: baixando)
   * @param {number} [o.idleSeconds]
   */
  constructor(o) {
    Object.assign(this, { resources: o.resources, models: o.models, settings: o.settings, log: o.logger });
    this.modelId = o.modelId ?? o.models.manifest.defaultWhisper;
    this.notReady = o.notReady ?? (() => null);
    this.idleSeconds = o.idleSeconds ?? 10 * 60;
    this.service = null;
    this.publicPort = null;
  }

  unavailableReason() {
    if (this.models.isInstalled(this.modelId)) return null;
    return this.notReady()
      ?? 'O modelo de transcrição ainda não foi baixado. Abra o menu Ajuda > Baixar a transcrição de áudio e vídeo.';
  }

  async listen(exclude = []) {
    this.publicPort = await pickPort(this.settings.get('whisperPort'), { exclude });
    this.settings.set('whisperPort', this.publicPort);
    const privatePort = await pickPort(undefined, { exclude: [...exclude, this.publicPort] });
    this.service = new OnDemandService({
      name: 'transcricao',
      publicPort: this.publicPort,
      privatePort,
      readyPath: '/health',
      readyTimeoutMs: 300000, // carregar 1,6 GB do disco
      idleMs: this.idleSeconds * 1000,
      logger: this.log,
      unavailable: () => this.unavailableReason(),
      createProcess: () => {
        const cmd = processCommand(this.resources, ['whisper', '--port', String(privatePort)]);
        return new ManagedProcess({
          name: 'transcricao', command: cmd.command, args: cmd.args, cwd: cmd.cwd,
          env: {
            WHISPER_MODEL: this.models.dirOf(this.modelId),
            WHISPER_COMPUTE_TYPE: 'int8',
            WHISPER_DEVICE: 'cpu',
            WHISPER_CPU_THREADS: String(this.settings.get('llmThreads', defaultThreads())),
            PYTHONUTF8: '1',
            HF_HUB_OFFLINE: '1', // o modelo já está em disco: nada de ir buscar na internet
            HF_HUB_DISABLE_TELEMETRY: '1',
          },
          logger: this.log, restart: null, gracefulStdin: false, stopTimeoutMs: 8000,
        });
      },
    });
    await this.service.listen();
  }

  /** O backend manda o áudio para esta porta fixa (o mesmo contrato do whisper.service do servidor). */
  backendEnv() {
    return { WHISPER_SERVER_URL: `http://127.0.0.1:${this.publicPort}` };
  }

  get state() {
    return this.service?.state ?? 'idle';
  }

  async stop() {
    await this.service?.stop();
  }
}
