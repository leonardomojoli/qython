"""Entrada do executável do backend (PyInstaller). A lógica fica em backend/desktop.py."""
import multiprocessing
import os
import sys


def _prepare_pdf_libs():
    """Prepara o que o WeasyPrint precisa das bibliotecas empacotadas (só no executável)."""
    if not getattr(sys, "frozen", False):
        return
    base = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    conf = os.path.join(base, "pdf-libs", "fonts.conf")
    if os.path.exists(conf):
        os.environ.setdefault("FONTCONFIG_FILE", conf)
    if sys.platform == "darwin":
        # O dlopen do macOS só procura nomes soltos (libpango-1.0.dylib) nas pastas de DYLD_*, lidas
        # quando o processo nasce. Então o executável se reinicia uma vez, no lugar, com a pasta do
        # pacote na lista; o PID e os canais de saída são os mesmos.
        fallback = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
        if base not in fallback.split(os.pathsep):
            os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = os.pathsep.join(
                [base] + ([fallback] if fallback else ["/usr/local/lib", "/usr/lib"]))
            os.execv(sys.executable, [sys.executable] + sys.argv[1:])


if __name__ == "__main__":
    # Necessário no Windows quando o app congelado usa multiprocessing (o chromadb e o
    # PyMuPDF podem criar processos filhos): sem isto cada filho reabriria o servidor.
    multiprocessing.freeze_support()
    _prepare_pdf_libs()
    from backend.desktop import main

    sys.exit(main())
