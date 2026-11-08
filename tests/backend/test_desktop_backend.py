# tests/backend/test_desktop_backend.py
"""Testes das peças do backend feitas para o app desktop.

Rode direto (não há pytest neste repositório):
    python3 tests/backend/test_desktop_backend.py

  - backend/spa.py: o wrapper ASGI que serve o front. O ponto delicado é NÃO capturar o
    que é da API: um Mount("/") faria POST /api/patients/ virar 405 em vez de redirecionar.
  - backend/services/mime_sniff.py: o detector de tipo usado quando não há libmagic.
  - backend/config.py: QYTHON_DATA_DIR separa o que o backend grava do código.

Os módulos são carregados pelo caminho do arquivo (spa.py e mime_sniff.py não importam
nada do pacote), então o teste não depende do nome da pasta do checkout.
"""
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def load(name, relpath):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, relpath))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


mime_sniff = load('mime_sniff', 'backend/services/mime_sniff.py')
spa = load('spa', 'backend/spa.py')


# --- mime_sniff ---------------------------------------------------------------------

def _zip_with(name):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        z.writestr(name, 'x')
    return buf.getvalue()


def test_mime_tipos_aceitos_pela_biblioteca():
    sniff = mime_sniff.from_buffer
    assert sniff(b'%PDF-1.7\n...') == 'application/pdf'
    assert sniff(_zip_with('ppt/slides/slide1.xml')).endswith('presentationml.presentation')
    assert sniff(_zip_with('word/document.xml')).endswith('wordprocessingml.document')
    assert sniff(b'ID3\x04\x00' + b'\x00' * 30) == 'audio/mpeg'
    assert sniff(b'\xff\xfb\x90\x00' + b'\x00' * 30) == 'audio/mpeg'
    assert sniff(b'RIFF\x24\x00\x00\x00WAVEfmt ') == 'audio/x-wav'
    assert sniff(b'\x00\x00\x00\x18ftypM4A \x00\x00') == 'audio/x-m4a'
    assert sniff(b'\x00\x00\x00\x18ftypisom\x00\x00') == 'video/mp4'
    assert sniff(b'\x00\x00\x00\x14ftypqt  \x00\x00') == 'video/quicktime'
    assert sniff('Prontuário: dor torácica há 2 dias.\n'.encode()) == 'text/plain'
    assert sniff(b'{"a": [1, 2]}') == 'application/json'
    assert sniff(b'<?xml version="1.0"?><a/>') == 'text/xml'
    assert sniff(b'<!DOCTYPE html><html></html>') == 'text/html'


def test_mime_recusa_o_que_nao_conhece():
    sniff = mime_sniff.from_buffer
    assert sniff(b'\x89PNG\r\n\x1a\n\x00\x00') == 'application/octet-stream'
    assert sniff(b'MZ\x90\x00\x03\x00\x00\x00') == 'application/octet-stream'  # executável do Windows
    assert sniff(b'\x00' * 64) == 'application/octet-stream'
    # Um .zip qualquer não pode passar por pptx/docx.
    assert sniff(_zip_with('qualquer.txt')) == 'application/zip'


def test_mime_de_arquivo():
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as fh:
        fh.write(b'%PDF-1.4\n' + b'0' * 20000)
    try:
        assert mime_sniff.from_file(fh.name, mime=True) == 'application/pdf'
    finally:
        os.unlink(fh.name)


# --- spa ----------------------------------------------------------------------------

def _web_dir():
    d = tempfile.mkdtemp()
    os.makedirs(os.path.join(d, 'assets'))
    open(os.path.join(d, 'index.html'), 'w').write('<title>Qython</title>')
    open(os.path.join(d, 'assets', 'app-abc123.js'), 'w').write('console.log(1)')
    open(os.path.join(d, 'favicon.png'), 'wb').write(b'\x89PNG')
    return d


