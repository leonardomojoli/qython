import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LanAccess, LanServer } from '../src/lan.js';
import { Settings } from '../src/settings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const quiet = { info() {}, warn() {}, error() {} };

/** Gera o certificado com o MESMO código que o app usa (backend/lan_cert.py). Sem cryptography, pula. */
function makeCert() {
  const run = spawnSync(process.env.QYTHON_PYTHON || 'python3',
    ['-c', 'import json; from backend.lan_cert import generate_certificate as g; print(json.dumps(g()))'],
    { cwd: repo, encoding: 'utf8' });
  if (run.status !== 0) return null;
  return JSON.parse(run.stdout.trim().split('\n').pop());
}
const cert = makeCert();
const opts = { skip: cert ? false : 'sem python3 com cryptography para gerar o certificado' };

/** Backend de mentira: guarda o que recebeu e responde com o que a rota pede. */
async function fakeBackend() {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, url: req.url }));
    });
  });
  const upgraded = new Set(); // o http.Server não fecha WebSockets: sem isto, close() espera para sempre
  server.on('upgrade', (req, socket) => {
    upgraded.add(socket);
    seen.push({ method: 'UPGRADE', url: req.url, headers: req.headers });
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nola-do-backend');
    socket.on('data', (d) => socket.write(`eco:${d}`));
    socket.on('error', () => {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    seen, port: server.address().port,
    close: () => new Promise((r) => { for (const s of upgraded) s.destroy(); server.closeAllConnections?.(); server.close(r); }),
  };
}

/** Cliente como o do celular: só aceita o certificado com a impressão digital pareada. */
function client(port, { fingerprint, method = 'GET', url, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    // O certificado pareado entra como única âncora de confiança (como a verificação do celular, que
    // só confia na impressão digital); o nome do servidor é ignorado, vale a impressão digital.
    const req = https.request({
      host: '127.0.0.1', port, path: url, method, headers, ca: cert.cert_pem, agent: false,
      checkServerIdentity: (_host, peer) => {
        const got = crypto.createHash('sha256').update(peer.raw).digest('hex');
        return got === fingerprint ? undefined : new Error(`impressão digital diferente: ${got}`);
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function up() {
  const backend = await fakeBackend();
  const lan = new LanServer({ backendPort: () => backend.port, logger: quiet });
  await lan.start({ port: 0, host: '127.0.0.1', cert: cert.cert_pem, key: cert.key_pem });
  return { backend, lan, fp: cert.fingerprint, call: (o) => client(lan.port, { fingerprint: cert.fingerprint, ...o }) };
}

test('repassa ao backend o que a política deixa passar, com o Host e a origem certos', opts, async () => {
  const { backend, lan, call } = await up();
  try {
    const health = await call({ url: '/api/health' });
    assert.equal(health.status, 200);
    const info = await call({ url: '/api/user/info?x=1', headers: { Authorization: 'Bearer abc' } });
    assert.equal(info.status, 200);
    const posted = await call({ method: 'POST', url: '/api/patients', headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' }, body: '{"nome":"Maria"}' });
    assert.equal(posted.status, 200);
    assert.equal(backend.seen.length, 3);
    assert.equal(backend.seen[1].url, '/api/user/info?x=1');
    assert.equal(backend.seen[1].headers.host, `127.0.0.1:${backend.port}`, 'o backend só aceita o Host local');
    assert.equal(backend.seen[1].headers['x-forwarded-for'], '127.0.0.1');
    assert.equal(backend.seen[2].body, '{"nome":"Maria"}');
  } finally {
    await lan.stop();
    await backend.close();
  }
});

test('o que a política barra nem chega ao backend', opts, async () => {
  const { backend, lan, call } = await up();
  try {
    assert.equal((await call({ method: 'POST', url: '/api/auth/login', body: 'username=a&password=b' })).status, 403);
    assert.equal((await call({ method: 'POST', url: '/api/pairing/start', headers: { Authorization: 'Bearer x' } })).status, 403);
    assert.equal((await call({ url: '/' })).status, 404);
    assert.equal((await call({ url: '/static/uploads/a.png', headers: { Authorization: 'Bearer x' } })).status, 404);
    assert.equal((await call({ url: '/api/user/info' })).status, 401);
    assert.equal(backend.seen.length, 0, 'nenhuma dessas requisições pode ter chegado ao backend');
  } finally {
    await lan.stop();
    await backend.close();
  }
});

test('a 11ª tentativa de claim em um minuto é barrada na porta, antes do backend', opts, async () => {
  const { backend, lan, call } = await up();
  try {
    const statuses = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await call({ method: 'POST', url: '/api/pairing/claim', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
    assert.deepEqual(statuses, [...Array(10).fill(200), 429, 429]);
    assert.equal(backend.seen.length, 10);
  } finally {
    await lan.stop();
    await backend.close();
  }
});

test('um certificado com outra impressão digital é recusado pelo cliente (é a defesa contra quem finge ser o computador)', opts, async () => {
  const { backend, lan } = await up();
  try {
    await assert.rejects(client(lan.port, { fingerprint: 'a'.repeat(64), url: '/api/health' }), /impressão digital diferente/);
  } finally {
    await lan.stop();
    await backend.close();
  }
});

test('o WebSocket só abre com o token e atravessa até o backend', opts, async () => {
  const { backend, lan } = await up();
  try {
    const open = (url) => new Promise((resolve, reject) => {
      const s = tls.connect({ host: '127.0.0.1', port: lan.port, rejectUnauthorized: false }, () => {
        s.write(`GET ${url} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: abc\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      });
      let text = '';
      s.on('data', (d) => {
        text += d;
        if (text.includes('ola-do-backend')) { s.write('ping'); }
        if (text.includes('eco:ping') || /^HTTP\/1.1 (401|404)/.test(text)) { s.destroy(); resolve(text); }
      });
      s.on('error', reject);
      setTimeout(() => { s.destroy(); resolve(text); }, 3000).unref();
    });
    assert.match(await open('/api/notifications/ws'), /^HTTP\/1.1 401/);
    assert.match(await open('/api/health?token=a'), /^HTTP\/1.1 404/);
    const ok = await open('/api/notifications/ws?token=jwt');
    assert.match(ok, /101 Switching Protocols/);
    assert.match(ok, /eco:ping/);
    assert.equal(backend.seen.at(-1).url, '/api/notifications/ws?token=jwt');
    assert.equal(backend.seen.at(-1).headers.host, `127.0.0.1:${backend.port}`);
  } finally {
    await lan.stop();
    await backend.close();
  }
});

test('backend fora do ar: 502 com mensagem, sem derrubar a porta', opts, async () => {
  const lan = new LanServer({ backendPort: () => 1, logger: quiet });
  await lan.start({ port: 0, host: '127.0.0.1', cert: cert.cert_pem, key: cert.key_pem });
  try {
    const res = await client(lan.port, { fingerprint: cert.fingerprint, url: '/api/health' });
    assert.equal(res.status, 502);
    assert.match(res.body, /não respondeu/);
  } finally {
    await lan.stop();
  }
});

function fakeSecrets() {
  const items = {};
  return { items, getItem: async (n) => items[n] ?? null, setItem: async (n, v) => { items[n] = v; } };
}

test('o certificado é criado uma vez e reaproveitado; a chave vai para o cofre, não para o settings', opts, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qy-lan-'));
  const settings = new Settings(path.join(dir, 'settings.json'));
  const secrets = fakeSecrets();
  let made = 0;
  const makeCertificate = async () => { made += 1; return cert; };
  const mk = () => new LanAccess({ settings, secrets, resources: {}, backendPort: () => 1, logger: quiet, makeCertificate, host: '127.0.0.1', addresses: () => ['192.168.1.20'] });
  const a = mk();
  assert.equal(a.status().enabled, false);
  assert.equal((await a.apply()).listening, false, 'desligado por padrão: nada escuta');

  const on = await a.setEnabled(true);
  assert.equal(on.listening, true);
  assert.equal(on.fingerprint, cert.fingerprint);
  assert.deepEqual(on.addresses, [`https://192.168.1.20:${on.port}`]);
  assert.equal(made, 1);
  assert.ok(secrets.items.LAN_TLS_KEY.includes('BEGIN PRIVATE KEY'));
  assert.ok(!fs.readFileSync(path.join(dir, 'settings.json'), 'utf8').includes('PRIVATE KEY'), 'a chave privada não pode ir para o settings.json');
  await a.close();

  // outra abertura do app: a escolha, a porta e o certificado continuam
  const b = mk();
  assert.equal(b.enabled, true);
  const again = await b.apply();
  assert.equal(again.listening, true);
  assert.equal(again.port, on.port, 'a porta é a mesma (o celular pareado e o QR code dependem dela)');
  assert.equal(made, 1, 'o certificado não é refeito');
  const off = await b.setEnabled(false);
  assert.equal(off.listening, false);
  assert.deepEqual(off.addresses, []);
  assert.equal(b.enabled, false);
  await b.close();
});

test('se a porta lembrada estiver ocupada, usa outra em vez de falhar', opts, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qy-lan-'));
  const settings = new Settings(path.join(dir, 'settings.json'));
  const holder = http.createServer();
  await new Promise((r) => holder.listen(0, '127.0.0.1', r));
  settings.set('lanPort', holder.address().port);
  const lan = new LanAccess({ settings, secrets: fakeSecrets(), resources: {}, backendPort: () => 1, logger: quiet, makeCertificate: async () => cert, host: '127.0.0.1', addresses: () => [] });
  try {
    const st = await lan.setEnabled(true);
    assert.equal(st.listening, true);
    assert.notEqual(st.port, holder.address().port);
  } finally {
    await lan.close();
    holder.close();
  }
});

test('erro ao gerar o certificado vira mensagem na tela, não exceção', opts, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qy-lan-'));
  const lan = new LanAccess({
    settings: new Settings(path.join(dir, 'settings.json')), secrets: fakeSecrets(), resources: {}, backendPort: () => 1, logger: quiet,
    makeCertificate: async () => { throw new Error('sem cryptography'); }, host: '127.0.0.1',
  });
  const st = await lan.setEnabled(true);
  assert.equal(st.listening, false);
  assert.match(st.error, /sem cryptography/);
});
