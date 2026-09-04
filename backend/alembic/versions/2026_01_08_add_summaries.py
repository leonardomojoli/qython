"""add_conversation_summaries_table

Revision ID: 2026_01_08_add_summaries
Revises: 2026_01_07_add_references
Create Date: 2026-01-08

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import TEXT, TIMESTAMP


# revision identifiers, used by Alembic.
revision = '2026_01_08_add_summaries'
down_revision = '2026_01_07_add_references'
branch_labels = None
depends_on = None


def upgrade():
    # Create conversation_summaries table
    op.create_table(
        'conversation_summaries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('messages_up_to', sa.Integer(), nullable=False),  # Message count when summary was created
        sa.Column('summary_text', TEXT, nullable=False),
        sa.Column('token_count', sa.Integer(), nullable=True),  # Estimated tokens in summary
        sa.Column('created_at', TIMESTAMP, server_default=sa.text('NOW()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['session_id'], ['chat_sessions.id'], ondelete='CASCADE')
    )
    
    # Create index for faster lookups
    op.create_index('ix_conversation_summaries_session_id', 'conversation_summaries', ['session_id'])


def downgrade():
    op.drop_index('ix_conversation_summaries_session_id', table_name='conversation_summaries')
    op.drop_table('conversation_summaries')
