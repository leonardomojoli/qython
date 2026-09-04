# qython/backend/routes/connector_routes.py
"""Conectores de nuvem do usuário (v1: Google Drive) — estilo Claude/ChatGPT.

Fluxo OAuth backend-driven (web abre popup; mobile abre WebView — padrão
LatreoVerificationModal): `POST /google/connect` devolve a auth_url com um
state JWT curto; o Google redireciona para `GET /google/callback`, que troca o
code, grava a conexão (refresh token cifrado) e devolve um HTML mínimo que faz
postMessage DUPLO — `window.opener` (popup web) e `window` (bridge do WebView).

Access tokens nunca são persistidos (connector_service minta sob demanda).
"""
import json
import logging
import secrets
from html import escape as _html_escape
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..config import Config
from ..database import get_db
from ..models import User, UserCloudConnection
from ..security import ALGORITHM, SECRET_KEY, get_current_active_user
from ..services import cloud_storage, connector_service
from ..services.cloud_storage import (
    CloudAuthRevoked,
    CloudNotConfigured,
    CloudStorageError,
)

logger = logging.getLogger("qython_logger")

router = APIRouter()

_STATE_PURPOSE = "connector_state"
_STATE_TTL_MINUTES = 10


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ConnectResponse(BaseModel):
    auth_url: str


class ConnectionInfo(BaseModel):
    provider: str
    account_email: Optional[str] = None
    status: str
    connected_at: Optional[datetime] = None


class ConnectorsStatusResponse(BaseModel):
    connections: List[ConnectionInfo]
    available: List[str]


