# backend/services/latreo_client.py
"""Async client for Latreo medical-identity verification (embed flow).

Latreo verifies doctors against government sources (CFM + CNES, or photo+selfie,
or ICP-Brasil). The biometric media is uploaded by the doctor straight to Latreo
through the embed iframe — it NEVER passes through this backend. Here we only:

  * create a hosted verification session (returns an embed_url for the frontend)
  * read back the canonical result server-side
  * verify the HMAC signature of webhooks Latreo sends us

Auth: server-to-server via a static API key in the `X-API-KEY` header
(`lk_<prefix>_<secret>`), created in the Latreo dashboard (Developer → API Keys).
Revocable and scoped — no dashboard password lives here.

See docs/LATREO_INTEGRATION_PROPOSAL.md and https://latreo.duckdns.org/docs-public/.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
from typing import Optional

from ..config import Config

logger = logging.getLogger("qython_logger")

# aiohttp is imported lazily inside the request helper so that the pure
# verify_webhook_signature() stays importable without the HTTP dependency.
_TIMEOUT_SECONDS = 15


class LatreoError(Exception):
    """Latreo is unreachable or returned an unexpected response."""


class LatreoNotConfigured(LatreoError):
    """Latreo API key is not set in the environment."""


def is_enabled() -> bool:
    """True when the server-to-server API key is configured."""
    return bool(Config.LATREO_API_KEY)


async def _authed_request(method: str, path: str, *, json_body: Optional[dict] = None) -> dict:
    import aiohttp
    if not is_enabled():
        raise LatreoNotConfigured("LATREO_API_KEY not set.")
    url = f"{Config.LATREO_BASE_URL}{path}"
    headers = {"X-API-KEY": Config.LATREO_API_KEY}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.request(
                method, url, json=json_body, headers=headers,
                timeout=aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS),
            ) as resp:
                text = await resp.text()
                if resp.status >= 400:
                    raise LatreoError(f"Latreo {method} {path} -> {resp.status}: {text[:300]}")
                if not text:
                    return {}
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    raise LatreoError(f"Latreo {method} {path} -> non-JSON response: {text[:200]}")
    except LatreoError:
        raise
    except asyncio.TimeoutError:
        # Latreo slow/unreachable — surface as LatreoError so callers degrade
        # gracefully (502 / pending) instead of a raw 500.
        raise LatreoError(f"Latreo {method} {path} timed out after {_TIMEOUT_SECONDS}s")
    except aiohttp.ClientError as e:
        raise LatreoError(f"Latreo {method} {path} connection error: {e}")


async def create_verification_session(
    *,
    kind: str = "doctor",
    client_user_ref: Optional[str] = None,
    theme_primary_color: Optional[str] = None,
    allowed_origins: Optional[list] = None,
    completion_redirect_url: Optional[str] = None,
    allow_silver: bool = True,
    allow_gold: bool = True,
    expires_in_minutes: int = 60,
) -> dict:
    """Create a hosted verification session.

    `kind` is "doctor" (default) or "student" (Latreo v1.64+). A student session
    resolves to final_tier "verified"/"verified_strong" via institutional email or
    enrollment proof + selfie.

    ⚠️ The doctor-tier toggles allow_silver/allow_gold appear to be NO-OP on Latreo v1.68:
    a session created with allow_silver=False/allow_gold=False comes back (GET) with
    `required_tier=null` and no trace of the flags. The DOCUMENTED tier control is
    `required_tier` (the MINIMUM accepted tier — bronze|prata|ouro; there is no "hide higher
    tiers" / ceiling knob). Bronze is accepted by default (required_tier omitted) and the
    confirm/webhook marks any 'completed' session as verified, so bronze already grants access.
    The flags are kept for back-compat but do NOT rely on them to cap/restrict tiers
    (see docs-public/guide.html §18.x). They are only sent in the doctor flow regardless.
    The SAME Latreo identity later migrates student → doctor when the CRM is issued.

    Returns {id, session_id, embed_url, expires_at, status, kind}.
    """
    kind = kind if kind in ("doctor", "student") else "doctor"
    body = {
        "hide_branding": False,
        "expires_in_minutes": expires_in_minutes,
    }
    if kind == "student":
        # Only the student flow sends an explicit kind. The doctor flow predates
        # this field (v1.64), so omitting it keeps doctor sessions byte-identical
        # to before (server default = physician path) and avoids any
        # doctor/physician wire-value ambiguity. Doctor keeps its tier toggles.
        body["kind"] = "student"
    else:
        body["allow_silver"] = allow_silver
        body["allow_gold"] = allow_gold
    if client_user_ref is not None:
        body["client_user_ref"] = str(client_user_ref)
    if theme_primary_color:
        body["theme_primary_color"] = theme_primary_color
    if allowed_origins:
        body["allowed_origins"] = allowed_origins
    if completion_redirect_url:
        body["completion_redirect_url"] = completion_redirect_url
    return await _authed_request("POST", "/api/v1/client/verification-sessions", json_body=body)


async def get_verification_session(session_id: str) -> dict:
    """Canonical server-side result of a session.

    Returns {status, kind, final_tier, doctor_user_id, student_user_id,
    declared_name, declared_crm, declared_uf, declared_specialty,
    declared_course, ...}. For a student session `kind == "student"`,
    `student_user_id` is set (doctor_user_id is null) and `final_tier` is
    "verified"/"verified_strong"; both ids are the same stable Latreo identity.
    """
    return await _authed_request("GET", f"/api/v1/client/verification-sessions/{session_id}")


async def list_students() -> list:
    """List the tenant's medical students (GET /api/v1/client/students).

    Read-only B2B view; each item carries {id, verification_status, student_tier, ...}.
    Needed because a STUDENT session GET returns final_tier=null — the student's
    tier (verified/verified_strong) lives here as `student_tier`, keyed by the
    stable Latreo user id (the same value the session exposes as doctor_user_id).
    """
    res = await _authed_request("GET", "/api/v1/client/students")
    return res if isinstance(res, list) else []


async def resolve_verification_tier(sess: dict) -> Optional[str]:
    """Tier of a *completed* session. Doctors carry it in `final_tier`
    (bronze/prata/ouro). Students get `final_tier == null` on the session, so we
    look their tier up in /client/students by the Latreo user id. Best-effort —
    never raises; a completed session whose tier can't be read still falls back to
    'verified' (the person IS verified; only the label is unknown)."""
    final_tier = sess.get("final_tier")
    if final_tier:
        return final_tier
    uid = sess.get("doctor_user_id") or sess.get("student_user_id")
    if uid is not None:
        try:
            for s in await list_students():
                if s.get("id") == uid:
                    return s.get("student_tier") or "verified"
        except LatreoError:
            pass
    return "verified"


def verify_webhook_signature(
    raw_body: bytes,
    signature_header: Optional[str],
    secret: Optional[str] = None,
    tolerance_sec: int = 300,
) -> bool:
    """Validate the `X-Latreo-Signature` header (Stripe-style `t=<unix>,v1=<hex>`).

    The signed payload is `f"{t}.{raw_body}"` HMAC-SHA256'd with the shared
    `whsec_...` secret. Rejects stale timestamps (replay protection).
    """
    secret = secret or Config.LATREO_WEBHOOK_SECRET
    if not secret or not signature_header:
        return False
    parts = {}
    for piece in signature_header.split(","):
        key, sep, value = piece.partition("=")
        if sep:
            parts[key.strip()] = value.strip()
    ts = parts.get("t")
    received = parts.get("v1")
    if not ts or not received:
        return False
    try:
        ts_int = int(ts)
    except ValueError:
        return False
    if tolerance_sec and abs(time.time() - ts_int) > tolerance_sec:
        return False
    signed = f"{ts}.".encode("ascii") + raw_body
    expected = hmac.new(secret.encode("ascii"), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)
