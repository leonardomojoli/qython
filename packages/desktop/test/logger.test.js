import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileLog } from '../src/logger.js';

test('gira o arquivo ao passar do limite e guarda só as últimas cópias', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qy-log-'));
  const file = path.join(dir, 'x.log');
  const log = new FileLog(file, { maxBytes: 100, keep: 3 });
  for (let i = 0; i < 40; i += 1) log.write(`linha ${String(i).padStart(3, '0')} ${'.'.repeat(20)}\n`);
  log.close();
  const names = fs.readdirSync(dir).sort();
  assert.deepEqual(names, ['x.log', 'x.log.1', 'x.log.2', 'x.log.3']);
  for (const n of names) assert.ok(fs.statSync(path.join(dir, n)).size <= 100 + 40);
  // O mais novo está no arquivo atual.
  assert.match(fs.readFileSync(file, 'utf8'), /linha 039/);
});
