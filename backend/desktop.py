# qython/backend/desktop.py
"""
Ponto de entrada do backend empacotado no app desktop.

O Electron não conhece Python: ele executa um único binário (gerado com PyInstaller a
partir de `packages/desktop/python/qython_backend.py`) e escolhe o que rodar pelo
primeiro argumento. Um executável só serve para tudo, porque cada binário a mais
repetiria as bibliotecas (alguns GB com o chromadb e o numpy):

  serve      prepara o banco e sobe a API (e o front, se QYTHON_WEB_DIR existir)
  chroma     o servidor do ChromaDB (a busca da biblioteca), em outra porta
  embed      embeddings e reranking da biblioteca (multilingual-e5 em ONNX, sem torch)
  selftest   importa o que o app usa e imprime um JSON; pega o que o PyInstaller deixou
             de fora sem precisar de banco nem de rede

Encerramento: o Electron fecha o stdin do processo e o `serve` termina sozinho. É a
única forma igual no Windows (onde não há SIGTERM) e no Linux/macOS, e também cobre o
Electron que morreu sem avisar, caso em que o stdin fecha do mesmo jeito e o backend
não fica órfão.
"""

from __future__ import annotations

import argparse
import faulthandler
import json
import logging
import os
import sys
import threading
import traceback

logger = logging.getLogger("qython_logger")

# O app instalado não lê .env: a configuração vem do ambiente que o Electron monta. Vários
# módulos chamam `load_dotenv()` sem caminho, que procura um .env subindo pelas pastas, e
# acharia o arquivo de outro projeto (ou um ~/.env esquecido) com GEMINI_API_KEY e afins. Isto
# precisa valer antes de qualquer import do backend.
os.environ["PYTHON_DOTENV_DISABLED"] = "1"


def _watch_parent(server) -> None:
    """Pede o encerramento do uvicorn quando o processo pai fecha o stdin."""
    try:
        stream = sys.stdin.buffer
        while stream.read(4096):
            pass
    except Exception:
        pass
    server.should_exit = True


def _use_bundled_models() -> None:
    """Aponta o tiktoken para o vocabulário embutido: sem isso ele o baixaria da internet no
    primeiro uso (e o copiloto quebraria sem rede)."""
    if not getattr(sys, "frozen", False):
        return
    base = getattr(sys, "_MEIPASS", "")
    tiktoken_dir = os.path.join(base, "tiktoken_cache")
    if os.path.isdir(tiktoken_dir):
        os.environ.setdefault("TIKTOKEN_CACHE_DIR", tiktoken_dir)


def _stage(text: str) -> None:
    """Uma linha no stderr (que o Electron grava em backend.log), para uma falha mostrar até onde
    o boot chegou. O logging do backend só liga quando o main.py é importado, no fim."""
    print(f"[desktop] {text}", file=sys.stderr, flush=True)


def serve(args: argparse.Namespace) -> int:
    import uvicorn

    _use_bundled_models()

    # Um travamento no boot (como o do pg_ctl no Windows, que só se via como 20 minutos de
    # silêncio) passa a ser um relatório: a cada 3 min parado, o Python imprime o que cada thread
    # está fazendo. Desarmado quando o boot termina; também cobre falha fatal (segfault).
    faulthandler.enable(file=sys.stderr)
    faulthandler.dump_traceback_later(int(os.getenv("QYTHON_BOOT_DUMP_SECONDS", "180")), repeat=True, file=sys.stderr)
    try:
        # Antes de importar o app: o schema precisa existir quando o lifespan rodar os
        # seeds, e o alembic reconfigura o logging, que o main.py refaz ao ser importado.
        _stage("preparando o banco de dados")
        from backend import bootstrap_db

        code = bootstrap_db.main()
        if code:
            _stage(f"o banco não ficou pronto (código {code})")
            return code

        _stage("carregando o backend")
        from backend.config import Config
        from backend.main import app
    except BaseException:  # noqa: BLE001 - qualquer causa precisa aparecer no log
        _stage("falha no boot:")
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        return 1
    finally:
        faulthandler.cancel_dump_traceback_later()

    _stage("iniciando o servidor")
    asgi = app
    if Config.WEB_DIR:
        # O mesmo processo serve o front: a janela abre http://127.0.0.1:porta/.
        from backend.spa import SPAWrapper

        asgi = SPAWrapper(app, Config.WEB_DIR)

    config = uvicorn.Config(
        asgi,
        host=args.host,
        port=args.port,
        log_config=None,  # o main.py já configurou o logging (arquivo com rotação)
        access_log=False,
        workers=1,
        timeout_keep_alive=75,
    )
    server = uvicorn.Server(config)
    if not args.keep_running_without_parent:
        threading.Thread(target=_watch_parent, args=(server,), daemon=True).start()
    server.run()
    return 0


