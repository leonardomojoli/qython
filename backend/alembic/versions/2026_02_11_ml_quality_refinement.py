"""Add quality_snapshots and refinement_chains tables

Quality Decay Detection: quality_snapshots stores periodic metrics snapshots
for monitoring model collapse before fine-tuning.

Iterative Refinement Tracking: refinement_chains links original → refined
TrainingData entries so models can learn to self-improve.

Revision ID: 2026_02_11_ml_quality_refinement
Revises: 2026_02_11_add_item_type
Create Date: 2026-02-11 20:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_11_ml_quality_refinement'
down_revision = '2026_02_11_add_item_type'
branch_labels = None
depends_on = None


def upgrade():
    # Quality Decay Detection snapshots
    op.create_table(
        'quality_snapshots',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('snapshot_data', sa.JSON, nullable=False),
        sa.Column('alerts', sa.JSON, nullable=True),
        sa.Column('health_status', sa.String(20), server_default='healthy'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
    )

    # Iterative Refinement Tracking chains
    op.create_table(
        'refinement_chains',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('original_id', sa.Integer,
                  sa.ForeignKey('training_data.id'), nullable=False),
        sa.Column('refined_id', sa.Integer,
                  sa.ForeignKey('training_data.id'), nullable=False),
        sa.Column('step', sa.Integer, server_default='1', nullable=False),
        sa.Column('refinement_type', sa.String(30), nullable=False),
        sa.Column('refinement_metadata', sa.JSON, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.UniqueConstraint('original_id', 'refined_id',
                           name='uq_refinement_pair'),
    )

    op.create_index('ix_refinement_chains_original_id',
                    'refinement_chains', ['original_id'])
    op.create_index('ix_refinement_chains_refined_id',
                    'refinement_chains', ['refined_id'])


def downgrade():
    op.drop_index('ix_refinement_chains_refined_id',
                  table_name='refinement_chains')
    op.drop_index('ix_refinement_chains_original_id',
                  table_name='refinement_chains')
    op.drop_table('refinement_chains')
    op.drop_table('quality_snapshots')
