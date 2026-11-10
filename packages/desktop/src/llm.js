// A IA local: llama-server (llama.cpp) subindo sob demanda atrás de uma porta fixa.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ManagedProcess } from './supervisor.js';
import { OnDemandService } from './ondemand.js';
import { defaultThreads } from './hardware.js';
import { pickPort } from './ports.js';

/** O nome que o backend usa para o modelo (LLM_MODEL); o llama-server responde a qualquer um. */
export const MODEL_ALIAS = 'gemma-4';

export function llamaServerPath(llamaDir) {
  return path.join(llamaDir, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
}

/**
 * Argumentos do llama-server. Os mesmos do serviço `llm` do docker-compose (contexto,
 * --jinja), mais: só 127.0.0.1, chave de API (outro programa da máquina não usa a IA do
 * médico), um slot (CPU não ganha com paralelismo e o contexto inteiro fica com a
 * conversa) e sem a interface web embutida.
 */
export function llamaArgs({ model, mmproj, port, apiKey, contextTokens, threads }) {
  const args = [
    '-m', model,
    ...(mmproj ? ['--mmproj', mmproj] : []),
    '-c', String(contextTokens),
    '-t', String(threads),
    '--jinja',
    '--parallel', '1',
    '--host', '127.0.0.1',
    '--port', String(port),
    '--api-key', apiKey,
    '--alias', MODEL_ALIAS,
    '--no-webui',
  ];
  return args;
}

/** Variáveis do backend para falar com a IA local pela porta fixa. */
export function backendLlmEnv({ port, apiKey, contextTokens }) {
  return {
    LLM_BASE_URL: `http://127.0.0.1:${port}/v1`,
    LLM_MODEL: MODEL_ALIAS,
    LLM_API_KEY: apiKey,
    LLM_CONTEXT_TOKENS: String(contextTokens),
  };
}

export class LocalLlm {
  /**
   * @param {object} o
   * @param {import('./models.js').ModelManager} o.models
   * @param {string} o.llamaDir pasta com o llama-server
   * @param {import('./settings.js').Settings} o.settings
   * @param {string} o.apiKey
   * @param {any} o.logger
   * @param {() => string|null} o.selectedId modelo escolhido
   * @param {() => string|null} [o.notReady] motivo extra de indisponibilidade (ex.: baixando)
   * @param {number} [o.idleSeconds]
   */
  constructor(o) {
    this.models = o.models;
    this.llamaDir = o.llamaDir;
    this.settings = o.settings;
    this.apiKey = o.apiKey;
    this.log = o.logger;
    this.selectedId = o.selectedId;
    this.notReady = o.notReady ?? (() => null);
    this.idleSeconds = o.idleSeconds ?? 15 * 60;
    this.service = null;
    this.publicPort = null;
    this.privatePort = null;
    this.customModelFile = o.customModelFile ?? null; // QYTHON_AI_MODEL_FILE: um GGUF qualquer (CI, avançado)
  }

  get contextTokens() {
    if (this.customModelFile) return 4096;
    return this.models.get(this.selectedId())?.contextTokens ?? 16384;
  }

  /** Arquivos do modelo escolhido, ou null se ainda não dá para iniciar. */
  resolvePaths() {
    if (this.customModelFile) return { model: this.customModelFile, mmproj: null };
    const id = this.selectedId();
    return id ? this.models.paths(id) : null;
  }

  unavailableReason() {
    if (this.resolvePaths()) return null;
    return this.notReady()
      ?? 'A IA local ainda não foi instalada. Abra o menu Ajuda > Escolher a IA para baixar um modelo.';
  }

  async listen() {
    this.publicPort = await pickPort(this.settings.get('llmPort'));
    this.settings.set('llmPort', this.publicPort);
    this.privatePort = await pickPort(undefined, { exclude: [this.publicPort] });
    this.service = new OnDemandService({
      name: 'ia-local',
      publicPort: this.publicPort,
      privatePort: this.privatePort,
      readyPath: '/health',
      idleMs: this.idleSeconds * 1000,
      logger: this.log,
      unavailable: () => this.unavailableReason(),
      createProcess: () => this._createProcess(),
    });
    await this.service.listen();
  }

  _createProcess() {
    const files = this.resolvePaths();
    if (!files) return null;
    const binary = llamaServerPath(this.llamaDir);
    if (!fs.existsSync(binary)) {
      throw new Error(`O llama-server não está em ${this.llamaDir}.`);
    }
    return new ManagedProcess({
      name: 'llama-server',
      command: binary,
      args: llamaArgs({
        ...files, port: this.privatePort, apiKey: this.apiKey,
        contextTokens: this.contextTokens, threads: this.settings.get('llmThreads', defaultThreads()),
      }),
      cwd: this.llamaDir,
      env: process.platform === 'linux' ? { LD_LIBRARY_PATH: `${this.llamaDir}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}` } : {},
      logger: this.log,
      restart: null, // quem pediu a IA tenta de novo; reiniciar sozinho esconderia o motivo
      gracefulStdin: false,
      stopTimeoutMs: 8000,
    });
  }

  backendEnv() {
    return backendLlmEnv({ port: this.publicPort, apiKey: this.apiKey, contextTokens: this.contextTokens });
  }

  get state() {
    return this.service?.state ?? 'idle';
  }

  /** Para o llama-server agora (troca de modelo); o próximo pedido o sobe com o novo. */
  async unload() {
    await this.service?.stopChild();
  }

  async stop() {
    await this.service?.stop();
  }
}

export const newApiKey = () => crypto.randomBytes(24).toString('hex');
