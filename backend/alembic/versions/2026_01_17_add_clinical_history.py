# backend/alembic/versions/2026_01_17_add_clinical_history.py
"""Add clinical_history fields to patients table

Revision ID: 2026_01_17_clinical_history
Revises: 2026_01_16_patient_addr
Create Date: 2026-01-17

Adds clinical_history and clinical_history_parsed fields to patients table
for importing external consultation history from UBS and other clinics.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '2026_01_17_clinical_history'
down_revision = '2026_01_16_patient_addr'
branch_labels = None
depends_on = None


def column_exists(table_name, column_name):
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade():
    # Add clinical_history column (raw text)
    if not column_exists('patients', 'clinical_history'):
        op.add_column('patients', sa.Column('clinical_history', sa.Text(), nullable=True))

    # Add clinical_history_parsed column (JSON - structured by AI)
    if not column_exists('patients', 'clinical_history_parsed'):
        op.add_column('patients', sa.Column('clinical_history_parsed', sa.JSON(), nullable=True))


def downgrade():
    # Remove clinical_history_parsed column
    if column_exists('patients', 'clinical_history_parsed'):
        op.drop_column('patients', 'clinical_history_parsed')

    # Remove clinical_history column
    if column_exists('patients', 'clinical_history'):
        op.drop_column('patients', 'clinical_history')
