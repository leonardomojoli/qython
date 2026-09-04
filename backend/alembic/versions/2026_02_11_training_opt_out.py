"""Add training data opt-out column to users

LGPD Art. 18(IV) compliance: allows users to opt out of having
their interactions collected for AI training purposes (data flywheel).

Revision ID: 2026_02_11_training_opt_out
Revises: 2026_02_11_ml_quality_refinement
Create Date: 2026-02-11 22:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_11_training_opt_out'
down_revision = '2026_02_11_ml_quality_refinement'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('training_data_opt_out', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'training_data_opt_out')
