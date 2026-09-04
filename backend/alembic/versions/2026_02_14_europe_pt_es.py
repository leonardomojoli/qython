"""Europe pharmacy expansion: Portugal and Spain programs and country links

Adds 2 government programs for PT and ES (both with copayment systems),
links BR medications to those countries, and tags essential
meds to the new programs.

Revision ID: 2026_02_14_europe_pt_es
Revises: 2026_02_14_latam_expansion
Create Date: 2026-02-14
"""
from alembic import op
from sqlalchemy import text

revision = '2026_02_14_europe_pt_es'
down_revision = '2026_02_14_latam_expansion'
branch_labels = None
depends_on = None

NEW_COUNTRIES = ['pt', 'es']

EU_PROGRAMS = [
    {
        'code': 'sns_pt',
        'name': 'SNS - Comparticipação',
        'country': 'pt',
        'description': 'Sistema Nacional de Saúde — comparticipação de medicamentos por escalões: A (95%), B (69%), C (37%), D (15%). Pensionistas recebem +5-15%. Genéricos têm comparticipação majorada.',
        'legal_reference': 'Decreto-Lei 118/92',
        'website_url': 'https://www.sns.gov.pt',
        'all_items_free': False,
    },
    {
        'code': 'sns_es',
        'name': 'SNS - Prestación Farmacéutica',
        'country': 'es',
        'description': 'Sistema Nacional de Salud — aportación farmacéutica: activos 40-60%, pensionistas 10% (máximo €8-18/mes según renta), grupos exentos 0%. Medicamentos de aportación reducida con visado.',
        'legal_reference': 'Real Decreto-ley 16/2012',
        'website_url': 'https://www.sanidad.gob.es',
        'all_items_free': False,
    },
]

# Essential active principles covered by both PT and ES national health systems
ESSENTIAL_PRINCIPLES = [
    'losartana', 'enalapril', 'hidroclorotiazida', 'anlodipino',
    'atenolol', 'captopril', 'metoprolol', 'propranolol',
    'furosemida', 'espironolactona',
    'metformina', 'glibenclamida',
    'insulina nph', 'insulina regular',
    'salbutamol', 'beclometasona', 'budesonida',
    'sinvastatina', 'atorvastatina',
    'ibuprofeno', 'paracetamol', 'diclofenaco',
    'amoxicilina', 'azitromicina', 'ciprofloxacina',
    'fluoxetina', 'sertralina',
    'diazepam', 'clonazepam',
    'carbamazepina', 'haloperidol',
    'ácido acetilsalicílico', 'varfarina',
    'omeprazol',
    'levotiroxina',
    'prednisona', 'dexametasona',
    'alopurinol',
]

PROGRAM_PRINCIPLES = {
    'sns_pt': ESSENTIAL_PRINCIPLES,
    'sns_es': ESSENTIAL_PRINCIPLES,
}


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Link all BR medications to PT and ES
    for country in NEW_COUNTRIES:
        conn.execute(text("""
            INSERT INTO medication_countries (medication_id, country_code)
            SELECT id, :country FROM medications WHERE country = 'br'
            ON CONFLICT DO NOTHING
        """), {'country': country})

    # 2. Insert government programs (idempotent)
    for prog in EU_PROGRAMS:
        conn.execute(text("""
            INSERT INTO government_programs (code, name, country, description, legal_reference, website_url, is_active, all_items_free)
            VALUES (:code, :name, :country, :description, :legal_reference, :website_url, true, :all_items_free)
            ON CONFLICT (code) DO NOTHING
        """), prog)

    # 3. Link medications to programs (by active_principle match)
    for prog_code, principles in PROGRAM_PRINCIPLES.items():
        prog_id = conn.execute(
            text("SELECT id FROM government_programs WHERE code = :code"),
            {'code': prog_code}
        ).scalar()

        if not prog_id:
            continue

        for principle in principles:
            conn.execute(text("""
                INSERT INTO medication_government_programs (medication_id, program_id, copay, is_active)
                SELECT m.id, :prog_id, 0, true
                FROM medications m
                WHERE LOWER(m.active_principle) = LOWER(:principle)
                AND NOT EXISTS (
                    SELECT 1 FROM medication_government_programs mgp
                    WHERE mgp.medication_id = m.id AND mgp.program_id = :prog_id
                )
            """), {'prog_id': prog_id, 'principle': principle})


def downgrade() -> None:
    conn = op.get_bind()

    prog_codes = [p['code'] for p in EU_PROGRAMS]
    codes_str = ', '.join(f"'{c}'" for c in prog_codes)

    # Remove program links
    conn.execute(text(f"""
        DELETE FROM medication_government_programs
        WHERE program_id IN (SELECT id FROM government_programs WHERE code IN ({codes_str}))
    """))

    # Remove programs
    conn.execute(text(f"""
        DELETE FROM government_programs WHERE code IN ({codes_str})
    """))

    # Remove country links for PT and ES
    for country in NEW_COUNTRIES:
        conn.execute(text("""
            DELETE FROM medication_countries WHERE country_code = :country
        """), {'country': country})
