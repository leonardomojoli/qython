"""Add clinical reference fields to medications

Revision ID: 2026_02_09_clinical_info
Revises: 2026_02_09_gov_programs
Create Date: 2026-02-09

"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_09_clinical_info'
down_revision = '2026_02_09_gov_programs'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('medications', sa.Column('common_brands', sa.Text(), nullable=True))
    op.add_column('medications', sa.Column('administration_route', sa.String(100), nullable=True))
    op.add_column('medications', sa.Column('usual_posology', sa.Text(), nullable=True))
    op.add_column('medications', sa.Column('max_daily_dose', sa.String(255), nullable=True))
    op.add_column('medications', sa.Column('common_indications', sa.Text(), nullable=True))
    op.add_column('medications', sa.Column('pregnancy_category', sa.String(5), nullable=True))
    op.add_column('medications', sa.Column('renal_adjustment', sa.Boolean(), server_default='false'))
    op.add_column('medications', sa.Column('hepatic_adjustment', sa.Boolean(), server_default='false'))


def downgrade() -> None:
    op.drop_column('medications', 'hepatic_adjustment')
    op.drop_column('medications', 'renal_adjustment')
    op.drop_column('medications', 'pregnancy_category')
    op.drop_column('medications', 'common_indications')
    op.drop_column('medications', 'max_daily_dose')
    op.drop_column('medications', 'usual_posology')
    op.drop_column('medications', 'administration_route')
    op.drop_column('medications', 'common_brands')