def _client():
    from starlette.applications import Starlette
    from starlette.responses import JSONResponse, RedirectResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    async def patients(request):
        return JSONResponse({'ok': True, 'method': request.method})

    async def slash(request):
        return RedirectResponse('/api/patients', status_code=307)

    async def root(request):
        return JSONResponse({'message': 'api'})

    inner = Starlette(routes=[
        Route('/', root),
        Route('/api/patients', patients, methods=['GET', 'POST']),
        Route('/api/patients/', slash, methods=['POST']),
        Route('/static/uploads/x.txt', patients),
    ])
    return TestClient(spa.SPAWrapper(inner, _web_dir()), follow_redirects=False)


def test_spa_serve_o_front():
    c = _client()
    index = c.get('/')
    assert index.status_code == 200 and '<title>Qython</title>' in index.text
    assert index.headers['cache-control'] == 'no-cache'
    assert index.headers['x-frame-options'] == 'DENY'
    # Rota do React Router: devolve o index.
    assert '<title>Qython</title>' in c.get('/login').text
    assert '<title>Qython</title>' in c.get('/consultas/12/editar').text
    # Arquivos reais saem como são, sem o no-cache do index.
    js = c.get('/assets/app-abc123.js')
    assert js.status_code == 200 and js.text == 'console.log(1)'
    assert c.get('/favicon.png').status_code == 200
    assert c.head('/login').status_code == 200


def test_spa_nao_toca_na_api():
    c = _client()
    assert c.get('/api/patients').json() == {'ok': True, 'method': 'GET'}
    assert c.post('/api/patients').json() == {'ok': True, 'method': 'POST'}
    # O motivo de o SPA ser um wrapper e não um Mount("/"): a barra a mais continua
    # indo para o app (que redireciona), em vez de cair num 405 do front.
    r = c.post('/api/patients/')
    assert r.status_code == 307 and r.headers['location'].endswith('/api/patients')
    # /api inexistente é 404 do app, nunca o index.html.
    r = c.get('/api/nao-existe')
    assert r.status_code == 404 and 'Qython' not in r.text
    assert c.get('/static/uploads/x.txt').json()['ok'] is True


def test_spa_nao_sai_da_pasta():
    c = _client()
    # Tentativa de ler fora da pasta cai no index, não no arquivo.
    for evil in ('/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/assets/../../../etc/passwd'):
        r = c.get(evil)
        assert 'root:' not in r.text, evil
    # Um prefixo parecido não é a API.
    assert '<title>Qython</title>' in c.get('/apiary').text


def test_spa_exige_o_build():
    try:
        spa.SPAWrapper(object(), tempfile.mkdtemp())
    except FileNotFoundError:
        return
    raise AssertionError('deveria recusar uma pasta sem index.html')


# --- config -------------------------------------------------------------------------

def _config(env_extra):
    code = (
        "import json, sys; sys.path.insert(0, %r);"
        "from backend.config import Config as C;"
        "print(json.dumps({k: str(getattr(C, k)) for k in "
        "['DATA_ROOT','STATIC_FOLDER','UPLOAD_FOLDER','LOG_DIR','CHROMA_PATH','CONFIG_DIR','WEB_DIR']}))"
    ) % ROOT
    env = {**os.environ, 'JWT_SECRET_KEY': 'x' * 40, 'DATABASE_URL': 'postgresql://u:p@localhost/db'}
    for k in ('QYTHON_DATA_DIR', 'QYTHON_WEB_DIR', 'QYTHON_LOG_DIR', 'CHROMA_PATH', 'UPLOAD_FOLDER'):
        env.pop(k, None)
    env.update(env_extra)
    out = subprocess.run([sys.executable, '-c', code], env=env, capture_output=True, text=True, cwd=tempfile.gettempdir())
    assert out.returncode == 0, out.stderr[-800:]
    return json.loads(out.stdout.strip().splitlines()[-1])


