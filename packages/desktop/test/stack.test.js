import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { layout } from '../src/paths.js';
import { SecretStore } from '../src/secrets.js';
import { Settings } from '../src/settings.js';
import { Stack, KeysMissingError, backendCommand } from '../src/stack.js';

const quiet = { info() {}, warn() {}, error() {}, sink: () => ({ write() {}, close() {} }) };

test('backendCommand usa o binário empacotado, ou o código-fonte em desenvolvimento', () => {
  const res = { backend: path.join('r', 'backend'), web: 'w' };
  const packed = backendCommand(res, 4321, {});
  assert.match(packed.command, /qython-backend(\.exe)?$/);
  assert.deepEqual(packed.args, ['serve', '--port', '4321']);

  const dev = backendCommand(res, 4321, { QYTHON_BACKEND_DEV: '/repo', QYTHON_PYTHON: '/venv/bin/python' });
  assert.equal(dev.command, '/venv/bin/python');
  assert.deepEqual(dev.args, ['-m', 'backend.desktop', 'serve', '--port', '4321']);
  assert.equal(dev.cwd, '/repo');
});

test('recusa abrir um banco que já tem dados quando as chaves sumiram', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qy-stack-'));
  const paths = layout(root);
  fs.mkdirSync(paths.pgData, { recursive: true });
  fs.writeFileSync(path.join(paths.pgData, 'PG_VERSION'), '18\n');
  const vault = { available: async () => false };
  const stack = new Stack({
    paths, resources: { backend: 'b', web: 'w' }, logger: quiet,
    secrets: new SecretStore(paths.secrets, vault), settings: new Settings(paths.settings),
  });
  await assert.rejects(stack.start(), KeysMissingError);
  // E não criou chaves novas por cima: o usuário ainda pode restaurar o backup.
  assert.equal(fs.existsSync(paths.secrets), false);
});

test('o ambiente do backend leva as chaves, a edição local e a origem da janela', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qy-env-'));
  const paths = layout(root);
  const stack = new Stack({
    paths, resources: { backend: 'b', web: '/app/web' }, logger: quiet,
    secrets: new SecretStore(paths.secrets, { available: async () => false }),
    settings: new Settings(paths.settings), env: { LLM_MODEL: 'gemma-4' },
  });
  stack.webPort = 41000;
  stack.pg = { url: 'postgresql://qython:pw@127.0.0.1:5000/qython' };
  const env = stack.backendEnv({
    JWT_SECRET_KEY: 'j', QYTHON_FIELD_KEK: 'f', QYTHON_TOKEN_KEK: 't',
  });
  assert.equal(env.QYTHON_EDITION, 'local');
  assert.equal(env.DATABASE_URL, 'postgresql://qython:pw@127.0.0.1:5000/qython');
  assert.equal(env.QYTHON_FIELD_KEK, 'f');
  assert.equal(env.QYTHON_WEB_DIR, '/app/web');
  assert.equal(env.ALLOWED_ORIGINS, 'http://127.0.0.1:41000');
  assert.equal(env.QYTHON_DATA_DIR, paths.data);
  assert.equal(env.LLM_MODEL, 'gemma-4');
  assert.ok(!('GEMINI_API_KEY' in env));
});

test('o backend recebe a porta fixa do Chroma e a telemetria vem desligada', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qy-env2-'));
  const paths = layout(root);
  const stack = new Stack({
    paths, resources: { backend: 'b', web: 'w' }, logger: quiet,
    secrets: new SecretStore(paths.secrets, { available: async () => false }), settings: new Settings(paths.settings),
  });
  stack.webPort = 41000;
  stack.pg = { url: 'postgresql://x' };
  stack.chroma = { backendEnv: () => ({ CHROMA_SERVER_HOST: '127.0.0.1', CHROMA_SERVER_PORT: '45123' }) };
  stack.llm = { backendEnv: () => ({ LLM_BASE_URL: 'http://127.0.0.1:45124/v1', LLM_PROVIDER: 'openai' }) };
  const env = stack.backendEnv({ JWT_SECRET_KEY: 'j', QYTHON_FIELD_KEK: 'f', QYTHON_TOKEN_KEK: 't' });
  assert.equal(env.CHROMA_SERVER_PORT, '45123');
  assert.equal(env.LLM_BASE_URL, 'http://127.0.0.1:45124/v1');
  assert.equal(env.QYTHON_MANAGED_LLM, '1');
  assert.equal(env.ANONYMIZED_TELEMETRY, 'False');
  assert.equal(env.HF_HUB_DISABLE_TELEMETRY, '1');
});
