"""add training_data engagement fields for DPO/curriculum learning

Revision ID: 2026_01_18_training_engagement
Revises: 3ddb6af77d22
Create Date: 2026-01-18

Adds new fields to training_data table for:
- difficulty_score: Curriculum learning support (0.0-1.0)
- regeneration_count: How many times user regenerated response
- time_to_first_edit_ms: Engagement metric
- total_edit_time_ms: Engagement metric
- accepted_without_edit: Whether user accepted AI output as-is
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2026_01_18_training_engagement'
down_revision = '3ddb6af77d22'
branch_labels = None
depends_on = None


def upgrade():
    # Add curriculum learning field
    op.add_column('training_data', sa.Column('difficulty_score', sa.Float(), nullable=True))

    # Add engagement metrics fields
    op.add_column('training_data', sa.Column('regeneration_count', sa.Integer(), server_default='0', nullable=True))
    op.add_column('training_data', sa.Column('time_to_first_edit_ms', sa.Integer(), nullable=True))
    op.add_column('training_data', sa.Column('total_edit_time_ms', sa.Integer(), nullable=True))
    op.add_column('training_data', sa.Column('accepted_without_edit', sa.Boolean(), nullable=True))


def downgrade():
    op.drop_column('training_data', 'accepted_without_edit')
    op.drop_column('training_data', 'total_edit_time_ms')
    op.drop_column('training_data', 'time_to_first_edit_ms')
    op.drop_column('training_data', 'regeneration_count')
    op.drop_column('training_data', 'difficulty_score')
