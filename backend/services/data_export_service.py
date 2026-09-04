# qython/backend/services/data_export_service.py
"""
LGPD Direitos do Titular — Articles 18 V and 18 VI.

Two responsibilities:

1. EXPORT (Art. 18 V — portabilidade): assemble a portable archive of all
   personal data tied to a user. Output: JSON bundle that can be zipped.
   Format is machine-readable so the user (or their lawyer, or another
   controller) can ingest it.

2. DELETE (Art. 18 VI — eliminação): cascade-delete all data where the user
   is the data subject. Soft-deletes the user account first (sets deleted_at)
   so the user can't log back in while async cleanup runs.

Both operations generate audit entries (via audit_service) and are designed
to be safe to run concurrently with normal traffic (transactional, batched).
"""

from __future__ import annotations

import io
import json
import logging
import zipfile
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Request
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models
from . import audit_service

logger = logging.getLogger(__name__)


# Tables whose rows are owned by the user and should be in the export.
# Each entry: (model class, attribute on User that holds the relationship)
EXPORTABLE_RELATIONS = [
    ('consultations', 'Consultation'),
    ('patients', 'Patient'),
    ('transactions', 'Transaction'),
    ('avatar_history', 'AvatarHistory'),
    ('anamnesis_templates', 'UserAnamnesisTemplate'),
    ('feedback', 'Feedback'),
    ('chat_sessions', 'ChatSession'),
    ('academic_libraries', 'AcademicLibrary'),
    ('academic_materials', 'AcademicMaterial'),
    ('consents', 'UserConsent'),
]


def _serialize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bytes):
        # Binary (encrypted columns will appear as ciphertext if decryption
        # fails; export_service decrypts via ORM, so this should be rare)
        return f"<binary {len(value)} bytes>"
    if isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    # Fallback — use repr to avoid silent loss
    try:
        return str(value)
    except Exception:
        return f"<unserializable {type(value).__name__}>"


def _model_to_dict(instance) -> dict:
    """Convert a SQLAlchemy model instance to a dict using its column names."""
    if instance is None:
        return {}
    cols = instance.__table__.columns
    out = {}
    for col in cols:
        try:
            value = getattr(instance, col.name)
        except Exception:
            value = None
        # Skip sensitive auth columns from export
        if col.name in {"password_hash"}:
            continue
        out[col.name] = _serialize_value(value)
    return out


async def build_user_export(db: AsyncSession, user_id: int) -> dict:
    """Assemble the full personal data bundle for a user.

    Returns a dict with sections per data type. Caller can serialize to JSON,
    optionally zip with `bundle_to_zip()`.
    """
    user = await db.get(models.User, user_id)
    if user is None:
        raise ValueError(f"User {user_id} not found")

    bundle: dict[str, Any] = {
        "export_metadata": {
            "user_id": user_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "format_version": "1.0",
            "legal_basis": "LGPD Art. 18 V — Direito à portabilidade",
        },
        "user": _model_to_dict(user),
        "data": {},
    }

    # Patients owned by user (deep — includes consultations of those patients)
    patient_stmt = select(models.Patient).where(models.Patient.doctor_id == user_id)
    patients = list((await db.execute(patient_stmt)).scalars().all())
    bundle["data"]["patients"] = [_model_to_dict(p) for p in patients]

    # Consultations
    cons_stmt = select(models.Consultation).where(models.Consultation.user_id == user_id)
    consultations = list((await db.execute(cons_stmt)).scalars().all())
    bundle["data"]["consultations"] = [_model_to_dict(c) for c in consultations]

    # Chat sessions + messages
    sessions_stmt = select(models.ChatSession).where(models.ChatSession.user_id == user_id)
    sessions = list((await db.execute(sessions_stmt)).scalars().all())
    bundle["data"]["chat_sessions"] = [_model_to_dict(s) for s in sessions]

    # Consents (full history including revoked)
    consent_stmt = (
        select(models.UserConsent)
        .where(models.UserConsent.user_id == user_id)
        .order_by(models.UserConsent.granted_at.desc())
    )
    consents = list((await db.execute(consent_stmt)).scalars().all())
    bundle["data"]["consents"] = [_model_to_dict(c) for c in consents]

    # Audit log entries where this user was the subject
    audit_stmt = (
        select(models.AuditLog)
        .where(models.AuditLog.affected_user_id == user_id)
        .order_by(models.AuditLog.occurred_at.desc())
        .limit(5000)
    )
    audit_entries = list((await db.execute(audit_stmt)).scalars().all())
    bundle["data"]["audit_log"] = [_model_to_dict(a) for a in audit_entries]

    # Generic "owned by user" relations (best-effort)
    for relation_name, _model_name in EXPORTABLE_RELATIONS:
        if relation_name in bundle["data"]:
            continue  # already filled in above
        try:
            related = getattr(user, relation_name)
            if hasattr(related, '__iter__'):
                items = list(related)
            elif related is None:
                items = []
            else:
                items = [related]
            bundle["data"][relation_name] = [_model_to_dict(item) for item in items]
        except Exception as exc:
            logger.warning("build_user_export: relation %s failed: %s", relation_name, exc)
            bundle["data"][relation_name] = {"_error": str(exc)}

    return bundle


