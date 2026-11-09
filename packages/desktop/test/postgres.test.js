import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCommand, serverOptions, platformPackage, INITDB_FLAGS } from '../src/postgres.js';

// O pg_ctl start deixa o postgres herdar os canais de saída. Aqui, um "pai" que sai logo e um
// neto que continua segurando os canais por 3 s: o mesmo desenho, em qualquer sistema.
const PAI = `
const { spawn } = require('node:child_process');
spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { stdio: 'inherit', detached: true }).unref();
console.log('pai: saindo');
`;

test('runCommand volta quando o processo termina, mesmo com um neto segurando os canais', async () => {
  const started = Date.now();
  const res = await runCommand(process.execPath, ['-e', PAI]);
  const took = Date.now() - started;
  assert.equal(res.code, 0);
  assert.match(res.stdout, /pai: saindo/);
  assert.ok(took < 2000, `esperou ${took} ms: está presa ao 'close' dos canais herdados`);
});

test('runCommand com prazo mata o comando que não volta e diz isso', async () => {
  const started = Date.now();
  await assert.rejects(
    runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 400 }),
    /não terminou em 0 s|não terminou em 1 s|não terminou/,
  );
  assert.ok(Date.now() - started < 3000);
});

test('runCommand sem canais devolve só o código', async () => {
  const res = await runCommand(process.execPath, ['-e', 'process.exit(7)'], { pipes: false });
  assert.equal(res.code, 7);
  assert.equal(res.stdout, '');
});

test('o Postgres escuta só em 127.0.0.1, sem socket Unix, e nasce em UTF-8 com locale embutido', () => {
  const opts = serverOptions(5432);
  assert.match(opts, /-p 5432/);
  assert.match(opts, /listen_addresses=127\.0\.0\.1/);
  assert.match(opts, /unix_socket_directories= /);
  assert.ok(INITDB_FLAGS.includes('--encoding=UTF8') && INITDB_FLAGS.includes('--locale-provider=builtin'));
});

test('há pacote de binários do Postgres para cada plataforma suportada', () => {
  assert.equal(platformPackage('linux', 'x64'), '@embedded-postgres/linux-x64');
  assert.equal(platformPackage('win32', 'x64'), '@embedded-postgres/windows-x64');
  assert.equal(platformPackage('darwin', 'arm64'), '@embedded-postgres/darwin-arm64');
  assert.throws(() => platformPackage('freebsd', 'x64'), /sem Postgres embarcado/i);
});
