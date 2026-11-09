import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  BackupError, applyRestore, checkCompatible, createBackup, openBackup, suggestedName, undoRestore,
} from '../src/backup.js';
import { PG_MAJOR, platformPackage } from '../src/postgres.js';
import { GENERATORS, SecretStore } from '../src/secrets.js';

const SECRETS = Object.fromEntries(Object.keys(GENERATORS).map((k) => [k, GENERATORS[k]()]));

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qython-backup-'));
}

/** Um perfil de mentira com o mesmo desenho do real (db/data, data/...). */
function fakeProfile(root, marker = 'v1') {
  fs.mkdirSync(path.join(root, 'db', 'data', 'base'), { recursive: true });
  fs.writeFileSync(path.join(root, 'db', 'data', 'PG_VERSION'), `${PG_MAJOR}\n`);
  fs.writeFileSync(path.join(root, 'db', 'data', 'base', 'tabela'), `linhas-${marker}`);
  fs.mkdirSync(path.join(root, 'data', 'uploads', 'sub'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'uploads', 'sub', 'receita.pdf'), `%PDF-${marker} acentuação ção`);
  fs.mkdirSync(path.join(root, 'models'), { recursive: true });
  fs.writeFileSync(path.join(root, 'models', 'grande.gguf'), 'não vai no backup');
  fs.writeFileSync(path.join(root, 'secrets.json'), '{"antigo":true}');
}

test('o PG_MAJOR do app é o do pacote de binários do Postgres', () => {
  const require = createRequire(import.meta.url);
  let dir = path.dirname(require.resolve(platformPackage()));
  let version = null;
  while (dir !== path.dirname(dir)) {
    const file = path.join(dir, 'package.json');
    if (fs.existsSync(file)) {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (pkg.name === platformPackage()) { version = pkg.version; break; }
    }
    dir = path.dirname(dir);
  }
  assert.ok(version, 'não achei o package.json do pacote do Postgres');
  assert.equal(version.split('.')[0], PG_MAJOR);
});

