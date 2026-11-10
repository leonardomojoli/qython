// Teste de fumaça do pareamento do celular pela rede local (usado por smoke.js).
import crypto from 'node:crypto';
import https from 'node:https';
import { assert, call } from './smoke-http.js';

const OWNER_EMAIL = 'dona@clinica-ci.com.br';

/** Cliente como o do celular: confia só no certificado do pareamento, conferido pela impressão digital. */
function lanCall(lan, port, method, route, { token, json, fingerprint } = {}) {
  const cert = lan.settings.get('lanCert');
  const expected = fingerprint ?? lan.settings.get('lanFingerprint');
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let body;
    if (json !== undefined) {
      body = JSON.stringify(json);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request({
      host: '127.0.0.1', port, path: route, method, headers, ca: cert, agent: false,
      checkServerIdentity: (_host, peer) => {
        const got = crypto.createHash('sha256').update(peer.raw).digest('hex');
        return got === expected ? undefined : new Error(`impressão digital diferente: ${got}`);
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * Pareamento do celular pela rede local (docs/PAREAMENTO.md): liga a porta, gera o código pela
 * API local (como a tela do computador faz), troca o código pelo acesso do aparelho pela porta
 * HTTPS, usa a API, confere o que a porta barra e que remover o aparelho corta o acesso na hora.
 */
export async function smokeLan({ lan, stack, token, step, ownerEmail = OWNER_EMAIL }) {
  const local = `${stack.webUrl}/api`;

  step('rede local: ligar a porta gera o certificado e abre o HTTPS');
  const status = await lan.setEnabled(true);
  assert(status.listening && status.port, `a porta da rede local não abriu: ${JSON.stringify(status)}`);
  assert(/^[0-9a-f]{64}$/.test(status.fingerprint ?? ''), `impressão digital inesperada: ${status.fingerprint}`);
  const derFingerprint = crypto.createHash('sha256').update(new crypto.X509Certificate(lan.settings.get('lanCert')).raw).digest('hex');
  assert(derFingerprint === status.fingerprint, 'a impressão digital não bate com o certificado gravado');
  const port = status.port;
  const call2 = (method, route, opts) => lanCall(lan, port, method, route, opts);

  step('rede local: só o que o celular precisa passa pela porta');
  const health = await call2('GET', '/api/health');
  assert(health.status === 200, `/api/health pela rede local devolveu ${health.status}`);
  for (const [method, route] of [['GET', '/'], ['GET', '/login'], ['GET', '/static/x'], ['GET', '/api/admin/users']]) {
    const res = await call2(method, route, { token });
    assert(res.status === 403 || res.status === 404, `${method} ${route} deveria ser barrado, devolveu ${res.status}`);
  }
  const login = await call2('POST', '/api/auth/login', { json: {} });
  assert(login.status === 403, `o login por senha não pode passar pela rede local (devolveu ${login.status})`);
  const noToken = await call2('GET', '/api/user/info');
  assert(noToken.status === 401, `sem acesso a API deveria dar 401, deu ${noToken.status}`);
  // A porta só aceita o acesso de um aparelho pareado: nem um Bearer inventado (que alcançaria as rotas do
  // backend sem login) nem o acesso do login por senha da janela do computador.
  const forged = await call2('GET', '/api/user/info', { token: 'inventado.por.alguem' });
  assert(forged.status === 401, `um Bearer inventado deveria dar 401, deu ${forged.status}`);
  const passwordLogin = await call2('GET', '/api/user/info', { token });
  assert(passwordLogin.status === 401, `o acesso do login por senha não vale na rede local (deu ${passwordLogin.status})`);

  step('rede local: a impressão digital errada derruba a conexão');
  let refused = false;
  try {
    await lanCall(lan, port, 'GET', '/api/health', { fingerprint: 'a'.repeat(64) });
  } catch {
    refused = true;
  }
  assert(refused, 'o cliente aceitou um certificado com outra impressão digital');

  step('pareamento: o computador gera o código e o celular o troca pelo acesso');
  const start = await call(local, 'POST', '/pairing/start', { token });
  assert(start.status === 200 && /^[A-Z2-9]{8}$/.test(start.data.code), `gerar código falhou: ${JSON.stringify(start.data)}`);
  const claim = await call2('POST', '/api/pairing/claim', { json: { code: start.data.display_code, device_name: 'Celular CI', platform: 'android' } });
  assert(claim.status === 200 && claim.data.device_token && claim.data.access_token, `o pareamento falhou: ${JSON.stringify(claim.data)}`);
  const reuse = await call2('POST', '/api/pairing/claim', { json: { code: start.data.code, device_name: 'Outro' } });
  assert(reuse.status >= 400 && reuse.status < 500, `o código deveria ser de uso único (devolveu ${reuse.status})`);

  step('pareamento: o celular usa a API pela porta com o acesso do aparelho');
  const me = await call2('GET', '/api/user/info', { token: claim.data.access_token });
  assert(me.status === 200 && me.data.email === ownerEmail, `/user/info pela rede local falhou: ${JSON.stringify(me.data).slice(0, 200)}`);
  for (const route of ['/api/pairing/start', '/api/pairing/devices']) {
    const res = await call2(route.endsWith('start') ? 'POST' : 'GET', route, { token: claim.data.access_token });
    assert(res.status === 403, `${route} só vale pela janela do computador (devolveu ${res.status})`);
  }
  const renewed = await call2('POST', '/api/pairing/token', { json: { device_token: claim.data.device_token } });
  assert(renewed.status === 200 && renewed.data.access_token, `renovar o acesso falhou: ${JSON.stringify(renewed.data)}`);

  step('pareamento: remover o aparelho corta o acesso na hora');
  const list = await call(local, 'GET', '/pairing/devices', { token });
  assert(list.status === 200 && list.data.some((d) => d.id === claim.data.device_id), `o aparelho não aparece na lista: ${JSON.stringify(list.data)}`);
  const del = await call(local, 'DELETE', `/pairing/devices/${claim.data.device_id}`, { token });
  assert(del.status < 300, `remover o aparelho falhou: ${JSON.stringify(del.data)}`);
  const after = await call2('GET', '/api/user/info', { token: renewed.data.access_token });
  assert(after.status === 401, `o acesso do aparelho removido deveria dar 401, deu ${after.status}`);
  const again = await call2('POST', '/api/pairing/token', { json: { device_token: claim.data.device_token } });
  assert(again.status === 401 || again.status === 403, `renovar com o aparelho removido deveria falhar, deu ${again.status}`);

  step('rede local: desligar fecha a porta');
  const off = await lan.setEnabled(false);
  assert(!off.listening, 'a porta continuou aberta depois de desligar');
  let closed = false;
  try {
    await call2('GET', '/api/health');
  } catch {
    closed = true;
  }
  assert(closed, 'ainda dá para conectar na porta depois de desligar');
}
