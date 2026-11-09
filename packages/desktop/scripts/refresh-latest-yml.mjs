// Refaz o sha512 e o tamanho do instalador no latest.yml depois da assinatura.
//
// O electron-updater confere o sha512 do instalador baixado contra o do latest.yml. A assinatura
// do Windows (SignPath) troca o .exe por um arquivo diferente, então o latest.yml gerado pelo
// electron-builder, que descreve o .exe SEM assinatura, passaria a reprovar toda atualização.
//
//   node scripts/refresh-latest-yml.mjs <pasta com latest.yml e o instalador>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function sha512Base64(file) {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');
}

/** Atualiza, no texto do latest.yml, o sha512 e o size dos arquivos que estão na pasta. */
export function refresh(yml, dir) {
  const lines = yml.split('\n');
  let current = null;
  const out = [];
  let top = null; // arquivo a que o `sha512:` de nível superior se refere (o `path:`)
  for (const line of lines) {
    const url = /^\s*-?\s*url:\s*(.+?)\s*$/.exec(line);
    if (url) current = url[1];
    const pathLine = /^path:\s*(.+?)\s*$/.exec(line);
    if (pathLine) top = pathLine[1];
    const sha = /^(\s*)sha512:\s*\S+\s*$/.exec(line);
    const size = /^(\s*)size:\s*\d+\s*$/.exec(line);
    const target = sha && sha[1] === '' ? top : current;
    const file = target && path.join(dir, target);
    if (sha && file && fs.existsSync(file)) {
      out.push(`${sha[1]}sha512: ${sha512Base64(file)}`);
    } else if (size && file && fs.existsSync(file)) {
      out.push(`${size[1]}size: ${fs.statSync(file).size}`);
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('refresh-latest-yml.mjs')) {
  const dir = path.resolve(process.argv[2] ?? 'release');
  for (const name of fs.readdirSync(dir).filter((n) => /^latest.*\.yml$/.test(n))) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, refresh(fs.readFileSync(file, 'utf8'), dir));
    console.log(`${name} atualizado`);
  }
}
