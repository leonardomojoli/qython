# qython/backend/scripts/backfill_anonymize_training_data.py
"""
Idempotent backfill that anonymizes legacy `training_data` rows.

Rationale: rows created before the LGPD pipeline (commit 6138ec95) all
have `anonymization_level=NULL` and may contain patient PII in
`input_data` / `output_data` in plain text. This script:

    1. Selects rows where anonymization_level IS NULL.
    2. Runs the (now PT-BR-capable) pii_redaction.assess_for_training over
       the combined text.
    3. If any patient-like PII is detected, applies inline redaction with
       Presidio to both columns and marks anonymization_level='anon'.
    4. If no patient PII is detected, still marks the row 'anon' (legacy
       rows have no consent record, so they default to the conservative
       track) and updates the pii_detected flag based on the assessment.
    5. Commits in batches of 100 so a failure mid-run doesn't lose work.

Run on the server with KEKs configured:
    cd /opt/qython && venv/bin/python3 backend/scripts/backfill_anonymize_training_data.py

Safe to re-run — rows already with anonymization_level set are skipped.
"""

import asyncio
import logging
import os
import sys

# Add project root to path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)

from sqlalchemy import select

from backend.database import AsyncSessionLocal
from backend.models import TrainingData
from backend.middleware.pii_redaction import assess_for_training, redact_for_llm

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

BATCH_SIZE = 100


async def process_batch(session, rows):
    """Process a batch in place. Caller commits."""
    redacted_count = 0
    pii_detected_count = 0

    for row in rows:
        combined = f"{row.input_data or ''}\n{row.output_data or ''}"
        assessment = assess_for_training(combined)

        # Update PII flag based on current detector
        new_pii = bool(assessment.get("has_pii"))
        if new_pii != row.pii_detected:
            row.pii_detected = new_pii
        if new_pii:
            pii_detected_count += 1

        # If PII of patient detected, apply inline redaction to both columns
        if assessment.get("patient_pii_likely"):
            new_input, _ = redact_for_llm(row.input_data or "", preserve_tokens=False)
            new_output, _ = redact_for_llm(row.output_data or "", preserve_tokens=False)
            row.input_data = new_input
            row.output_data = new_output
            redacted_count += 1
            meta = dict(row.metadata_info or {})
            meta["patient_pii_redacted_backfill"] = True
            row.metadata_info = meta

        # Legacy rows have no consent record — default to 'anon' track (safer
        # under Art. 12; they will only be exportable as anonymized).
        row.anonymization_level = "anon"

    return redacted_count, pii_detected_count


async def backfill():
    total_processed = 0
    total_redacted = 0
    total_with_pii = 0
    offset = 0

    async with AsyncSessionLocal() as session:
        # Total count up front for progress reporting
        total_pending_result = await session.execute(
            select(TrainingData).where(TrainingData.anonymization_level.is_(None))
        )
        all_pending = list(total_pending_result.scalars().all())
        logger.info("Backfill targets: %d row(s) with anonymization_level IS NULL",
                    len(all_pending))

    while True:
        async with AsyncSessionLocal() as session:
            stmt = (
                select(TrainingData)
                .where(TrainingData.anonymization_level.is_(None))
                .order_by(TrainingData.id)
                .limit(BATCH_SIZE)
            )
            rows = list((await session.execute(stmt)).scalars().all())
            if not rows:
                break

            redacted, with_pii = await process_batch(session, rows)
            await session.commit()

            total_processed += len(rows)
            total_redacted += redacted
            total_with_pii += with_pii
            logger.info(
                "Batch processed: %d rows (cumulative=%d, redacted=%d, with_pii=%d)",
                len(rows), total_processed, total_redacted, total_with_pii,
            )

            offset += len(rows)
            if len(rows) < BATCH_SIZE:
                break

    logger.info(
        "Done. processed=%d redacted=%d with_pii=%d",
        total_processed, total_redacted, total_with_pii,
    )


if __name__ == "__main__":
    asyncio.run(backfill())
