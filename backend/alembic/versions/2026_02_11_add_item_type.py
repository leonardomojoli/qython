"""Add item_type column to medications table

Differentiates medications from supplies/devices in the pharmacy catalog.
Existing non-medication items (Fralda Geriátrica, Absorvente Higiênico) are
updated to item_type='supply'.

Revision ID: 2026_02_11_add_item_type
Revises: 2026_02_10_doctor_logo
Create Date: 2026-02-11 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_11_add_item_type'
down_revision = '2026_02_10_doctor_logo'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('medications', sa.Column('item_type', sa.String(20), server_default='medication', nullable=False))
    op.create_index('ix_medications_item_type', 'medications', ['item_type'])

    # Update existing non-medication items
    op.execute("UPDATE medications SET item_type = 'supply' WHERE therapeutic_class = 'Item não-medicamentoso'")


def downgrade() -> None:
    op.drop_index('ix_medications_item_type', table_name='medications')
    op.drop_column('medications', 'item_type')
