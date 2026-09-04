"""Medication i18n translations table

Revision ID: 2026_02_28_med_i18n
Revises: 2026_02_25_arena_xp
Create Date: 2026-02-28
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_28_med_i18n'
down_revision = '2026_02_25_arena_xp'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'medication_translations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('medication_id', sa.Integer(), sa.ForeignKey('medications.id', ondelete='CASCADE'), nullable=False),
        sa.Column('locale', sa.String(5), nullable=False),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('active_principle', sa.String(255), nullable=True),
        sa.UniqueConstraint('medication_id', 'locale', name='uq_medication_translation_locale'),
    )
    op.create_index('ix_med_translation_lookup', 'medication_translations', ['medication_id', 'locale'])


def downgrade() -> None:
    op.drop_index('ix_med_translation_lookup', table_name='medication_translations')
    op.drop_table('medication_translations')
