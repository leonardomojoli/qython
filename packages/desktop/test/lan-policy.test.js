import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, Throttle, throttleKey, lanAddresses } from '../src/lan-policy.js';

const d = (method, url, headers = {}, upgrade = false) => decide({ method, url, headers, upgrade });
const bearer = { authorization: 'Bearer abc.def' };

test('sem login passam só a saúde, a config pública e as duas rotas do pareamento', () => {
  assert.equal(d('GET', '/api/health').ok, true);
  assert.equal(d('GET', '/api/public/config').ok, true);
  assert.equal(d('POST', '/api/pairing/claim').ok, true);
  assert.equal(d('POST', '/api/pairing/token').ok, true);
  // o verbo conta: GET no claim não é a rota aberta
  assert.deepEqual(d('GET', '/api/pairing/claim'), { ok: false, status: 401, message: 'Falta o acesso do aparelho. Pareie o celular de novo.' });
});

test('o resto da API exige o acesso do aparelho no cabeçalho', () => {
  assert.equal(d('GET', '/api/user/info').status, 401);
  assert.equal(d('GET', '/api/user/info', { authorization: 'Basic abc' }).status, 401);
  assert.equal(d('GET', '/api/user/info', { authorization: 'Bearer ' }).status, 401);
  assert.equal(d('GET', '/api/user/info', bearer).ok, true);
  assert.equal(d('POST', '/api/patients/', bearer).ok, true);
});

test('login por senha, cadastro, administração e a gestão de aparelhos nunca passam, nem logado', () => {
  for (const url of ['/api/auth/login', '/api/auth/register/step1', '/api/auth/forgot-password', '/api/auth', '/api/auth/',
    '/api/pairing/start', '/api/pairing/devices', '/api/pairing/devices/3', '/api/admin/ai', '/api/admin']) {
    for (const headers of [{}, bearer]) {
      const v = d('POST', url, headers);
      assert.equal(v.ok, false, url);
      assert.equal(v.status, 403, url);
    }
  }
});

test('truques de caminho não escapam da regra (o backend decodifica uma vez, a regra também)', () => {
  assert.equal(d('POST', '/api/auth%2Flogin', bearer).status, 403); // %2F vira / no backend
  assert.equal(d('POST', '/api/%61uth/login', bearer).status, 403); // %61 é "a"
  assert.equal(d('POST', '/api/pairing/%73tart', bearer).status, 403);
  assert.equal(d('GET', '/api/../index.html', bearer).status, 404); // normalizado para /index.html
  assert.equal(d('GET', '/api/user/../auth/login', bearer).status, 403); // normalizado para /api/auth/login
  assert.equal(d('GET', '/api//auth/login', bearer).status, 400);
  assert.equal(d('GET', '/api/user%00', bearer).status, 400);
  assert.equal(d('GET', '/api/user%5Cinfo', bearer).status, 400);
  assert.equal(d('GET', '/api/%E0%A4%A', bearer).status, 400); // percent mal formado
  // dupla codificação vira literal no backend (sem rota): a rota proibida não se atinge
  assert.equal(d('POST', '/api/auth%252Flogin', bearer).ok, true);
});

test('nada fora de /api: nem o app web, nem arquivos estáticos, nem a documentação da API', () => {
  for (const url of ['/', '/index.html', '/static/uploads/x.png', '/docs', '/openapi.json', '/assets/app.js', '/apix', '/API/health']) {
    assert.equal(d('GET', url, bearer).status, 404, url);
  }
});

test('o WebSocket de notificações exige o token na consulta e nenhum outro caminho abre', () => {
  assert.equal(d('GET', '/api/notifications/ws', {}, true).status, 401);
  assert.equal(d('GET', '/api/notifications/ws?token=', {}, true).status, 401);
  assert.equal(d('GET', '/api/notifications/ws?token=abc', {}, true).ok, true);
  assert.equal(d('GET', '/api/user/info?token=abc', {}, true).status, 404);
  assert.equal(d('GET', '/api/health', {}, true).status, 404);
});

test('a requisição repassada leva o caminho normalizado e a consulta', () => {
  assert.equal(d('GET', '/api/user/../health?x=1').path, '/api/health?x=1');
  assert.equal(d('GET', '/api/patients?search=jo%C3%A3o', bearer).path, '/api/patients?search=jo%C3%A3o');
});

test('o limite por origem barra a 11ª tentativa e volta com o tempo', () => {
  let now = 0;
  const t = new Throttle({ limit: 10, windowMs: 60_000, now: () => now });
  for (let i = 0; i < 10; i += 1) assert.equal(t.allow('claim:1.2.3.4'), true);
  assert.equal(t.allow('claim:1.2.3.4'), false);
  assert.equal(t.allow('claim:5.6.7.8'), true, 'outra origem tem o seu limite');
  now = 61_000;
  assert.equal(t.allow('claim:1.2.3.4'), true);
});

test('só claim e token têm limite próprio', () => {
  assert.equal(throttleKey('POST', '/api/pairing/claim'), 'claim');
  assert.equal(throttleKey('POST', '/api/pairing/token/'), 'token');
  assert.equal(throttleKey('GET', '/api/pairing/claim'), null);
  assert.equal(throttleKey('GET', '/api/user/info'), null);
});

test('endereços da rede local: sem loopback, sem link-local, os mais comuns primeiro', () => {
  const ifaces = {
    lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    docker0: [{ family: 'IPv4', internal: false, address: '172.17.0.1' }],
    eth0: [{ family: 'IPv4', internal: false, address: '10.0.0.7' }, { family: 'IPv6', internal: false, address: 'fe80::1' }],
    wlan0: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }, { family: 'IPv4', internal: false, address: '169.254.9.9' }],
    vpn: [{ family: 'IPv4', internal: false, address: '100.64.0.2' }],
  };
  assert.deepEqual(lanAddresses(ifaces), ['192.168.1.20', '10.0.0.7', '172.17.0.1', '100.64.0.2']);
  assert.deepEqual(lanAddresses({}), []);
});

test('a decisão devolve o acesso que a rota exige (para quem chama conferir), e nada nas rotas abertas', () => {
  assert.equal(d('GET', '/api/user/info', { authorization: 'Bearer abc.def.ghi' }).token, 'abc.def.ghi');
  assert.equal(d('GET', '/api/notifications/ws?token=t0k', {}, true).token, 't0k');
  assert.equal(d('GET', '/api/health').token, undefined);
  assert.equal(d('POST', '/api/pairing/claim').token, undefined);
});
