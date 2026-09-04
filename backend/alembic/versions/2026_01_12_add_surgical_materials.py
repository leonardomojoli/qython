# backend/alembic/versions/2026_01_12_add_surgical_materials.py
"""Add surgical_materials and frequent_materials tables

Revision ID: 2026_01_12_materials
Revises: 2026_01_12_templates
Create Date: 2026-01-12

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '2026_01_12_materials'
down_revision = '2026_01_12_templates'
branch_labels = None
depends_on = None


def upgrade():
    # Create surgical_materials table
    op.create_table('surgical_materials',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('manufacturer', sa.String(length=255), nullable=True),
        sa.Column('udi_code', sa.String(length=100), nullable=True),
        sa.Column('lot_number', sa.String(length=50), nullable=True),
        sa.Column('serial_number', sa.String(length=50), nullable=True),
        sa.Column('expiration_date', sa.DateTime(), nullable=True),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=True, server_default='1'),
        sa.Column('unit', sa.String(length=20), nullable=True, server_default='un'),
        sa.Column('is_billable', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('unit_cost', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['case_id'], ['surgical_cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for surgical_materials
    op.create_index('ix_surgical_materials_udi_code', 'surgical_materials', ['udi_code'])
    op.create_index('ix_surgical_materials_category', 'surgical_materials', ['category'])
    op.create_index('ix_surgical_materials_case_id', 'surgical_materials', ['case_id'])

    # Create frequent_materials table
    op.create_table('frequent_materials',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('default_quantity', sa.Integer(), nullable=True, server_default='1'),
        sa.Column('default_unit', sa.String(length=20), nullable=True, server_default='un'),
        sa.Column('usage_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('last_used', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'name', name='uq_user_material_name')
    )

    # Create index for frequent_materials
    op.create_index('ix_frequent_materials_user_id', 'frequent_materials', ['user_id'])


def downgrade():
    # Drop indexes
    op.drop_index('ix_frequent_materials_user_id', table_name='frequent_materials')
    op.drop_index('ix_surgical_materials_case_id', table_name='surgical_materials')
    op.drop_index('ix_surgical_materials_category', table_name='surgical_materials')
    op.drop_index('ix_surgical_materials_udi_code', table_name='surgical_materials')

    # Drop tables
    op.drop_table('frequent_materials')
    op.drop_table('surgical_materials')
