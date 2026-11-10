import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyDeviceToken } from '../src/device-token.js';

const SECRET = 'segredo-do-backend-com-bastante-entropia-123456';
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

/** Um JWT como o PyJWT do backend emite. */
function jwt(claims, { secret = SECRET, alg = 'HS256', header } = {}) {
  const head = b64(header ?? { alg, typ: 'JWT' });
  const body = b64(claims);
  const hmac = alg === 'HS384' ? 'sha384' : 'sha256';
  const sig = crypto.createHmac(hmac, secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const NOW = 1_800_000_000_000;
const valid = { sub: 'a@b.com', user_id: 7, device_id: 3, exp: NOW / 1000 + 600 };

test('o acesso de um aparelho pareado vale', () => {
  assert.equal(verifyDeviceToken(jwt(valid), SECRET, NOW), true);
});

test('vencido, assinatura errada e segredo errado não valem', () => {
  assert.equal(verifyDeviceToken(jwt({ ...valid, exp: NOW / 1000 - 1 }), SECRET, NOW), false);
  assert.equal(verifyDeviceToken(jwt(valid, { secret: 'outro-segredo-qualquer-0000000000000000' }), SECRET, NOW), false);
  const token = jwt(valid);
  assert.equal(verifyDeviceToken(`${token.slice(0, -3)}AAA`, SECRET, NOW), false);
});

test('o acesso do login por senha (sem device_id) não vale na rede local', () => {
  assert.equal(verifyDeviceToken(jwt({ sub: 'a@b.com', user_id: 7, exp: NOW / 1000 + 600 }), SECRET, NOW), false);
  assert.equal(verifyDeviceToken(jwt({ ...valid, device_id: 'x' }), SECRET, NOW), false);
  assert.equal(verifyDeviceToken(jwt({ ...valid, user_id: null }), SECRET, NOW), false);
});

test('alg=none, outro algoritmo, sem exp e lixo são recusados', () => {
  const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(valid)}.`;
  assert.equal(verifyDeviceToken(none, SECRET, NOW), false);
  assert.equal(verifyDeviceToken(jwt(valid, { alg: 'HS384' }), SECRET, NOW), false);
  assert.equal(verifyDeviceToken(jwt({ ...valid, exp: undefined }), SECRET, NOW), false);
  for (const garbage of ['', 'abc', 'a.b', 'a.b.c', '....', undefined, null, 42]) {
    assert.equal(verifyDeviceToken(garbage, SECRET, NOW), false);
  }
  assert.equal(verifyDeviceToken(jwt(valid), '', NOW), false, 'sem segredo nada vale');
});
