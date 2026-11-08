# qython/backend/desktop.py
"""
Ponto de entrada do backend empacotado no app desktop.

O Electron não conhece Python: ele executa um único binário (gerado com PyInstaller a
partir de `packages/desktop/python/qython_backend.py`) e escolhe o que rodar pelo
primeiro argumento. Um executável só serve para tudo, porque cada binário a mais
repetiria as bibliotecas (alguns GB com o chromadb e o numpy):

  serve      prepara o banco e sobe a API (e o front, se QYTHON_WEB_DIR existir)
  chroma     o servidor do ChromaDB (a busca da biblioteca), em outra porta
  selftest   importa o que o app usa e imprime um JSON; pega o que o PyInstaller deixou
             de fora sem precisar de banco nem de rede

Encerramento: o Electron fecha o stdin do processo e o `serve` termina sozinho. É a
única forma igual no Windows (onde não há SIGTERM) e no Linux/macOS, e também cobre o
Electron que morreu sem avisar, caso em que o stdin fecha do mesmo jeito e o backend
não fica órfão.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import threading

logger = logging.getLogger("qython_logger")


def _watch_parent(server) -> None:
    """Pede o encerramento do uvicorn quando o processo pai fecha o stdin."""
    try:
        stream = sys.stdin.buffer
        while stream.read(4096):
            pass
    except Exception:
        pass
    server.should_exit = True


def serve(args: argparse.Namespace) -> int:
    import uvicorn

    # Antes de importar o app: o schema precisa existir quando o lifespan rodar os
    # seeds, e o alembic reconfigura o logging, que o main.py refaz ao ser importado.
    from backend import bootstrap_db

    code = bootstrap_db.main()
    if code:
        return code

    from backend.config import Config
    from backend.main import app

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

    def import_chroma():
        import chromadb

        return chromadb.__version__

    def import_pdf():
        from backend.services import pdf_service

        # Sem Pango/GTK o backend sobe e só o PDF falha (ver pdf_service); aqui isso conta
        # como aviso, não como defeito do empacotamento.
        try:
            pdf_service.HTML(string="<p>ok</p>").write_pdf()
            return "ok"
        except RuntimeError as exc:
            return f"indisponível: {exc}"

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

    sub.add_parser("selftest").set_defaults(fn=selftest)

    args = parser.parse_args(argv)
    if not getattr(args, "fn", None):
        parser.print_help()
        return 2
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
