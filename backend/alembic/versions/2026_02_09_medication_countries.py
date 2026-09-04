"""Add medication_countries junction table and Argentina programs

Revision ID: 2026_02_09_med_countries
Revises: 2026_02_09_clinical_info
Create Date: 2026-02-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = '2026_02_09_med_countries'
down_revision = '2026_02_09_clinical_info'
branch_labels = None
depends_on = None

# Argentina government programs
AR_PROGRAMS = [
    {
        'code': 'remediar',
        'name': 'Programa Nacional REMEDIAR',
        'country': 'ar',
        'description': 'Provisión gratuita de medicamentos esenciales a través de 7.800+ centros de salud públicos.',
        'legal_reference': 'Decreto 2724/2002 Art. 10; Resolución MS 248/2020',
        'website_url': 'https://www.argentina.gob.ar/salud/remediar',
        'all_items_free': True,
    },
    {
        'code': 'pami',
        'name': 'PAMI - Jubilados y Pensionados',
        'country': 'ar',
        'description': 'Cobertura del 50-100% en medicamentos para jubilados y pensionados según patología e ingresos.',
        'legal_reference': 'Ley 19.032 (1971)',
        'website_url': 'https://www.pami.org.ar/',
        'all_items_free': False,
    },
    {
        'code': 'incluir_salud',
        'name': 'Incluir Salud (ex-PROFE)',
        'country': 'ar',
        'description': 'Cobertura gratuita para titulares de pensiones no contributivas.',
        'legal_reference': 'Decreto 160/2018',
        'website_url': 'https://www.argentina.gob.ar/andis/acceder-al-programa-federal-incluir-salud',
        'all_items_free': True,
    },
]

# Active principles covered by REMEDIAR (key essential meds)
REMEDIAR_PRINCIPLES = [
    'paracetamol', 'ibuprofeno', 'enalapril', 'atenolol',
    'hidroclorotiazida', 'amlodipino', 'metformina', 'glibenclamida',
    'salbutamol', 'beclometasona', 'amoxicilina', 'azitromicina',
    'ciprofloxacina', 'metronidazol', 'losartana', 'captopril',
    'omeprazol', 'ranitidina', 'dipirona', 'diclofenaco',
    'loratadina', 'cetirizina', 'prednisona', 'sulfato ferroso',
    'ácido fólico',
]


def upgrade() -> None:
    # 1. Create medication_countries junction table
    op.create_table(
        'medication_countries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('medication_id', sa.Integer(), sa.ForeignKey('medications.id', ondelete='CASCADE'), nullable=False),
        sa.Column('country_code', sa.String(5), nullable=False),
        sa.UniqueConstraint('medication_id', 'country_code', name='uq_medication_country'),
    )
    op.create_index('ix_medication_countries_country_code', 'medication_countries', ['country_code'])

    conn = op.get_bind()

    # 2. Populate from existing medications.country
    conn.execute(text("""
        INSERT INTO medication_countries (medication_id, country_code)
        SELECT id, country FROM medications
        ON CONFLICT DO NOTHING
    """))

    # 3. Link all BR medications to AR as well (same essential meds available)
    conn.execute(text("""
        INSERT INTO medication_countries (medication_id, country_code)
        SELECT id, 'ar' FROM medications WHERE country = 'br'
        ON CONFLICT DO NOTHING
    """))

    # 4. Insert Argentina government programs
    for prog in AR_PROGRAMS:
        conn.execute(text("""
            INSERT INTO government_programs (code, name, country, description, legal_reference, website_url, is_active, all_items_free)
            VALUES (:code, :name, :country, :description, :legal_reference, :website_url, true, :all_items_free)
            ON CONFLICT (code) DO NOTHING
        """), prog)

    # 5. Link REMEDIAR-covered medications (by active_principle match)
    remediar_id = conn.execute(
        text("SELECT id FROM government_programs WHERE code = 'remediar'")
    ).scalar()

    if remediar_id:
        for principle in REMEDIAR_PRINCIPLES:
            conn.execute(text("""
                INSERT INTO medication_government_programs (medication_id, program_id, copay, is_active)
                SELECT m.id, :prog_id, 0, true
                FROM medications m
                WHERE LOWER(m.active_principle) = LOWER(:principle)
                AND NOT EXISTS (
                    SELECT 1 FROM medication_government_programs mgp
                    WHERE mgp.medication_id = m.id AND mgp.program_id = :prog_id
                )
            """), {'prog_id': remediar_id, 'principle': principle})


def downgrade() -> None:
    conn = op.get_bind()

    # Remove AR program links
    conn.execute(text("""
        DELETE FROM medication_government_programs
        WHERE program_id IN (SELECT id FROM government_programs WHERE code IN ('remediar', 'pami', 'incluir_salud'))
    """))

    # Remove AR programs
    conn.execute(text("""
        DELETE FROM government_programs WHERE code IN ('remediar', 'pami', 'incluir_salud')
    """))

    op.drop_index('ix_medication_countries_country_code', 'medication_countries')
    op.drop_table('medication_countries')
