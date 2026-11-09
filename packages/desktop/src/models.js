// Modelos de IA locais: o que existe, o que já está baixado e como baixar.
import fs from 'node:fs';
import path from 'node:path';
import { downloadFile, isVerified } from './downloader.js';

export function loadManifest(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function fileUrl(model, file) {
  // `path` é o caminho dentro do repositório; `name` é como o arquivo fica no disco.
  return `https://huggingface.co/${model.repo}/resolve/${model.revision}/${file.path ?? file.name}`;
}

export class ModelManager {
  /**
   * @param {{models: any[], defaultModel: string}} manifest
   * @param {string} modelsDir
   * @param {object} [o]
   * @param {typeof fetch} [o.fetchImpl]
   * @param {(model:any, file:any)=>string} [o.urlFor] para testes e espelhos
   */
  constructor(manifest, modelsDir, o = {}) {
    this.manifest = manifest;
    this.dir = modelsDir;
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.urlFor = o.urlFor ?? fileUrl;
    this.retries = o.retries;
    this.job = null;
  }

  list() {
    return this.manifest.models;
  }

  /** Os modelos de linguagem, que o médico escolhe. */
  llms() {
    return this.manifest.models.filter((m) => !m.kind);
  }

  /** O modelo de transcrição de áudio e vídeo que baixa junto com a IA (null se o manifesto não tem). */
  defaultWhisper() {
    return this.manifest.defaultWhisper ? this.get(this.manifest.defaultWhisper) : null;
  }

  /** Modelos de apoio (busca da biblioteca): não se escolhem, baixam junto com a IA. */
  supports() {
    return this.manifest.models.filter((m) => m.kind === 'support');
  }

  supportMissing() {
    return this.supports().filter((m) => !this.isInstalled(m.id));
  }

  /** Pasta do modelo no disco (model.onnx, tokenizer.json...). */
  dirOf(id) {
    return path.join(this.dir, id);
  }

  get(id) {
    return this.manifest.models.find((m) => m.id === id) ?? null;
  }

  filePath(model, file) {
    return path.join(this.dir, model.id, file.name);
  }

  /** Bytes já no disco deste modelo (arquivos prontos e o que falta de .part), para calcular o que falta baixar. */
  bytesOnDisk(model) {
    let total = 0;
    for (const f of model.files) {
      const dest = this.filePath(model, f);
      for (const p of [dest, `${dest}.part`]) {
        try {
          total += fs.statSync(p).size;
        } catch {
          // não existe
        }
      }
    }
    return total;
  }

  isInstalled(id) {
    const model = this.get(id);
    return !!model && model.files.every((f) => isVerified(this.filePath(model, f), f.size));
  }

  /** Caminhos para o llama-server, ou null se o modelo não está inteiro. */
  paths(id) {
    const model = this.get(id);
    if (!model || !this.isInstalled(id)) return null;
    const find = (role) => {
      const f = model.files.find((x) => x.role === role);
      return f ? this.filePath(model, f) : null;
    };
    return { model: find('model'), mmproj: find('mmproj') };
  }

  /**
   * Baixa os arquivos do modelo, um depois do outro. Um job por vez.
   * @param {string} id
   * @param {{onProgress?:(p:object)=>void, signal?:AbortSignal}} [o]
   */
  async install(id, o = {}) {
    const model = this.get(id);
    if (!model) throw new Error(`Modelo desconhecido: ${id}`);
    if (this.job) throw new Error('Já existe um download em andamento.');
    const total = model.files.reduce((s, f) => s + f.size, 0);
    let before = 0;
    this.job = { id };
    try {
      for (const file of model.files) {
        await downloadFile({
          url: this.urlFor(model, file),
          dest: this.filePath(model, file),
          size: file.size,
          sha256: file.sha256,
          signal: o.signal,
          fetchImpl: this.fetchImpl,
          retries: this.retries,
          onProgress: (p) => o.onProgress?.({
            id, phase: p.phase, file: file.name, received: before + (p.phase === 'verifying' ? 0 : p.received),
            total, bytesPerSec: p.bytesPerSec,
            etaSec: p.bytesPerSec > 0 ? Math.round((total - before - p.received) / p.bytesPerSec) : null,
          }),
        });
        before += file.size;
      }
      o.onProgress?.({ id, phase: 'done', file: null, received: total, total, bytesPerSec: 0, etaSec: 0 });
    } finally {
      this.job = null;
    }
  }

  remove(id) {
    const model = this.get(id);
    if (!model) return;
    fs.rmSync(path.join(this.dir, model.id), { recursive: true, force: true });
  }
}
