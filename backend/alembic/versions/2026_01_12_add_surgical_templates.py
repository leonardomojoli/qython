# backend/alembic/versions/2026_01_12_add_surgical_templates.py
"""Add surgical_templates table

Revision ID: 2026_01_12_templates
Revises: 2026_01_10_consult_enhance
Create Date: 2026-01-12

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '2026_01_12_templates'
down_revision = '2026_01_10_consult_enhance'
branch_labels = None
depends_on = None


def upgrade():
    # Create surgical_templates table
    op.create_table('surgical_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('scope', sa.String(length=20), nullable=False, server_default='user'),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('specialty', sa.String(length=100), nullable=True),
        sa.Column('procedure_type', sa.String(length=100), nullable=True),
        sa.Column('anesthesia_type', sa.String(length=50), nullable=True),
        sa.Column('template_content', sa.Text(), nullable=False),
        sa.Column('language', sa.String(length=10), nullable=True, server_default='pt-BR'),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('usage_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'name', name='uq_user_template_name')
    )

    # Create indexes for faster queries
    op.create_index('ix_surgical_templates_scope', 'surgical_templates', ['scope'])
    op.create_index('ix_surgical_templates_specialty', 'surgical_templates', ['specialty'])


def downgrade():
    # Drop indexes first
    op.drop_index('ix_surgical_templates_specialty', table_name='surgical_templates')
    op.drop_index('ix_surgical_templates_scope', table_name='surgical_templates')

    # Drop table
    op.drop_table('surgical_templates')