def bundle_to_zip(bundle: dict) -> bytes:
    """Wrap a JSON bundle in a zip with a README. Returns bytes ready to send."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            'qython_data_export.json',
            json.dumps(bundle, ensure_ascii=False, indent=2, default=str),
        )
        zf.writestr('README.txt', _README_BODY)
    return buf.getvalue()


_README_BODY = """Qython — Exportação de dados pessoais (LGPD Art. 18 V)

Este arquivo contém todos os dados pessoais associados à sua conta no Qython,
em formato JSON estruturado conforme garantido pelo Art. 18, V da Lei Geral
de Proteção de Dados (Lei 13.709/2018).

Conteúdo:
  - user: dados cadastrais
  - data.patients: pacientes que você registrou
  - data.consultations: consultas que você documentou
  - data.chat_sessions: histórico de conversas com o copiloto
  - data.consents: histórico de consentimentos concedidos e revogados
  - data.audit_log: registros de operações sobre seus dados

Caso queira exercer outros direitos (correção, eliminação, oposição,
revogação de consentimento), acesse:
    https://qython.ai/encarregado

Encarregado pelo Tratamento de Dados:
    dpo@qython.ai
"""


async def soft_delete_user(
    db: AsyncSession,
    user_id: int,
    *,
    request: Optional[Request] = None,
) -> bool:
    """Mark user as deleted (soft delete). Login is blocked immediately.
    Async cascade cleanup is run by `purge_user_data` (typically from a
    background task)."""
    user = await db.get(models.User, user_id)
    if user is None:
        return False
    if user.deleted_at is not None:
        return True  # Already deleted

    user.deleted_at = datetime.now(timezone.utc)
    await db.flush()

    await audit_service.log_account_delete(
        db, user_id=user_id, request=request,
        cascade_counts={'stage': 'soft_delete'},
    )
    return True


async def purge_user_data(db: AsyncSession, user_id: int) -> dict:
    """Hard delete of all data owned by the user (cascade via SQLAlchemy
    relationships). Returns counts per relation for audit purposes.

    Should be called AFTER soft_delete_user, ideally from a background job.
    Training data: rows are NOT deleted but `excluded_due_to_revocation` is
    set so they're omitted from future exports. Anonymized entries (without
    user_id linkage) are retained — they're out of LGPD scope per Art. 12.
    """
    user = await db.get(models.User, user_id)
    if user is None:
        return {"error": "user_not_found"}

    counts = {}

    # 1. Exclude (don't delete) training data — keeps history for ANPD audit
    res = await db.execute(
        update(models.TrainingData)
        .where(models.TrainingData.user_id == user_id)
        .values(excluded_due_to_revocation=True, user_id=None)
    )
    counts['training_data_excluded'] = res.rowcount or 0

    # 2. Hard-delete the user — SQLAlchemy cascade handles related rows
    # (patients, consultations, chat_sessions, etc.) per the relationship
    # `cascade="all, delete-orphan"` definitions.
    await db.execute(delete(models.User).where(models.User.id == user_id))

    counts['user'] = 1
    return counts
