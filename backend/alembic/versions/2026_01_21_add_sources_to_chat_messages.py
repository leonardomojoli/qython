"""add sources column to chat_messages for grounding

Revision ID: 2026_01_21_sources
Revises: 2026_01_18_training_engagement
Create Date: 2026-01-21

Adds sources column to chat_messages table to store
Google Search Grounding sources (bibliographic references).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2026_01_21_sources'
down_revision = '2026_01_18_training_engagement'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('chat_messages', sa.Column('sources', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('chat_messages', 'sources')