def chroma(args: argparse.Namespace) -> int:
    """`chroma run`, o mesmo que a imagem chromadb/chroma sobe no Docker."""
    from chromadb.cli.cli import app as chroma_cli

    sys.argv = ["chroma", "run", "--path", args.path, "--host", args.host, "--port", str(args.port)]
    chroma_cli()
    return 0


def embed(args: argparse.Namespace) -> int:
    """Embeddings e reranking da biblioteca (multilingual-e5 em ONNX): EMBED_MODEL_DIR e,
    opcional, RERANK_MODEL_DIR dizem onde estão os modelos."""
    import uvicorn

    from backend.embed_onnx import build_app

    uvicorn.run(build_app(), host=args.host, port=args.port, log_config=None, access_log=False, workers=1)
    return 0


def whisper(args: argparse.Namespace) -> int:
    """Transcrição de áudio e vídeo (faster-whisper): o mesmo serviço do servidor
    (backend/whisper_server.py, POST /transcribe), aqui dentro do executável. WHISPER_MODEL aponta
    para a pasta do modelo já baixado (formato CTranslate2)."""
    import uvicorn

    from backend import whisper_server

    uvicorn.run(whisper_server.app, host=args.host, port=args.port, log_config=None, access_log=False, workers=1)
    return 0


