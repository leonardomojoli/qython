# tests/backend/test_ai_settings.py
"""Testes da configuração da IA pela interface (backend/services/ai_settings_service.py).

Rode direto (não há pytest neste repositório):
    python3 tests/backend/test_ai_settings.py

Sem banco: o serviço fala com um par get/set de strings, aqui um dicionário. O que importa:
  - a validação recusa o que deixaria a IA inutilizável antes de salvar;
  - as chaves de API ficam cifradas em repouso e NUNCA voltam pela visão da API;
  - aplicar muda o servidor de IA na hora (ambiente + clientes descartados) e apagar volta ao ambiente;
  - o teste de conexão conversa de verdade com o servidor.
"""
import asyncio
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, ROOT)
os.environ.setdefault('JWT_SECRET_KEY', 'x' * 40)
os.environ.setdefault('DATABASE_URL', 'postgresql://u:p@127.0.0.1:1/db')
os.environ['QYTHON_ALLOW_EPHEMERAL_KEK'] = '1'
for var in ('LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_CONTEXT_TOKENS'):
    os.environ.pop(var, None)

from backend.services import ai_settings_service as ai  # noqa: E402
from backend.services import llm_provider  # noqa: E402


def memory_store():
    data = {}

    async def get(key):
        return data.get(key)

    async def set_(key, value):
        data[key] = value

    return ai.Store(get, set_), data


def run(coro):
    return asyncio.run(coro)


def expect_error(fn, fragment):
    try:
        fn()
    except ai.AiSettingsError as exc:
        assert fragment in str(exc), f'mensagem inesperada: {exc}'
        return
    raise AssertionError(f'deveria recusar ({fragment})')


# --- validação ----------------------------------------------------------------------

def test_validacao_recusa_valor_ruim():
    expect_error(lambda: ai.validate_patch({'provider': 'gemini'}), 'desconhecidos')  # não há mais escolha de provedor
    expect_error(lambda: ai.validate_patch({'gemini_api_key': 'k'}), 'desconhecidos')
    expect_error(lambda: ai.validate_patch({'base_url': 'ftp://x/v1'}), 'http://')
    expect_error(lambda: ai.validate_patch({'base_url': 'http://'}), 'http://')
    expect_error(lambda: ai.validate_patch({'context_tokens': 10}), 'entre 2.048')
    expect_error(lambda: ai.validate_patch({'context_tokens': 'muito'}), 'número')
    expect_error(lambda: ai.validate_patch({'api_key': 'abc\ndef'}), 'inválida')
    expect_error(lambda: ai.validate_patch({'senha': 'x'}), 'desconhecidos')


def test_validacao_normaliza():
    got = ai.validate_patch({'base_url': ' http://127.0.0.1:8081/v1/ ', 'model': ' gemma-4 ',
                             'context_tokens': '16384', 'api_key': ' k '})
    assert got == {'base_url': 'http://127.0.0.1:8081/v1', 'model': 'gemma-4',
                   'context_tokens': 16384, 'api_key': 'k'}
    assert ai.validate_patch({'base_url': '', 'context_tokens': ''}) == {'base_url': '', 'context_tokens': ''}


def test_sem_endereco_do_servidor_e_recusado():
    expect_error(lambda: ai.check_consistency({}, {}), 'endereço')
    ai.check_consistency({'base_url': 'http://x/v1'}, {})
    ai.check_consistency({}, {'LLM_BASE_URL': 'http://do-ambiente/v1'})


# --- persistência e segredos ---------------------------------------------------------

def test_chaves_ficam_cifradas_e_nao_vazam_pela_visao():
    store, data = memory_store()
    run(ai.save(store, {'base_url': 'http://srv/v1', 'api_key': 'sk-SEGREDO-LOCAL'}))
    raw = json.dumps(data)
    assert 'SEGREDO' not in raw, 'chave em texto no banco'
    assert 'api_key' in json.loads(data[ai.KEY_SECRETS])
    stored = run(ai.load_stored(store))
    assert stored['api_key'] == 'sk-SEGREDO-LOCAL'
    view = json.dumps(ai.view(stored))
    assert 'SEGREDO' not in view, 'chave na visão da API'
    assert ai.view(stored)['has_api_key'] is True
    assert 'has_gemini_key' not in ai.view(stored) and 'provider' not in ai.view(stored)
    run(ai.clear(store))


