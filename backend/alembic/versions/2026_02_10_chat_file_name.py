"""Add file_name column to chat_messages

Stores the original filename of attached documents/images
so the UI can display a file attachment indicator in chat history.

Revision ID: 2026_02_10_chat_file_name
Revises: 2026_02_10_ml_enhancements
Create Date: 2026-02-10 20:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_10_chat_file_name'
down_revision = '2026_02_10_ml_enhancements'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('chat_messages', sa.Column('file_name', sa.String(255), nullable=True))

def downgrade():
    op.drop_column('chat_messages', 'file_name')
