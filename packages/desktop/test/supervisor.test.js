import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ManagedProcess, killStale } from '../src/supervisor.js';

const quiet = {
  info() {}, warn() {}, error() {},
  sink: () => ({ write() {}, close() {} }),
};
const node = process.execPath;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 8000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout no teste');
    await wait(25);
  }
};

test('reinicia o processo que cai', async () => {
  const p = new ManagedProcess({
    name: 't', command: node, args: ['-e', 'setTimeout(() => process.exit(3), 100)'], logger: quiet,
    restart: { max: 10, windowMs: 60000, backoffMs: [50] },
  });
  let restarts = 0;
  p.on('restart', () => { restarts += 1; });
  p.start();
  await until(() => restarts >= 2);
  await p.stop();
  assert.equal(p.state, 'stopped');
});

test('desiste depois de cair vezes demais', async () => {
  const p = new ManagedProcess({
    name: 't', command: node, args: ['-e', 'process.exit(1)'], logger: quiet,
    restart: { max: 2, windowMs: 60000, backoffMs: [20] },
  });
  let failed = false;
  p.on('failed', () => { failed = true; });
  p.start();
  await until(() => failed);
  assert.equal(p.state, 'failed');
});

test('encerra com educação fechando o stdin, e o pid file some', async () => {
  const pidFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qy-sup-')), 'run', 'x.pid');
  const p = new ManagedProcess({
    name: 't', command: node, args: ['-e', 'process.stdin.resume(); process.stdin.on("end", () => process.exit(0))'],
    logger: quiet, gracefulStdin: true, pidFile,
  });
  p.start();
  await until(() => fs.existsSync(pidFile));
  assert.equal(Number(fs.readFileSync(pidFile, 'utf8')), p.pid);
  const t0 = Date.now();
  await p.stop();
  assert.ok(Date.now() - t0 < 3000, 'deveria sair logo ao fechar o stdin');
  assert.equal(p.isAlive(), false);
  assert.equal(fs.existsSync(pidFile), false);
});

test('força o encerramento de quem ignora o pedido', { skip: process.platform === 'win32' }, async () => {
  const p = new ManagedProcess({
    name: 't', command: node, args: ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'],
    logger: quiet, gracefulStdin: false, stopTimeoutMs: 400,
  });
  p.start();
  await wait(300);
  await p.stop();
  assert.equal(p.isAlive(), false);
});

test('parar um processo que nunca subiu não falha', async () => {
  const p = new ManagedProcess({ name: 't', command: node, logger: quiet });
  await p.stop();
  assert.equal(p.state, 'stopped');
});

test('killStale encerra o processo órfão apontado pelo pid file', { skip: process.platform === 'win32' }, async () => {
  const { spawn } = await import('node:child_process');
  const orphan = spawn(node, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const pidFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qy-stale-')), 'b.pid');
  fs.writeFileSync(pidFile, String(orphan.pid));
  assert.equal(killStale(pidFile, quiet), true);
  await new Promise((resolve) => orphan.on('exit', resolve));
  assert.equal(fs.existsSync(pidFile), false);
  // Sem arquivo, ou com pid que não existe mais: nada a fazer.
  assert.equal(killStale(pidFile, quiet), false);
  fs.writeFileSync(pidFile, '999999');
  assert.equal(killStale(pidFile, quiet), false);
});

test('a chave de API passada ao processo não aparece no log', async () => {
  const lines = [];
  const logger = { ...quiet, info: (m) => lines.push(m) };
  const p = new ManagedProcess({
    name: 't', command: node, args: ['-e', 'setTimeout(() => {}, 200)', '--api-key', 'SEGREDO123'], logger, restart: null,
  });
  p.start();
  await p.stop();
  assert.ok(lines.some((l) => l.includes('iniciando')));
  assert.ok(!lines.join('\n').includes('SEGREDO123'), 'a chave vazou no log');
});