def test_config_sem_data_dir_e_igual_ao_de_sempre():
    c = _config({})
    assert c['DATA_ROOT'] == ROOT
    assert c['STATIC_FOLDER'] == os.path.join(ROOT, 'backend', 'static')
    assert c['LOG_DIR'] == os.path.join(ROOT, 'log')
    assert c['CHROMA_PATH'] == os.path.join(ROOT, 'chroma_db')
    assert c['WEB_DIR'] == ''


def test_config_com_data_dir_grava_fora_do_codigo():
    data = tempfile.mkdtemp()
    c = _config({'QYTHON_DATA_DIR': data, 'QYTHON_WEB_DIR': '/x/web'})
    real = os.path.realpath(data)
    assert c['DATA_ROOT'] == real
    for key in ('STATIC_FOLDER', 'UPLOAD_FOLDER', 'LOG_DIR', 'CHROMA_PATH', 'CONFIG_DIR'):
        assert c[key].startswith(real), (key, c[key])
    assert c['WEB_DIR'] == '/x/web'


def test_servidor_de_embeddings_recebe_json_no_corpo():
    """Regressão: com os modelos Pydantic dentro de build_app(), o FastAPI os tratava como query
    ('Field required: query.req') e o /embed devolvia 422 a toda chamada real."""
    sys.path.insert(0, ROOT)
    os.environ.setdefault('JWT_SECRET_KEY', 'x' * 40)
    from starlette.testclient import TestClient

    from backend.embed_onnx import build_app

    class FakeEmbedder:
        dim = 4

        def encode(self, texts, kind, batch_size=16):
            return [[float(len(t)), 1.0 if kind == 'query' else 0.0, 0.0, 0.0] for t in texts]

    class FakeReranker:
        def score(self, query, documents, batch_size=16):
            return [float(len(d)) for d in documents]

    client = TestClient(build_app(embedder=FakeEmbedder(), reranker=FakeReranker()))
    assert client.get('/health').json() == {'status': 'ok', 'dim': 4, 'rerank': True, 'engine': 'onnx'}
    res = client.post('/embed', json={'texts': ['ab', 'abc'], 'kind': 'query'})
    assert res.status_code == 200, res.text
    assert res.json() == {'embeddings': [[2.0, 1.0, 0.0, 0.0], [3.0, 1.0, 0.0, 0.0]], 'dim': 4}
    assert client.post('/embed', json={'texts': []}).json() == {'embeddings': [], 'dim': 4}
    ranked = client.post('/rerank', json={'query': 'q', 'documents': ['a', 'ccc', 'bb'], 'top_k': 2}).json()
    assert [r['index'] for r in ranked['results']] == [1, 2], ranked
    # Sem reranker o backend precisa receber um erro que ele trata (cai na ordem da fusão).
    bare = TestClient(build_app(embedder=FakeEmbedder()))
    assert bare.post('/rerank', json={'query': 'q', 'documents': ['a']}).status_code == 503
    assert bare.get('/health').json()['rerank'] is False


def test_app_instalado_nao_le_env_solto_pelas_pastas():
    """Um .env esquecido numa pasta acima não pode vazar chave nenhuma para o app instalado."""
    base = tempfile.mkdtemp()
    work = os.path.join(base, 'a', 'b')
    os.makedirs(work)
    open(os.path.join(base, 'a', '.env'), 'w').write('STRAY_KEY=vazou\n')
    env = {k: v for k, v in os.environ.items() if k not in ('PYTHON_DOTENV_DISABLED', 'STRAY_KEY')}
    env.update({'JWT_SECRET_KEY': 'x' * 40, 'PYTHONPATH': ROOT})

    def run(code):
        out = subprocess.run([sys.executable, '-c', code], env=env, capture_output=True, text=True, cwd=work)
        assert out.returncode == 0, out.stderr[-600:]
        return out.stdout.strip().splitlines()[-1]

    probe = "from dotenv import load_dotenv; load_dotenv(); import os; print(os.getenv('STRAY_KEY'))"
    assert run(probe) == 'vazou', 'o controle falhou: sem o desktop o .env deveria ser achado'
    assert run('import backend.desktop;' + probe) == 'None'


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
