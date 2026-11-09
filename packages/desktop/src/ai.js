// O controle da IA do app: qual modelo, baixar, trocar, e o estado para o assistente e o menu.
import { EventEmitter } from 'node:events';
import { assess, freeDiskBytes, modelBytes, totalRamGb } from './hardware.js';
import { DownloadAborted, ChecksumError } from './downloader.js';

export class AiController extends EventEmitter {
  /**
   * @param {object} o
   * @param {import('./models.js').ModelManager} o.models
   * @param {import('./settings.js').Settings} o.settings
   * @param {any} o.logger
   * @param {() => import('./llm.js').LocalLlm} o.llm
   * @param {{totalRamGb:()=>number, freeDiskBytes:(d:string)=>number}} [o.hw] substituível nos testes
   */
  constructor(o) {
    super();
    this.models = o.models;
    this.settings = o.settings;
    this.log = o.logger;
    this.getLlm = o.llm;
    this.hw = o.hw ?? { totalRamGb, freeDiskBytes };
    this.progress = null; // última medida do download em andamento
    this.error = null;
    this.abort = null;
  }

  /** {modelId, chosenAt} ou null se o médico ainda não escolheu (mostra o assistente). */
  get choice() {
    return this.settings.get('ai', null);
  }

  get selectedId() {
    return this.choice?.modelId ?? null;
  }

  get downloading() {
    return this.abort !== null;
  }

  /** O que dizer a quem pede a IA enquanto ela não está pronta. */
  notReadyReason() {
    if (this.downloading && this.progress) {
      const pct = Math.floor((this.progress.received / this.progress.total) * 100);
      return `A IA local ainda está sendo baixada (${pct}%). Ela fica disponível quando terminar.`;
    }
    if (this.choice?.modelId && !this.models.isInstalled(this.choice.modelId)) {
      return 'O download da IA local não terminou. Abra o menu Ajuda > Escolher a IA para continuar.';
    }
    return null;
  }

  state() {
    const hw = { totalRamGb: this.hw.totalRamGb(), freeDiskBytes: this.hw.freeDiskBytes(this.models.dir) };
    return {
      hardware: { ramGb: Math.round(hw.totalRamGb * 10) / 10, diskFreeGb: Math.round((hw.freeDiskBytes / 1024 ** 3) * 10) / 10 },
      defaultModel: this.models.manifest.defaultModel,
      selected: this.selectedId,
      models: this.models.list().map((m) => {
        const installed = this.models.isInstalled(m.id);
        return {
          id: m.id, label: m.label, tag: m.tag, summary: m.summary, ramGb: m.ramGb, minTotalRamGb: m.minTotalRamGb,
          bytes: modelBytes(m), installed,
          assessment: assess(m, hw, installed ? modelBytes(m) : this.models.bytesOnDisk(m)),
        };
      }),
      download: this.downloading ? { ...this.progress, id: this.choice?.modelId } : null,
      error: this.error,
      service: this.getLlm()?.state ?? 'idle',
    };
  }

  _emit() {
    this.emit('change', this.state());
  }

  /** Registra a escolha. Trocar de modelo descarrega o anterior da memória. */
  async select(modelId) {
    if (!this.models.get(modelId)) throw new Error(`Modelo desconhecido: ${modelId}`);
    const changed = this.selectedId !== modelId;
    this.settings.set('ai', { modelId, chosenAt: new Date().toISOString() });
    if (changed) await this.getLlm()?.unload();
    this.error = null;
    this._emit();
  }

  /** Baixa o modelo escolhido em segundo plano. Resolve quando termina (ou falha). */
  async install(modelId) {
    if (this.downloading) throw new Error('Já existe um download em andamento.');
    await this.select(modelId);
    if (this.models.isInstalled(modelId)) {
      this._emit();
      return;
    }
    this.abort = new AbortController();
    this.error = null;
    this.progress = { phase: 'downloading', received: 0, total: modelBytes(this.models.get(modelId)), bytesPerSec: 0, etaSec: null };
    this._emit();
    try {
      await this.models.install(modelId, {
        signal: this.abort.signal,
        onProgress: (p) => {
          this.progress = p;
          this.emit('progress', p);
        },
      });
      this.log.info(`Modelo ${modelId} instalado.`);
      this.emit('installed', modelId);
    } catch (err) {
      if (err instanceof DownloadAborted) {
        this.log.info('Download cancelado pelo usuário.');
      } else {
        this.error = err instanceof ChecksumError ? err.message : `O download falhou: ${err.message}`;
        this.log.error(this.error);
      }
    } finally {
      this.abort = null;
      this.progress = null;
      this._emit();
    }
  }

  cancel() {
    this.abort?.abort();
  }

  /** Retoma, na abertura, um download que o app interrompeu ao fechar. */
  resumePending() {
    const id = this.selectedId;
    if (id && !this.models.isInstalled(id) && !this.downloading && this.models.bytesOnDisk(this.models.get(id)) > 0) {
      this.log.info(`Retomando o download de ${id}.`);
      this.install(id).catch((err) => this.log.error(err.message));
    }
  }
}
