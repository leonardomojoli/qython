// Teste de fumaça: sobe a pilha de verdade, usa a API como um médico novo e fecha.
// Roda no CI (Linux sob xvfb, Windows e macOS) e prova, em ordem:
//   1. o banco novo é criado e o backend responde em /api/health;
//   2. o front é servido na mesma origem da API;
//   3. a conta do dono nasce sem captcha, SMS nem e-mail, e o termo de uso é aceito;
//   4. dado cifrado (documento de um paciente) continua legível DEPOIS de reiniciar tudo,
//      ou seja, as chaves de criptografia sobrevivem a uma nova abertura do app.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupFlow, restoreFlow } from './backup-flow.js';

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

  // A IA primeiro: ela confere que o llama-server começa desligado, e o chat da biblioteca (que
  // também usa a IA) o religaria.
  if (process.env.QYTHON_AI_MODEL_FILE) await smokeAi({ stack, api: `${base2}/api`, token, step, log });
  await smokeLibrary({ stack, api: `${base2}/api`, token, step, log, withAi: !!process.env.QYTHON_AI_MODEL_FILE });

  await smokeBackup({ stack, step, patientId });

  step('OK');
}

async function login(base) {
  const res = await call(`${base}/api`, 'POST', '/auth/login', { form: { username: OWNER.email, password: OWNER.password } });
  assert(res.status === 200 && res.data.access_token, `login falhou: ${JSON.stringify(res.data)}`);
  return res.data.access_token;
}