def test_salvar_so_muda_o_que_foi_enviado_e_vazio_apaga():
    store, _ = memory_store()
    run(ai.save(store, {'base_url': 'http://srv/v1', 'model': 'm1', 'api_key': 'k1'}))
    run(ai.save(store, {'model': 'm2'}))
    stored = run(ai.load_stored(store))
    assert stored == {'base_url': 'http://srv/v1', 'model': 'm2', 'api_key': 'k1'}
    run(ai.save(store, {'api_key': ''}))
    assert 'api_key' not in run(ai.load_stored(store))
    run(ai.clear(store))


def test_nada_e_salvo_quando_a_combinacao_e_recusada():
    store, data = memory_store()
    try:
        run(ai.save(store, {'model': 'gemma-4'}))  # sem endereço do servidor, nem salvo nem no ambiente
    except ai.AiSettingsError:
        assert not data, 'não deveria ter gravado nada'
        return
    raise AssertionError('deveria recusar a configuração sem o endereço do servidor')


# --- aplicar ao processo ---------------------------------------------------------------

def test_aplicar_troca_o_servidor_na_hora_e_apagar_volta_ao_ambiente():
    store, _ = memory_store()
    assert llm_provider.provider_name() == 'openai'  # o único caminho: servidor local compatível
    assert llm_provider.capabilities()['image_generation'] is False and llm_provider.capabilities()['web_search'] is False
    run(ai.save(store, {'base_url': 'http://127.0.0.1:8081/v1', 'model': 'gemma-4', 'context_tokens': 8192}))
    assert os.environ['LLM_BASE_URL'] == 'http://127.0.0.1:8081/v1'
    assert llm_provider.context_tokens() == 8192
    run(ai.clear(store))
    assert 'LLM_BASE_URL' not in os.environ
    assert llm_provider.context_tokens() == 16384


def test_o_ambiente_original_volta_ao_apagar():
    os.environ['LLM_BASE_URL'] = 'http://do-ambiente/v1'
    ai._baseline = None  # recaptura o ambiente deste teste
    store, _ = memory_store()
    run(ai.save(store, {'base_url': 'http://da-interface/v1'}))
    assert os.environ['LLM_BASE_URL'] == 'http://da-interface/v1'
    assert ai.view(run(ai.load_stored(store)))['sources']['base_url'] == 'interface'
    run(ai.clear(store))
    assert os.environ['LLM_BASE_URL'] == 'http://do-ambiente/v1'
    assert ai.view({})['sources']['base_url'] == 'ambiente'
    os.environ.pop('LLM_BASE_URL')
    ai._baseline = None


def test_aplicar_descarta_os_clientes_ja_construidos():
    built = []
    lazy = llm_provider.LazyClient(lambda: built.append(1) or object())
    lazy._resolve()
    lazy._resolve()
    assert len(built) == 1
    ai.apply({})
    lazy._resolve()
    assert len(built) == 2, 'o cliente deveria ser reconstruído com a configuração nova'


# --- teste de conexão -------------------------------------------------------------------

class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.headers.get('Authorization') != 'Bearer boa':
            self.send_response(401)
            self.end_headers()
            return
        body = json.dumps({'data': [{'id': 'gemma-4'}, {'id': 'outro'}]}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)


def test_conexao_com_servidor_compativel():
    server = HTTPServer(('127.0.0.1', 0), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/v1'
    try:
        ok = run(ai.test_connection({'base_url': base, 'api_key': 'boa'}))
        assert ok['ok'] and ok['models'] == ['gemma-4', 'outro'] and ok['latency_ms'] >= 0, ok
        bad = run(ai.test_connection({'base_url': base, 'api_key': 'errada'}))
        assert not bad['ok'] and 'recusou a chave' in bad['detail'], bad
    finally:
        server.shutdown()
    down = run(ai.test_connection({'base_url': 'http://127.0.0.1:1/v1'}))
    assert not down['ok'] and 'conectar' in down['detail'], down
    assert not run(ai.test_connection({}))['ok']


if __name__ == '__main__':
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith('test_') and callable(fn):
            try:
                fn()
                print(f'ok   {name}')
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f'FAIL {name}: {type(exc).__name__}: {exc}')
    sys.exit(1 if failed else 0)
