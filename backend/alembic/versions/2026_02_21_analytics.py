"""Add user_activity table, last_login_at and email_tracking to users

Revision ID: 2026_02_21_analytics
Revises: 2026_02_20_add_notifications
Create Date: 2026-02-21
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_21_analytics'
down_revision = '2026_02_20_add_notifications'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add columns to users
    op.add_column('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('email_tracking', sa.JSON(), nullable=True))
    op.create_index('ix_users_last_login_at', 'users', ['last_login_at'])

    # Create user_activity table
    op.create_table(
        'user_activity',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('feature', sa.String(30), nullable=False),
        sa.Column('action', sa.String(30), nullable=False),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_user_activity_user_id', 'user_activity', ['user_id'])
    op.create_index('ix_user_activity_feature', 'user_activity', ['feature'])
    op.create_index('ix_user_activity_created_at', 'user_activity', ['created_at'])
    op.create_index('ix_user_activity_user_feature_created', 'user_activity', ['user_id', 'feature', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_user_activity_user_feature_created', table_name='user_activity')
    op.drop_index('ix_user_activity_created_at', table_name='user_activity')
    op.drop_index('ix_user_activity_feature', table_name='user_activity')
    op.drop_index('ix_user_activity_user_id', table_name='user_activity')
    op.drop_table('user_activity')
    op.drop_index('ix_users_last_login_at', table_name='users')
    op.drop_column('users', 'email_tracking')
    op.drop_column('users', 'last_login_at')
