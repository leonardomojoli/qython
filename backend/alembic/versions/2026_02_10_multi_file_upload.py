"""Widen file_name column for multi-file upload

Changes file_name from VARCHAR(255) to TEXT to support
JSON arrays of multiple filenames per message.

Revision ID: 2026_02_10_multi_file_upload
Revises: 2026_02_10_chat_file_name
Create Date: 2026-02-10 21:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_10_multi_file_upload'
down_revision = '2026_02_10_chat_file_name'
branch_labels = None
depends_on = None

def upgrade():
    op.alter_column('chat_messages', 'file_name',
                     type_=sa.Text(),
                     existing_type=sa.String(255),
                     existing_nullable=True)

def downgrade():
    op.alter_column('chat_messages', 'file_name',
                     type_=sa.String(255),
                     existing_type=sa.Text(),
                     existing_nullable=True)
