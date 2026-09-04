"""Add content_hash column to training_data table

Revision ID: 2024_12_28_add_content_hash
Revises: 
Create Date: 2024-12-28

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2024_12_28_add_content_hash'
down_revision = '784aaa0d5fea'
branch_labels = None
depends_on = None


def upgrade():
    # Add content_hash column for deduplication
    op.add_column('training_data', 
        sa.Column('content_hash', sa.String(32), nullable=True)
    )
    
    # Create unique index for deduplication
    op.create_index(
        'ix_training_data_content_hash', 
        'training_data', 
        ['content_hash'], 
        unique=True
    )


def downgrade():
    op.drop_index('ix_training_data_content_hash', table_name='training_data')
    op.drop_column('training_data', 'content_hash')
