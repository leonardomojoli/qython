import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { waitForHttp } from '../src/health.js';
import { randomFreePort } from '../src/ports.js';

const serve = (port, handler) => new Promise((resolve) => {
  const s = http.createServer(handler);
  s.listen(port, '127.0.0.1', () => resolve(s));
});

test('espera o servidor subir e valida o corpo', async () => {
  const port = await randomFreePort();
  setTimeout(() => serve(port, (_q, r) => r.end('{"status":"ok"}')).then((s) => setTimeout(() => s.close(), 4000).unref()), 600);
  await waitForHttp(`http://127.0.0.1:${port}/`, {
    intervalMs: 100, timeoutMs: 5000, validate: (res, body) => res.ok && body.includes('"ok"'),
  });
});

test('HTTP de erro não conta como saudável', async () => {
  const port = await randomFreePort();
  const s = await serve(port, (_q, r) => { r.statusCode = 503; r.end('x'); });
  try {
    await assert.rejects(waitForHttp(`http://127.0.0.1:${port}/`, { intervalMs: 50, timeoutMs: 400 }), /Tempo esgotado.*HTTP 503/);
  } finally {
    s.close();
  }
});

test('desiste na hora quando o processo morreu', async () => {
  const port = await randomFreePort();
  const started = Date.now();
  await assert.rejects(waitForHttp(`http://127.0.0.1:${port}/`, { isAlive: () => false, timeoutMs: 30000 }), /encerrou antes/);
  assert.ok(Date.now() - started < 2000);
});
