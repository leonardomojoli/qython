import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModelManager, fileUrl, loadManifest } from '../src/models.js';
import { assess, GB } from '../src/hardware.js';
import { AiController } from '../src/ai.js';
import { Settings } from '../src/settings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const real = loadManifest(path.join(here, '..', 'models.json'));
const quiet = { info() {}, warn() {}, error() {}, sink: () => ({ write() {}, close() {} }) };

test('o manifesto fixa cada arquivo por tamanho, SHA-256 e revisão', () => {
  assert.equal(real.defaultModel, 'gemma-4-26b-a4b');
  for (const m of real.models.filter((x) => !x.kind)) {
    assert.match(m.revision, /^[0-9a-f]{40}$/);
    assert.ok(m.files.some((f) => f.role === 'model'));
    for (const f of m.files) {
      assert.match(f.sha256, /^[0-9a-f]{64}$/, `${m.id}/${f.name}`);
      assert.ok(f.size > 1e8);
      assert.match(fileUrl(m, f), /^https:\/\/huggingface\.co\/ggml-org\/.+\/resolve\/[0-9a-f]{40}\/.+\.gguf$/);
    }
  }
  // O padrão tem a quantização explícita: sem ela o llama.cpp baixaria os 50 GB do BF16.
  const def = real.models.find((m) => m.id === real.defaultModel);
  assert.ok(def.files.find((f) => f.role === 'model').name.endsWith('-Q4_0.gguf'));
  for (const asset of Object.values(real.llama.assets)) assert.match(asset.sha256, /^[0-9a-f]{64}$/);
});

test('os modelos de busca da biblioteca são multilíngues, fixados e não aparecem como escolha', () => {
  const mm = new ModelManager(real, '/x');
  assert.deepEqual(mm.supports().map((m) => m.id), ['e5-base-int8', 'rerank-mmarco-int8', 'ocr-ppocrv6-medium']);
  assert.ok(mm.llms().every((m) => m.kind !== 'support'));
  assert.ok(mm.llms().length === 3 && !mm.llms().some((m) => m.id.includes('e5')));
  for (const m of mm.supports()) {
    // Do Hugging Face: fixado por commit. Fora dele (OCR): cada arquivo traz a URL numa versão.
    if (m.repo) assert.match(m.revision, /^[0-9a-f]{40}$/);
    for (const f of m.files) {
      assert.match(f.sha256, /^[0-9a-f]{64}$/, `${m.id}/${f.name}`);
      assert.ok(f.size > 1e6);
      if (!m.repo) assert.match(f.url, /^https:\/\/github\.com\/leonardomojoli\/qython\/releases\/download\/ocr-models-[^/]+\/.+\.onnx$/, `${m.id}/${f.name}`);
    }
  }
  // O arquivo no disco tem o nome simples; a URL usa o caminho dentro do repositório.
  const e5 = mm.get('e5-base-int8');
  const model = e5.files.find((f) => f.role === 'model');
  assert.equal(model.name, 'model.onnx');
  assert.equal(fileUrl(e5, model), `https://huggingface.co/Xenova/multilingual-e5-base/resolve/${e5.revision}/onnx/model_quantized.onnx`);
  assert.equal(fileUrl(e5, e5.files.find((f) => f.role === 'tokenizer')).endsWith('/tokenizer.json'), true);
  assert.equal(mm.supportMissing().length, 3);
  // O OCR médio vem com a URL inteira e é usado pelo nome do arquivo no disco.
  const ocr = mm.get('ocr-ppocrv6-medium');
  assert.deepEqual(ocr.files.map((f) => f.name), ['PP-OCRv6_det_medium.onnx', 'PP-OCRv6_rec_medium.onnx']);
  assert.equal(fileUrl(ocr, ocr.files[0]), ocr.files[0].url);
});

test('avisa quando falta RAM, mas nunca troca de modelo sozinha', () => {
  const m = real.models.find((x) => x.id === 'gemma-4-26b-a4b');
  const ok = assess(m, { totalRamGb: 32, freeDiskBytes: 100 * GB });
  assert.deepEqual([ok.ramLevel, ok.warnings, ok.blocking], ['ok', [], null]);

  const low = assess(m, { totalRamGb: 18, freeDiskBytes: 100 * GB });
  assert.equal(low.ramLevel, 'low');
  assert.match(low.warnings[0], /18 GB de RAM.*32 GB/);

  const tiny = assess(m, { totalRamGb: 8, freeDiskBytes: 100 * GB });
  assert.equal(tiny.ramLevel, 'insufficient');
  assert.match(tiny.warnings[0], /provavelmente não vai rodar/);
  assert.equal(tiny.blocking, null, 'o aviso não impede: a decisão é do médico');
});

test('falta de disco bloqueia o download, descontando o que já foi baixado', () => {
  const m = real.models.find((x) => x.id === 'gemma-4-26b-a4b');
  const total = m.files.reduce((s, f) => s + f.size, 0);
  assert.match(assess(m, { totalRamGb: 32, freeDiskBytes: 5 * GB }).blocking, /Falta espaço em disco/);
  assert.equal(assess(m, { totalRamGb: 32, freeDiskBytes: 2 * GB }, total - GB).blocking, null);
});