def selftest(_args: argparse.Namespace) -> int:
    """Importa os módulos que o app carrega e relata o que faltou. Sem rede nem banco."""
    os.environ.setdefault("JWT_SECRET_KEY", "x" * 40)
    os.environ.setdefault("DATABASE_URL", "postgresql://selftest:selftest@127.0.0.1:1/selftest")
    os.environ.setdefault("QYTHON_ALLOW_EPHEMERAL_KEK", "1")
    report: dict = {"frozen": bool(getattr(sys, "frozen", False)), "python": sys.version.split()[0]}
    problems: list[str] = []

    def check(label: str, fn) -> None:
        try:
            report[label] = fn() or "ok"
        except Exception as exc:  # noqa: BLE001 - o objetivo é listar tudo que falha
            report[label] = f"FALHOU: {type(exc).__name__}: {exc}"
            problems.append(label)

    def import_app():
        from backend.main import app

        return f"{len(app.routes)} rotas"

    def mime_detection():
        # Sem libmagic (nunca vai no pacote), a biblioteca valida o upload pelo mime_sniff.
        from backend.services.academic_services import library_service

        kinds = {
            library_service.magic.from_buffer(b"%PDF-1.7\n" + b"0" * 64, mime=True),
            library_service.magic.from_buffer("texto simples".encode(), mime=True),
        }
        if kinds != {"application/pdf", "text/plain"}:
            raise AssertionError(f"detecção de tipo inesperada: {kinds}")
        return library_service.magic.__name__

    def tiktoken_offline():
        # Com o vocabulário embutido, nenhuma requisição é feita (o app pode estar sem rede).
        _use_bundled_models()
        import tiktoken

        return f"{len(tiktoken.get_encoding('cl100k_base').encode('olá, mundo'))} tokens"

    def onnx_runtime():
        # O servidor de embeddings roda neste mesmo executável (modo `embed`), sem torch.
        import onnxruntime
        import tokenizers

        from backend import embed_onnx

        return f"onnxruntime {onnxruntime.__version__}, tokenizers {tokenizers.__version__}, {embed_onnx.__name__}"

    def whisper_runtime():
        # O modo `whisper` importa tudo isto dentro de função: a análise estática do PyInstaller
        # não os vê. O silero_vad.onnx do faster-whisper é arquivo de dados dentro do pacote; o PyAV
        # traz as bibliotecas do ffmpeg, então não há ffmpeg para instalar.
        import av
        import ctranslate2
        import faster_whisper

        from backend import whisper_server

        assets = os.path.join(os.path.dirname(faster_whisper.__file__), "assets")
        if not any(n.startswith("silero_vad") and n.endswith(".onnx") for n in os.listdir(assets)):
            raise RuntimeError(f"falta o modelo de VAD do faster-whisper em {assets}: {os.listdir(assets)}")
        return f"faster-whisper {faster_whisper.__version__}, ctranslate2 {ctranslate2.__version__}, av {av.__version__}, {whisper_server.__name__}"

    def import_chroma():
        import chromadb

        return chromadb.__version__

    def import_pdf():
        from backend.services import pdf_service

        # Sem Pango/GTK o backend sobe e só o PDF falha (ver pdf_service). No pacote isso é
        # defeito: as bibliotecas vão dentro dele (Windows e macOS) ou vêm do GTK do Electron
        # (Linux). Fora do pacote (desenvolvimento), a falta é só um aviso.
        try:
            pdf = pdf_service.HTML(string="<h1>Receita</h1><p>Dipirona 500 mg — ação, coração</p>").write_pdf()
        except RuntimeError as exc:
            if getattr(sys, "frozen", False):
                raise
            return f"indisponível: {exc}"
        print(f"[selftest] pdf: gerado ({len(pdf)} bytes); conferindo o texto", file=sys.stderr, flush=True)
        if not pdf.startswith(b"%PDF"):
            raise RuntimeError(f"o PDF gerado não é válido ({len(pdf)} bytes)")
        # Sem fonte (fontconfig sem configuração) o PDF sai em branco: confere que o texto está lá.
        import fitz

        with fitz.open(stream=pdf, filetype="pdf") as doc:
            text = doc[0].get_text()
        print("[selftest] pdf: texto lido", file=sys.stderr, flush=True)
        if "Receita" not in text or "ação" not in text:
            raise RuntimeError(f"o PDF saiu sem o texto esperado (fontes?): {text!r}")
        return f"ok ({len(pdf)} bytes, texto conferido)"

    def import_fitz():
        import fitz

        return fitz.__doc__.split("\n")[0]

    def alembic_scripts():
        from backend.bootstrap_db import _alembic_config
        from alembic.script import ScriptDirectory

        return f"head {ScriptDirectory.from_config(_alembic_config()).get_current_head()}"

    def data_files():
        from backend.config import Config

        base = str(Config.BACKEND_DIR)
        needed = ["seeds/data/CID10CSV.zip", "alembic.ini", "exam_contexts/enamed_exam_context.txt"]
        missing = [p for p in needed if not os.path.exists(os.path.join(base, *p.split("/")))]
        if missing:
            raise FileNotFoundError(", ".join(missing))
        return "ok"

    check("app", import_app)
    check("mime", mime_detection)

    check("tiktoken", tiktoken_offline)
    check("onnx", onnx_runtime)
    check("whisper", whisper_runtime)
    check("chromadb", import_chroma)
    check("fitz", import_fitz)
    check("pdf", import_pdf)
    check("alembic", alembic_scripts)
    check("data_files", data_files)
    print(json.dumps(report, ensure_ascii=False))
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="qython-backend")
    sub = parser.add_subparsers(dest="mode")

    p_serve = sub.add_parser("serve")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, required=True)
    p_serve.add_argument("--keep-running-without-parent", action="store_true")
    p_serve.set_defaults(fn=serve)

    p_chroma = sub.add_parser("chroma")
    p_chroma.add_argument("--host", default="127.0.0.1")
    p_chroma.add_argument("--port", type=int, required=True)
    p_chroma.add_argument("--path", required=True)
    p_chroma.set_defaults(fn=chroma)

    p_embed = sub.add_parser("embed")
    p_embed.add_argument("--host", default="127.0.0.1")
    p_embed.add_argument("--port", type=int, required=True)
    p_embed.set_defaults(fn=embed)

    p_whisper = sub.add_parser("whisper")
    p_whisper.add_argument("--host", default="127.0.0.1")
    p_whisper.add_argument("--port", type=int, required=True)
    p_whisper.set_defaults(fn=whisper)

    sub.add_parser("selftest").set_defaults(fn=selftest)

    args = parser.parse_args(argv)
    if not getattr(args, "fn", None):
        parser.print_help()
        return 2
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
