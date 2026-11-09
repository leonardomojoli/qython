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

# --- dependências com arquivos de dados ou importações dinâmicas ---------------------
binaries = []
hiddenimports = []
# pymupdf: o pacote "pymupdf-layout" instala os modelos ONNX dentro de pymupdf/layout.
for pkg in ("chromadb", "tiktoken_ext", "tldextract", "weasyprint", "pptx", "pymupdf",
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
    # Pesos do ML: ficam no pacote de IA, sob demanda (ver packages/desktop/python/lock.sh).
    "torch", "torchvision", "torchaudio", "sentence_transformers", "transformers",
    "faster_whisper", "ctranslate2", "tensorflow", "jax",
    # Redação de nomes para o Gemini: instalada à parte.
    "presidio_analyzer", "presidio_anonymizer", "spacy", "thinc", "blis",
    "firebase_admin", "cv2",
    # python-magic precisa da libmagic do sistema (ausente no Windows e no macOS) e o import dele
    # trava o PyInstaller no Windows. A biblioteca usa services/mime_sniff.py no lugar.
    "magic",
]

a = Analysis(
    [os.path.join(SPECPATH, "qython_backend.py")],
    pathex=[ROOT],
    binaries=binaries,
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
