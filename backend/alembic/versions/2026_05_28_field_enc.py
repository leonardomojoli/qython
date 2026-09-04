# backend/alembic/versions/2026_05_28_field_enc.py
"""Field-level encryption for sensitive at-rest columns.

Revision ID: 2026_05_28_field_enc
Revises: 2026_05_27_lgpd_core
Create Date: 2026-05-28

Encrypts at-rest columns that contain PII or clinical content:

    users:          personal_id_number, phone_number
    patients:       full_name, document_id, phone, email, address,
                    clinical_history, allergies, chronic_conditions,
                    current_medications
    consultations:  raw_notes, improved_notes, summary, chief_complaint,
                    physical_exam

Strategy per column (atomic, downtime-required):
    1. ADD <col>_enc BYTEA NULL
    2. Backfill: read plain via SQL, encrypt with Fernet, UPDATE _enc
    3. DROP <col>
    4. RENAME <col>_enc TO <col>

After this migration the columns are LargeBinary (BYTEA) at the database
level. application code MUST use the matching EncryptedString /
EncryptedJSON TypeDecorator declared in models.py to read/write.

REQUIRED ENV: QYTHON_FIELD_KEK (set in /opt/qython/.env).
DOWNTIME: stop the backend before running. Workers reading old plain-text
columns would crash mid-flight otherwise.
"""

import json
import logging

from alembic import op
import sqlalchemy as sa

from backend.services.encryption_service import encrypt_value, _load_field_cipher


revision = '2026_05_28_field_enc'
down_revision = '2026_05_27_lgpd_core'
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


# (table, column, is_json)
COLUMNS_TO_ENCRYPT = [
    ('users', 'personal_id_number', False),
    ('users', 'phone_number',       False),

    ('patients', 'full_name',           False),
    ('patients', 'document_id',         False),
    ('patients', 'phone',               False),
    ('patients', 'email',               False),
    ('patients', 'address',             False),
    ('patients', 'clinical_history',    False),
    ('patients', 'allergies',           True),
    ('patients', 'chronic_conditions',  True),
    ('patients', 'current_medications', True),

    ('consultations', 'raw_notes',       False),
    ('consultations', 'improved_notes',  False),
    ('consultations', 'summary',         False),
    ('consultations', 'chief_complaint', False),
    ('consultations', 'physical_exam',   False),
]


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    cols = sa.inspect(bind).get_columns(table)
    return any(c['name'] == column for c in cols)


def _column_type_is_binary(table: str, column: str) -> bool:
    bind = op.get_bind()
    for c in sa.inspect(bind).get_columns(table):
        if c['name'] == column:
            return 'BYTEA' in str(c['type']).upper() or 'LARGE' in str(c['type']).upper()
    return False


def _serialize(value, is_json: bool):
    if value is None:
        return None
    if is_json:
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        if isinstance(value, str):
            # already JSON serialized
            return value
        return json.dumps(value, ensure_ascii=False)
    return value if isinstance(value, str) else str(value)


def _migrate_column(conn, table: str, column: str, is_json: bool) -> None:
    enc_col = f"{column}_enc"

    # Idempotency: if column is already BYTEA, skip entirely
    if _column_exists(table, column) and _column_type_is_binary(table, column):
        logger.info("SKIP %s.%s (already encrypted)", table, column)
        return

    if not _column_exists(table, column):
        logger.warning("SKIP %s.%s (column does not exist)", table, column)
        return

    # 1. Add _enc nullable BYTEA (if not already present from a previous attempt)
    if not _column_exists(table, enc_col):
        op.add_column(table, sa.Column(enc_col, sa.LargeBinary, nullable=True))

    # 2. Backfill in a single pass
    rows = conn.execute(
        sa.text(f'SELECT id, "{column}" FROM "{table}" WHERE "{column}" IS NOT NULL')
    ).fetchall()
    count = 0
    for row_id, plain in rows:
        serialized = _serialize(plain, is_json)
        if serialized is None:
            continue
        ciphertext = encrypt_value(serialized)
        conn.execute(
            sa.text(f'UPDATE "{table}" SET "{enc_col}" = :ct WHERE id = :id'),
            {"ct": ciphertext, "id": row_id},
        )
        count += 1
    logger.info("Backfilled %d row(s) for %s.%s", count, table, column)

    # 3. Drop plain
    op.drop_column(table, column)

    # 4. Rename
    op.execute(sa.text(
        f'ALTER TABLE "{table}" RENAME COLUMN "{enc_col}" TO "{column}"'
    ))


def upgrade():
    # Fail fast if KEK is missing — better than silently using ephemeral keys
    # that won't be available at runtime.
    _load_field_cipher()

    conn = op.get_bind()
    for table, column, is_json in COLUMNS_TO_ENCRYPT:
        _migrate_column(conn, table, column, is_json)


def downgrade():
    """Reverses the schema (column types go back to TEXT/JSON) but the
    contents become NULL — Fernet is one-way without the key at downgrade
    time. This downgrade is for emergency schema reversal only; data
    recovery requires running a separate restore from backup."""
    bind = op.get_bind()
    for table, column, is_json in reversed(COLUMNS_TO_ENCRYPT):
        if not _column_exists(table, column):
            continue
        if not _column_type_is_binary(table, column):
            continue
        # rename current bytea to _enc, add fresh plain column, drop _enc
        op.execute(sa.text(
            f'ALTER TABLE "{table}" RENAME COLUMN "{column}" TO "{column}_enc"'
        ))
        if is_json:
            op.add_column(table, sa.Column(column, sa.JSON, nullable=True))
        else:
            op.add_column(table, sa.Column(column, sa.Text, nullable=True))
        op.drop_column(table, f"{column}_enc")
