import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ManagedProcess } from '../src/supervisor.js';
import { OnDemandService } from '../src/ondemand.js';
import { randomFreePort } from '../src/ports.js';

const quiet = { info() {}, warn() {}, error() {}, sink: () => ({ write() {}, close() {} }) };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Espera uma condição de verdade em vez de um tempo fixo: o desligamento leva mais no Windows.
async function until(cond, ms = 8000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) assert.fail('a condição não se cumpriu a tempo');
    await wait(50);
  }
}

// Um "llama-server" de mentira: /health só responde 200 depois de um tempo, /echo devolve o
// corpo, /stream manda pedaços, /slow demora, e cada início grava uma linha em stdout.
const FAKE = `
const http = require('http');
const port = Number(process.argv[1]);
const readyAt = Date.now() + Number(process.env.READY_MS || 300);
if (process.env.STOP_DELAY_MS) process.on('SIGTERM', () => setTimeout(() => process.exit(0), Number(process.env.STOP_DELAY_MS)));
http.createServer((req, res) => {
  if (req.url === '/health') { res.statusCode = Date.now() < readyAt ? 503 : 200; return res.end('{}'); }
  if (req.url === '/stream') { let n = 0; res.write('a'); const t = setInterval(() => { res.write('b'); if (++n === 3) { clearInterval(t); res.end('z'); } }, 40); return; }
  if (req.url === '/hang') { req.on('close', () => console.log('CLOSED')); return; }
  let body = ''; req.on('data', (d) => body += d); req.on('end', () => res.end(JSON.stringify({ got: body, auth: req.headers.authorization || null })));
}).listen(port, '127.0.0.1');
`;

async function setup(opts = {}) {
  const output = [];
  const capture = { ...quiet, sink: () => ({ write: (c) => output.push(String(c)), close() {} }) };
  const publicPort = await randomFreePort();
  const privatePort = await randomFreePort();
  const spawned = [];
  const svc = new OnDemandService({
    name: 'fake', publicPort, privatePort, readyPath: '/health', logger: quiet, idleMs: opts.idleMs ?? 0,
    readyTimeoutMs: opts.readyTimeoutMs ?? 10000, unavailable: opts.unavailable,
    createProcess: () => {
      const p = new ManagedProcess({
        name: 'fake', command: process.execPath, args: ['-e', FAKE, String(privatePort)],
        env: { READY_MS: String(opts.readyMs ?? 300), ...(opts.stopDelayMs ? { STOP_DELAY_MS: String(opts.stopDelayMs) } : {}) }, logger: capture, restart: null, stopTimeoutMs: 2000,
      });
      spawned.push(p);
      return p;
    },
  });
  await svc.listen();
  return { svc, base: `http://127.0.0.1:${publicPort}`, spawned, output };
}

test('só sobe o processo no primeiro pedido, e repassa método, corpo e cabeçalhos', async () => {
  const { svc, base, spawned } = await setup();
  try {
    assert.equal(svc.state, 'idle');
    assert.equal(spawned.length, 0);
    const res = await fetch(`${base}/echo`, { method: 'POST', body: 'olá', headers: { Authorization: 'Bearer k' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { got: 'olá', auth: 'Bearer k' });
    assert.equal(svc.state, 'running');
    await fetch(`${base}/echo`);
    assert.equal(spawned.length, 1, 'o segundo pedido deveria reaproveitar o processo');
  } finally { await svc.stop(); }
});

test('pedidos simultâneos durante o início esperam o mesmo processo', async () => {
  const { svc, base, spawned } = await setup({ readyMs: 600 });
  try {
    const results = await Promise.all([1, 2, 3].map((i) => fetch(`${base}/echo`, { method: 'POST', body: String(i) }).then((r) => r.json())));
    assert.deepEqual(results.map((r) => r.got).sort(), ['1', '2', '3']);
    assert.equal(spawned.length, 1);
  } finally { await svc.stop(); }
});

test('repassa a resposta em pedaços, sem esperar o fim', async () => {
  const { svc, base } = await setup();
  try {
    const res = await fetch(`${base}/stream`);
    const chunks = [];
    for await (const c of res.body) chunks.push(Buffer.from(c).toString());
    assert.equal(chunks.join(''), 'abbbz');
    assert.ok(chunks.length > 1, 'deveria chegar em mais de um pedaço');
  } finally { await svc.stop(); }
});

test('desliga o processo depois de parado e o sobe de novo no pedido seguinte', async () => {
  const { svc, base, spawned } = await setup({ idleMs: 400 });
  try {
    await fetch(`${base}/echo`).then((r) => r.text());
    assert.equal(svc.state, 'running');
    const first = spawned[0];
    await until(() => svc.state === 'idle');
    assert.equal(first.isAlive(), false);
    const res = await fetch(`${base}/echo`);
    assert.equal(res.status, 200);
    assert.equal(spawned.length, 2);
    assert.equal(svc.state, 'running');
  } finally { await svc.stop(); }
});

test('um pedido em andamento impede o desligamento por inatividade', async () => {
  const { svc, base, spawned } = await setup({ idleMs: 300 });
  try {
    await fetch(`${base}/echo`).then((r) => r.text());
    const res = await fetch(`${base}/stream`); // dura ~120 ms; o ocioso (300 ms) só conta depois
    await res.text();
    assert.equal(svc.state, 'running');
    assert.equal(spawned.length, 1);
  } finally { await svc.stop(); }
});

test('responde 503 em JSON quando o serviço não pode atender', async () => {
  const { svc, base, spawned } = await setup({ unavailable: () => 'A IA ainda está sendo baixada (37%).' });
  try {
    const res = await fetch(`${base}/v1/chat/completions`, { method: 'POST', body: '{}' });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error.message, /37%/);
    assert.equal(spawned.length, 0, 'não deve subir o processo à toa');
  } finally { await svc.stop(); }
});

test('se o processo não fica pronto no prazo, o pedido falha e o próximo tenta de novo', async () => {
  const { svc, base } = await setup({ readyMs: 60000, readyTimeoutMs: 800 });
  try {
    const res = await fetch(`${base}/echo`);
    assert.equal(res.status, 503);
    assert.match((await res.json()).error.message, /não iniciou/);
    assert.equal(svc.state, 'idle');
  } finally { await svc.stop(); }
});

test('quando o cliente desiste, o pedido ao processo é cancelado (o modelo para de gerar)', async () => {
  const { svc, base, spawned, output } = await setup();
  try {
    const ac = new AbortController();
    const p = fetch(`${base}/hang`, { signal: ac.signal }).catch(() => {});
    await wait(800);
    ac.abort();
    await p;
    await wait(300);
    assert.equal(svc.inflight, 0);
    assert.equal(spawned.length, 1);
    assert.ok(output.join('').includes('CLOSED'), 'o processo deveria ter visto a conexão fechar');
  } finally { await svc.stop(); }
});

test('um pedido durante o desligamento espera o processo antigo morrer e sobe um novo', async () => {
  const { svc, base, spawned } = await setup({ idleMs: 0, stopDelayMs: 700 });
  try {
    await fetch(`${base}/echo`).then((r) => r.text());
    const stopping = svc.stopChild(); // o SIGTERM demora 700 ms para valer (no Windows morre na hora)
    const res = await fetch(`${base}/echo`);
    assert.equal(res.status, 200);
    await stopping;
    assert.equal(spawned.length, 2);
    assert.equal(spawned[0].isAlive(), false);
    assert.equal(svc.state, 'running');
  } finally { await svc.stop(); }
});
