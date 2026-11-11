// Confere o acesso (JWT HS256) que o backend emite ao celular pareado, na porta da rede local.
//
// O backend continua sendo quem decide (assinatura, validade e aparelho não revogado, a cada requisição).
// Esta conferência é uma barreira ANTES dele: sem um acesso de aparelho de verdade, quem está na rede
// não alcança nem as rotas do backend que dispensam login. O acesso do login por senha (sem `device_id`)
// também não vale aqui: o celular entra só pelo pareamento.
import crypto from 'node:crypto';

function decodeJson(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/**
 * @param {string} token JWT recebido
 * @param {string} secret JWT_SECRET_KEY do backend (a mesma chave HMAC, em texto)
 * @param {number} [now] ms desde 1970 (para os testes)
 * @returns {boolean}
 */
export function verifyDeviceToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [header, payload, signature] = parts;
  try {
    if (decodeJson(header).alg !== 'HS256') return false;
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest();
    const got = Buffer.from(signature, 'base64url');
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return false;
    const claims = decodeJson(payload);
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return false;
    return Number.isInteger(claims.device_id) && Number.isInteger(claims.user_id);
  } catch {
    return false;
  }
}
