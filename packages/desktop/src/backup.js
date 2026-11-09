// Backup e restauração do perfil do Qython.
//
// O backup é UM arquivo (.qybackup) cifrado com a senha que o médico escolhe: scrypt para
// derivar a chave e AES-256-GCM sobre um tar comprimido. Dentro dele vão o banco (a pasta do
// cluster, com o Postgres parado), a pasta de dados do backend (biblioteca, exportações,
// Chroma) e as chaves de criptografia. As chaves precisam ir junto: sem elas, as colunas
// cifradas (CPF, RG, notas clínicas) ficam ilegíveis no computador novo. É por isso que o
// arquivo INTEIRO é cifrado, e não só um pedaço dele.
//
// Não leva os modelos de IA (dezenas de GB, baixados de novo pelo assistente), os logs nem
// os PIDs.
//
// A restauração NUNCA apaga o que existia: o banco e os dados atuais vão para uma pasta
// `antes-do-restauro-<data>` ao lado, e o médico decide quando descartar.
//
// Limite conhecido: a pasta do cluster do Postgres só serve para o mesmo sistema, a mesma
// arquitetura e a mesma versão maior do Postgres. Fora disso a restauração se recusa, em vez
// de entregar um banco que não abre.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

export class BackupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackupError';
  }
}

export const EXTENSION = '.qybackup';
const MAGIC = Buffer.from('QYBK');
const FORMAT = 1;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + 1 + SALT_LEN + IV_LEN;
const META_FILE = 'qython-backup.json';
const MIN_PASSPHRASE = 8;
/** O que entra no backup, relativo ao perfil. */
const PARTS = ['db', 'data'];

/** O tar do sistema. No Windows, o do Git for Windows (GNU) lê "C:" como máquina remota: usa o bsdtar do Windows. */
export function tarBinary() {
  if (process.platform === 'win32') return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  return 'tar';
}

function deriveKey(passphrase, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      String(passphrase).normalize('NFKC'), salt, 32,
      { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

function runTar(args) {
  const child = spawn(tarBinary(), args, {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, COPYFILE_DISABLE: '1' }, // macOS: sem arquivos ._ de metadados
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
  const done = new Promise((resolve, reject) => {
    child.on('error', (err) => reject(new BackupError(`Não foi possível executar o tar (${tarBinary()}): ${err.message}`)));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new BackupError(`O tar falhou (código ${code}): ${stderr.trim()}`))));
  });
  return { child, done };
}

export function pgMajorOf(pgVersionFile) {
  const text = fs.readFileSync(pgVersionFile, 'utf8').trim();
  return text.split('.')[0];
}

/**
 * Cria o backup. O Postgres e o Chroma precisam estar PARADOS (o chamador para a pilha).
 *
 * @param {object} o
 * @param {string} o.root perfil do usuário
 * @param {Record<string,string>} o.secrets as chaves em claro (vão cifradas dentro do arquivo)
 * @param {string} o.passphrase
 * @param {string} o.outFile destino
 * @param {string} [o.appVersion]
 * @returns {Promise<{file:string, bytes:number}>}
 */
