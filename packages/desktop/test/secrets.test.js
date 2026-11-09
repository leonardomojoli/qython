import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SecretStore, SecretsUnavailableError, electronVault, fernetKey } from '../src/secrets.js';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qy-sec-')), 'secrets.json');

// Cofre de mentira: "cifra" invertendo os bytes, para provar que o arquivo não guarda o texto.
const fakeVault = (available = true, { reEncrypt = false } = {}) => ({
  available: async () => available,
  encrypt: async (s) => Buffer.from(`enc:${s}`).reverse(),
  decrypt: async (b) => {
    const s = Buffer.from(b).reverse().toString();
    if (!s.startsWith('enc:')) throw new Error('bad blob');
    return { result: s.slice(4), shouldReEncrypt: reEncrypt };
  },
});

test('a chave Fernet tem 44 caracteres url-safe e decodifica para 32 bytes', () => {
  for (let i = 0; i < 20; i += 1) {
    const key = fernetKey();
    assert.equal(key.length, 44);
    assert.match(key, /^[A-Za-z0-9_-]{43}=$/);
    assert.equal(Buffer.from(key.replace(/-/g, '+').replace(/_/g, '/'), 'base64').length, 32);
  }
});

test('as chaves são geradas uma vez e voltam iguais na próxima abertura', async () => {
  const file = tmp();
  const first = await new SecretStore(file, fakeVault()).load();
  assert.deepEqual(Object.keys(first).sort(), ['JWT_SECRET_KEY', 'LLM_LOCAL_KEY', 'PG_PASSWORD', 'QYTHON_FIELD_KEK', 'QYTHON_TOKEN_KEK']);
  const second = await new SecretStore(file, fakeVault()).load();
  assert.deepEqual(second, first);
});

test('com o cofre do sistema, o arquivo não guarda nenhuma chave em texto', async () => {
  const file = tmp();
  const keys = await new SecretStore(file, fakeVault()).load();
  const raw = fs.readFileSync(file, 'utf8');
  for (const value of Object.values(keys)) assert.ok(!raw.includes(value), 'chave em texto no arquivo');
  assert.equal(JSON.parse(raw).protection, 'os');
});

test('sem cofre, guarda em arquivo de uso restrito e avisa o modo', { skip: process.platform === 'win32' }, async () => {
  const file = tmp();
  const store = new SecretStore(file, fakeVault(false));
  await store.load();
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).protection, 'file');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(store.protection, 'file');
});

test('no Linux, o backend basic_text não conta como cofre', async () => {
  const storage = (backend) => ({
    isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => backend,
  });
  assert.equal(await electronVault(storage('basic_text')).available(), false);
  assert.equal(await electronVault(storage('gnome_libsecret')).available(), true);
  // Fora do Linux o método não existe.
  assert.equal(await electronVault({ isAsyncEncryptionAvailable: async () => true }).available(), true);
  assert.equal(await electronVault({ isAsyncEncryptionAvailable: async () => false }).available(), false);
});

test('NUNCA recria as chaves quando o cofre não abre: recriar apagaria os dados cifrados', async () => {
  const file = tmp();
  await new SecretStore(file, fakeVault()).load();
  const before = fs.readFileSync(file, 'utf8');
  // Chaveiro bloqueado ou trocado.
  await assert.rejects(new SecretStore(file, fakeVault(false)).load(), SecretsUnavailableError);
  const broken = { ...fakeVault(), decrypt: async () => { throw new Error('keyring changed'); } };
  await assert.rejects(new SecretStore(file, broken).load(), SecretsUnavailableError);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'o arquivo de chaves foi alterado');
});

test('um arquivo de chaves corrompido é erro, não um recomeço', async () => {
  const file = tmp();
  fs.writeFileSync(file, '{ não é json');
  await assert.rejects(new SecretStore(file, fakeVault()).load(), SecretsUnavailableError);
  assert.equal(fs.readFileSync(file, 'utf8'), '{ não é json');
});

test('uma chave nova entra sem mexer nas que já existem', async () => {
  const file = tmp();
  const store = new SecretStore(file, fakeVault());
  const only = await store.load(['QYTHON_FIELD_KEK']);
  const all = await store.load();
  assert.equal(all.QYTHON_FIELD_KEK, only.QYTHON_FIELD_KEK);
  assert.ok(all.JWT_SECRET_KEY);
});

test('quando o sistema pede para recifrar (chave rotacionada), grava o mesmo segredo de novo', async () => {
  const file = tmp();
  const first = await new SecretStore(file, fakeVault()).load();
  const resealed = await new SecretStore(file, fakeVault(true, { reEncrypt: true })).load();
  assert.deepEqual(resealed, first);
  assert.deepEqual(await new SecretStore(file, fakeVault()).load(), first);
});