// Modelo pequeno de mentira servido localmente.
async function fakeRepo() {
  const files = { 'a.gguf': crypto.randomBytes(200_000), 'mm.gguf': crypto.randomBytes(50_000) };
  const server = http.createServer((req, res) => {
    const name = req.url.split('/').pop();
    const data = files[name];
    if (!data) { res.statusCode = 404; return res.end(); }
    res.end(data);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const manifest = {
    defaultModel: 'tiny',
    models: [{
      id: 'tiny', label: 'Tiny', ramGb: 1, minTotalRamGb: 2, contextTokens: 4096, repo: 'x/y', revision: 'r',
      files: [
        { role: 'model', name: 'a.gguf', size: files['a.gguf'].length, sha256: sha(files['a.gguf']) },
        { role: 'mmproj', name: 'mm.gguf', size: files['mm.gguf'].length, sha256: sha(files['mm.gguf']) },
      ],
    }],
  };
  return { server, manifest, port: server.address().port };
}

test('instala o modelo inteiro, com progresso agregado, e só então o considera instalado', async () => {
  const { server, manifest, port } = await fakeRepo();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qy-mod-'));
  try {
    const mm = new ModelManager(manifest, dir, { urlFor: (_m, f) => `http://127.0.0.1:${port}/${f.name}` });
    assert.equal(mm.isInstalled('tiny'), false);
    assert.equal(mm.paths('tiny'), null);
    const seen = [];
    await mm.install('tiny', { onProgress: (p) => seen.push(p) });
    assert.equal(mm.isInstalled('tiny'), true);
    const paths = mm.paths('tiny');
    assert.ok(paths.model.endsWith('a.gguf') && paths.mmproj.endsWith('mm.gguf'));
    assert.equal(seen.at(-1).phase, 'done');
    assert.equal(seen.at(-1).received, seen.at(-1).total);
    assert.ok(seen.every((p) => p.received <= p.total));
    mm.remove('tiny');
    assert.equal(mm.isInstalled('tiny'), false);
  } finally { server.close(); }
});

test('o controlador guarda a escolha, baixa em segundo plano e relata o estado', async () => {
  const { server, manifest, port } = await fakeRepo();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qy-ai-'));
  try {
    const mm = new ModelManager(manifest, path.join(dir, 'models'), { urlFor: (_m, f) => `http://127.0.0.1:${port}/${f.name}` });
    const settings = new Settings(path.join(dir, 'settings.json'));
    const unloaded = [];
    const ai = new AiController({
      models: mm, settings, logger: quiet, llm: () => ({ state: 'idle', unload: async () => unloaded.push(1) }),
      hw: { totalRamGb: () => 16, freeDiskBytes: () => 50 * GB },
    });
    assert.equal(ai.choice, null, 'sem escolha, o assistente aparece');
    assert.match(ai.state().models[0].assessment.ramLevel, /ok/);
    await ai.install('tiny');
    assert.equal(ai.state().models[0].installed, true);
    assert.equal(ai.choice.modelId, 'tiny');
    assert.equal(ai.notReadyReason(), null);
    // A escolha sobrevive a reabrir o app.
    assert.equal(new Settings(path.join(dir, 'settings.json')).get('ai').modelId, 'tiny');
  } finally { server.close(); }
});

test('download que falha deixa o motivo no estado e a IA marcada como não pronta', async () => {
  const { server, manifest } = await fakeRepo();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qy-ai2-'));
  try {
    // URL errada: 404 em todo arquivo.
    const mm = new ModelManager(manifest, path.join(dir, 'models'), { retries: 0, fetchImpl: async () => ({ status: 500, body: null }) });
    const ai = new AiController({
      models: mm, settings: new Settings(path.join(dir, 's.json')), logger: quiet, llm: () => null,
      hw: { totalRamGb: () => 16, freeDiskBytes: () => 50 * GB },
    });
    await ai.install('tiny');
    assert.match(ai.state().error, /falhou/);
    assert.match(ai.notReadyReason(), /não terminou/);
  } finally { server.close(); }
});

test('o manifesto traz a transcrição (whisper) com tudo fixado e fora da lista de LLMs', () => {
  const real = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'models.json'), 'utf8'));
  const mm = new ModelManager(real, '/x');
  const w = mm.defaultWhisper();
  assert.equal(w.id, 'whisper-large-v3-turbo');
  assert.ok(mm.llms().every((m) => m.kind === undefined), 'whisper não pode aparecer como modelo de linguagem');
  for (const m of real.models.filter((x) => x.kind === 'whisper')) {
    assert.match(m.revision, /^[0-9a-f]{40}$/, m.id);
    assert.ok(m.files.some((f) => f.role === 'model' && f.name === 'model.bin' && f.size > 7e7), `${m.id} sem model.bin`);
    assert.ok(m.files.some((f) => f.name === 'config.json') && m.files.some((f) => f.name === 'tokenizer.json'));
    for (const f of m.files) assert.match(f.sha256, /^[0-9a-f]{64}$/, `${m.id}/${f.name}`);
  }
  assert.ok(w.files.find((f) => f.name === 'model.bin').size > 1.5e9, 'o padrão é o large-v3-turbo');
});
