# tests/backend/test_transcription_service.py
"""Testes da transcrição local (backend/services/academic_services/transcription_service.py).

Rode direto (não há pytest neste repositório):
    python3 tests/backend/test_transcription_service.py

O Qython só transcreve pelo faster-whisper local (WHISPER_SERVER_URL). O que importa:
  - sem URL não há para onde mandar: erro permanente, com a causa dita (nada de serviço em nuvem);
  - serviço de pé: o texto volta;
  - serviço fora do ar ou 5xx: erro TRANSITÓRIO (o documento volta a 'pending' e é reprocessado);
  - 4xx e resultado vazio: erro permanente.

O módulo é carregado pelo caminho do arquivo (não importa nada do pacote `backend`).
"""
import importlib.util
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def load():
    path = os.path.join(ROOT, 'backend', 'services', 'academic_services', 'transcription_service.py')
    spec = importlib.util.spec_from_file_location('transcription_service', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ts = load()


class _Handler(BaseHTTPRequestHandler):
    status = 200
    body = {'text': 'Paciente refere cefaleia há três dias.'}

    def log_message(self, *a):
        pass

    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length', 0)))
        data = json.dumps(self.body).encode()
        self.send_response(self.status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def _with_server(status, body, fn):
    _Handler.status, _Handler.body = status, body
    server = HTTPServer(('127.0.0.1', 0), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    old = ts.WHISPER_SERVER_URL
    ts.WHISPER_SERVER_URL = f'http://127.0.0.1:{server.server_port}'
    try:
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            f.write(b'RIFF....WAVEfmt ')
        try:
            return fn(f.name)
        finally:
            os.unlink(f.name)
    finally:
        ts.WHISPER_SERVER_URL = old
        server.shutdown()


def _raises(exc_type, fn):
    try:
        fn()
    except exc_type as exc:
        return exc
    raise AssertionError(f'deveria levantar {exc_type.__name__}')


def test_sem_url_nao_ha_para_onde_mandar():
    old, ts.WHISPER_SERVER_URL = ts.WHISPER_SERVER_URL, ''
    try:
        exc = _raises(RuntimeError, lambda: ts.transcribe_audio('/tmp/qualquer.wav'))
    finally:
        ts.WHISPER_SERVER_URL = old
    assert 'WHISPER_SERVER_URL' in str(exc) and not isinstance(exc, ts.TranscriptionTransientError), exc


def test_servico_de_pe_devolve_o_texto():
    assert _with_server(200, {'text': 'Paciente refere cefaleia há três dias.'}, ts.transcribe_audio) \
        == 'Paciente refere cefaleia há três dias.'


def test_5xx_e_transitorio():
    _with_server(503, {'detail': 'carregando o modelo'},
                 lambda path: _raises(ts.TranscriptionTransientError, lambda: ts.transcribe_audio(path)))


def test_4xx_e_permanente():
    exc = _with_server(400, {'detail': 'formato'}, lambda path: _raises(RuntimeError, lambda: ts.transcribe_audio(path)))
    assert not isinstance(exc, ts.TranscriptionTransientError), exc


def test_resultado_vazio_e_permanente():
    exc = _with_server(200, {'text': '  '}, lambda path: _raises(RuntimeError, lambda: ts.transcribe_audio(path)))
    assert not isinstance(exc, ts.TranscriptionTransientError), exc


def test_servico_fora_do_ar_e_transitorio():
    old, ts.WHISPER_SERVER_URL = ts.WHISPER_SERVER_URL, 'http://127.0.0.1:1'
    try:
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            f.write(b'x')
        try:
            _raises(ts.TranscriptionTransientError, lambda: ts.transcribe_audio(f.name))
        finally:
            os.unlink(f.name)
    finally:
        ts.WHISPER_SERVER_URL = old


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
