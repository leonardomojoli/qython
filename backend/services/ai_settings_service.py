# qython/backend/services/ai_settings_service.py
"""
Configuração da IA editável pela interface.

Até aqui o provedor, o modelo e as chaves só mudavam editando o `.env` e reiniciando. Aqui
elas ficam no banco (tabela `system_settings`) e valem na hora, no app desktop e na edição
servidor:

O Qython roda só com IA local: um servidor compatível com a API da OpenAI (llama.cpp, Ollama,
LM Studio, vLLM). Não há escolha de provedor.

  base_url        endereço do servidor (com o /v1)
  model           nome do modelo para o servidor
  context_tokens  janela de contexto do modelo
  api_key         chave do servidor, para os que pedem (cifrada em repouso)

O que está salvo SOBREPÕE o ambiente (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_CONTEXT_TOKENS`,
`LLM_API_KEY`); apagar volta ao que o ambiente diz.
O resto do backend lê o ambiente a cada chamada (llm_provider), então aplicar é atualizar o
ambiente e descartar os clientes já construídos.

As chaves não saem pela API: o GET só diz se existem.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import time
from typing import Any, Awaitable, Callable, Optional
from urllib.parse import urlparse

from . import encryption_service, llm_provider
from ..config import Config

logger = logging.getLogger("qython_logger")

KEY_CONFIG = "ai_config"
KEY_SECRETS = "ai_config_secrets"

PLAIN_FIELDS = ("base_url", "model", "context_tokens")
SECRET_FIELDS = ("api_key",)

# Campo da interface → variável de ambiente que o llm_provider lê.
ENV_VARS = {
    "base_url": "LLM_BASE_URL",
    "model": "LLM_MODEL",
    "context_tokens": "LLM_CONTEXT_TOKENS",
    "api_key": "LLM_API_KEY",
}

_baseline: Optional[dict] = None  # o ambiente como estava antes de qualquer sobreposição


class AiSettingsError(ValueError):
    """Valor inválido vindo da interface (vira 400)."""


# ---------------------------------------------------------------------------
# Armazenamento: um par get/set de strings, para testar sem banco.
# ---------------------------------------------------------------------------

Getter = Callable[[str], Awaitable[Optional[str]]]
Setter = Callable[[str, str], Awaitable[None]]


class Store:
    def __init__(self, get: Getter, set_: Setter):
        self.get = get
        self.set = set_


def db_store(db, user_id: Optional[int] = None, request=None) -> Store:
    """Guarda em `system_settings`. A chave pública passa pelo log de auditoria das
    configurações; as chaves de API não (elas são cifradas e ficam fora dele)."""
    from sqlalchemy.future import select

    from ..models import SystemSettings
    from .system_settings_service import SystemSettingsService

    async def get(key: str) -> Optional[str]:
        row = (await db.execute(select(SystemSettings).filter(SystemSettings.key == key))).scalars().first()
        return row.value if row else None

    async def set_(key: str, value: str) -> None:
        if key == KEY_CONFIG:
            await SystemSettingsService.set(
                key, value, db, user_id=user_id, request=request, reason="Configuração da IA"
            )
            return
        row = (await db.execute(select(SystemSettings).filter(SystemSettings.key == key))).scalars().first()
        if row:
            row.value = value
            row.updated_by = user_id
        else:
            db.add(SystemSettings(key=key, value=value, updated_by=user_id))
        await db.commit()
        SystemSettingsService.invalidate_cache(key)

    return Store(get, set_)


def _seal(value: str) -> str:
    token = encryption_service.encrypt_value(value)
    return base64.b64encode(token).decode("ascii") if token else ""


def _unseal(blob: str) -> Optional[str]:
    if not blob:
        return None
    return encryption_service.decrypt_value(base64.b64decode(blob))


async def load_stored(store: Store) -> dict:
    """O que está salvo, com as chaves já decifradas (uso interno; nunca vai para a API)."""
    out: dict[str, Any] = {}
    raw = await store.get(KEY_CONFIG)
    if raw:
        try:
            out.update({k: v for k, v in json.loads(raw).items() if k in PLAIN_FIELDS and v not in (None, "")})
        except ValueError:
            logger.error("ai_config ilegível no banco; ignorando.")
    raw_secrets = await store.get(KEY_SECRETS)
    if raw_secrets:
        try:
            for name, blob in json.loads(raw_secrets).items():
                if name in SECRET_FIELDS:
                    value = _unseal(blob)
                    if value:
                        out[name] = value
        except ValueError:
            logger.error("ai_config_secrets ilegível no banco; ignorando.")
    return out


# ---------------------------------------------------------------------------
# Validação
# ---------------------------------------------------------------------------

def validate_patch(patch: dict) -> dict:
    """Confere e normaliza o que veio da interface. Só os campos presentes mudam; texto vazio
    apaga (volta ao ambiente)."""
    clean: dict[str, Any] = {}
    unknown = set(patch) - set(PLAIN_FIELDS) - set(SECRET_FIELDS)
    if unknown:
        raise AiSettingsError(f"Campos desconhecidos: {', '.join(sorted(unknown))}")

    if "base_url" in patch:
        url = (patch["base_url"] or "").strip().rstrip("/")
        if url:
            parsed = urlparse(url)
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                raise AiSettingsError("O endereço deve começar com http:// ou https:// (ex.: http://127.0.0.1:8081/v1).")
        clean["base_url"] = url

    if "model" in patch:
        model = (patch["model"] or "").strip()
        if len(model) > 200:
            raise AiSettingsError("Nome de modelo longo demais.")
        clean["model"] = model

    if "context_tokens" in patch:
        raw = patch["context_tokens"]
        if raw in (None, ""):
            clean["context_tokens"] = ""
        else:
            try:
                tokens = int(raw)
            except (TypeError, ValueError):
                raise AiSettingsError("A janela de contexto deve ser um número de tokens.")
            if not 2048 <= tokens <= 2_000_000:
                raise AiSettingsError("A janela de contexto deve ficar entre 2.048 e 2.000.000 de tokens.")
            clean["context_tokens"] = tokens

    for name in SECRET_FIELDS:
        if name in patch:
            value = (patch[name] or "").strip()
            if len(value) > 500 or any(c in value for c in "\r\n"):
                raise AiSettingsError("Chave inválida.")
            clean[name] = value
    return clean


def merge(stored: dict, clean: dict) -> dict:
    out = dict(stored)
    for name, value in clean.items():
        if value in ("", None):
            out.pop(name, None)
        else:
            out[name] = value
    return out


def check_consistency(merged: dict, env_baseline: dict) -> None:
    """Combinações que deixariam a IA inutilizável são recusadas na hora, não na primeira pergunta."""
    if not (merged.get("base_url") or env_baseline.get("LLM_BASE_URL")):
        raise AiSettingsError("Informe o endereço do servidor de IA (ex.: http://127.0.0.1:8081/v1).")


# ---------------------------------------------------------------------------
# Aplicar ao processo
# ---------------------------------------------------------------------------

def _capture_baseline() -> dict:
    global _baseline
    if _baseline is None:
        _baseline = {var: os.environ.get(var) for var in ENV_VARS.values()}
    return _baseline


def env_baseline() -> dict:
    return {k: v for k, v in _capture_baseline().items() if v}


def apply(stored: dict) -> None:
    """Põe a configuração salva no ambiente do processo e descarta os clientes de IA já
    construídos, para a próxima chamada usar o novo provedor."""
    base = _capture_baseline()
    for field, var in ENV_VARS.items():
        value = stored.get(field)
        if value not in (None, ""):
            os.environ[var] = str(value)
        elif base.get(var) is None:
            os.environ.pop(var, None)
        else:
            os.environ[var] = base[var]
    llm_provider.reset_clients()
    logger.info("Configuração da IA aplicada: servidor %s.", os.environ.get("LLM_BASE_URL") or "(não definido)")


async def apply_from_store(store: Store) -> dict:
    stored = await load_stored(store)
    if stored:
        apply(stored)
    return stored


async def save(store: Store, patch: dict) -> dict:
    clean = validate_patch(patch)
    stored = await load_stored(store)
    merged = merge(stored, clean)
    check_consistency(merged, env_baseline())

    await store.set(KEY_CONFIG, json.dumps({k: merged[k] for k in PLAIN_FIELDS if k in merged}, ensure_ascii=False))
    await store.set(KEY_SECRETS, json.dumps({k: _seal(merged[k]) for k in SECRET_FIELDS if merged.get(k)}))
    apply(merged)
    return merged


async def clear(store: Store) -> None:
    await store.set(KEY_CONFIG, "{}")
    await store.set(KEY_SECRETS, "{}")
    apply({})


# ---------------------------------------------------------------------------
# Visão para a interface (sem as chaves)
# ---------------------------------------------------------------------------

def view(stored: dict) -> dict:
    base = env_baseline()

    def source(field: str) -> str:
        if stored.get(field):
            return "interface"
        return "ambiente" if base.get(ENV_VARS[field]) else "padrão"

    return {
        "base_url": os.environ.get("LLM_BASE_URL") or "",
        "model": os.environ.get("LLM_MODEL") or "",
        "context_tokens": llm_provider.context_tokens(),
        "has_api_key": bool(os.environ.get("LLM_API_KEY")),
        "sources": {f: source(f) for f in ENV_VARS},
        "overridden": bool(stored),
        # O app desktop sobe e desliga o servidor de IA local por conta própria; a tela mostra o
        # caminho para trocar de modelo em vez de pedir um endereço.
        "managed_local": os.getenv("QYTHON_MANAGED_LLM") == "1",
        "capabilities": llm_provider.capabilities(),
    }


# ---------------------------------------------------------------------------
# Teste de conexão
# ---------------------------------------------------------------------------

async def test_connection(candidate: dict) -> dict:
    """Conversa de verdade com o servidor de IA (os valores informados, completados pelo que já
    está em uso) sem salvar nada."""
    import httpx

    started = time.monotonic()

    base = (candidate.get("base_url") or os.environ.get("LLM_BASE_URL") or "").rstrip("/")
    if not base:
        return {"ok": False, "detail": "Informe o endereço do servidor para testar."}
    key = candidate.get("api_key") or os.environ.get("LLM_API_KEY")
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    # Um servidor local carrega o modelo na primeira chamada (o app desktop só o sobe sob demanda).
    host = urlparse(base).hostname or ""
    timeout = 240.0 if host in ("127.0.0.1", "localhost", "::1") else 20.0
    try:
        async with httpx.AsyncClient(timeout=timeout) as http:
            res = await http.get(f"{base}/models", headers=headers)
            if res.status_code in (404, 405):
                model = candidate.get("model") or os.environ.get("LLM_MODEL") or "local"
                res = await http.post(
                    f"{base}/chat/completions", headers=headers,
                    json={"model": model, "messages": [{"role": "user", "content": "ok"}], "max_tokens": 1},
                )
    except httpx.HTTPError as exc:
        return {"ok": False, "detail": f"Não foi possível conectar em {base}: {exc}"}
    latency = int((time.monotonic() - started) * 1000)
    if res.status_code == 200:
        models: list[str] = []
        try:
            models = [m.get("id", "") for m in res.json().get("data", [])][:5]
        except ValueError:
            pass
        return {"ok": True, "latency_ms": latency, "detail": "Servidor respondeu.", "models": [m for m in models if m]}
    if res.status_code in (401, 403):
        return {"ok": False, "detail": "O servidor recusou a chave de API."}
    message = res.text[:200].replace("\n", " ")
    return {"ok": False, "detail": f"O servidor respondeu HTTP {res.status_code}: {message}"}
