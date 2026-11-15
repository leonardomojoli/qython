import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updatePolicy, autoUpdateEnabled, updatesAvailable } from '../src/updater.js';

const settings = (autoUpdate) => ({ get: (k, d) => (k === 'autoUpdate' && autoUpdate !== undefined ? autoUpdate : d) });
const base = { isPackaged: true, env: {}, settings: settings(), platform: 'win32', appImage: false };

test('app empacotado procura atualização e baixa sozinho', () => {
  assert.deepEqual(updatePolicy(base), { enabled: true, autoDownload: true });
  assert.deepEqual(updatePolicy({ ...base, platform: 'linux', appImage: true }), { enabled: true, autoDownload: true });
});

test('em desenvolvimento, nunca', () => {
  assert.equal(updatePolicy({ ...base, isPackaged: false }).enabled, false);
});

test('quem não quer a consulta ao GitHub desliga por variável ou pelas preferências', () => {
  assert.equal(updatePolicy({ ...base, env: { QYTHON_NO_UPDATE: '1' } }).enabled, false);
  assert.equal(updatePolicy({ ...base, settings: settings(false) }).enabled, false);
  assert.equal(updatePolicy({ ...base, settings: settings(true) }).enabled, true);
});

test('o deb é do gerenciador de pacotes do sistema; só o AppImage se atualiza', () => {
  const linux = { ...base, platform: 'linux' };
  assert.equal(updatePolicy({ ...linux, appImage: false }).enabled, false);
  assert.match(updatePolicy({ ...linux, appImage: false }).reason, /pacote/);
  assert.equal(updatePolicy({ ...linux, appImage: true }).enabled, true);
});

test('no macOS sem assinatura só avisa, não baixa nem instala', () => {
  assert.deepEqual(updatePolicy({ ...base, platform: 'darwin' }), { enabled: true, autoDownload: false });
});

test('a opção do menu liga e desliga a consulta ao GitHub; a variável de ambiente manda mais', () => {
  assert.equal(autoUpdateEnabled({ env: {}, settings: settings() }), true);
  assert.equal(autoUpdateEnabled({ env: {}, settings: settings(true) }), true);
  assert.equal(autoUpdateEnabled({ env: {}, settings: settings(false) }), false);
  assert.equal(autoUpdateEnabled({ env: { QYTHON_NO_UPDATE: '1' }, settings: settings(true) }), false);
});

test('só quem se atualiza sozinho mostra a opção no menu (o deb não)', () => {
  assert.equal(updatesAvailable({ platform: 'win32', appImage: false }), true);
  assert.equal(updatesAvailable({ platform: 'darwin', appImage: false }), true);
  assert.equal(updatesAvailable({ platform: 'linux', appImage: true }), true);
  assert.equal(updatesAvailable({ platform: 'linux', appImage: false }), false);
});
