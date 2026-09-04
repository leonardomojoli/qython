# backend/alembic/versions/2026_01_16_patient_internationalization.py
"""Add patient country field and rename cpf to document_id

Revision ID: 2026_01_16_patient_i18n
Revises: 2d40c4ab1984
Create Date: 2026-01-16

This migration adds internationalization support for patient registration:
- Adds 'country' column to store patient nationality (br, co, ar, mx, etc.)
- Renames 'cpf' to 'document_id' for generic national ID support
- Increases document_id size to 30 characters to support various formats
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '2026_01_16_patient_i18n'
down_revision = '2d40c4ab1984'
branch_labels = None
depends_on = None


def column_exists(table_name, column_name):
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade():
    # Add country column to patients table
    if not column_exists('patients', 'country'):
        op.add_column('patients', sa.Column('country', sa.String(5), nullable=True))

    # Rename cpf to document_id (if cpf exists)
    if column_exists('patients', 'cpf') and not column_exists('patients', 'document_id'):
        op.alter_column('patients', 'cpf', new_column_name='document_id')

    # Alter document_id column to support longer IDs (30 chars)
    if column_exists('patients', 'document_id'):
        op.alter_column('patients', 'document_id',
                       type_=sa.String(30),
                       existing_type=sa.String(14),
                       existing_nullable=True)

    # Set default country for existing patients (Brazil)
    op.execute("UPDATE patients SET country = 'br' WHERE country IS NULL")


def downgrade():
    # Revert document_id size
    if column_exists('patients', 'document_id'):
        op.alter_column('patients', 'document_id',
                       type_=sa.String(14),
                       existing_type=sa.String(30),
                       existing_nullable=True)

    # Rename document_id back to cpf
    if column_exists('patients', 'document_id') and not column_exists('patients', 'cpf'):
        op.alter_column('patients', 'document_id', new_column_name='cpf')

    # Drop country column
    if column_exists('patients', 'country'):
        op.drop_column('patients', 'country')
