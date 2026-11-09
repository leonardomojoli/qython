// Baixa o llama-server (llama.cpp) da versão fixada em models.json, confere o SHA-256 e
// extrai para build-resources/llama. Sem GPU: a build de CPU roda em qualquer máquina.
//
//   node scripts/fetch-llama.mjs [--out <pasta>] [--platform linux-x64]
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'models.json'), 'utf8'));
const platform = arg('platform', `${process.platform}-${process.arch}`);
const asset = manifest.llama.assets[platform];
if (!asset) {
  console.error(`Sem llama-server para ${platform}. Disponíveis: ${Object.keys(manifest.llama.assets).join(', ')}`);
  process.exit(1);
}
const out = path.resolve(arg('out', path.join(root, 'build-resources', 'llama')));
const cache = path.join(root, '.cache');
fs.mkdirSync(cache, { recursive: true });
const archive = path.join(cache, asset.name);

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

if (!fs.existsSync(archive) || sha256(archive) !== asset.sha256) {
  const url = `${manifest.llama.baseUrl}/${asset.name}`;
  console.log(`Baixando ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
}
const got = sha256(archive);
if (got !== asset.sha256) {
  fs.rmSync(archive, { force: true });
  console.error(`SHA-256 de ${asset.name} não confere: ${got} (esperado ${asset.sha256})`);
  process.exit(1);
}

// O tar do Git Bash não abre .zip; no Windows usa o bsdtar do sistema.
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'qython-llama-'));
execFileSync(tar, ['-xf', archive, '-C', work], { stdio: 'inherit' });

// O pacote traz uma pasta (llama-bNNNN/) com dezenas de ferramentas; o app só usa o servidor.
const entries = fs.readdirSync(work);
const src = entries.length === 1 && fs.statSync(path.join(work, entries[0])).isDirectory() ? path.join(work, entries[0]) : work;
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const exe = process.platform === 'win32' ? '.exe' : '';
for (const name of fs.readdirSync(src)) {
  const isLibrary = /\.(dll|so|dylib)(\.|$)/.test(name) || name.startsWith('lib');
  const isOtherTool = name.startsWith('llama') && !isLibrary && name !== `llama-server${exe}` && !/license/i.test(name);
  if (isOtherTool || /^(rpc-server|ggml-rpc-server|test-)/.test(name)) continue;
  fs.cpSync(path.join(src, name), path.join(out, name), { recursive: true, verbatimSymlinks: true });
}
fs.rmSync(work, { recursive: true, force: true });
if (!fs.existsSync(path.join(out, `llama-server${exe}`))) throw new Error('llama-server não está no pacote extraído.');
console.log(`llama-server ${manifest.llama.build} (${platform}) em ${out}`);
