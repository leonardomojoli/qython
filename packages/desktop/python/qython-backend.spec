# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller do backend do Qython, em modo pasta (onedir): inicia mais rápido que o
arquivo único, que descompactaria algumas centenas de MB a cada abertura, e deixa o
electron-builder compactar tudo uma vez só, no instalador.

Gera dist/qython-backend/qython-backend[.exe]. Os arquivos que o código lê pelo
caminho (migrations, CID-10, i18n, imagens dos PDFs) vão com a MESMA estrutura de
pastas do repositório, porque o backend os acha por `__file__`/`PROJECT_ROOT`.
"""
import os

from PyInstaller.utils.hooks import (
    collect_all,
    collect_data_files,
    collect_submodules,
)

ROOT = os.path.abspath(os.path.join(SPECPATH, "..", "..", ".."))
BACKEND = os.path.join(ROOT, "backend")

# --- arquivos de dados do próprio backend -------------------------------------------
SKIP_DIRS = {"__pycache__", "static", "scripts"}
datas = []
for folder, dirs, files in os.walk(BACKEND):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    rel = os.path.relpath(folder, ROOT)
    in_alembic = rel.replace(os.sep, "/").startswith("backend/alembic")
    for name in files:
        # O código Python vai no executável; só as migrations ficam em arquivo, porque o
        # alembic as carrega pelo caminho.
        if name.endswith((".py", ".pyc")) and not in_alembic:
            continue
        if name.endswith(".pyc"):
            continue
        datas.append((os.path.join(folder, name), rel))

# Imagens que os PDFs (receita, atestado, materiais) leem de packages/web/src/assets.
assets = os.path.join(ROOT, "packages", "web", "src", "assets")
for folder, dirs, files in os.walk(assets):
    for name in files:
        if name.lower().endswith((".png", ".jpg", ".jpeg", ".svg", ".webp", ".ttf", ".otf")):
            datas.append((os.path.join(folder, name), os.path.relpath(folder, ROOT)))

# Vocabulário do tiktoken, para o copiloto não precisar de internet (prepare_tiktoken.py).
tiktoken_cache = os.path.join(SPECPATH, "tiktoken-cache")
if not os.path.isdir(tiktoken_cache) or not os.listdir(tiktoken_cache):
    raise SystemExit("Falta python/tiktoken-cache: rode python/prepare_tiktoken.py antes do PyInstaller.")
for name in os.listdir(tiktoken_cache):
    datas.append((os.path.join(tiktoken_cache, name), "tiktoken_cache"))

# Pango/GTK para o PDF (WeasyPrint): o Windows e o macOS não têm. O CI as reúne em pdf-libs/<so>
# (windows.sh, bundle_dylibs.py). No Windows entram na raiz do pacote, onde o carregador as procura.
# No macOS entram numa PASTA PRÓPRIA (pdf-libs/mac), como ARQUIVOS DE DADOS: na raiz elas dividiriam
# o nome com as que outras rodas trazem (o opencv do OCR traz libpng, libfreetype...), e como binários
# o PyInstaller reescreve as dependências delas para @rpath/..., que aponta para a raiz do pacote e
# não acha mais as irmãs. O bundle_dylibs.py já deixou cada dependência como @loader_path/<irmã>;
# como dados, os arquivos vão intactos e o DYLD_FALLBACK_LIBRARY_PATH aponta para a pasta.
# No Linux vêm do sistema (o GTK que o Electron já exige).
import sys
_pdf_dir = {"win32": "win", "darwin": "mac"}.get(sys.platform)
extra_binaries = []
if _pdf_dir:
    _pdf_libs = os.path.join(SPECPATH, "pdf-libs", _pdf_dir)
    if os.path.isdir(_pdf_libs) and os.listdir(_pdf_libs):
        for name in sorted(os.listdir(_pdf_libs)):
            if _pdf_dir == "mac":
                datas.append((os.path.join(_pdf_libs, name), "pdf-libs/mac"))
            else:
                extra_binaries.append((os.path.join(_pdf_libs, name), "."))
    else:
        print(f"AVISO: {_pdf_libs} vazio; o pacote sai SEM as bibliotecas do PDF (o selftest vai falhar).")
# Configuração mínima do fontconfig (sem ela o PDF sai sem texto): o entry point aponta FONTCONFIG_FILE para cá.
for _conf in ("fonts-win32.conf", "fonts-darwin.conf"):
    datas.append((os.path.join(SPECPATH, "pdf-libs", _conf), "pdf-libs"))

# --- dependências com arquivos de dados ou importações dinâmicas ---------------------
binaries = []
hiddenimports = []
# pymupdf: o pacote "pymupdf-layout" instala os modelos ONNX dentro de pymupdf/layout.
# tokenizers e onnxruntime: o servidor de embeddings (modo `embed`) os importa dentro de função,
# então a análise estática do PyInstaller não os enxerga.
# faster_whisper, ctranslate2 e av: o modo `whisper` (transcrição) os importa dentro de função;
# o faster-whisper tem o VAD (silero_vad_*.onnx) como arquivo de dados.
# rapidocr: os modelos .onnx (PP-OCRv6) e os .yaml de configuração são arquivos de dados do pacote;
# o cv2 e o shapely trazem bibliotecas nativas.
for pkg in ("rapidocr", "cv2", "shapely", "pyclipper", "omegaconf", "colorlog", "faster_whisper", "ctranslate2", "av", "tokenizers", "onnxruntime", "chromadb", "tiktoken_ext", "tldextract", "weasyprint", "pptx", "pymupdf",
            "pymupdf4llm", "langchain_text_splitters", "fpdf", "pyphen", "tinycss2",
            "cssselect2", "certifi", "email_validator", "slowapi", "limits"):
    try:
        d, b, h = collect_all(pkg)
    except Exception:
        continue
    datas += d
    binaries += b
    hiddenimports += h

hiddenimports += collect_submodules("backend")
hiddenimports += collect_submodules("uvicorn")
hiddenimports += collect_submodules("apscheduler")
hiddenimports += collect_submodules("sqlalchemy.dialects.postgresql")
hiddenimports += collect_submodules("alembic")
hiddenimports += [
    "asyncpg", "psycopg", "psycopg_binary", "websockets", "h11", "httptools",
    "multipart", "jose", "jwt", "bcrypt", "tiktoken_ext.openai_public",
]

excludes = [
    "tkinter", "matplotlib", "IPython", "notebook", "pytest",
    # Pesos do ML que o app não usa (o embedder e o whisper rodam sem torch; ver lock.sh).
    "torch", "torchvision", "torchaudio", "sentence_transformers", "transformers",
    "tensorflow", "jax",
    # Redação de nomes (só serviria a uma IA externa; o Qython roda só com IA local).
    "presidio_analyzer", "presidio_anonymizer", "spacy", "thinc", "blis",
    "firebase_admin",
    # python-magic precisa da libmagic do sistema (ausente no Windows e no macOS) e o import dele
    # trava o PyInstaller no Windows. A biblioteca usa services/mime_sniff.py no lugar.
    "magic",
]

a = Analysis(
    [os.path.join(SPECPATH, "qython_backend.py")],
    pathex=[ROOT],
    binaries=binaries + extra_binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="qython-backend",
    console=True,  # sem janela de console visível: o Electron o inicia com windowsHide
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="qython-backend")
