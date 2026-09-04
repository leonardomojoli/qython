# backend/alembic/versions/2026_01_16_add_patient_address.py
"""Add address field to patients table

Revision ID: 2026_01_16_patient_addr
Revises: 2026_01_16_patient_i18n
Create Date: 2026-01-16

Adds address field to patients table for family medicine use cases.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '2026_01_16_patient_addr'
down_revision = '2026_01_16_patient_i18n'
branch_labels = None
depends_on = None


def column_exists(table_name, column_name):
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade():
    # Add address column to patients table
    if not column_exists('patients', 'address'):
        op.add_column('patients', sa.Column('address', sa.String(500), nullable=True))


def downgrade():
    # Remove address column
    if column_exists('patients', 'address'):
        op.drop_column('patients', 'address')
