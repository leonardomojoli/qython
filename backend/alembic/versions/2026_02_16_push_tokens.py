"""Add push_tokens table for mobile push notifications (FCM/APNs)

Revision ID: 2026_02_16_push_tokens
Revises: 2026_02_15_northamerica_oceania
Create Date: 2026-02-16
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_16_push_tokens'
down_revision = '2026_02_15_northamerica_oceania'


def upgrade():
    op.create_table(
        'push_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('token', sa.String(500), nullable=False),
        sa.Column('platform', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_used_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'token', name='uq_push_tokens_user_token'),
    )


def downgrade():
    op.drop_table('push_tokens')
