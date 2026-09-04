"""Add notifications table and user notification preferences

Revision ID: 2026_02_20_add_notifications
Revises: 2026_02_18_sync_support
Create Date: 2026-02-20
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_20_add_notifications'
down_revision = '2026_02_18_sync_support'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('data', sa.JSON(), nullable=True),
        sa.Column('is_read', sa.Boolean(), default=False, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('ix_notifications_type', 'notifications', ['type'])
    op.create_index('ix_notifications_created_at', 'notifications', ['created_at'])

    op.add_column('users', sa.Column('notification_preferences', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'notification_preferences')
    op.drop_index('ix_notifications_created_at', table_name='notifications')
    op.drop_index('ix_notifications_type', table_name='notifications')
    op.drop_index('ix_notifications_user_id', table_name='notifications')
    op.drop_table('notifications')
