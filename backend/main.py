# qython/backend/main.py

import logging
import gzip
import shutil
import os
from logging.handlers import RotatingFileHandler
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .config import Config
from .database import create_tables
from .routes import (
    auth_routes, consultation_routes, user_routes, copilot_routes,
    feedback_routes, billing_routes, academic_routes, settings_routes,
    export_routes, admin_routes, patient_routes,
    prescription_routes, document_routes, exam_routes, icd10_routes,
    profile_update_routes, orientation_routes,
    medication_routes, pharmacy_routes, public_routes, sync_routes,
    notification_routes, verification_routes, connector_routes
)
from .services.llm_services import initialize_prompt_cache

# =============================================================================
# CONFIGURAÇÃO DE LOGGING PROFISSIONAL
# =============================================================================
# - Rotação automática com compressão gzip
# - Structured logging com formato consistente
# - Filtros para bibliotecas externas barulhentas
# - Níveis apropriados por componente
# =============================================================================

log_directory = "log"
os.makedirs(log_directory, exist_ok=True)


class CompressedRotatingFileHandler(RotatingFileHandler):
    """RotatingFileHandler que comprime arquivos rotacionados com gzip"""
    def doRollover(self):
        super().doRollover()
        # Comprime o arquivo rotacionado mais recente
        if self.backupCount > 0:
            oldest_log = f"{self.baseFilename}.{self.backupCount}"
            if os.path.exists(oldest_log):
                with open(oldest_log, 'rb') as f_in:
                    with gzip.open(f"{oldest_log}.gz", 'wb') as f_out:
                        shutil.copyfileobj(f_in, f_out)
                os.remove(oldest_log)


class QythonLogFilter(logging.Filter):
    """Filtro para reduzir ruído de bibliotecas externas"""

    # Mensagens a serem filtradas (contém qualquer uma dessas strings)
    FILTERED_MESSAGES = [
        "AFC is enabled",
        "AFC remote call",
        "HTTP Request: POST https://generativelanguage",
    ]

    def filter(self, record: logging.LogRecord) -> bool:
        # Filtra mensagens barulhentas de bibliotecas externas
        message = record.getMessage()
        for filtered in self.FILTERED_MESSAGES:
            if filtered in message:
                return False
        return True


def setup_logging():
    """Configura o sistema de logging com as melhores práticas"""

    # Formato profissional: timestamp ISO | level | logger | message
    log_format = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    formatter = logging.Formatter(log_format, datefmt=date_format)

    # Handler de arquivo com rotação e compressão
    # - 10MB por arquivo, 10 backups = ~100MB máximo
    file_handler = CompressedRotatingFileHandler(
        os.path.join(log_directory, "qython_app.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=10,
        encoding='utf-8'
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)
    file_handler.addFilter(QythonLogFilter())

    # Handler de console (stdout para systemd/journald)
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    stream_handler.setLevel(logging.INFO)
    stream_handler.addFilter(QythonLogFilter())

    # Configura root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.handlers.clear()
    root_logger.addHandler(file_handler)
    root_logger.addHandler(stream_handler)

    # Silencia bibliotecas externas barulhentas
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("google_genai").setLevel(logging.WARNING)
    logging.getLogger("google_genai.models").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("alembic").setLevel(logging.WARNING)
    logging.getLogger("multipart").setLevel(logging.WARNING)
    logging.getLogger("PIL").setLevel(logging.WARNING)

    return logging.getLogger("qython_logger")


# Inicializa o sistema de logging
logger = setup_logging()
logger.info("Sistema de logging inicializado")

# Configuração do Limiter (Rate Limiting)
from .rate_limiter import limiter

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Import scheduler and arena services
    from .services.scheduler import start_scheduler, stop_scheduler
    from .services.arena_service import seed_seasons
    from .services.server_monitor import start_server_monitor, stop_server_monitor
    from .seeds.seed_medications import seed_all as seed_pharmacy_data
    from .database import AsyncSessionLocal

    # Create tables is now async
    await create_tables()
    initialize_prompt_cache()

    # Seed data - use advisory lock so only one Gunicorn worker runs seeds
    async with AsyncSessionLocal() as db:
        from sqlalchemy import text
        lock_result = await db.execute(text("SELECT pg_try_advisory_lock(100001)"))
        acquired = lock_result.scalar()

        if not acquired:
            logger.info("Another worker is running seeds, skipping")
        else:
            try:
                added = await seed_seasons(db)
                if added > 0:
                    logger.info(f"Seeded {added} new arena seasons")
            except Exception as e:
                logger.error(f"Error seeding seasons: {e}")

            try:
                meds_added, interactions_added = await seed_pharmacy_data(db)
                if meds_added > 0 or interactions_added > 0:
                    logger.info(f"Seeded {meds_added} medications, {interactions_added} drug interactions")
            except Exception as e:
                logger.error(f"Error seeding pharmacy data: {e}")

            await db.execute(text("SELECT pg_advisory_unlock(100001)"))

    # Start internal scheduler for ranking updates
    start_scheduler()
    logger.info("Internal scheduler started")

    # Start server monitor for metrics collection and auto-maintenance
    start_server_monitor()
    logger.info("Server monitor started")

    yield

    # Cleanup on shutdown
    stop_scheduler()
    stop_server_monitor()
    logger.info("Application shutdown complete")

app = FastAPI(lifespan=lifespan)

# Configuração do Rate Limiter no app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Monta o diretório estático para servir arquivos como fotos de perfil
STATIC_DIR = Config.STATIC_FOLDER
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)
app.mount(f"/{Config.STATIC_URL_PATH_PREFIX}", StaticFiles(directory=STATIC_DIR), name="static")

