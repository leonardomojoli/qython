"""user_cloud_connections — Conectores de nuvem do usuário (Biblioteca Drive-first)

Revision ID: 2026_07_10_cloud_connections
Revises: 2026_06_21_drop_arena_rounds
Create Date: 2026-07-10

Fase 1 do plano Drive-first: a Biblioteca passa a guardar os ORIGINAIS na nuvem
do próprio usuário (v1: Google Drive, scope drive.file). Esta tabela guarda o
vínculo OAuth por (user, provider): refresh_token cifrado em repouso
(EncryptedString/Fernet → BYTEA), e-mail da conta, id da pasta-raiz "Qython" e
status ('active'|'revoked' — revogado preserva a linha p/ auditoria e dispara a
UX de reconexão). Access tokens nunca são persistidos.
"""
from alembic import op
import sqlalchemy as sa


revision = '2026_07_10_cloud_connections'
down_revision = '2026_06_21_drop_arena_rounds'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_cloud_connections',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(length=20), nullable=False, server_default='gdrive'),
        sa.Column('refresh_token', sa.LargeBinary(), nullable=False),  # EncryptedString (Fernet) no model
        sa.Column('account_email', sa.String(length=255), nullable=True),
        sa.Column('root_folder_id', sa.String(length=128), nullable=True),
        sa.Column('scopes', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
        sa.Column('connected_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_refresh_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('user_id', 'provider', name='uq_cloud_conn_user_provider'),
    )
    op.create_index('ix_user_cloud_connections_user_id', 'user_cloud_connections', ['user_id'])


def downgrade():
    op.drop_index('ix_user_cloud_connections_user_id', table_name='user_cloud_connections')
    op.drop_table('user_cloud_connections')
