# qython/backend/config.py

import os
from dotenv import load_dotenv
from pathlib import Path
import logging

# Define o diretório base do backend (/opt/qython/backend)
backend_dir = Path(__file__).resolve().parent

# Define a raiz do projeto (/opt/qython)
project_root = backend_dir.parent

# Define o caminho do .env na raiz (/opt/qython/.env)
env_path = project_root / ".env"

# Carrega as variáveis
load_dotenv(dotenv_path=env_path)

# Fallback de segurança: se não carregar, tenta procurar automaticamente no sistema
if not os.getenv('DATABASE_URL'):
    load_dotenv() 

class Config:
    # Chave secreta para assinar os JWTs
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY')
    if not JWT_SECRET_KEY or len(JWT_SECRET_KEY) < 32:
        raise ValueError(
            "JWT_SECRET_KEY deve estar definida no .env com pelo menos 32 caracteres."
        )
    JWT_ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 720))

    # --- BANCO DE DADOS (CRÍTICO PARA O ALEMBIC) ---
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL')

    # --- URLs públicas (emails, deep links, redirects) ---
    WEB_BASE_URL = os.getenv("WEB_BASE_URL", "https://qython.ai").rstrip("/")
    API_BASE_URL = os.getenv("API_BASE_URL", f"{WEB_BASE_URL}/api").rstrip("/")

    # CORS allow-list e TrustedHost — comma-separated env vars, default = qython.ai canônico.
    # qython.app/qython.com 301-redirecionam no Nginx antes de chegar no backend.
    ALLOWED_ORIGINS = [
        o.strip() for o in os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:3000,https://qython.ai,https://www.qython.ai"
        ).split(",") if o.strip()
    ]
    ALLOWED_HOSTS = [
        h.strip() for h in os.getenv(
            "ALLOWED_HOSTS",
            "localhost,127.0.0.1,qython.ai,*.qython.ai"
        ).split(",") if h.strip()
    ]

    # IAs
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
    PRIMARY_LLM_MODEL = os.getenv("PRIMARY_LLM_MODEL")
    FALLBACK_LLM_MODEL = os.getenv("FALLBACK_LLM_MODEL")
    SIMPLE_TASK_LLM_MODEL = os.getenv("SIMPLE_TASK_LLM_MODEL")
    # Chat/RAG (alto volume) — modelo e thinking PRÓPRIOS, separados do PRIMARY (que segue p/
    # consultas/resumos/relatórios). Rota o chat p/ um modelo barato: no 3.1-flash-lite o output
    # é 6× mais barato que o 3.5-flash, então thinking pode ficar ALTO (raciocínio) e ainda dar
    # margem saudável. Tunável por env SEM deploy (A/B): ex. CHAT_LLM_MODEL=gemini-3.1-flash
    # (qualidade média-alta) ou CHAT_THINKING_LEVEL=medium/low.
    CHAT_LLM_MODEL = os.getenv("CHAT_LLM_MODEL", "gemini-3.1-flash-lite")
    CHAT_THINKING_LEVEL = os.getenv("CHAT_THINKING_LEVEL", "high")
    # Geração de material (Produtor de Materiais) — modelo DEDICADO, isolado do PRIMARY
    # (consultas/resumos/relatórios). Default lite p/ margem: material a 3.5-flash dava
    # custo ~6× a receita (ex.: questionário $0,175 vs 8 dracmas ≈ $0,028); lite ≈ break-even.
    # Tunável por env SEM deploy (A/B ou voltar p/ gemini-3.5-flash). [COST] no log dá o real.
    MATERIAL_LLM_MODEL = os.getenv("MATERIAL_LLM_MODEL", "gemini-3.1-flash-lite")
    MATERIAL_FALLBACK_LLM_MODEL = os.getenv("MATERIAL_FALLBACK_LLM_MODEL", "gemini-2.5-flash-lite")
    # Thinking do material: no lite o thinking é baratíssimo, então ALTO recupera a
    # profundidade das justificativas (que encurtaram com thinking=0) mantendo a margem.
    # Tunável por env (high/medium/low/minimal) sem deploy se o custo apertar.
    MATERIAL_THINKING_LEVEL = os.getenv("MATERIAL_THINKING_LEVEL", "high")

    # Provas de concurso (Meus Concursos) — modelo FORTE, isolado do Produtor de Materiais.
    # Motivo: o lite acerta conteúdo clínico mas erra precisão normativa (regência,
    # concordância) — 3 de 4 questões de Português vieram defeituosas na 1ª prova real.
    # Viável porque o contexto por bloco passou a ser amostrado (EXAM_*_CHAR_BUDGET):
    # sem isso, 671k tokens de input × 3.5-flash davam $1,24/prova. Preço: 100 dracmas
    # (feature generate_custom_exam). [COST] exam:<tipo> no log dá o custo real.
    EXAM_LLM_MODEL = os.getenv("EXAM_LLM_MODEL", "gemini-3.5-flash")
    EXAM_FALLBACK_LLM_MODEL = os.getenv("EXAM_FALLBACK_LLM_MODEL", "gemini-2.5-flash")
    EXAM_THINKING_LEVEL = os.getenv("EXAM_THINKING_LEVEL", "high")
    # Orçamento de contexto por bloco (chars). Material que couber vai INTEIRO; acima do
    # teto, amostragem por JANELAS distribuídas (nunca truncar — o fim do programa não
    # pode desaparecer). Tunável por env sem deploy.
    EXAM_LIB_CHAR_BUDGET = int(os.getenv("EXAM_LIB_CHAR_BUDGET", "60000"))
    EXAM_PAST_CHAR_BUDGET = int(os.getenv("EXAM_PAST_CHAR_BUDGET", "14000"))
    # Teto da avoid-list POR BLOCO (anti-repetição da prova de concurso). Generoso de
    # propósito: o bloco maior tem ~70 enunciados por 7 provas, e a lista por bloco custa
    # MENOS contexto que a lista plana replicada em cada bloco.
    EXAM_AVOID_PER_BLOCK = int(os.getenv("EXAM_AVOID_PER_BLOCK", "200"))
    # Curadoria de referências: o modelo julga cada fonte (sustenta/fraca/irrelevante) antes
    # de a lista ir para a resposta. 1 chamada leve por resposta com >=2 referências.
    REF_CURATION_ENABLED = os.getenv("REF_CURATION_ENABLED", "1") == "1"
    REF_CURATION_MODEL = os.getenv("REF_CURATION_MODEL")  # vazio = SIMPLE_TASK_LLM_MODEL
    # Ilustração da resposta com imagem de acervo ABERTO (Wikimedia Commons/Openverse),
    # usada só quando a biblioteca do próprio usuário não tem nada equivalente.
    WEB_IMAGE_SEARCH_ENABLED = os.getenv("WEB_IMAGE_SEARCH_ENABLED", "1") == "1"
    # Referências: lista curta e forte comunica mais confiança que lista longa e desigual.
    # Fonte "web" (source_type 'other') só aparece quando NÃO há este tanto de fonte forte.
    REF_MAX = int(os.getenv("REF_MAX", "5"))
    REF_WEB_FALLBACK_MIN_STRONG = int(os.getenv("REF_WEB_FALLBACK_MIN_STRONG", "2"))
    MEDICAL_IMAGE_ANALYST_MODEL = os.getenv("MEDICAL_IMAGE_ANALYST_MODEL")
    IMAGE_GEN_MODEL = os.getenv("IMAGE_GEN_MODEL")
    IMAGE_GEN_MODEL_PRO = os.getenv("IMAGE_GEN_MODEL_PRO")  # Pro model for high-quality material generation
    ENABLE_GROUNDING = os.getenv("ENABLE_GROUNDING", "0") == "1"
    ENABLE_PROMPT_CACHING = os.getenv("ENABLE_PROMPT_CACHING", "0") == "1"
    # NCBI PubMed E-utilities API key (optional). Without it PubMed allows only
    # ~3 req/s shared per IP; with it, ~10 req/s — recommended in production so
    # citation lookups don't fail under concurrent load.
    NCBI_API_KEY = os.getenv("NCBI_API_KEY", "")

    # --- PAGAMENTOS (NOVOS) ---
    STRIPE_API_KEY = os.getenv('STRIPE_API_KEY')
    STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
    
    BINANCE_PAY_API_KEY = os.getenv('BINANCE_PAY_API_KEY')
    BINANCE_PAY_SECRET_KEY = os.getenv('BINANCE_PAY_SECRET_KEY')

    # dLocal Go (cartão + PIX/boleto + métodos locais LatAm; cobrança cross-border
    # liquidando na entidade do Uruguai). Auth Bearer API_KEY:SECRET; o HMAC do webhook
    # reusa as duas chaves (sem secret de webhook separado).
    DLOCAL_API_KEY = os.getenv('DLOCAL_API_KEY')
    DLOCAL_SECRET_KEY = os.getenv('DLOCAL_SECRET_KEY')
    DLOCAL_ENV = os.getenv('DLOCAL_ENV', 'sbx')          # 'sbx' (sandbox) | 'live' (produção)
    # Moeda/país de cobrança. USD = cross-border (o cliente paga em moeda local no checkout
    # do dLocal e liquidamos em USD); tunável por .env após validar no sandbox (ex.: BRL/BR).
    DLOCAL_CURRENCY = os.getenv('DLOCAL_CURRENCY', 'USD')
    DLOCAL_COUNTRY = os.getenv('DLOCAL_COUNTRY', '')      # vazio = dLocal detecta no checkout

    # --- Diretórios ---
    BACKEND_DIR = Path(__file__).resolve().parent
    PROJECT_ROOT = BACKEND_DIR.parent
    STATIC_URL_PATH_PREFIX = "static"
    STATIC_FOLDER = os.path.join(BACKEND_DIR, 'static')
    PERMANENT_UPLOAD_FOLDER = os.path.join(STATIC_FOLDER, 'uploads')
    UPLOAD_FOLDER_PROFILE = os.path.join(PERMANENT_UPLOAD_FOLDER, 'profile_pictures')
    UPLOAD_FOLDER_DOCTOR_LOGOS = os.path.join(PERMANENT_UPLOAD_FOLDER, 'doctor_logos')
    THUMBNAIL_FOLDER = os.path.join(PERMANENT_UPLOAD_FOLDER, 'thumbnails')
    SLIDESHOW_FOLDER = os.path.join(PERMANENT_UPLOAD_FOLDER, 'slideshows')
    CHAT_IMAGES_FOLDER = os.path.join(PERMANENT_UPLOAD_FOLDER, 'chat_images')
    DOCUMENT_IMAGES_FOLDER = os.path.join(PERMANENT_UPLOAD_FOLDER, 'document_images')
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', os.path.join(PROJECT_ROOT, 'temp_upload'))
    PDF_FONT_PATH = os.getenv('PDF_FONT_PATH', os.path.join(PROJECT_ROOT, 'fonts', 'DejaVuSans.ttf'))
    ENABLE_ANALYTICS = os.getenv("ENABLE_ANALYTICS", "0").lower() in ("1", "true")

    OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY')

    # --- Latreo (verificação profissional de médicos via embed) ---
    # Latreo é provedor de identidade médica (CFM+CNES / foto+selfie / ICP-Brasil).
    # A biometria (carteira CRM + selfie) vai direto pro Latreo pelo embed — nunca
    # toca este backend. Aqui só criamos a sessão e lemos o resultado server-side.
    # Auth server-to-server via API key (`lk_...`, header X-API-KEY) criada no
    # dashboard Latreo + secret do webhook (gitignored, padrão dos KEKs). Sem a
    # API key, a verificação Latreo fica desligada e o médico cai no fallback 'pending'.
    LATREO_BASE_URL = os.getenv("LATREO_BASE_URL", "https://lastreo.com").rstrip("/")
    LATREO_API_KEY = os.getenv("LATREO_API_KEY")  # lk_<prefix>_<secret>
    LATREO_WEBHOOK_SECRET = os.getenv("LATREO_WEBHOOK_SECRET")  # whsec_... (HMAC-SHA256, estilo Stripe)
    LATREO_VERIFY_THEME_COLOR = os.getenv("LATREO_VERIFY_THEME_COLOR", "#bb86fc")

    # --- Conectores de nuvem do usuário (Biblioteca Drive-first, 2026-07) ---
    # Originais da Biblioteca moram na nuvem do PRÓPRIO usuário (v1: Google Drive,
    # scope drive.file — só enxerga o que o app criou / o usuário abriu no Picker).
    # OAuth backend-driven: refresh token cifrado em repouso (EncryptedString);
    # access token mintado sob demanda e NUNCA persistido. Sem CLIENT_ID/SECRET os
    # endpoints de conexão retornam 503 e a Biblioteca segue no caminho legado.
    GOOGLE_OAUTH_CLIENT_ID = os.getenv('GOOGLE_OAUTH_CLIENT_ID', '')
    GOOGLE_OAUTH_CLIENT_SECRET = os.getenv('GOOGLE_OAUTH_CLIENT_SECRET', '')
    GOOGLE_OAUTH_REDIRECT_URI = os.getenv(
        'GOOGLE_OAUTH_REDIRECT_URI', 'https://qython.ai/api/connectors/google/callback')
    GOOGLE_PICKER_API_KEY = os.getenv('GOOGLE_PICKER_API_KEY', '')   # browser key, referrer-restrita
    GOOGLE_PROJECT_NUMBER = os.getenv('GOOGLE_PROJECT_NUMBER', '')   # app_id do Google Picker
    DRIVE_ROOT_FOLDER_NAME = os.getenv('DRIVE_ROOT_FOLDER_NAME', 'Qython')
    # Gate estrutural: exigir nuvem conectada para AÇÕES da Biblioteca. Flip por
    # env (sem deploy) quando web+mobile tiverem o CTA de conectar (Fase 4 do plano).
    CLOUD_LIBRARY_REQUIRED = os.getenv('CLOUD_LIBRARY_REQUIRED', 'false').lower() in ('1', 'true')

    # --- LGPD Field-Level Encryption ---
    # QYTHON_FIELD_KEK — Fernet key (32 bytes url-safe base64) for encrypting
    # sensitive at-rest columns (CPF, RG, clinical notes, etc.).
    # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # QYTHON_TOKEN_KEK — 32-byte url-safe base64 key for deterministic
    # pseudonymization in ML pipeline.
    # Generate: python -c "import os, base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
    # Set both in .env. For throwaway local dev only, set QYTHON_ALLOW_EPHEMERAL_KEK=1.
    QYTHON_FIELD_KEK = os.getenv('QYTHON_FIELD_KEK')
    QYTHON_TOKEN_KEK = os.getenv('QYTHON_TOKEN_KEK')
    QYTHON_ALLOW_EPHEMERAL_KEK = os.getenv('QYTHON_ALLOW_EPHEMERAL_KEK', '0') == '1'

    # --- Firebase (Phone Authentication) ---
    # Credentials stored in /opt/qython/config/ for cleaner project structure
    FIREBASE_CREDENTIALS_PATH = os.path.join(PROJECT_ROOT, 'config', 'firebase_credentials.json')

    # --- Storage Quotas ---
    STORAGE_QUOTAS = {
        'free': 500 * 1024 * 1024,            # 500MB
        'resident': 2 * 1024 * 1024 * 1024,   # 2GB
        'staff': 5 * 1024 * 1024 * 1024,      # 5GB
        'specialist': 15 * 1024 * 1024 * 1024, # 15GB
    }
    STORAGE_LIMITS = {
        'free': {'docs_per_library': 20, 'max_libraries': 3},
        'resident': {'docs_per_library': 50, 'max_libraries': 10},
        'staff': {'docs_per_library': 100, 'max_libraries': 25},
        'specialist': {'docs_per_library': None, 'max_libraries': None},
    }

    # --- Vision Pipeline (Document Image Descriptions) ---
    VISION_DESCRIPTION_MODEL = os.getenv("VISION_DESCRIPTION_MODEL", "gemini-2.5-flash-lite")
    VISION_BATCH_SIZE = 25
    VISION_RPM_LIMIT = 25
    VISION_MAX_RETRIES = 3
    MIN_IMAGE_DIMENSION = 100      # px — ignore icons/bullets
    MIN_IMAGE_AREA = 15_000        # px² — ignore decorations
    MAX_IMAGES_PER_DOCUMENT = 50

    # --- TTL for Generated Content ---
    GENERATED_CONTENT_TTL_HOURS = 72

    # --- Avatar History ---
    MAX_AVATAR_HISTORY = {
        'free': 5,
        'resident': 15,
        'staff': 30,
        'specialist': 50,
    }

