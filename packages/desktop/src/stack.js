// A pilha local do Qython: Postgres embarcado + backend (que serve também o front).
// Os serviços da IA (llama-server, Chroma, whisper) entram aqui sob demanda.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { ManagedProcess, killStale } from './supervisor.js';
import { PostgresService } from './postgres.js';
import { waitForHttp } from './health.js';
import { pickPort } from './ports.js';
import { SecretsUnavailableError } from './secrets.js';

export class KeysMissingError extends Error {
  constructor() {
    super(
      'O banco de dados existe, mas as chaves de criptografia dele não foram encontradas. ' +
        'Sem elas os dados dos pacientes não podem ser lidos. Restaure o arquivo secrets.json ' +
        'do backup, ou apague a pasta de dados para começar do zero.',
    );
    this.name = 'KeysMissingError';
  }
}

/** Como executar o backend: o binário empacotado, ou o código-fonte (desenvolvimento). */
export function backendCommand(resources, port, env = process.env) {
  if (env.QYTHON_BACKEND_DEV) {
    return {
      command: env.QYTHON_PYTHON || 'python3',
      args: ['-m', 'backend.desktop', 'serve', '--port', String(port)],
      cwd: env.QYTHON_BACKEND_DEV,
    };
  }
  const exe = process.platform === 'win32' ? 'qython-backend.exe' : 'qython-backend';
  return {
    command: path.join(resources.backend, exe),
    args: ['serve', '--port', String(port)],
    cwd: undefined,
  };
}

export class Stack extends EventEmitter {
  /**
   * @param {object} o
   * @param {ReturnType<import('./paths.js').layout>} o.paths
   * @param {{backend:string, web:string}} o.resources
   * @param {import('./secrets.js').SecretStore} o.secrets
   * @param {import('./settings.js').Settings} o.settings
   * @param {ReturnType<import('./logger.js').createLogger>} o.logger
   * @param {(text:string)=>void} [o.onStatus]
   * @param {object} [o.env] variáveis extras para o backend (testes e IA)
   */
  constructor(o) {
    super();
    Object.assign(this, { paths: o.paths, resources: o.resources, secrets: o.secrets, settings: o.settings, log: o.logger });
    this.onStatus = o.onStatus ?? (() => {});
    this.extraEnv = o.env ?? {};
    this.pg = null;
    this.backend = null;
    this.webPort = null;
    this.running = false;
  }

  get webUrl() {
    return `http://127.0.0.1:${this.webPort}`;
  }

  async start() {
    const status = (t) => {
      this.log.info(t);
      this.onStatus(t);
    };

    status('Abrindo as chaves de segurança');
    const hadSecrets = this.secrets.exists();
    const dbExists = fs.existsSync(path.join(this.paths.pgData, 'PG_VERSION'));
    if (!hadSecrets && dbExists) throw new KeysMissingError();
    const keys = this.secrets.load();
    if (this.secrets.protection === 'file') {
      this.log.warn('Sem cofre do sistema: as chaves ficam num arquivo protegido só pelas permissões do usuário.');
    }

    fs.mkdirSync(this.paths.data, { recursive: true });
    fs.mkdirSync(this.paths.logs, { recursive: true });

    this.webPort = await pickPort(this.settings.get('webPort'));
    this.settings.set('webPort', this.webPort);
    const pgPort = await pickPort(this.settings.get('pgPort'), { exclude: [this.webPort] });
    this.settings.set('pgPort', pgPort);

    const backendPid = path.join(this.paths.run, 'backend.pid');
    killStale(backendPid, this.log);

    status(dbExists ? 'Iniciando o banco de dados' : 'Criando o banco de dados (só na primeira vez)');
    this.pg = new PostgresService({
      dataDir: this.paths.pgData,
      port: pgPort,
      password: keys.PG_PASSWORD,
      logger: this.log,
      logFile: path.join(this.paths.logs, 'postgres.log'),
    });
    await this.pg.start();

    status(dbExists ? 'Iniciando o Qython' : 'Preparando o Qython (só na primeira vez; pode levar alguns minutos)');
    const cmd = backendCommand(this.resources, this.webPort);
    this.backend = new ManagedProcess({
      name: 'backend',
      command: cmd.command,
      args: cmd.args,
      cwd: cmd.cwd ?? this.paths.data,
      logger: this.log,
      gracefulStdin: true,
      stopTimeoutMs: 20000,
      pidFile: backendPid,
      env: this.backendEnv(keys),
    });
    this.backend.on('failed', () => this.emit('failed', 'O Qython parou de responder.'));
    this.backend.on('restart', () => this.emit('restarted'));
    this.backend.start();

    await waitForHttp(`${this.webUrl}/api/health`, {
      timeoutMs: 600000, // 1ª abertura: cria 70 tabelas e semeia medicamentos, CID-10 e provas
      isAlive: () => this.backend.state !== 'failed' && this.backend.state !== 'stopped',
      validate: (res, body) => res.ok && body.includes('"ok"'),
      onTick: (ms) => {
        if (ms > 0 && ms % 10000 < 500) status(`Aguardando o Qython iniciar (${Math.round(ms / 1000)} s)`);
      },
    });
    this.running = true;
    this.log.info(`Qython pronto em ${this.webUrl}`);
    this.emit('ready');
  }

  backendEnv(keys) {
    const origin = this.webUrl;
    return {
      DATABASE_URL: this.pg.url,
      JWT_SECRET_KEY: keys.JWT_SECRET_KEY,
      QYTHON_FIELD_KEK: keys.QYTHON_FIELD_KEK,
      QYTHON_TOKEN_KEK: keys.QYTHON_TOKEN_KEK,
      QYTHON_EDITION: 'local',
      QYTHON_DATA_DIR: this.paths.data,
      QYTHON_LOG_DIR: path.join(this.paths.logs, 'backend'),
      QYTHON_WEB_DIR: this.resources.web,
      ALLOWED_HOSTS: '127.0.0.1,localhost',
      ALLOWED_ORIGINS: origin,
      WEB_BASE_URL: origin,
      API_BASE_URL: `${origin}/api`,
      PYTHONUNBUFFERED: '1',
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
      ...this.extraEnv,
    };
  }

  async stop() {
    this.running = false;
    if (this.backend) {
      await this.backend.stop();
      this.backend.dispose();
      this.backend = null;
    }
    if (this.pg) {
      await this.pg.stop().catch((err) => this.log.error(`Falha ao desligar o banco: ${err.message}`));
      this.pg = null;
    }
  }
}

export { SecretsUnavailableError };
