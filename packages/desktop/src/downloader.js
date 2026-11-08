// Download de arquivo grande: retomável, com progresso e conferência de SHA-256.
// Um modelo tem 15 GB; a conexão cai, o computador dorme, o app fecha. Nada disso pode
// obrigar o médico a recomeçar do zero, e nenhum byte corrompido pode virar "a IA".
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class ChecksumError extends Error {
  constructor(expected, got) {
    super(`O arquivo baixado está corrompido (SHA-256 ${got.slice(0, 12)}…, esperado ${expected.slice(0, 12)}…).`);
    this.name = 'ChecksumError';
  }
}

export class DownloadAborted extends Error {
  constructor() {
    super('Download cancelado.');
    this.name = 'DownloadAborted';
  }
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DownloadAborted()); }, { once: true });
});

function hashFile(file, hash, onBytes) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 });
    stream.on('data', (chunk) => { hash.update(chunk); onBytes?.(chunk.length); });
    stream.on('error', reject);
    stream.on('end', resolve);
  });
}

/** O arquivo final já está lá, inteiro e conferido? O marcador evita re-hashear 15 GB a cada abertura. */
export function isVerified(dest, size) {
  try {
    const st = fs.statSync(dest);
    if (st.size !== size) return false;
    const marker = JSON.parse(fs.readFileSync(`${dest}.ok`, 'utf8'));
    return marker.size === size && marker.mtimeMs === st.mtimeMs;
  } catch {
    return false;
  }
}

function writeMarker(dest, size) {
  const st = fs.statSync(dest);
  fs.writeFileSync(`${dest}.ok`, JSON.stringify({ size, mtimeMs: st.mtimeMs }));
}

/**
 * @param {object} o
 * @param {string} o.url
 * @param {string} o.dest destino final
 * @param {number} o.size tamanho esperado, em bytes
 * @param {string} o.sha256
 * @param {(p:{phase:'verifying'|'downloading', received:number, total:number, bytesPerSec:number})=>void} [o.onProgress]
 * @param {AbortSignal} [o.signal]
 * @param {typeof fetch} [o.fetchImpl]
 * @param {number} [o.retries]
 */
export async function downloadFile(o) {
  const { url, dest, size, sha256, onProgress, signal, fetchImpl = fetch, retries = 8 } = o;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (isVerified(dest, size)) return { skipped: true };

  const part = `${dest}.part`;
  let hash = crypto.createHash('sha256');
  let received = 0;

  // Retoma de onde parou: os bytes que já estão no .part entram no hash antes de continuar.
  const reset = () => {
    fs.rmSync(part, { force: true });
    hash = crypto.createHash('sha256');
    received = 0;
  };
  if (fs.existsSync(part)) {
    const have = fs.statSync(part).size;
    if (have > size) {
      reset();
    } else {
      onProgress?.({ phase: 'verifying', received: 0, total: size, bytesPerSec: 0 });
      let hashed = 0;
      await hashFile(part, hash, (n) => {
        hashed += n;
        onProgress?.({ phase: 'verifying', received: hashed, total: have, bytesPerSec: 0 });
      });
      received = have;
    }
  }

  let lastReport = 0;
  const window = [];
  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < 250) return;
    lastReport = now;
    window.push([now, received]);
    while (window.length > 1 && now - window[0][0] > 5000) window.shift();
    const [t0, b0] = window[0];
    const bytesPerSec = now > t0 ? ((received - b0) / (now - t0)) * 1000 : 0;
    onProgress?.({ phase: 'downloading', received, total: size, bytesPerSec });
  };

  let attempt = 0;
  while (received < size) {
    if (signal?.aborted) throw new DownloadAborted();
    try {
      const headers = { 'User-Agent': 'Qython-Desktop' };
      if (received > 0) headers.Range = `bytes=${received}-`;
      const res = await fetchImpl(url, { headers, signal });
      if (res.status === 416) {
        // O servidor não aceita o intervalo: o .part não serve; recomeça.
        reset();
        continue;
      }
      if (res.status === 200 && received > 0) reset(); // ignorou o Range: manda o arquivo todo
      else if (res.status !== 200 && res.status !== 206) throw new Error(`HTTP ${res.status}`);

      const out = fs.createWriteStream(part, { flags: received > 0 ? 'a' : 'w' });
      try {
        for await (const chunk of res.body) {
          hash.update(chunk);
          received += chunk.length;
          if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
          report();
        }
      } finally {
        await new Promise((resolve) => out.end(resolve));
      }
      report(true);
      attempt = 0;
    } catch (err) {
      if (signal?.aborted || err instanceof DownloadAborted) throw new DownloadAborted();
      attempt += 1;
      if (attempt > retries) throw new Error(`O download falhou depois de ${retries} tentativas: ${err.message}`);
      // O hash e o contador continuam; só o que chegou ao disco conta.
      const onDisk = fs.existsSync(part) ? fs.statSync(part).size : 0;
      if (onDisk !== received) {
        // Bytes em voo que não foram gravados: re-hash a partir do disco.
        hash = crypto.createHash('sha256');
        received = onDisk;
        if (onDisk > 0) await hashFile(part, hash);
      }
      await sleep(Math.min(30000, 1000 * 2 ** (attempt - 1)), signal);
    }
  }

  const digest = hash.digest('hex');
  if (digest !== sha256.toLowerCase()) {
    fs.rmSync(part, { force: true });
    throw new ChecksumError(sha256, digest);
  }
  fs.renameSync(part, dest);
  writeMarker(dest, size);
  return { skipped: false };
}
