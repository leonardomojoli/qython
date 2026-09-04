# backend/alembic/versions/2026_05_29_latreo_verif.py
"""Latreo professional-verification fields on users.

Revision ID: 2026_05_29_latreo_verif
Revises: 2026_05_28_field_enc
Create Date: 2026-05-29

Adds the columns that mirror a doctor's Latreo verification result. The
biometric media (CRM card + selfie) is collected and stored by Latreo via the
embed flow — it never reaches Qython. These columns only record the outcome:

    verification_provider        'latreo' | 'internal'
    verification_tier            bronze | basic | strong (Latreo)
    latreo_doctor_id             Latreo's doctor user id (webhook -> user mapping)
    latreo_session_id            last verification session id ("vs_...")
    verified_at                  when verification completed
    last_verification_check_at   last server-side re-check (defense-in-depth cron)
"""
from alembic import op
import sqlalchemy as sa


revision = '2026_05_29_latreo_verif'
down_revision = '2026_05_28_field_enc'
branch_labels = None
depends_on = None


# (name, type) — all nullable, additive.
NEW_COLUMNS = [
    ('verification_provider', sa.String(length=20)),
    ('verification_tier', sa.String(length=20)),
    ('latreo_doctor_id', sa.Integer()),
    ('latreo_session_id', sa.String(length=40)),
    ('verified_at', sa.DateTime(timezone=True)),
    ('last_verification_check_at', sa.DateTime(timezone=True)),
]


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return any(c['name'] == column for c in sa.inspect(bind).get_columns(table))


def upgrade():
    for name, type_ in NEW_COLUMNS:
        if not _has_column('users', name):
            op.add_column('users', sa.Column(name, type_, nullable=True))
    bind = op.get_bind()
    existing_indexes = {ix['name'] for ix in sa.inspect(bind).get_indexes('users')}
    if 'ix_users_latreo_doctor_id' not in existing_indexes:
        op.create_index('ix_users_latreo_doctor_id', 'users', ['latreo_doctor_id'])


def downgrade():
    bind = op.get_bind()
    existing_indexes = {ix['name'] for ix in sa.inspect(bind).get_indexes('users')}
    if 'ix_users_latreo_doctor_id' in existing_indexes:
        op.drop_index('ix_users_latreo_doctor_id', table_name='users')
    for name, _ in reversed(NEW_COLUMNS):
        if _has_column('users', name):
            op.drop_column('users', name)
