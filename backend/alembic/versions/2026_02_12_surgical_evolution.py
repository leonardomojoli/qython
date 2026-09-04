"""Surgical evolution: patient linking, emergency flag, WHO checklist

Adds:
- patient_id FK and is_emergency flag to surgical_cases
- surgical_checklists table (WHO Safe Surgery phases)

Revision ID: 2026_02_12_surgical_evolution
Revises: 2026_02_11_training_opt_out
Create Date: 2026-02-12 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_12_surgical_evolution'
down_revision = '2026_02_11_training_opt_out'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add patient_id FK to surgical_cases
    op.add_column('surgical_cases', sa.Column('patient_id', sa.Integer(), sa.ForeignKey('patients.id'), nullable=True))
    op.create_index('ix_surgical_cases_patient_id', 'surgical_cases', ['patient_id'])

    # 2. Add is_emergency flag to surgical_cases
    op.add_column('surgical_cases', sa.Column('is_emergency', sa.Boolean(), server_default=sa.text('false'), nullable=False))

    # 3. Create surgical_checklists table (WHO Safe Surgery)
    op.create_table(
        'surgical_checklists',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('case_id', sa.Integer(), sa.ForeignKey('surgical_cases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('phase', sa.String(20), nullable=False),
        sa.Column('items', sa.JSON(), nullable=False),
        sa.Column('completed_by', sa.String(255), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint('case_id', 'phase', name='uq_checklist_case_phase'),
    )


def downgrade() -> None:
    op.drop_table('surgical_checklists')
    op.drop_index('ix_surgical_cases_patient_id', table_name='surgical_cases')
    op.drop_column('surgical_cases', 'is_emergency')
    op.drop_column('surgical_cases', 'patient_id')
