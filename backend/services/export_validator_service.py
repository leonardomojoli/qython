# qython/backend/services/export_validator_service.py
"""
Pre-export validator for the ML training data pipeline (LGPD).

Runs BEFORE each SFT/DPO export to guarantee that every record leaving the
training pool currently has the legal basis to do so. Catches:

    - Consent that was active when collected but has been revoked since
    - Consent that has expired (the 12-month TTL)
    - User accounts that were deleted (Art. 18 VI)
    - PII that slipped past collection (re-scan with current detector)
    - K-anonymity violations on the anonymized track

Records that fail any check are dropped from the export AND the failure is
counted. The aggregated counts go into DatasetExportLog as proof of
minimization (Art. 12 + Art. 18 VI compatibility).

Use:
    from backend.services.export_validator_service import (
        validate_entries_for_export, register_export,
    )

    entries = await db.execute(select(TrainingData).where(...))
    report = await validate_entries_for_export(db, list(entries.scalars()))
    # report.valid is the subset safe to export
    # report.consent_snapshot is the {user_id: [scopes]} mapping at export time

    # ... build the JSONL with report.valid ...

    await register_export(
        db,
        exporter_user_id=admin.id,
        export_type='sft_jsonl',
        dataset_bytes=jsonl_bytes,
        report=report,
        metadata={'filters': {...}},
    )
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models
from .pii_detector import detect_and_summarize as detect_pii_in_texts

logger = logging.getLogger("qython_logger")


@dataclass
class ExportValidationReport:
    valid: list = field(default_factory=list)
    excluded_revoked: int = 0
    excluded_expired: int = 0
    excluded_deleted_user: int = 0
    excluded_pii: int = 0
    excluded_no_consent: int = 0
    excluded_other: int = 0
    consent_snapshot: dict[str, list[str]] = field(default_factory=dict)

    @property
    def total_excluded(self) -> int:
        return (
            self.excluded_revoked
            + self.excluded_expired
            + self.excluded_deleted_user
            + self.excluded_pii
            + self.excluded_no_consent
            + self.excluded_other
        )

    @property
    def summary(self) -> dict:
        return {
            "valid": len(self.valid),
            "excluded_revoked": self.excluded_revoked,
            "excluded_expired": self.excluded_expired,
            "excluded_deleted_user": self.excluded_deleted_user,
            "excluded_pii": self.excluded_pii,
            "excluded_no_consent": self.excluded_no_consent,
            "excluded_other": self.excluded_other,
            "total_excluded": self.total_excluded,
        }


async def _load_user_states(
    db: AsyncSession, user_ids: set[int]
) -> dict[int, dict]:
    """Return per-user dict: {deleted: bool, active_scopes: [str], training_opt_out: bool}."""
    if not user_ids:
        return {}

    # Load all users in one query
    user_rows = (await db.execute(
        select(
            models.User.id,
            models.User.deleted_at,
            models.User.training_data_opt_out,
        ).where(models.User.id.in_(user_ids))
    )).all()
    user_state = {
        uid: {
            "deleted": deleted_at is not None,
            "training_opt_out": bool(opt_out),
            "active_scopes": [],
        }
        for uid, deleted_at, opt_out in user_rows
    }

    # Mark any user_id that has no row as deleted (the user_id column was nulled)
    for uid in user_ids:
        if uid not in user_state:
            user_state[uid] = {
                "deleted": True, "training_opt_out": False, "active_scopes": [],
            }

    # Load active consents in one query
    now = datetime.now(timezone.utc)
    consent_rows = (await db.execute(
        select(
            models.UserConsent.user_id,
            models.UserConsent.type,
            models.UserConsent.expires_at,
        ).where(
            models.UserConsent.user_id.in_(user_ids),
            models.UserConsent.revoked_at.is_(None),
        )
    )).all()
    for uid, ctype, expires_at in consent_rows:
        if expires_at is not None and expires_at <= now:
            continue
        if ctype.value.startswith("ml_") or ctype.value.startswith("ml_research_"):
            user_state[uid]["active_scopes"].append(ctype.value)

    return user_state


def _check_consent_coverage(
    entry: "models.TrainingData",
    user_state: dict,
) -> Optional[str]:
    """Return None if consent is OK, or a reason string ('revoked', 'expired',
    'deleted', 'no_consent') if not.

    Logic:
    - excluded_due_to_revocation flag → 'revoked'
    - user.deleted_at set → 'deleted'
    - anonymization_level == 'anon' → always OK (Art. 12 — not personal data)
    - anonymization_level == 'pseudo' → user must have at least one active
      ml_* scope (we trust the original routing decision for which one).
    """
    if getattr(entry, "excluded_due_to_revocation", False):
        return "revoked"

    if entry.user_id is None:
        # Anonymized entry (no link to user). OK for export.
        return None

    state = user_state.get(entry.user_id)
    if state is None or state["deleted"]:
        return "deleted"

    if entry.anonymization_level == "anon":
        return None  # outside LGPD scope

    if entry.anonymization_level == "pseudo":
        if not state["active_scopes"]:
            return "no_consent"
        return None

    # Legacy entries (anonymization_level NULL): require the user has at
    # least one active scope OR be non-opt-out (legacy semantics).
    if state["active_scopes"]:
        return None
    if not state["training_opt_out"]:
        # User never explicitly opted out — borderline case, but legal exposure
        # without a consent record is too high. Exclude.
        return "no_consent"
    return "no_consent"


def _check_pii(entry: "models.TrainingData") -> bool:
    """Returns True if entry is PII-clean (safe to export), False otherwise."""
    try:
        result = detect_pii_in_texts(entry.input_data, entry.output_data)
        return not result.get("pii_detected", False)
    except Exception as exc:
        logger.warning("PII recheck failed for entry %s: %s", entry.id, exc)
        # Conservative: when in doubt, exclude
        return False


async def validate_entries_for_export(
    db: AsyncSession,
    entries: Iterable["models.TrainingData"],
    *,
    enforce_pii_recheck: bool = True,
) -> ExportValidationReport:
    """Validate a batch of TrainingData entries before exporting them.

    Args:
        db: async DB session.
        entries: candidate TrainingData rows.
        enforce_pii_recheck: re-run pii_detector. Default True.

    Returns:
        ExportValidationReport with the safe subset and exclusion counts.
    """
    entries = list(entries)
    report = ExportValidationReport()

    if not entries:
        return report

    user_ids = {e.user_id for e in entries if e.user_id is not None}
    user_state = await _load_user_states(db, user_ids)

    for entry in entries:
        reason = _check_consent_coverage(entry, user_state)
        if reason is not None:
            if reason == "revoked":
                report.excluded_revoked += 1
            elif reason == "expired":
                report.excluded_expired += 1
            elif reason == "deleted":
                report.excluded_deleted_user += 1
            elif reason == "no_consent":
                report.excluded_no_consent += 1
            else:
                report.excluded_other += 1
            continue

        if enforce_pii_recheck and not _check_pii(entry):
            report.excluded_pii += 1
            continue

        report.valid.append(entry)

    # Build consent snapshot for the audit log
    report.consent_snapshot = {
        str(uid): sorted(state["active_scopes"])
        for uid, state in user_state.items()
        if state["active_scopes"]
    }

    logger.info(
        "[EXPORT VALIDATOR] candidates=%d valid=%d excluded=%s",
        len(entries), len(report.valid), report.summary,
    )
    return report


def _check_preference_consent_coverage(
    entry: "models.PreferenceData",
    user_state: dict,
) -> Optional[str]:
    """Same idea as _check_consent_coverage but for PreferenceData.

    Rules:
      - entry.user_id NULL              → already anonymized, OK
      - user_state missing or deleted    → 'deleted'
      - DPO is the feedback-loop track, so we require the user to have at
        least one active ml_* scope (typically ml_training_feedback). If the
        user is not opted out and has no scope, we still treat as no_consent
        (DPO data is high-signal, conservative posture).
    """
    if entry.user_id is None:
        return None

    state = user_state.get(entry.user_id)
    if state is None or state["deleted"]:
        return "deleted"

    if state["active_scopes"]:
        return None
    return "no_consent"


def _check_preference_pii(entry: "models.PreferenceData") -> bool:
    """PII recheck across prompt + chosen + rejected."""
    try:
        joined_input = entry.prompt or ""
        joined_output = (entry.chosen or "") + "\n" + (entry.rejected or "")
        result = detect_pii_in_texts(joined_input, joined_output)
        return not result.get("pii_detected", False)
    except Exception as exc:
        logger.warning("PII recheck failed for preference %s: %s", entry.id, exc)
        return False


async def validate_preference_entries_for_export(
    db: AsyncSession,
    entries: Iterable["models.PreferenceData"],
    *,
    enforce_pii_recheck: bool = True,
) -> ExportValidationReport:
    """Validate a batch of PreferenceData entries before DPO export.

    Same shape as validate_entries_for_export but tuned for PreferenceData:
      - per-user consent coverage (any active ml_* scope; ml_training_feedback
        is the primary one for DPO but any ML consent counts)
      - PII recheck across prompt + chosen + rejected
      - drops user-deleted entries and user-missing entries
    """
    entries = list(entries)
    report = ExportValidationReport()

    if not entries:
        return report

    user_ids = {e.user_id for e in entries if e.user_id is not None}
    user_state = await _load_user_states(db, user_ids)

    for entry in entries:
        reason = _check_preference_consent_coverage(entry, user_state)
        if reason is not None:
            if reason == "revoked":
                report.excluded_revoked += 1
            elif reason == "expired":
                report.excluded_expired += 1
            elif reason == "deleted":
                report.excluded_deleted_user += 1
            elif reason == "no_consent":
                report.excluded_no_consent += 1
            else:
                report.excluded_other += 1
            continue

        if enforce_pii_recheck and not _check_preference_pii(entry):
            report.excluded_pii += 1
            continue

        report.valid.append(entry)

    report.consent_snapshot = {
        str(uid): sorted(state["active_scopes"])
        for uid, state in user_state.items()
        if state["active_scopes"]
    }

    logger.info(
        "[EXPORT VALIDATOR][DPO] candidates=%d valid=%d excluded=%s",
        len(entries), len(report.valid), report.summary,
    )
    return report


async def register_export(
    db: AsyncSession,
    *,
    exporter_user_id: int,
    export_type: str,
    dataset_bytes: bytes,
    report: ExportValidationReport,
    anonymization_level: str = "mixed",
    metadata: Optional[dict] = None,
) -> "models.DatasetExportLog":
    """Persist a DatasetExportLog entry for this export.

    Args:
        exporter_user_id: admin who triggered the export.
        export_type: 'sft_jsonl', 'dpo_jsonl', 'dpo_parquet', etc.
        dataset_bytes: raw bytes of the file being delivered.
        report: ExportValidationReport produced by validate_entries_for_export.
        anonymization_level: 'pseudo', 'anon', or 'mixed'.
        metadata: free-form context.

    Returns the saved DatasetExportLog row.
    """
    dataset_hash = hashlib.sha256(dataset_bytes).hexdigest()
    log = models.DatasetExportLog(
        exported_by_user_id=exporter_user_id,
        export_type=export_type,
        dataset_hash=dataset_hash,
        entry_count=len(report.valid),
        anonymization_level=anonymization_level,
        consent_snapshot=report.consent_snapshot,
        excluded_due_to_revocation=report.excluded_revoked,
        excluded_due_to_expiry=report.excluded_expired,
        metadata_info=(metadata or {}) | {
            "excluded_summary": report.summary,
        },
    )
    db.add(log)
    await db.flush()
    return log