// Backup e restauração de ponta a ponta, do jeito que o menu faz: o arquivo cifrado sai com a
// pilha parada, o médico continua usando (cadastra outro paciente), restaura, e o app tem de
// voltar ao instante do backup, com o documento cifrado ainda legível (as chaves vão no arquivo).
export async function smokeBackup({ stack, step, patientId }) {
  const file = path.join(os.tmpdir(), `qython-fumaca-${process.pid}.qybackup`);
  try {
    step('backup: para a pilha, guarda tudo num arquivo cifrado e religa');
    const { bytes } = await backupFlow({ stack, passphrase: 'senha-da-fumaca', outFile: file });
    assert(bytes > 1000, `o backup saiu pequeno demais (${bytes} bytes)`);
    const base = stack.webUrl;
    const token = await login(base);

    const later = await call(`${base}/api`, 'POST', '/patients', {
      token, json: { full_name: 'Depois do Backup', document_id: '111.444.777-35', gender: 'M' },
    });
    assert(later.status < 300 && later.data.id, `cadastrar o paciente posterior falhou: ${JSON.stringify(later.data)}`);

    step('restauração com a senha errada não derruba nem muda nada');
    let wrong = null;
    try {
      await restoreFlow({ stack, file, passphrase: 'senha-errada-123' });
    } catch (err) {
      wrong = err;
    }
    assert(wrong && /Senha incorreta/.test(wrong.message), `a senha errada deveria ser recusada: ${wrong?.message}`);
    assert((await fetch(`${base}/api/health`)).status === 200, 'a pilha deveria seguir de pé depois da senha errada');

    step('restauração: volta ao instante do backup');
    const { antes } = await restoreFlow({ stack, file, passphrase: 'senha-da-fumaca' });
    assert(fs.existsSync(path.join(antes, 'db')), 'o banco anterior deveria ter sido guardado, não apagado');
    assert(stack.webUrl === base, 'a porta mudou depois de restaurar');

    const token2 = await login(base);
    const back = await call(`${base}/api`, 'GET', `/patients/${patientId}`, { token: token2 });
    assert(back.status === 200 && back.data.document_id === '529.982.247-25',
      `o paciente do backup deveria estar lá e legível: ${back.status} ${JSON.stringify(back.data)}`);
    const gone = await call(`${base}/api`, 'GET', `/patients/${later.data.id}`, { token: token2 });
    assert(gone.status === 404, `o paciente posterior ao backup não deveria existir (veio ${gone.status})`);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** Um PDF de uma página com o texto, escrito à mão (sem dependências). Só ASCII. */
function tinyPdf(text) {
  const esc = text.replace(/[()\\]/g, '\\$&');
  const content = `BT /F1 12 Tf 72 720 Td (${esc}) Tj ET`;
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/**
 * Biblioteca com armazenamento local: o PDF é enviado, indexado no Chroma (que sobe sob
 * demanda) com o embedder ONNX embutido, e uma pergunta encontra o trecho. Depois do Chroma
 * ser desligado por inatividade, o próximo pedido o sobe de novo e os dados continuam lá.
 */
async function smokeLibrary({ stack, api, token, step, log, withAi }) {
  const chroma = stack.chroma;
  assert(chroma, 'o Chroma não foi criado');
  assert(chroma.state === 'idle', `o Chroma deveria estar desligado antes de a biblioteca ser usada (estado: ${chroma.state})`);

  step('biblioteca: envia um PDF');
  const lib = await call(api, 'POST', '/academic/libraries', { token, json: { name: 'Biblioteca do CI' } });
  assert(lib.status < 300 && lib.data.id, `criar biblioteca falhou: ${JSON.stringify(lib.data)}`);
  const form = new FormData();
  const pdf = tinyPdf('Amoxicilina na otite media aguda em criancas: 80 a 90 mg/kg/dia, dividida em duas tomadas, por 10 dias. '
    + 'A dose maxima e 4 g por dia.');
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'otite.pdf');
  const up = await call(api, 'POST', `/academic/libraries/${lib.data.id}/documents`, { token, form });
  assert(up.status === 202, `upload devolveu ${up.status}: ${JSON.stringify(up.data).slice(0, 300)}`);

  step('biblioteca: espera a indexação (Chroma sob demanda + embedder ONNX)');
  let doc;
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const list = await call(api, 'GET', `/academic/libraries/${lib.data.id}/documents`, { token });
    doc = list.data[0];
    if (doc && (doc.status === 'processed' || doc.status === 'error')) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert(doc?.status === 'processed', `o documento não foi indexado: ${JSON.stringify(doc)}`);
  assert(doc.storage_provider === null || doc.storage_provider === 'local',
    `o documento deveria ficar no armazenamento local, veio ${doc.storage_provider}`);
  assert(chroma.service.starts >= 1, 'o Chroma não subiu para indexar');
  // O embedder multilíngue (e5 em ONNX) é quem gera os vetores: sem ele a busca não entende português.
  const embedder = stack.embedder;
  assert(embedder?.service.starts >= 1, 'o serviço de embeddings (e5) não subiu para indexar');
  const health = await fetch(`http://127.0.0.1:${embedder.publicPort}/health`).then((r) => r.json());
  assert(health.engine === 'onnx' && health.dim === 768, `embedder inesperado: ${JSON.stringify(health)}`);

  if (!withAi) return;
  const ask = () => call(api, 'POST', `/academic/libraries/${lib.data.id}/chat`, {
    token, json: { message: 'Qual a dose de amoxicilina na otite média aguda em crianças?', history: [] },
  });
  step('biblioteca: a pergunta encontra o trecho indexado');
  const first = await ask();
  assert(first.status === 200, `chat da biblioteca devolveu ${first.status}: ${JSON.stringify(first.data).slice(0, 300)}`);
  assert(!/^(Não encontrei|Desculpe, não consegui)/.test(first.data.response), `a busca não achou o trecho: ${first.data.response}`);

  step('biblioteca: parado, o Chroma é desligado e os dados continuam');
  const idleMs = (Number(process.env.QYTHON_CHROMA_IDLE_SECONDS) || 600) * 1000;
  const stopBy = Date.now() + idleMs + 30000;
  while (chroma.state !== 'idle' && Date.now() < stopBy) await new Promise((r) => setTimeout(r, 500));
  assert(chroma.state === 'idle', 'o Chroma não foi desligado depois de parado');
  const chromaStarts = chroma.service.starts;
  const again = await ask();
  assert(chroma.service.starts > chromaStarts, 'o Chroma deveria ter subido de novo');
  assert(again.status === 200 && !/^(Não encontrei|Desculpe, não consegui)/.test(again.data.response),
    `depois de religar o Chroma a busca falhou: ${JSON.stringify(again.data).slice(0, 300)}`);
  log.info('[fumaça] biblioteca: ok');
}

/**
 * IA local de ponta a ponta com um modelo minúsculo (o CI usa o Qwen3 0.6B): a pergunta vai
 * pelo copiloto do backend, atravessa a porta fixa da IA, sobe o llama-server sob demanda,
 * volta como resposta; parado, ele é desligado para liberar a memória e o pedido seguinte
 * o sobe de novo. Prova a fiação, não a qualidade da resposta.
 */
async function smokeAi({ stack, api, token, step, log }) {
  const llm = stack.llm;
  assert(llm, 'a IA local não foi criada');
  assert(llm.state === 'idle', `o llama-server deveria estar desligado antes do primeiro pedido (estado: ${llm.state})`);

  const cfg = await call(api, 'GET', '/public/config');
  assert(cfg.data.ai?.provider === 'openai', `provedor de IA esperado: openai, veio ${JSON.stringify(cfg.data.ai)}`);

  const ask = async (text) => {
    const form = new FormData();
    form.append('message', text);
    return call(api, 'POST', '/copilot', { token, form });
  };

  step('IA local: 1º pedido sobe o llama-server');
  const first = await ask('Responda apenas com a palavra OK.');
  assert(first.status === 200, `o copiloto devolveu ${first.status}: ${JSON.stringify(first.data).slice(0, 400)}`);
  assert(typeof first.data.response === 'string' && first.data.response.trim().length > 0,
    `resposta vazia: ${JSON.stringify(first.data).slice(0, 400)}`);
  // Com a ociosidade curta do teste, ele pode ter sido desligado entre duas chamadas internas
  // do copiloto; o que importa aqui é que subiu sob demanda.
  assert(llm.service.starts >= 1, 'o llama-server não subiu para responder');

  step('IA local: parado, o llama-server é desligado');
  const idleMs = (Number(process.env.QYTHON_LLM_IDLE_SECONDS) || 900) * 1000;
  const deadline = Date.now() + idleMs + 30000;
  while (llm.state !== 'idle' && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500));
  assert(llm.state === 'idle', 'o llama-server não foi desligado depois de parado');

  step('IA local: o pedido seguinte o sobe de novo');
  const startsBefore = llm.service.starts;
  const second = await ask('Diga apenas: de novo.');
  assert(second.status === 200 && second.data.response?.trim(), `2º pedido falhou: ${JSON.stringify(second.data).slice(0, 400)}`);
  assert(llm.service.starts > startsBefore, 'o llama-server deveria ter subido de novo');
  log.info('[fumaça] IA local: ok');
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