class PickerTokenResponse(BaseModel):
    access_token: str
    expires_in: int
    app_id: str
    api_key: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_state(user_id: int) -> str:
    return jwt.encode(
        {
            "sub": str(user_id),
            "purpose": _STATE_PURPOSE,
            "nonce": secrets.token_urlsafe(8),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=_STATE_TTL_MINUTES),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def _parse_state(state: str) -> Optional[int]:
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != _STATE_PURPOSE:
            return None
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None


# Página pós-OAuth (Clinical Glassmorphism). Placeholders __X__ trocados em _callback_html
# — evita o inferno de chaves duplas do f-string com CSS. `dark = glow` (design system):
# o orb emite luz colorida, sem gloss.
_CALLBACK_TEMPLATE = """<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__ — Qython</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: radial-gradient(1200px 620px at 50% -12%, #241b33 0%, #16141d 46%, #0f0e14 100%);
    color: #e8e6ef; min-height: 100vh;
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .card {
    text-align: center; max-width: 400px; width: 100%;
    background: rgba(30, 30, 42, 0.72);
    backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px);
    border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 26px;
    padding: 44px 34px; box-shadow: 0 28px 64px rgba(0, 0, 0, 0.5);
    animation: rise .55s cubic-bezier(.2, .8, .2, 1) both;
  }
  @keyframes rise { from { opacity: 0; transform: translateY(18px) scale(.97); } to { opacity: 1; transform: none; } }
  .orb {
    width: 88px; height: 88px; margin: 0 auto 26px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, __ACCENT__ 0%, __ACCENT2__ 100%);
    box-shadow: 0 0 0 1px rgba(255,255,255,.10), 0 10px 38px __GLOW__;
    animation: pulse 2.6s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 1px rgba(255,255,255,.10), 0 10px 38px __GLOW__; }
    50%      { box-shadow: 0 0 0 1px rgba(255,255,255,.16), 0 14px 52px __GLOW_STRONG__; }
  }
  .orb svg { width: 44px; height: 44px; }
  h1 { font-size: 22px; font-weight: 700; letter-spacing: -.02em; margin-bottom: 10px; }
  p { font-size: 15px; line-height: 1.55; color: #aba8bd; }
  .brand { margin-top: 30px; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #6b6880; font-weight: 700; }
</style></head>
<body>
  <div class="card">
    <div class="orb">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">__ICON__</svg>
    </div>
    <h1>__TITLE__</h1>
    <p>__MESSAGE__</p>
    <div class="brand">Qython</div>
  </div>
<script>
(function () {
  var payload = __PAYLOAD__;
  try { if (window.opener) { window.opener.postMessage(payload, __ORIGIN__); } } catch (e) {}
  try { window.postMessage(payload, '*'); } catch (e) {}
  setTimeout(function () { try { window.close(); } catch (e) {} }, __CLOSE_MS__);
})();
</script></body></html>"""


def _callback_html(payload: dict) -> HTMLResponse:
    """Página pós-OAuth: postMessage DUPLO (popup web + bridge WebView) e auto-close.

    - Popup web: `window.opener.postMessage(..., WEB_BASE_URL)` — origem travada.
    - WebView mobile: a página é o top-frame; `window.postMessage` cai no próprio
      window e a bridge injetada (padrão LatreoVerificationModal) reencaminha.
    """
    ok = payload.get("type") == "qython.connector.connected"
    if ok:
        accent, accent2 = "#03dac6", "#018786"
        glow, glow_strong = "rgba(3,218,198,.42)", "rgba(3,218,198,.62)"
        icon = '<path d="M20 6 9 17l-5-5"/>'
        title = "Tudo pronto!"
        message = "Sua nuvem foi conectada. Esta janela vai fechar sozinha."
        close_ms = "1400"
    else:
        accent, accent2 = "#cf6679", "#a3364f"
        glow, glow_strong = "rgba(207,102,121,.42)", "rgba(207,102,121,.62)"
        icon = '<path d="M18 6 6 18M6 6l12 12"/>'
        title = "Não foi possível conectar"
        message = payload.get("message") or "Feche esta janela e tente novamente."
        close_ms = "4000"

    page = _CALLBACK_TEMPLATE
    for key, val in (
        ("__ACCENT2__", accent2), ("__ACCENT__", accent),
        ("__GLOW_STRONG__", glow_strong), ("__GLOW__", glow),
        ("__ICON__", icon),
        ("__TITLE__", _html_escape(title)), ("__MESSAGE__", _html_escape(message)),
        ("__CLOSE_MS__", close_ms),
        ("__PAYLOAD__", json.dumps(payload, ensure_ascii=False)),
        ("__ORIGIN__", json.dumps(Config.WEB_BASE_URL)),
    ):
        page = page.replace(key, val)
    return HTMLResponse(content=page)


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------

@router.post("/google/connect", response_model=ConnectResponse)
async def google_connect(current_user: User = Depends(get_current_active_user)):
    """Inicia a conexão do Google Drive: devolve a URL de consentimento."""
    provider = cloud_storage.get_provider("gdrive")
    if not provider.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "CONNECTOR_NOT_CONFIGURED",
                    "message": "Conector Google Drive não configurado no servidor."},
        )
    return ConnectResponse(auth_url=provider.get_auth_url(_make_state(current_user.id)))


