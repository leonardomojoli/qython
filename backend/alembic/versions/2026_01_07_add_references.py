"""add_references_to_training_data

Revision ID: 2026_01_07_add_references
Revises: 
Create Date: 2026-01-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON


# revision identifiers, used by Alembic.
revision = '2026_01_07_add_references'
down_revision = '29185922f924'  # Update this with the actual latest revision
branch_labels = None
depends_on = None


def upgrade():
    # Add references column to training_data table
    op.add_column('training_data', 
        sa.Column('references', JSON, nullable=True)
    )


def downgrade():
    # Remove references column
    op.drop_column('training_data', 'references')
