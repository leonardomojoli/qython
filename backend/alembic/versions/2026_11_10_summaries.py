"""conversation_summaries para quem criou o banco sem ela

Revision ID: 2026_11_10_summaries
Revises: 2026_11_10_pairing
Create Date: 2026-11-10

A tabela nasceu numa migration antiga (2026_01_08_add_summaries), mas o modelo `ConversationSummary` nunca
chegou ao models.py. Bancos criados pelos modelos (Docker e app desktop, que não rodam a cadeia histórica)
ficaram sem ela, e o resumo de conversa longa do copiloto quebrava com ImportError. Agora o modelo existe
(banco novo a cria) e esta migration cria a tabela nos bancos que já estavam de pé; onde ela já existe, nada muda.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import TEXT, TIMESTAMP


revision = '2026_11_10_summaries'
down_revision = '2026_11_10_pairing'
branch_labels = None
depends_on = None


def upgrade():
    if sa.inspect(op.get_bind()).has_table('conversation_summaries'):
        return
    op.create_table(
        'conversation_summaries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('messages_up_to', sa.Integer(), nullable=False),
        sa.Column('summary_text', TEXT, nullable=False),
        sa.Column('token_count', sa.Integer(), nullable=True),
        sa.Column('created_at', TIMESTAMP, server_default=sa.text('NOW()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['session_id'], ['chat_sessions.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_conversation_summaries_session_id', 'conversation_summaries', ['session_id'])


def downgrade():
    # Não remove: a tabela pode vir da migration antiga e ter dados.
    pass
