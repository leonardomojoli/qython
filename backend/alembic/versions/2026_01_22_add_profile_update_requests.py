"""Add profile_update_requests table

Revision ID: 2026_01_22_profile
Revises: 2026_01_21_sources
Create Date: 2026-01-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '2026_01_22_profile'
down_revision = '2026_01_21_sources'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'profile_update_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('request_type', sa.String(length=50), nullable=False),
        sa.Column('current_value', sa.JSON(), nullable=False),
        sa.Column('requested_value', sa.JSON(), nullable=False),
        sa.Column('documents', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('admin_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reviewed_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_profile_update_requests_request_type'), 'profile_update_requests', ['request_type'], unique=False)
    op.create_index(op.f('ix_profile_update_requests_status'), 'profile_update_requests', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_profile_update_requests_status'), table_name='profile_update_requests')
    op.drop_index(op.f('ix_profile_update_requests_request_type'), table_name='profile_update_requests')
    op.drop_table('profile_update_requests')
