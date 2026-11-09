import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refresh } from '../scripts/refresh-latest-yml.mjs';

const b64 = (buf) => crypto.createHash('sha512').update(buf).digest('base64');

test('depois da assinatura, o latest.yml passa a descrever o instalador assinado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qy-yml-'));
  const signed = Buffer.from('instalador ASSINADO, bytes diferentes do original');
  fs.writeFileSync(path.join(dir, 'Qython-1.2.3-win-x64.exe'), signed);
  const yml = [
    'version: 1.2.3',
    'files:',
    '  - url: Qython-1.2.3-win-x64.exe',
    '    sha512: HASH-DO-EXE-SEM-ASSINATURA',
    '    size: 111',
    '  - url: Outro-que-nao-esta-aqui.exe',
    '    sha512: MANTER',
    '    size: 222',
    'path: Qython-1.2.3-win-x64.exe',
    'sha512: HASH-DO-EXE-SEM-ASSINATURA',
    "releaseDate: '2026-11-08T00:00:00.000Z'",
    '',
  ].join('\n');
  const out = refresh(yml, dir);
  assert.match(out, new RegExp(`    sha512: ${b64(signed).replace(/[+/=]/g, '\\$&')}\\n    size: ${signed.length}\\n`));
  assert.match(out, new RegExp(`\\nsha512: ${b64(signed).replace(/[+/=]/g, '\\$&')}\\n`), 'o sha512 do nível superior também');
  assert.ok(out.includes('sha512: MANTER\n    size: 222'), 'o que não está na pasta fica como estava');
  assert.ok(out.includes('version: 1.2.3') && out.includes('releaseDate'));
});
