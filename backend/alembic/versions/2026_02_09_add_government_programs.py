"""Add government programs tables and country to medications

Revision ID: 2026_02_09_gov_programs
Revises: 2026_02_08_pharmacy
Create Date: 2026-02-09

"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_09_gov_programs'
down_revision = '2026_02_08_pharmacy'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Government programs table
    op.create_table('government_programs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('country', sa.String(5), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('legal_reference', sa.String(500), nullable=True),
        sa.Column('website_url', sa.String(500), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('all_items_free', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    op.create_index('ix_government_programs_code', 'government_programs', ['code'])
    op.create_index('ix_government_programs_country', 'government_programs', ['country'])

    # Junction table: medication <-> government program
    op.create_table('medication_government_programs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('medication_id', sa.Integer(), nullable=False),
        sa.Column('program_id', sa.Integer(), nullable=False),
        sa.Column('copay', sa.Float(), server_default='0'),
        sa.Column('max_quantity_per_month', sa.String(100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['medication_id'], ['medications.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['program_id'], ['government_programs.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('medication_id', 'program_id', name='uq_medication_program'),
    )

    # Add country column to medications
    op.add_column('medications', sa.Column('country', sa.String(5), server_default='br', nullable=False))
    op.create_index('ix_medications_country', 'medications', ['country'])

    # --- Data migration ---

    # Insert Farmácia Popular program
    op.execute("""
        INSERT INTO government_programs (code, name, country, description, legal_reference, website_url, is_active, all_items_free)
        VALUES (
            'farmacia_popular',
            'Farmácia Popular do Brasil',
            'br',
            'Programa do governo federal que disponibiliza medicamentos essenciais gratuitamente em farmácias credenciadas.',
            'Portaria GM/MS 6.613/2025',
            'https://www.gov.br/saude/pt-br/composicao/sctie/daf/programa-farmacia-popular',
            true,
            true
        )
    """)

    # Populate junction table from existing FP medications
    op.execute("""
        INSERT INTO medication_government_programs (medication_id, program_id, copay, is_active)
        SELECT m.id, gp.id, 0, true
        FROM medications m
        CROSS JOIN government_programs gp
        WHERE m.farmacia_popular = true AND gp.code = 'farmacia_popular'
    """)

    # Update all FP medications to copay=0 (everything is free since Feb 2025)
    op.execute("""
        UPDATE medications SET farmacia_popular_copay = 0
        WHERE farmacia_popular = true
    """)


def downgrade() -> None:
    op.drop_index('ix_medications_country', table_name='medications')
    op.drop_column('medications', 'country')
    op.drop_table('medication_government_programs')
    op.drop_index('ix_government_programs_country', table_name='government_programs')
    op.drop_index('ix_government_programs_code', table_name='government_programs')
    op.drop_table('government_programs')