# Configuração do CORS — origens vêm de Config.ALLOWED_ORIGINS (env var ALLOWED_ORIGINS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=Config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Accept-Language"],
)

# TrustedHostMiddleware — hosts vêm de Config.ALLOWED_HOSTS (env var ALLOWED_HOSTS)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=Config.ALLOWED_HOSTS,
)

# Security headers middleware
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# Custom middleware for rate limiting tracking and maintenance mode
from .middleware.rate_limiter import RateLimitMiddleware, MaintenanceModeMiddleware
app.add_middleware(RateLimitMiddleware)
app.add_middleware(MaintenanceModeMiddleware)

# Inclusão das rotas
app.include_router(auth_routes.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(consultation_routes.router, prefix="/api/consultations", tags=["Consultations"])
app.include_router(user_routes.router, prefix="/api/user", tags=["User"])
app.include_router(copilot_routes.router, prefix="/api/copilot", tags=["Copilot"])
app.include_router(feedback_routes.router, prefix="/api/feedback", tags=["Feedback"])
app.include_router(billing_routes.router, prefix="/api/billing", tags=["Billing"])
app.include_router(academic_routes.router, prefix="/api/academic", tags=["Academic"])
app.include_router(settings_routes.router, prefix="/api/settings", tags=["Settings"])
app.include_router(export_routes.router, prefix="/api/export", tags=["Export"])
app.include_router(admin_routes.router, prefix="/api/admin", tags=["Admin"])
app.include_router(patient_routes.router, prefix="/api/patients", tags=["Patients"])
app.include_router(prescription_routes.router, prefix="/api/prescriptions", tags=["Prescriptions"])
app.include_router(document_routes.router, prefix="/api/documents", tags=["Documents"])
app.include_router(exam_routes.router, prefix="/api/exams", tags=["Exams"])
app.include_router(icd10_routes.router, prefix="/api/icd10", tags=["ICD-10"])
app.include_router(profile_update_routes.router, prefix="/api/profile-updates", tags=["Profile Updates"])
app.include_router(orientation_routes.router, prefix="/api/orientations", tags=["Orientations"])
app.include_router(medication_routes.router, prefix="/api/medications", tags=["Medications"])
app.include_router(pharmacy_routes.router, prefix="/api/pharmacy", tags=["Pharmacy"])
app.include_router(public_routes.router, prefix="/api/public", tags=["Public"])
app.include_router(sync_routes.router, prefix="/api/sync", tags=["Sync"])
app.include_router(notification_routes.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(verification_routes.router, prefix="/api", tags=["Verification"])
app.include_router(connector_routes.router, prefix="/api/connectors", tags=["Connectors"])

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=jsonable_encoder({"detail": exc.errors()}),
    )

@app.get("/")
@limiter.limit("5/minute")
def read_root(request: Request):
    return {"message": "Bem-vindo à API da Qython"}

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

logger.info("Aplicação FastAPI configurada e pronta para iniciar.")

