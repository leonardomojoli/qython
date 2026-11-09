// Reúne o que o app carrega em build-resources/: o backend empacotado (PyInstaller) e o
// build do front. É de lá que o app lê em desenvolvimento e no CI; o electron-builder
// copia as mesmas pastas para dentro do instalador.
//
//   node scripts/prepare-resources.mjs [--backend <pasta do PyInstaller>] [--web <build do front>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? path.resolve(process.argv[i + 1]) : fallback;
}

const backendSrc = arg('backend', path.join(root, 'python', 'dist', 'qython-backend'));
const webSrc = arg('web', path.join(root, '..', 'web', 'build'));
const out = path.join(root, 'build-resources');

for (const [label, src] of [['backend', backendSrc], ['web', webSrc]]) {
  if (!fs.existsSync(src)) {
    console.error(`Falta o ${label}: ${src}`);
    process.exit(1);
  }
}
if (!fs.existsSync(path.join(webSrc, 'index.html'))) {
  console.error(`${webSrc} não parece um build do front (sem index.html).`);
  process.exit(1);
}

// Troca só o backend e o front: as outras pastas (llama/, de fetch-llama.mjs) ficam.
for (const name of ['backend', 'web']) fs.rmSync(path.join(out, name), { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(backendSrc, path.join(out, 'backend'), { recursive: true, verbatimSymlinks: true });
fs.cpSync(webSrc, path.join(out, 'web'), { recursive: true });
console.log(`build-resources pronto em ${out}`);
