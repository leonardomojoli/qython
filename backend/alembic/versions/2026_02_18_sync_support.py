"""Add sync support timestamps to drug_interactions

Revision ID: 2026_02_18_sync_support
Revises: 2026_02_16_push_tokens
Create Date: 2026-02-18
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_18_sync_support'
down_revision = '2026_02_16_push_tokens'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('drug_interactions', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.add_column('drug_interactions', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()))


def downgrade():
    op.drop_column('drug_interactions', 'updated_at')
    op.drop_column('drug_interactions', 'created_at')