@router.get("/google/callback")
async def google_callback(
    background_tasks: BackgroundTasks,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Redirect do Google (rota pública — o usuário é identificado pelo state JWT)."""
    fail = lambda msg: _callback_html(  # noqa: E731
        {"type": "qython.connector.error", "provider": "gdrive", "message": msg}
    )

    if error:
        # Usuário negou o consentimento (ou erro do Google) — nada gravado.
        return fail("Conexão cancelada." if error == "access_denied" else f"Google retornou: {error}")
    if not code or not state:
        return fail("Resposta do Google incompleta.")

    user_id = _parse_state(state)
    if user_id is None:
        return fail("Sessão de conexão expirada. Tente conectar de novo.")

    provider = cloud_storage.get_provider("gdrive")
    try:
        tokens = await provider.exchange_code(code)
    except CloudNotConfigured:
        return fail("Conector não configurado no servidor.")
    except CloudStorageError as e:
        logger.error(f"[CONNECTOR] exchange_code falhou p/ user {user_id}: {e}")
        return fail("Não foi possível concluir a conexão com o Google.")

    result = await db.execute(
        select(UserCloudConnection).filter(
            UserCloudConnection.user_id == user_id,
            UserCloudConnection.provider == "gdrive",
        )
    )
    connection = result.scalars().first()
    if connection is None:
        connection = UserCloudConnection(user_id=user_id, provider="gdrive")
        db.add(connection)
    connection.refresh_token = tokens["refresh_token"]
    connection.account_email = tokens.get("email") or connection.account_email
    connection.scopes = tokens.get("scopes")
    connection.status = "active"
    connection.connected_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(connection)
    connector_service.drop_cached_token(connection.id)

    # Best-effort: cria já a pasta "Qython" visível no Drive (confirmação tangível
    # p/ o usuário). Falha aqui não derruba a conexão — a pasta é garantida de novo
    # no primeiro upload (ensure_root_folder é idempotente).
    try:
        folder_id = await provider.ensure_root_folder(tokens["access_token"], connection.root_folder_id)
        connection.root_folder_id = folder_id
        await db.commit()
    except CloudStorageError as e:
        logger.warning(f"[CONNECTOR] ensure_root_folder adiado p/ user {user_id}: {e}")

    background_tasks.add_task(connector_service.schedule_legacy_migration, user_id)
    logger.info(f"[CONNECTOR] Google Drive conectado p/ user {user_id} ({connection.account_email})")
    return _callback_html(
        {
            "type": "qython.connector.connected",
            "provider": "gdrive",
            "account_email": connection.account_email or "",
        }
    )


@router.get("/status", response_model=ConnectorsStatusResponse)
async def connectors_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Lista as conexões do usuário (todas) + provedores disponíveis."""
    result = await db.execute(
        select(UserCloudConnection).filter(UserCloudConnection.user_id == current_user.id)
    )
    connections = result.scalars().all()
    return ConnectorsStatusResponse(
        connections=[
            ConnectionInfo(
                provider=c.provider,
                account_email=c.account_email,
                status=c.status,
                connected_at=c.connected_at,
            )
            for c in connections
        ],
        available=cloud_storage.available_providers(),
    )


@router.delete("/google/disconnect")
async def google_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Desconecta o Drive: revoga no Google (best-effort) e marca 'revoked'.

    A linha permanece para auditoria; os documentos Drive-backed ficam sem
    acesso ao original até reconectar (texto/chat seguem — derivados são nossos).
    """
    connection = await connector_service.get_connection(
        db, current_user.id, "gdrive", only_active=False
    )
    if connection is None:
        raise HTTPException(status_code=404, detail="Nenhuma conexão Google Drive.")
    provider = cloud_storage.get_provider("gdrive")
    if connection.status == "active":
        await provider.revoke(connection.refresh_token)
    connection.status = "revoked"
    await db.commit()
    connector_service.drop_cached_token(connection.id)
    logger.info(f"[CONNECTOR] Google Drive desconectado p/ user {current_user.id}")
    return {"disconnected": True}


@router.get("/google/picker-token", response_model=PickerTokenResponse)
async def google_picker_token(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Access token curto p/ o Google Picker (import de arquivos já no Drive)."""
    connection = await connector_service.get_connection(db, current_user.id, "gdrive")
    if connection is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "CLOUD_NOT_CONNECTED",
                    "message": "Conecte seu Google Drive para importar arquivos."},
        )
    try:
        access_token = await connector_service.get_access_token(db, connection)
    except CloudAuthRevoked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "CLOUD_REAUTH_REQUIRED",
                    "message": "Acesso ao Google Drive revogado. Reconecte sua conta."},
        )
    except CloudStorageError as e:
        logger.error(f"[CONNECTOR] picker-token falhou p/ user {current_user.id}: {e}")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="Google Drive indisponível no momento.")
    # expires_in conservador: o token real dura ~1h; o Picker só precisa da sessão de escolha.
    return PickerTokenResponse(
        access_token=access_token,
        expires_in=300,
        app_id=Config.GOOGLE_PROJECT_NUMBER,
        api_key=Config.GOOGLE_PICKER_API_KEY,
    )
