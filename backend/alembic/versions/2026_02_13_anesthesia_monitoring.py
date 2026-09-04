"""Anesthesia monitoring: vital signs and clinical alerts

Adds:
- vital_signs table (intraoperative vital signs readings)
- anesthesia_alerts table (rule-based clinical alerts)

Revision ID: 2026_02_13_anesthesia_monitoring
Revises: 2026_02_12_surgical_evolution
Create Date: 2026-02-13 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_13_anesthesia_monitoring'
down_revision = '2026_02_12_surgical_evolution'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create vital_signs table
    op.create_table(
        'vital_signs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('case_id', sa.Integer(), sa.ForeignKey('surgical_cases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column('heart_rate', sa.Integer(), nullable=True),
        sa.Column('bp_systolic', sa.Integer(), nullable=True),
        sa.Column('bp_diastolic', sa.Integer(), nullable=True),
        sa.Column('bp_mean', sa.Integer(), nullable=True),
        sa.Column('spo2', sa.Integer(), nullable=True),
        sa.Column('etco2', sa.Integer(), nullable=True),
        sa.Column('temperature', sa.Float(), nullable=True),
        sa.Column('fio2', sa.Integer(), nullable=True),
        sa.Column('bis', sa.Integer(), nullable=True),
        sa.Column('tof', sa.Integer(), nullable=True),
        sa.Column('cam', sa.Float(), nullable=True),
        sa.Column('urine_output_ml', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
    )
    op.create_index('ix_vital_signs_case_timestamp', 'vital_signs', ['case_id', 'timestamp'])

    # 2. Create anesthesia_alerts table
    op.create_table(
        'anesthesia_alerts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('case_id', sa.Integer(), sa.ForeignKey('surgical_cases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('vital_signs_id', sa.Integer(), sa.ForeignKey('vital_signs.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column('alert_type', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('message', sa.String(500), nullable=True),
        sa.Column('suggested_action', sa.Text(), nullable=True),
        sa.Column('trigger_value', sa.String(100), nullable=True),
        sa.Column('acknowledged', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('was_accurate', sa.Boolean(), nullable=True),
        sa.Column('feedback_notes', sa.Text(), nullable=True),
    )
    op.create_index('ix_anesthesia_alerts_case_created', 'anesthesia_alerts', ['case_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_anesthesia_alerts_case_created', table_name='anesthesia_alerts')
    op.drop_table('anesthesia_alerts')
    op.drop_index('ix_vital_signs_case_timestamp', table_name='vital_signs')
    op.drop_table('vital_signs')
