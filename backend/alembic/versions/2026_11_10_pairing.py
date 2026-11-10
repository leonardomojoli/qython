"""pareamento do celular com o desktop: códigos de uso único e aparelhos pareados

Revision ID: 2026_11_10_pairing
Revises: 2026_07_11_docs_drive_fields
Create Date: 2026-11-10

`pairing_codes`: código que o computador mostra (QR code) para o celular provar que está olhando a
tela; só o hash fica no banco, vale poucos minutos e só serve uma vez.
`paired_devices`: o celular depois do pareamento; o segredo dele (só o hash) renova tokens curtos de
acesso, e `revoked_at` corta o aparelho.
"""
from alembic import op
import sqlalchemy as sa


revision = '2026_11_10_pairing'
down_revision = '2026_07_11_docs_drive_fields'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'pairing_codes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('code_hash'),
    )
    op.create_index('ix_pairing_codes_user_id', 'pairing_codes', ['user_id'])
    op.create_table(
        'paired_devices',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('platform', sa.String(length=20), nullable=True),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('token_hash'),
    )
    op.create_index('ix_paired_devices_user_id', 'paired_devices', ['user_id'])


def downgrade():
    op.drop_index('ix_paired_devices_user_id', table_name='paired_devices')
    op.drop_table('paired_devices')
    op.drop_index('ix_pairing_codes_user_id', table_name='pairing_codes')
    op.drop_table('pairing_codes')
