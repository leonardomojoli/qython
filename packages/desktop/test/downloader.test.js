import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { ChecksumError, DownloadAborted, downloadFile, isVerified } from '../src/downloader.js';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qy-dl-'));
const DATA = crypto.randomBytes(3 * 1024 * 1024 + 123);

/** Servidor de arquivo com Range; `behavior` muda o que ele faz. */
async function serve(behavior = {}) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const range = /bytes=(\d+)-/.exec(req.headers.range ?? '');
    hits.push(range ? Number(range[1]) : 0);
    let start = range && !behavior.ignoreRange ? Number(range[1]) : 0;
    if (start >= DATA.length) { res.statusCode = 416; return res.end(); }
    const body = DATA.subarray(start);
    res.statusCode = start > 0 ? 206 : 200;
    res.setHeader('Content-Length', body.length);
    if (behavior.dropAfter && hits.length === 1) {
      // Manda um pedaço e corta a conexão no meio.
      res.write(body.subarray(0, behavior.dropAfter));
      setTimeout(() => res.destroy(), 30);
      return;
    }
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/f.bin`, server, hits };
}

test('baixa, confere o SHA-256 e não baixa de novo o que já está pronto', async () => {
  const { url, server, hits } = await serve();
  const dest = path.join(tmp(), 'm.gguf');
  try {
    const events = [];
    await downloadFile({ url, dest, size: DATA.length, sha256: sha(DATA), onProgress: (p) => events.push(p) });
    assert.ok(fs.readFileSync(dest).equals(DATA));
    assert.equal(fs.existsSync(`${dest}.part`), false);
    assert.ok(isVerified(dest, DATA.length));
    assert.equal(events.at(-1).received, DATA.length);
    const again = await downloadFile({ url, dest, size: DATA.length, sha256: sha(DATA) });
    assert.equal(again.skipped, true);
    assert.equal(hits.length, 1);
  } finally { server.close(); }
});

test('retoma de onde parou com Range, conferindo o que já estava no disco', async () => {
  const { url, server, hits } = await serve();
  const dest = path.join(tmp(), 'm.gguf');
  try {
    fs.writeFileSync(`${dest}.part`, DATA.subarray(0, 1_000_000));
    await downloadFile({ url, dest, size: DATA.length, sha256: sha(DATA) });
    assert.ok(fs.readFileSync(dest).equals(DATA));
    assert.deepEqual(hits, [1_000_000]);
  } finally { server.close(); }
});

test('um .part corrompido é pego pelo SHA-256 e descartado', async () => {
  const { url, server } = await serve();
  const dest = path.join(tmp(), 'm.gguf');
  try {
    const bad = Buffer.from(DATA.subarray(0, 500_000));
    bad[10] ^= 0xff;
    fs.writeFileSync(`${dest}.part`, bad);
    await assert.rejects(downloadFile({ url, dest, size: DATA.length, sha256: sha(DATA) }), ChecksumError);
    assert.equal(fs.existsSync(dest), false);
    assert.equal(fs.existsSync(`${dest}.part`), false);
    // Na tentativa seguinte, sem lixo, funciona.
    await downloadFile({ url, dest, size: DATA.length, sha256: sha(DATA) });
    assert.ok(isVerified(dest, DATA.length));
  } finally { server.close(); }
});

test('servidor que ignora o Range: recomeça do zero sem corromper', async () => {
  const { url, server } = await serve({ ignoreRange: true });
  const dest = path.join(tmp(), 'm.gguf');
  try {
    fs.writeFileSync(`${dest}.part`, DATA.subarray(0, 700_000));
    await downloadFile({ url, dest, size: DATA.length, sha256: sha(DATA) });
    assert.ok(fs.readFileSync(dest).equals(DATA));
  } finally { server.close(); }
});

test('conexão que cai no meio é retomada sozinha', async () => {
  const { url, server, hits } = await serve({ dropAfter: 900_000 });
  const dest = path.join(tmp(), 'm.gguf');
  try {
    await downloadFile({ url, dest, size: DATA.length, sha256: sha(DATA), retries: 3 });
    assert.ok(fs.readFileSync(dest).equals(DATA));
    assert.ok(hits.length >= 2, 'deveria ter pedido de novo');
    assert.ok(hits[1] > 0, 'a segunda tentativa deveria usar Range');
  } finally { server.close(); }
});

test('cancelar para o download e deixa o .part para retomar depois', async () => {
  const { url, server } = await serve();
  const dest = path.join(tmp(), 'm.gguf');
  const controller = new AbortController();
  try {
    await assert.rejects(
      downloadFile({
        url, dest, size: DATA.length, sha256: sha(DATA), signal: controller.signal,
        onProgress: (p) => { if (p.phase === 'downloading' && p.received > 0) controller.abort(); },
      }),
      DownloadAborted,
    );
    assert.equal(fs.existsSync(dest), false);
  } finally { server.close(); }
});

test('sem o servidor, desiste depois das tentativas e diz o motivo', async () => {
  const dest = path.join(tmp(), 'm.gguf');
  await assert.rejects(
    downloadFile({ url: 'http://127.0.0.1:1/x', dest, size: 10, sha256: 'a'.repeat(64), retries: 1 }),
    /falhou depois de 1 tentativas/,
  );
});
