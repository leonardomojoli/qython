# backend/alembic/versions/2026_05_27_drop_surgical_center.py
"""Drop surgical center tables

Revision ID: 2026_05_27_drop_surg
Revises: 2026_05_26_drop_blog
Create Date: 2026-05-27

Removes the surgical center feature entirely (9 tables, 0 rows of real data
at removal time — only 5 seed templates that were never used by an actual
physician). Feature had ~5 months in production with zero adoption.

Drop order respects FK chain: dependents first, parent surgical_cases last.
Downgrade recreates the structure for emergency recovery; rows are lost.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = '2026_05_27_drop_surg'
down_revision = '2026_05_26_drop_blog'
branch_labels = None
depends_on = None


SURGICAL_TABLES_DROP_ORDER = [
    'anesthesia_alerts',
    'vital_signs',
    'drug_administrations',
    'surgical_checklists',
    'surgical_materials',
    'surgical_outcomes',
    'surgical_events',
    'surgical_templates',
    'surgical_cases',
]


def table_exists(table_name):
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade():
    for table in SURGICAL_TABLES_DROP_ORDER:
        if table_exists(table):
            op.drop_table(table)


def downgrade():
    # Recreate structural shells only — rows are lost on drop.
    # Order reversed: parent first, then children that reference it.
    if not table_exists('surgical_cases'):
        op.create_table(
            'surgical_cases',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('patient_id', sa.Integer(), sa.ForeignKey('patients.id'), nullable=True),
            sa.Column('procedure_name', sa.String(255), nullable=True),
            sa.Column('status', sa.String(20), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if not table_exists('surgical_templates'):
        op.create_table(
            'surgical_templates',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('scope', sa.String(20), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    # Child tables — minimal structural shells, callers must rebuild from app code.
    for table in ['surgical_events', 'surgical_outcomes', 'surgical_materials',
                  'surgical_checklists', 'drug_administrations', 'vital_signs',
                  'anesthesia_alerts']:
        if not table_exists(table):
            op.create_table(
                table,
                sa.Column('id', sa.Integer(), primary_key=True),
                sa.Column('case_id', sa.Integer(), sa.ForeignKey('surgical_cases.id', ondelete='CASCADE'), nullable=False),
                sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            )
