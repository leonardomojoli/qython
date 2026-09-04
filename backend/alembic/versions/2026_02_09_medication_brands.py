"""Add medication_brands table for country-specific brand names

Revision ID: 2026_02_09_med_brands
Revises: 2026_02_09_br_to_uy
Create Date: 2026-02-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = '2026_02_09_med_brands'
down_revision = '2026_02_09_br_to_uy'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create medication_brands table
    op.create_table(
        'medication_brands',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('medication_id', sa.Integer(), sa.ForeignKey('medications.id', ondelete='CASCADE'), nullable=False),
        sa.Column('country_code', sa.String(5), nullable=False),
        sa.Column('brand_names', sa.Text(), nullable=False),
        sa.UniqueConstraint('medication_id', 'country_code', name='uq_medication_brand_country'),
    )
    op.create_index('ix_medication_brands_lookup', 'medication_brands', ['medication_id', 'country_code'])

    # Migrate existing common_brands data: each medication gets a brand entry for its origin country
    op.execute(text("""
        INSERT INTO medication_brands (medication_id, country_code, brand_names)
        SELECT id, country, common_brands
        FROM medications
        WHERE common_brands IS NOT NULL AND common_brands != ''
    """))


def downgrade() -> None:
    op.drop_index('ix_medication_brands_lookup', table_name='medication_brands')
    op.drop_table('medication_brands')
