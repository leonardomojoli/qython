"""Add ML pipeline columns to training_data

New columns for training data pipeline:
- creation_method: 'human', 'ai_generated', 'hybrid'
- generation_number: data provenance (0=human, 1=first AI gen)
- bloom_level: Bloom's taxonomy for curriculum learning
- is_evaluation_holdout: held-out eval set flag
- pii_detected: PII detection flag

Revision ID: 2026_02_10_ml_enhancements
Revises: 2026_02_10_sus_programs
Create Date: 2026-02-10 18:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_10_ml_enhancements'
down_revision = '2026_02_10_sus_programs'


def upgrade():
    op.add_column('training_data', sa.Column('creation_method', sa.String(20), nullable=True))
    op.add_column('training_data', sa.Column('generation_number', sa.Integer(), server_default='0'))
    op.add_column('training_data', sa.Column('bloom_level', sa.String(20), nullable=True))
    op.add_column('training_data', sa.Column('is_evaluation_holdout', sa.Boolean(), server_default='false'))
    op.add_column('training_data', sa.Column('pii_detected', sa.Boolean(), server_default='false'))

    # Indexes for filtering during export
    op.create_index('ix_training_data_creation_method', 'training_data', ['creation_method'])
    op.create_index('ix_training_data_bloom_level', 'training_data', ['bloom_level'])
    op.create_index('ix_training_data_is_evaluation_holdout', 'training_data', ['is_evaluation_holdout'])
    op.create_index('ix_training_data_pii_detected', 'training_data', ['pii_detected'])


def downgrade():
    op.drop_index('ix_training_data_pii_detected', table_name='training_data')
    op.drop_index('ix_training_data_is_evaluation_holdout', table_name='training_data')
    op.drop_index('ix_training_data_bloom_level', table_name='training_data')
    op.drop_index('ix_training_data_creation_method', table_name='training_data')

    op.drop_column('training_data', 'pii_detected')
    op.drop_column('training_data', 'is_evaluation_holdout')
    op.drop_column('training_data', 'bloom_level')
    op.drop_column('training_data', 'generation_number')
    op.drop_column('training_data', 'creation_method')
