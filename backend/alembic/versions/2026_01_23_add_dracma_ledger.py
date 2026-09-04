"""Add dracma_ledger table for expiration tracking

Revision ID: 2026_01_23_ledger
Revises: 2026_01_22_profile
Create Date: 2026-01-23

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '2026_01_23_ledger'
down_revision = '2026_01_22_profile'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'dracma_ledger',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('remaining', sa.Float(), nullable=False),
        sa.Column('source', sa.String(length=30), nullable=False),
        sa.Column('transaction_id', sa.Integer(), nullable=True),
        sa.Column('acquired_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('consumed_at', sa.DateTime(), nullable=True),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('expiration_notified_30d', sa.Boolean(), default=False),
        sa.Column('expiration_notified_7d', sa.Boolean(), default=False),
        sa.Column('expiration_notified_1d', sa.Boolean(), default=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id']),
        sa.PrimaryKeyConstraint('id')
    )
    # Indexes for common queries
    op.create_index('ix_dracma_ledger_source', 'dracma_ledger', ['source'], unique=False)
    op.create_index('ix_dracma_ledger_status', 'dracma_ledger', ['status'], unique=False)
    op.create_index('ix_dracma_ledger_expires_at', 'dracma_ledger', ['expires_at'], unique=False)
    op.create_index('ix_dracma_ledger_user_active', 'dracma_ledger', ['user_id', 'status'], unique=False)
    op.create_index('ix_dracma_ledger_expiration', 'dracma_ledger', ['expires_at', 'status'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_dracma_ledger_expiration', table_name='dracma_ledger')
    op.drop_index('ix_dracma_ledger_user_active', table_name='dracma_ledger')
    op.drop_index('ix_dracma_ledger_expires_at', table_name='dracma_ledger')
    op.drop_index('ix_dracma_ledger_status', table_name='dracma_ledger')
    op.drop_index('ix_dracma_ledger_source', table_name='dracma_ledger')
    op.drop_table('dracma_ledger')
