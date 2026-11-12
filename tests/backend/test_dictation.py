# tests/backend/test_dictation.py
"""Ditado de voz (backend/routes/dictation_routes.py + transcribe_dictation).

Rode direto (não há pytest neste repositório):
    python3 tests/backend/test_dictation.py

O ditado manda um trecho curto de voz ao whisper da instalação e devolve o texto. O que importa:
  - o texto volta, e o idioma pedido ('pt-BR') chega ao whisper como 'pt';
  - silêncio (sem fala) volta "" e não erro;
  - o whisper fora do ar, ou avisando que falta o modelo (503 do app desktop), vira 503 com um texto
    que o usuário entende, e a mensagem do desktop chega inteira;
  - áudio vazio (400), grande demais (413) e sem login (401) são recusados antes de chegar ao whisper;
  - o áudio temporário é apagado no fim, com sucesso ou com erro.
"""
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

os.environ.setdefault("JWT_SECRET_KEY", "k" * 48)
os.environ.setdefault("DATABASE_URL", "postgresql://t:t@127.0.0.1:1/t")
os.environ.setdefault("QYTHON_ALLOW_EPHEMERAL_KEK", "1")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

from backend.rate_limiter import limiter  # noqa: E402
from backend.routes import dictation_routes  # noqa: E402
from backend.security import get_current_active_user  # noqa: E402
from backend.services.academic_services import transcription_service as ts  # noqa: E402


class FakeWhisper(BaseHTTPRequestHandler):
    status = 200
    body = {"text": "Paciente refere cefaleia há três dias."}
    seen = []  # (corpo cru) de cada pedido, para conferir o idioma

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        FakeWhisper.seen.append(self.rfile.read(length))
        payload = json.dumps(FakeWhisper.body).encode()
        self.send_response(FakeWhisper.status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


def start_whisper():
    server = HTTPServer(("127.0.0.1", 0), FakeWhisper)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def temp_audio_files():
    folder = tempfile.gettempdir()
    return {n for n in os.listdir(folder) if n.endswith((".m4a", ".bin", ".wav")) and n.startswith("tmp")}


class FakeUser:
    id = 7


def make_client():
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(dictation_routes.router, prefix="/api/dictation")
    app.dependency_overrides[get_current_active_user] = lambda: FakeUser()
    return TestClient(app)


SERVER = start_whisper()
ts.WHISPER_SERVER_URL = f"http://127.0.0.1:{SERVER.server_port}"
CLIENT = make_client()
AUDIO = {"file": ("ditado.m4a", b"\x00\x00\x00\x20ftypM4A fake-audio-bytes", "audio/mp4")}


def reset(status=200, body=None):
    FakeWhisper.status = status
    FakeWhisper.body = body if body is not None else {"text": "Paciente refere cefaleia há três dias."}
    FakeWhisper.seen.clear()


def test_texto_volta_e_idioma_chega_ao_whisper_como_pt():
    reset()
    before = temp_audio_files()
    resp = CLIENT.post("/api/dictation", files=AUDIO, data={"language": "pt-BR"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"text": "Paciente refere cefaleia há três dias."}
    assert b'name="language"' in FakeWhisper.seen[0] and b"\r\n\r\npt\r\n" in FakeWhisper.seen[0]
    assert temp_audio_files() == before, "o áudio temporário precisa ser apagado"


def test_idioma_desconhecido_e_ignorado():
    reset()
    resp = CLIENT.post("/api/dictation", files=AUDIO, data={"language": "tlh"})
    assert resp.status_code == 200
    assert b'name="language"' not in FakeWhisper.seen[0]


def test_silencio_volta_vazio_e_nao_erro():
    reset(body={"text": ""})
    resp = CLIENT.post("/api/dictation", files=AUDIO)
    assert resp.status_code == 200 and resp.json() == {"text": ""}


def test_modelo_nao_baixado_chega_com_a_mensagem_do_desktop():
    reset(503, {"error": {"message": "Baixe o modelo de transcrição no menu Ajuda.", "code": 503}})
    before = temp_audio_files()
    resp = CLIENT.post("/api/dictation", files=AUDIO)
    assert resp.status_code == 503
    assert resp.json()["detail"] == "Baixe o modelo de transcrição no menu Ajuda."
    assert temp_audio_files() == before


def test_whisper_com_erro_sem_mensagem_vira_503_generico():
    reset(500, {"detail": "transcription failed"})
    resp = CLIENT.post("/api/dictation", files=AUDIO)
    assert resp.status_code == 503 and "tente de novo" in resp.json()["detail"].lower()


def test_whisper_fora_do_ar_vira_503_com_texto_claro():
    original = ts.WHISPER_SERVER_URL
    ts.WHISPER_SERVER_URL = "http://127.0.0.1:1"
    try:
        resp = CLIENT.post("/api/dictation", files=AUDIO)
    finally:
        ts.WHISPER_SERVER_URL = original
    assert resp.status_code == 503 and "transcrição" in resp.json()["detail"]


def test_sem_whisper_configurado_diz_o_que_falta():
    original = ts.WHISPER_SERVER_URL
    ts.WHISPER_SERVER_URL = ""
    try:
        resp = CLIENT.post("/api/dictation", files=AUDIO)
    finally:
        ts.WHISPER_SERVER_URL = original
    assert resp.status_code == 503 and "não está configurado" in resp.json()["detail"]


def test_audio_vazio_e_recusado_antes_do_whisper():
    reset()
    resp = CLIENT.post("/api/dictation", files={"file": ("ditado.m4a", b"", "audio/mp4")})
    assert resp.status_code == 400 and not FakeWhisper.seen


def test_audio_grande_demais_e_recusado_antes_do_whisper():
    reset()
    big = b"\x00" * (dictation_routes.MAX_BYTES + 1)
    resp = CLIENT.post("/api/dictation", files={"file": ("ditado.m4a", big, "audio/mp4")})
    assert resp.status_code == 413 and not FakeWhisper.seen


def test_extensao_estranha_nao_vira_caminho_estranho():
    reset()
    before = temp_audio_files()
    resp = CLIENT.post("/api/dictation", files={"file": ("../../etc/passwd.sh", b"abc", "audio/mp4")})
    assert resp.status_code == 200
    assert temp_audio_files() == before


def test_sem_login_e_recusado():
    reset()
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(dictation_routes.router, prefix="/api/dictation")
    resp = TestClient(app).post("/api/dictation", files=AUDIO)
    assert resp.status_code == 401 and not FakeWhisper.seen


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("ok  ", name)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print("FAIL", name, "->", repr(exc))
    sys.exit(1 if failed else 0)
