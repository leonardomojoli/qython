# qython/backend/services/audit_service.py
"""
Audit logging service (LGPD Art. 37 — registro de operações).

Wraps inserts to the `audit_log` table. The table itself is append-only —
Postgres trigger `audit_log_no_modify` rejects UPDATE/DELETE — so this service
only needs to handle insertion ergonomics: extracting actor metadata from
FastAPI Request, ensuring fail-safe behavior (audit failure must never break
the operation it was auditing), and providing common action helpers.

Conventions for action strings (verb.target.qualifier):
    auth.login.success, auth.login.failed, auth.logout, auth.password_reset
    user.profile.update, user.account.delete, user.account.restore
    user.consent.grant, user.consent.revoke
    user.data.export, user.data.access
    patient.create, patient.read, patient.update, patient.delete
    consultation.create, consultation.read, consultation.update
    training_data.collect, training_data.exclude, training_data.export
    admin.dsr.process, admin.user.impersonate
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models

logger = logging.getLogger(__name__)


def _extract_actor_metadata(request: Optional[Request]) -> dict[str, Optional[str]]:
    """Pull IP and User-Agent from a FastAPI request. Tolerates None for
    background jobs that have no request context."""
    if request is None:
        return {"actor_ip": None, "actor_user_agent": None}

    # Honor X-Forwarded-For (we're behind Nginx)
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else None
    )
    user_agent = request.headers.get("user-agent")
    return {
        "actor_ip": ip[:45] if ip else None,
        "actor_user_agent": user_agent[:500] if user_agent else None,
    }


async def log(
    db: AsyncSession,
    *,
    action: str,
    actor_user_id: Optional[int] = None,
    actor_role: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[Any] = None,
    affected_user_id: Optional[int] = None,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    metadata: Optional[dict] = None,
    request: Optional[Request] = None,
    commit: bool = False,
) -> Optional[models.AuditLog]:
    """Insert an audit log entry.

    Fail-safe: if the insert fails, we log the error and return None — we
    never raise, because audit failure must not break the underlying operation.

    Args:
        db: SQLAlchemy AsyncSession bound to the same transaction as the
            audited operation (so they commit together).
        action: dotted action string (e.g. 'patient.read').
        actor_user_id: ID of the user performing the action (None for system).
        actor_role: 'medico', 'paciente', 'admin', 'system', 'anonymous'.
        target_type: e.g. 'Patient', 'Consultation', 'UserConsent'.
        target_id: ID of the targeted entity (coerced to string).
        affected_user_id: data subject affected (often = actor for self-actions).
        before/after: optional state snapshots (NEVER raw clinical text).
        metadata: free-form context.
        request: FastAPI request, used to extract IP/UA.
        commit: if True, commits the session after insert. Default False —
                caller controls the transaction.
    """
    try:
        actor_meta = _extract_actor_metadata(request)
        entry = models.AuditLog(
            occurred_at=datetime.now(timezone.utc),
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            actor_ip=actor_meta["actor_ip"],
            actor_user_agent=actor_meta["actor_user_agent"],
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            affected_user_id=affected_user_id,
            before=before,
            after=after,
            metadata_info=metadata,
        )
        db.add(entry)
        await db.flush()
        if commit:
            await db.commit()
        return entry
    except Exception as exc:
        # Audit failure must never break the operation being audited.
        logger.error(
            "audit_service.log failed: action=%s target=%s:%s affected_user=%s err=%s",
            action, target_type, target_id, affected_user_id, exc,
            exc_info=True,
        )
        return None


# Common helpers — thin wrappers for the most frequent actions

async def log_login(db: AsyncSession, user_id: int, success: bool,
                    request: Optional[Request] = None, reason: Optional[str] = None):
    return await log(
        db,
        action='auth.login.success' if success else 'auth.login.failed',
        actor_user_id=user_id if success else None,
        actor_role='medico',  # caller may override
        affected_user_id=user_id,
        metadata={'reason': reason} if reason else None,
        request=request,
    )


async def log_consent_grant(db: AsyncSession, user_id: int, consent_type: str,
                            version: str, request: Optional[Request] = None):
    return await log(
        db,
        action='user.consent.grant',
        actor_user_id=user_id,
        actor_role='medico',
        target_type='UserConsent',
        target_id=f'{consent_type}@{version}',
        affected_user_id=user_id,
        metadata={'consent_type': consent_type, 'version': version},
        request=request,
    )


async def log_consent_revoke(db: AsyncSession, user_id: int, consent_type: str,
                             request: Optional[Request] = None):
    return await log(
        db,
        action='user.consent.revoke',
        actor_user_id=user_id,
        actor_role='medico',
        target_type='UserConsent',
        target_id=consent_type,
        affected_user_id=user_id,
        metadata={'consent_type': consent_type},
        request=request,
    )


async def log_data_export(db: AsyncSession, user_id: int,
                          request: Optional[Request] = None):
    return await log(
        db,
        action='user.data.export',
        actor_user_id=user_id,
        actor_role='medico',
        target_type='User',
        target_id=user_id,
        affected_user_id=user_id,
        request=request,
    )


async def log_account_delete(db: AsyncSession, user_id: int,
                             request: Optional[Request] = None,
                             cascade_counts: Optional[dict] = None):
    return await log(
        db,
        action='user.account.delete',
        actor_user_id=user_id,
        actor_role='medico',
        target_type='User',
        target_id=user_id,
        affected_user_id=user_id,
        metadata={'cascade_counts': cascade_counts} if cascade_counts else None,
        request=request,
    )
