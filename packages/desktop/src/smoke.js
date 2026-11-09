// Teste de fumaça: sobe a pilha de verdade, usa a API como um médico novo e fecha.
// Roda no CI (Linux sob xvfb, Windows e macOS) e prova, em ordem:
//   1. o banco novo é criado e o backend responde em /api/health;
//   2. o front é servido na mesma origem da API;
//   3. a conta do dono nasce sem captcha, SMS nem e-mail, e o termo de uso é aceito;
//   4. dado cifrado (documento de um paciente) continua legível DEPOIS de reiniciar tudo,
//      ou seja, as chaves de criptografia sobrevivem a uma nova abertura do app.
const OWNER = { email: 'dona@clinica-ci.com.br', password: 'Senha123!' };

function assert(cond, message) {
  if (!cond) throw new Error(`FUMAÇA FALHOU: ${message}`);
}

async function call(base, method, route, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form instanceof FormData ? form : new URLSearchParams(form);
  }
  const res = await fetch(`${base}${route}`, { method, headers, body });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

export async function runSmoke({ stack, log, window }) {
  const base = stack.webUrl;
  const api = `${base}/api`;
  const step = (m) => log.info(`[fumaça] ${m}`);

  step('front servido na mesma origem');
  const index = await fetch(`${base}/`).then((r) => r.text());
  assert(index.includes('<title>Qython</title>'), 'o index.html do front não foi servido');
  const deep = await fetch(`${base}/login`);
  assert(deep.status === 200, `rota do SPA /login devolveu ${deep.status}`);
  const missing = await fetch(`${api}/nao-existe`);
  assert(missing.status === 404, '/api inexistente deveria dar 404, não o index.html');

  if (window) {
    step('o React renderiza na janela');
    // O main já pediu a raiz; navegar de novo aborta a primeira carga (ERR_ABORTED, -3).
    await window.loadURL(`${base}/login`).catch((err) => {
      if (err.errno !== -3) throw err;
    });
    const rendered = await waitForDom(window, `!!document.querySelector('input[type="password"]')`, 30000);
    assert(rendered, 'a tela de login não renderizou (React quebrou no carregamento)');
  }

  step('configuração pública: instalação sem conta');
  const cfg = await call(api, 'GET', '/public/config');
  assert(cfg.status === 200 && cfg.data.setup_required === true, `setup_required esperado, veio ${JSON.stringify(cfg.data)}`);
  assert(cfg.data.edition === 'local', 'edição deveria ser local');

  step('cadastro do dono');
  const form = new FormData();
  for (const [k, v] of Object.entries({
    email: OWNER.email, password: OWNER.password, full_name: 'Dona CI', occupation: 'Médico',
    country: 'br', identifier_number: 'CRM-CI',
  })) form.append(k, v);
  const reg = await call(api, 'POST', '/auth/register/step1', { form });
  assert(reg.status === 200 && reg.data.status === 'active' && reg.data.user?.is_admin, `cadastro do dono falhou: ${JSON.stringify(reg.data)}`);
  let token = reg.data.access_token;

  step('termo de uso');
  const info = await call(api, 'GET', '/user/info', { token });
  assert(info.data.terms_pending === true, 'o termo de uso deveria estar pendente');
  const accept = await call(api, 'POST', '/user/me/consents', { token, json: { type: 'terms_of_use' } });
  assert(accept.status < 300, `aceite do termo falhou: ${JSON.stringify(accept.data)}`);

  step('paciente com documento (coluna cifrada)');
  const created = await call(api, 'POST', '/patients', {
    token, json: { full_name: 'Maria da Silva', document_id: '529.982.247-25', gender: 'F' },
  });
  assert(created.status < 300, `criar paciente falhou (${created.status}): ${JSON.stringify(created.data)}`);
  const patientId = created.data.id;
  assert(patientId, 'o paciente não voltou com id');

  step('reiniciando a pilha inteira (as chaves precisam sobreviver)');
  await stack.stop();
  await stack.start();

  const base2 = stack.webUrl;
  assert(base2 === base, `a porta mudou entre aberturas (${base} -> ${base2}): o login do médico se perderia`);
  const login = await call(`${base2}/api`, 'POST', '/auth/login', {
    form: { username: OWNER.email, password: OWNER.password },
  });
  assert(login.status === 200 && login.data.access_token, `login após reiniciar falhou: ${JSON.stringify(login.data)}`);
  token = login.data.access_token;
  const again = await call(`${base2}/api`, 'GET', `/patients/${patientId}`, { token });
  assert(again.status === 200, `ler o paciente falhou (${again.status}): ${JSON.stringify(again.data)}`);
  assert(again.data.document_id === '529.982.247-25',
    `documento cifrado ilegível após reiniciar: ${JSON.stringify(again.data.document_id)}`);
  const stillAccepted = await call(`${base2}/api`, 'GET', '/user/info', { token });
  assert(stillAccepted.data.terms_pending === false, 'o aceite do termo se perdeu');

  step('OK');
}

async function waitForDom(window, expression, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await window.webContents.executeJavaScript(expression)) return true;
    } catch {
      // a página ainda está carregando
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
