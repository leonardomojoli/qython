// PostgreSQL embarcado.
//
// Os binários vêm dos pacotes @embedded-postgres/<plataforma>, trazidos pela dependência
// `embedded-postgres` (a mesma versão do servidor nos três sistemas). O ciclo de vida
// NÃO usa a classe EmbeddedPostgres do pacote: ela executa o `postgres` direto, e o
// Postgres se recusa a rodar com token de administrador no Windows (o caso de qualquer
// conta sem UAC e do runner do CI). O `pg_ctl` refaz o processo com token restrito, e é
// também o jeito de desligar com segurança (o WAL é gravado) em vez de matar o processo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import pg from 'pg';
import { DB_NAME, DB_USER } from './paths.js';

const require = createRequire(import.meta.url);

// Banco novo: UTF-8 e o locale "builtin" C.UTF-8 do Postgres 17+. Não depende de nenhum
// locale do sistema (o macOS não tem C.UTF-8, o Windows nomeia os locales de outro jeito),
// então o cluster se comporta igual nos três; lower()/upper()/ILIKE tratam acentos.
export const INITDB_FLAGS = ['--encoding=UTF8', '--locale=C', '--locale-provider=builtin', '--builtin-locale=C.UTF-8'];

/** Opções do servidor, como a string de `pg_ctl -o`. */
export function serverOptions(port) {
  return [
    `-p ${port}`,
    '-c listen_addresses=127.0.0.1', // só a própria máquina
    '-c unix_socket_directories=', // o caminho do socket estoura o limite em pastas longas
    '-c max_connections=60',
    '-c shared_buffers=128MB',
    '-c log_min_messages=warning',
  ].join(' ');
}

export function platformPackage(platform = process.platform, arch = process.arch) {
  const known = {
    'linux-x64': 'linux-x64', 'linux-arm64': 'linux-arm64', 'darwin-x64': 'darwin-x64',
    'darwin-arm64': 'darwin-arm64', 'win32-x64': 'windows-x64',
  };
  const key = known[`${platform}-${arch}`];
  if (!key) throw new Error(`Plataforma sem Postgres embarcado: ${platform}-${arch}`);
  return `@embedded-postgres/${key}`;
}

/** Caminhos dos binários (initdb, postgres, pg_ctl) do pacote da plataforma. */
export async function resolveBinaries() {
  const entry = require.resolve(platformPackage());
  const mod = await import(pathToFileURL(entry).href);
  return { initdb: mod.initdb, postgres: mod.postgres, pg_ctl: mod.pg_ctl };
}

function run(bin, args, { env, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: { ...process.env, ...env }, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (input) child.stdin.end(input);
  });
}

export class PostgresService {
  constructor({ dataDir, port, password, logger, logFile }) {
    this.dataDir = dataDir;
    this.port = port;
    this.password = password;
    this.log = logger;
    this.logFile = logFile ?? path.join(path.dirname(dataDir), 'postgres.log');
    this.bin = null;
  }

  get url() {
    return `postgresql://${DB_USER}:${encodeURIComponent(this.password)}@127.0.0.1:${this.port}/${DB_NAME}`;
  }

  get initialized() {
    return fs.existsSync(path.join(this.dataDir, 'PG_VERSION'));
  }

  async initialise() {
    fs.mkdirSync(path.dirname(this.dataDir), { recursive: true });
    const pwDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qython-pw-'));
    const pwFile = path.join(pwDir, 'pw');
    fs.writeFileSync(pwFile, `${this.password}\n`, { mode: 0o600 });
    try {
      const { code, stdout, stderr } = await run(this.bin.initdb, [
        `--pgdata=${this.dataDir}`, '--auth=scram-sha-256', `--username=${DB_USER}`, `--pwfile=${pwFile}`,
        ...INITDB_FLAGS,
      ], { env: { LC_MESSAGES: 'C' } });
      if (code !== 0) throw new Error(`initdb falhou (código ${code}): ${stderr || stdout}`);
    } finally {
      fs.rmSync(pwDir, { recursive: true, force: true });
    }
  }

  async isRunning() {
    const { code } = await run(this.bin.pg_ctl, ['status', '-D', this.dataDir]);
    return code === 0;
  }

  async start() {
    this.bin = await resolveBinaries();
    if (!this.initialized) {
      this.log.info('Criando o banco de dados (primeira abertura).');
      await this.initialise();
    }
    // Um Postgres que sobrou de uma queda do app segura o diretório de dados e a porta
    // antiga. Desliga com segurança antes de subir o novo.
    if (await this.isRunning()) {
      this.log.warn('Havia um Postgres de uma abertura anterior; desligando.');
      await this.stop();
    }
    const started = await run(this.bin.pg_ctl, [
      'start', '-D', this.dataDir, '-o', serverOptions(this.port), '-l', this.logFile, '-w', '-t', '120',
    ]);
    if (started.code !== 0) {
      let tail = '';
      try {
        tail = fs.readFileSync(this.logFile, 'utf8').split('\n').slice(-12).join('\n');
      } catch {
        // sem log
      }
      throw new Error(`O PostgreSQL não iniciou: ${started.stderr || started.stdout}\n${tail}`);
    }
    await this.ensureDatabase();
  }

  async ensureDatabase() {
    const client = new pg.Client({
      host: '127.0.0.1', port: this.port, user: DB_USER, password: this.password, database: 'postgres',
    });
    await client.connect();
    try {
      const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
      if (found.rowCount === 0) {
        this.log.info(`Criando o banco "${DB_NAME}".`);
        await client.query(`CREATE DATABASE ${client.escapeIdentifier(DB_NAME)}`);
      }
    } finally {
      await client.end();
    }
  }

  /** Desligamento rápido e seguro: grava o WAL e fecha as conexões. */
  async stop() {
    this.bin ??= await resolveBinaries();
    const { code, stderr } = await run(this.bin.pg_ctl, ['stop', '-D', this.dataDir, '-m', 'fast', '-w', '-t', '60']);
    if (code !== 0 && (await this.isRunning())) {
      throw new Error(`pg_ctl stop falhou (código ${code}): ${stderr}`);
    }
  }
}