export async function createBackup({ root, secrets, passphrase, outFile, appVersion = null }) {
  if (!passphrase || String(passphrase).length < MIN_PASSPHRASE) {
    throw new BackupError(`A senha do backup precisa ter ao menos ${MIN_PASSPHRASE} caracteres.`);
  }
  const pgVersionFile = path.join(root, 'db', 'data', 'PG_VERSION');
  if (!fs.existsSync(pgVersionFile)) throw new BackupError('Não há banco de dados para guardar no backup.');

  const stage = fs.mkdtempSync(path.join(root, '.backup-'));
  const partial = `${outFile}.parcial`;
  try {
    fs.writeFileSync(path.join(stage, META_FILE), JSON.stringify({
      format: FORMAT, createdAt: new Date().toISOString(), app: appVersion,
      platform: process.platform, arch: process.arch,
      pgMajor: pgMajorOf(pgVersionFile), secrets,
    }), { mode: 0o600 });

    const salt = crypto.randomBytes(SALT_LEN);
    const iv = crypto.randomBytes(IV_LEN);
    const header = Buffer.concat([MAGIC, Buffer.from([FORMAT]), salt, iv]);
    const key = await deriveKey(passphrase, salt);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(header);

    const args = ['-cf', '-'];
    for (const part of PARTS) if (fs.existsSync(path.join(root, part))) args.push('-C', root, part);
    args.push('-C', stage, META_FILE);
    const tar = runTar(args);
    tar.child.stdin.end();

    fs.writeFileSync(partial, header, { mode: 0o600 });
    const out = fs.createWriteStream(partial, { flags: 'a' });
    const [piped, tarResult] = await Promise.allSettled([
      pipeline(tar.child.stdout, zlib.createGzip(), cipher, out),
      tar.done,
    ]);
    if (tarResult.status === 'rejected') throw tarResult.reason;
    if (piped.status === 'rejected') throw piped.reason;
    fs.appendFileSync(partial, cipher.getAuthTag());
    fs.renameSync(partial, outFile);
    return { file: outFile, bytes: fs.statSync(outFile).size };
  } catch (err) {
    fs.rmSync(partial, { force: true });
    throw err;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

/**
 * Abre o backup (decifra e extrai numa pasta de trabalho) sem tocar no perfil atual.
 * @returns {Promise<{meta:object, stage:string}>}
 */
export async function openBackup({ file, passphrase, root }) {
  let size;
  try {
    size = fs.statSync(file).size;
  } catch (err) {
    throw new BackupError(`Não consegui abrir o arquivo de backup: ${err.message}`);
  }
  if (size < HEADER_LEN + TAG_LEN + 1) throw new BackupError('Este arquivo não é um backup do Qython.');
  const fd = fs.openSync(file, 'r');
  const header = Buffer.alloc(HEADER_LEN);
  const tag = Buffer.alloc(TAG_LEN);
  try {
    fs.readSync(fd, header, 0, HEADER_LEN, 0);
    fs.readSync(fd, tag, 0, TAG_LEN, size - TAG_LEN);
  } finally {
    fs.closeSync(fd);
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new BackupError('Este arquivo não é um backup do Qython.');
  if (header[MAGIC.length] !== FORMAT) throw new BackupError('Este backup é de uma versão do Qython que este app não conhece.');

  const salt = header.subarray(MAGIC.length + 1, MAGIC.length + 1 + SALT_LEN);
  const iv = header.subarray(MAGIC.length + 1 + SALT_LEN);
  const key = await deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);

  const stage = fs.mkdtempSync(path.join(root, '.restauro-'));
  try {
    const tar = runTar(['-xf', '-', '-C', stage]);
    // A autenticidade só é conferida no fim da decifragem: por isso tudo vai para uma pasta
    // de trabalho, e o perfil só é tocado depois que isto retorna sem erro.
    const [piped, tarResult] = await Promise.allSettled([
      pipeline(fs.createReadStream(file, { start: HEADER_LEN, end: size - TAG_LEN - 1 }), decipher, zlib.createGunzip(), tar.child.stdin),
      tar.done,
    ]);
    if (piped.status === 'rejected') throw new BackupError('Senha incorreta, ou o arquivo de backup está corrompido.');
    if (tarResult.status === 'rejected') throw tarResult.reason;

    const metaFile = path.join(stage, META_FILE);
    if (!fs.existsSync(metaFile)) throw new BackupError('O backup está incompleto (sem os metadados).');
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    fs.rmSync(metaFile, { force: true });
    return { meta, stage };
  } catch (err) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw err;
  }
}

/** Recusa o que o Postgres não abriria (outro sistema, arquitetura ou versão maior). */
export function checkCompatible(meta, { pgMajor, platform = process.platform, arch = process.arch }) {
  if (meta.platform !== platform || meta.arch !== arch) {
    throw new BackupError(
      `Este backup foi feito em ${meta.platform}/${meta.arch} e este computador é ${platform}/${arch}. ` +
        'O banco de dados só pode ser restaurado no mesmo tipo de sistema.',
    );
  }
  if (pgMajor && String(meta.pgMajor) !== String(pgMajor)) {
    throw new BackupError(
      `Este backup usa o PostgreSQL ${meta.pgMajor} e este app usa o ${pgMajor}. Restaure com a versão do Qython que o criou.`,
    );
  }
}

/**
 * Troca o banco e os dados atuais pelos do backup. O que havia vai para `antes-do-restauro-*`.
 * Se algo falhar no meio, devolve o que já tinha movido.
 * @returns {{antes:string}}
 */
export function applyRestore({ root, stage, secretsFile, now = new Date() }) {
  const antes = path.join(root, `antes-do-restauro-${now.toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(antes, { recursive: true });
  const moved = [];
  const move = (from, to) => {
    renameWithRetry(from, to);
    moved.push([from, to]);
  };
  try {
    for (const part of PARTS) {
      if (fs.existsSync(path.join(root, part))) move(path.join(root, part), path.join(antes, part));
    }
    if (secretsFile && fs.existsSync(secretsFile)) fs.copyFileSync(secretsFile, path.join(antes, path.basename(secretsFile)));
    for (const part of PARTS) {
      if (fs.existsSync(path.join(stage, part))) move(path.join(stage, part), path.join(root, part));
    }
  } catch (err) {
    for (const [from, to] of moved.reverse()) {
      try {
        fs.renameSync(to, from);
      } catch {
        // melhor esforço: o que ficou está em `antes`
      }
    }
    throw new BackupError(`Não consegui trocar os dados (eles foram mantidos): ${err.message}`);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  return { antes };
}

/**
 * Desfaz um `applyRestore` (quando o passo seguinte falha): o que veio do backup sai do
 * caminho e o que havia antes volta.
 */
export function undoRestore({ root, antes, secretsFile, now = new Date() }) {
  const descartado = path.join(root, `restauro-descartado-${now.toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(descartado, { recursive: true });
  for (const part of PARTS) {
    if (fs.existsSync(path.join(root, part))) renameWithRetry(path.join(root, part), path.join(descartado, part));
    if (fs.existsSync(path.join(antes, part))) renameWithRetry(path.join(antes, part), path.join(root, part));
  }
  const oldSecrets = secretsFile && path.join(antes, path.basename(secretsFile));
  if (oldSecrets && fs.existsSync(oldSecrets)) fs.copyFileSync(oldSecrets, secretsFile);
  return { descartado };
}

/** No Windows um antivírus ou o indexador ainda pode estar com um arquivo aberto por um instante. */
function renameWithRetry(from, to, tries = 40) {
  for (let i = 0; ; i += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (i >= tries || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

/** Nome sugerido para o arquivo de backup. */
export function suggestedName(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `qython-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${EXTENSION}`;
}
