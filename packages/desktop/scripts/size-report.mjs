// Tamanho de uma pasta e dos maiores itens dentro dela, em Markdown (para o resumo do CI).
//   node scripts/size-report.mjs <pasta> [título]
import fs from 'node:fs';
import path from 'node:path';

function size(p) {
  const st = fs.lstatSync(p);
  if (!st.isDirectory()) return st.size;
  return fs.readdirSync(p).reduce((sum, name) => sum + size(path.join(p, name)), 0);
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const dir = process.argv[2];
const title = process.argv[3] ?? path.basename(dir);
const inner = fs.existsSync(path.join(dir, '_internal')) ? path.join(dir, '_internal') : dir;
const rows = fs.readdirSync(inner).map((n) => [n, size(path.join(inner, n))]).sort((a, b) => b[1] - a[1]).slice(0, 12);

console.log(`### ${title}: ${mb(size(dir))}\n`);
console.log('| Maiores itens | Tamanho |\n|---|---|');
for (const [n, s] of rows) console.log(`| ${n} | ${mb(s)} |`);
