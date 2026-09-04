# qython/backend/services/consent_service.py
"""
Consent management service (LGPD Art. 7, 8, 11 + Art. 18 IX).

Handles versioned, granular, revocable consent records. Each grant produces
an immutable row in user_consents tied to a specific ConsentDocument version.
Revocation marks revoked_at — the row is never deleted (audit trail).

Active = revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()).

Default TTLs:
    - terms_of_use, privacy_policy: no expiry (NULL)
    - ml_training_*: 365 days (forces yearly renewal)
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models
from . import audit_service

logger = logging.getLogger(__name__)


ML_SCOPE_TTL_DAYS = 365
OPERATIONAL_TTL_DAYS = None  # T&C and Privacy Policy never expire automatically


def compute_content_hash(body: str) -> str:
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


async def get_active_document(
    db: AsyncSession,
    consent_type: models.ConsentDocumentType,
    locale: str = "pt-BR",
) -> Optional[models.ConsentDocument]:
    """Return the currently-active document for a given type+locale.
    Active = is_active=True. Returns the latest version if multiple active."""
    stmt = (
        select(models.ConsentDocument)
        .where(
            models.ConsentDocument.type == consent_type,
            models.ConsentDocument.locale == locale,
            models.ConsentDocument.is_active.is_(True),
        )
        .order_by(models.ConsentDocument.published_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def publish_document(
    db: AsyncSession,
    *,
    consent_type: models.ConsentDocumentType,
    version: str,
    title: str,
    body: str,
    locale: str = "pt-BR",
    default_ttl_days: Optional[int] = None,
    deactivate_previous: bool = True,
    metadata: Optional[dict] = None,
) -> models.ConsentDocument:
    """Publish a new version of a consent document. By default deactivates
    previous versions of the same (type, locale)."""
    if deactivate_previous:
        await db.execute(
            update(models.ConsentDocument)
            .where(
                models.ConsentDocument.type == consent_type,
                models.ConsentDocument.locale == locale,
                models.ConsentDocument.is_active.is_(True),
            )
            .values(is_active=False)
        )

    doc = models.ConsentDocument(
        type=consent_type,
        version=version,
        locale=locale,
        title=title,
        body=body,
        content_hash=compute_content_hash(body),
        default_ttl_days=default_ttl_days,
        is_active=True,
        metadata_info=metadata,
    )
    db.add(doc)
    await db.flush()
    return doc


async def get_active_consent(
    db: AsyncSession,
    user_id: int,
    consent_type: models.ConsentDocumentType,
) -> Optional[models.UserConsent]:
    """Return the active grant for (user, type), or None.
    Filters in app code to handle the expires_at semantics correctly."""
    stmt = (
        select(models.UserConsent)
        .where(
            models.UserConsent.user_id == user_id,
            models.UserConsent.type == consent_type,
            models.UserConsent.revoked_at.is_(None),
        )
        .order_by(models.UserConsent.granted_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    consent = result.scalar_one_or_none()
    if consent is None:
        return None
    if consent.expires_at is not None and consent.expires_at <= datetime.now(timezone.utc):
        return None
    return consent


async def check_active(
    db: AsyncSession,
    user_id: int,
    consent_type: models.ConsentDocumentType,
) -> bool:
    return (await get_active_consent(db, user_id, consent_type)) is not None


async def list_user_consents(
    db: AsyncSession,
    user_id: int,
    include_revoked: bool = False,
) -> list[models.UserConsent]:
    stmt = (
        select(models.UserConsent)
        .where(models.UserConsent.user_id == user_id)
        .order_by(models.UserConsent.granted_at.desc())
    )
    if not include_revoked:
        stmt = stmt.where(models.UserConsent.revoked_at.is_(None))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def grant(
    db: AsyncSession,
    *,
    user_id: int,
    consent_type: models.ConsentDocumentType,
    request: Optional[Request] = None,
    locale: str = "pt-BR",
    scope_metadata: Optional[dict] = None,
) -> models.UserConsent:
    """Grant consent. If an active grant already exists for the same type and
    document version, returns it idempotently. Otherwise: revokes any prior
    active grant (different version) and creates a new one."""
    document = await get_active_document(db, consent_type, locale=locale)
    if document is None:
        raise ValueError(
            f"No active document for consent_type={consent_type.value} locale={locale}. "
            "Publish one with publish_document() first."
        )

    existing = await get_active_consent(db, user_id, consent_type)
    if existing is not None and existing.version == document.version:
        # Idempotent — same version already granted
        return existing

    # Revoke any previous active grant for this type
    if existing is not None:
        existing.revoked_at = datetime.now(timezone.utc)
        await db.flush()

    # Compute expires_at from the document's default TTL
    expires_at = None
    if document.default_ttl_days is not None:
        expires_at = datetime.now(timezone.utc) + timedelta(days=document.default_ttl_days)
    elif consent_type.value.startswith("ml_"):
        # Safety net: ML scopes always expire even if doc didn't set TTL
        expires_at = datetime.now(timezone.utc) + timedelta(days=ML_SCOPE_TTL_DAYS)

    actor_ip = None
    actor_user_agent = None
    if request is not None:
        meta = audit_service._extract_actor_metadata(request)
        actor_ip = meta["actor_ip"]
        actor_user_agent = meta["actor_user_agent"]

    consent = models.UserConsent(
        user_id=user_id,
        document_id=document.id,
        type=consent_type,
        version=document.version,
        granted_at=datetime.now(timezone.utc),
        expires_at=expires_at,
        actor_ip=actor_ip,
        actor_user_agent=actor_user_agent,
        document_hash=document.content_hash,
        scope_metadata=scope_metadata,
    )
    db.add(consent)
    await db.flush()

    # Reflect ML training consents on User for fast lookups
    if consent_type.value.startswith("ml_"):
        await db.execute(
            update(models.User)
            .where(models.User.id == user_id)
            .values(
                training_data_consent_at=consent.granted_at,
                training_data_consent_version=document.version,
                training_data_opt_out=False,  # explicit consent overrides legacy flag
            )
        )

    await audit_service.log_consent_grant(
        db, user_id=user_id, consent_type=consent_type.value,
        version=document.version, request=request,
    )

    return consent


async def revoke(
    db: AsyncSession,
    *,
    user_id: int,
    consent_type: models.ConsentDocumentType,
    request: Optional[Request] = None,
) -> Optional[models.UserConsent]:
    """Revoke the active grant for (user, type). Returns the revoked record
    or None if there was no active grant."""
    active = await get_active_consent(db, user_id, consent_type)
    if active is None:
        return None

    active.revoked_at = datetime.now(timezone.utc)
    await db.flush()

    # If revoking an ML scope, mark related training_data for exclusion
    if consent_type.value.startswith("ml_"):
        await db.execute(
            update(models.TrainingData)
            .where(
                models.TrainingData.user_id == user_id,
                models.TrainingData.consent_id == active.id,
            )
            .values(excluded_due_to_revocation=True)
        )

    await audit_service.log_consent_revoke(
        db, user_id=user_id, consent_type=consent_type.value, request=request,
    )

    return active


async def has_any_ml_consent(db: AsyncSession, user_id: int) -> bool:
    """Convenience: does the user have ANY active ML training consent?"""
    stmt = select(models.UserConsent.id).where(
        models.UserConsent.user_id == user_id,
        models.UserConsent.type.in_([
            models.ConsentDocumentType.ml_training_general,
            models.ConsentDocumentType.ml_training_specialty,
            models.ConsentDocumentType.ml_training_image,
            models.ConsentDocumentType.ml_training_voice,
            models.ConsentDocumentType.ml_training_feedback,
            models.ConsentDocumentType.ml_research_publication,
        ]),
        models.UserConsent.revoked_at.is_(None),
    ).limit(1)
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def get_consent_for_source_type(
    db: AsyncSession,
    user_id: int,
    source_type: str,
) -> Optional[models.UserConsent]:
    """Map a training data source_type to the appropriate ML consent scope and
    return the active consent if any. Returns None if no consent covers this
    source.

    Mapping (kept simple — refine as data collector evolves):
        chat_*, copilot_*               -> ml_training_general
        consultation_*                  -> ml_training_general
        image_*, vision_*               -> ml_training_image
        audio_*, voice_*, transcription -> ml_training_voice
        feedback_*                      -> ml_training_feedback
        specialty_specific_*            -> ml_training_specialty
        academic_*, podcast_*, video_*  -> ml_research_publication
    """
    scope = _source_type_to_consent_scope(source_type)
    if scope is None:
        return None
    return await get_active_consent(db, user_id, scope)


def _source_type_to_consent_scope(
    source_type: str,
) -> Optional[models.ConsentDocumentType]:
    if source_type is None:
        return None
    st = source_type.lower()
    if st.startswith(("image_", "vision_")):
        return models.ConsentDocumentType.ml_training_image
    if st.startswith(("audio_", "voice_", "transcription")):
        return models.ConsentDocumentType.ml_training_voice
    if st.startswith("feedback") or "preference" in st:
        return models.ConsentDocumentType.ml_training_feedback
    if st.startswith("specialty"):
        return models.ConsentDocumentType.ml_training_specialty
    if st.startswith(("academic", "podcast", "video_lesson", "study_material",
                      "research")):
        return models.ConsentDocumentType.ml_research_publication
    # default bucket
    return models.ConsentDocumentType.ml_training_general