test('backup e restauração: volta o banco e os dados, guarda o que havia e não leva os modelos', async () => {
  const root = tmp();
  try {
    fakeProfile(root, 'v1');
    const out = path.join(root, 'saida', suggestedName());
    fs.mkdirSync(path.dirname(out));
    const { bytes } = await createBackup({ root, secrets: SECRETS, passphrase: 'senha-do-backup', outFile: out });
    assert.ok(bytes > 100);
    // O arquivo é cifrado de ponta a ponta: nada legível dentro dele.
    const raw = fs.readFileSync(out);
    assert.equal(raw.subarray(0, 4).toString(), 'QYBK');
    assert.ok(!raw.includes(Buffer.from('linhas-v1')) && !raw.includes(Buffer.from(SECRETS.QYTHON_FIELD_KEK)));
    assert.equal(fs.existsSync(`${out}.parcial`), false);

    // O médico segue usando e muda o dado; depois restaura.
    fs.writeFileSync(path.join(root, 'db', 'data', 'base', 'tabela'), 'linhas-v2-depois-do-backup');
    const { meta, stage } = await openBackup({ file: out, passphrase: 'senha-do-backup', root });
    assert.deepEqual(meta.secrets, SECRETS);
    checkCompatible(meta, { pgMajor: PG_MAJOR });
    const { antes } = applyRestore({ root, stage, secretsFile: path.join(root, 'secrets.json') });

    assert.equal(fs.readFileSync(path.join(root, 'db', 'data', 'base', 'tabela'), 'utf8'), 'linhas-v1');
    assert.equal(fs.readFileSync(path.join(root, 'data', 'uploads', 'sub', 'receita.pdf'), 'utf8'), '%PDF-v1 acentuação ção');
    // O que existia antes da restauração está guardado, não apagado.
    assert.equal(fs.readFileSync(path.join(antes, 'db', 'data', 'base', 'tabela'), 'utf8'), 'linhas-v2-depois-do-backup');
    assert.equal(fs.readFileSync(path.join(antes, 'secrets.json'), 'utf8'), '{"antigo":true}');
    // Modelos de IA e a pasta de trabalho não fazem parte do backup.
    assert.equal(fs.readFileSync(path.join(root, 'models', 'grande.gguf'), 'utf8'), 'não vai no backup');
    assert.equal(fs.existsSync(stage), false);
    assert.deepEqual(fs.readdirSync(root).filter((n) => n.startsWith('.')), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('senha errada e arquivo adulterado não restauram nada e não mexem no perfil', async () => {
  const root = tmp();
  try {
    fakeProfile(root);
    const out = path.join(root, 'b.qybackup');
    await createBackup({ root, secrets: SECRETS, passphrase: 'senha-do-backup', outFile: out });

    await assert.rejects(openBackup({ file: out, passphrase: 'outra-senha-qualquer', root }), (e) => e instanceof BackupError && /Senha incorreta/.test(e.message));

    const bytes = fs.readFileSync(out);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff; // um byte trocado no meio
    const adulterado = path.join(root, 'c.qybackup');
    fs.writeFileSync(adulterado, bytes);
    await assert.rejects(openBackup({ file: adulterado, passphrase: 'senha-do-backup', root }), /Senha incorreta, ou o arquivo/);

    const truncado = path.join(root, 'd.qybackup');
    fs.writeFileSync(truncado, fs.readFileSync(out).subarray(0, 200));
    await assert.rejects(openBackup({ file: truncado, passphrase: 'senha-do-backup', root }), BackupError);

    assert.deepEqual(fs.readdirSync(root).filter((n) => n.startsWith('.') || n.startsWith('antes')), []);
    assert.equal(fs.readFileSync(path.join(root, 'db', 'data', 'base', 'tabela'), 'utf8'), 'linhas-v1');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('recusa um arquivo que não é backup e uma senha curta', async () => {
  const root = tmp();
  try {
    fakeProfile(root);
    const lixo = path.join(root, 'x.qybackup');
    fs.writeFileSync(lixo, 'isto não é um backup, é só texto comprido o bastante para passar do cabeçalho');
    await assert.rejects(openBackup({ file: lixo, passphrase: 'senha-do-backup', root }), /não é um backup do Qython/);
    await assert.rejects(createBackup({ root, secrets: SECRETS, passphrase: 'curta', outFile: path.join(root, 'y') }), /ao menos 8/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('recusa restaurar em outro sistema, outra arquitetura ou outra versão do Postgres', () => {
  const meta = { platform: 'linux', arch: 'x64', pgMajor: '18' };
  checkCompatible(meta, { pgMajor: '18', platform: 'linux', arch: 'x64' });
  assert.throws(() => checkCompatible(meta, { pgMajor: '18', platform: 'win32', arch: 'x64' }), /mesmo tipo de sistema/);
  assert.throws(() => checkCompatible(meta, { pgMajor: '18', platform: 'linux', arch: 'arm64' }), /mesmo tipo de sistema/);
  assert.throws(() => checkCompatible(meta, { pgMajor: '19', platform: 'linux', arch: 'x64' }), /PostgreSQL 18/);
});

test('se a troca falha no meio, os dados atuais são devolvidos', async () => {
  const root = tmp();
  try {
    fakeProfile(root, 'atual');
    const stage = fs.mkdtempSync(path.join(root, '.restauro-'));
    fs.mkdirSync(path.join(stage, 'db', 'data'), { recursive: true });
    fs.writeFileSync(path.join(stage, 'db', 'data', 'PG_VERSION'), PG_MAJOR);
    // Sabotagem: o "arquivo de chaves" é uma pasta, então a cópia dele falha DEPOIS de o banco
    // e os dados já terem sido movidos para `antes-do-restauro-*`.
    const secretsFile = path.join(root, 'secrets-que-e-pasta');
    fs.mkdirSync(secretsFile);
    assert.throws(() => applyRestore({ root, stage, secretsFile }), (e) => e instanceof BackupError && /foram mantidos/.test(e.message));
    assert.equal(fs.readFileSync(path.join(root, 'db', 'data', 'base', 'tabela'), 'utf8'), 'linhas-atual');
    assert.equal(fs.readFileSync(path.join(root, 'data', 'uploads', 'sub', 'receita.pdf'), 'utf8'), '%PDF-atual acentuação ção');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('SecretStore.replaceAll troca todas as chaves pelas do backup e exige todas', async () => {
  const root = tmp();
  try {
    const store = new SecretStore(path.join(root, 'secrets.json'), null);
    const originais = await store.load();
    assert.notEqual(originais.QYTHON_FIELD_KEK, SECRETS.QYTHON_FIELD_KEK);
    await assert.rejects(store.replaceAll({ QYTHON_FIELD_KEK: 'x' }), /não traz a chave/);
    await store.replaceAll(SECRETS);
    const outra = new SecretStore(path.join(root, 'secrets.json'), null);
    assert.deepEqual(await outra.load(), SECRETS);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('undoRestore devolve o banco, os dados e as chaves de antes', async () => {
  const root = tmp();
  try {
    fakeProfile(root, 'v1');
    const out = path.join(root, 'b.qybackup');
    await createBackup({ root, secrets: SECRETS, passphrase: 'senha-do-backup', outFile: out });
    fs.writeFileSync(path.join(root, 'db', 'data', 'base', 'tabela'), 'linhas-atuais');
    const { stage } = await openBackup({ file: out, passphrase: 'senha-do-backup', root });
    const secretsFile = path.join(root, 'secrets.json');
    const { antes } = applyRestore({ root, stage, secretsFile });
    fs.writeFileSync(secretsFile, '{"novo":true}'); // o que replaceAll teria escrito
    undoRestore({ root, antes, secretsFile });
    assert.equal(fs.readFileSync(path.join(root, 'db', 'data', 'base', 'tabela'), 'utf8'), 'linhas-atuais');
    assert.equal(fs.readFileSync(secretsFile, 'utf8'), '{"antigo":true}');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
