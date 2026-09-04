"""Add Chile government programs and link BR meds to CL

Revision ID: 2026_02_09_cl_programs
Revises: 2026_02_09_py_programs
Create Date: 2026-02-09

"""
from alembic import op
from sqlalchemy import text

revision = '2026_02_09_cl_programs'
down_revision = '2026_02_09_py_programs'
branch_labels = None
depends_on = None

# Chile government programs
CL_PROGRAMS = [
    {
        'code': 'fofar',
        'name': 'FOFAR - Fondo de Farmacia',
        'country': 'cl',
        'description': 'Programa del MINSAL que entrega medicamentos gratuitos a afiliados FONASA para hipertensión arterial, diabetes tipo 2 y dislipidemia en Centros de Atención Primaria.',
        'legal_reference': 'Resolución Exenta N° 535/2014 MINSAL',
        'website_url': 'https://www.minsal.cl/fofar/',
        'all_items_free': True,
    },
    {
        'code': 'ges_auge',
        'name': 'GES/AUGE - Garantías Explícitas en Salud',
        'country': 'cl',
        'description': 'Sistema universal que garantiza acceso a diagnóstico, tratamiento y medicamentos para 90 patologías. Copago máximo 20% del arancel de referencia. Más de 1.300 medicamentos cubiertos.',
        'legal_reference': 'Ley 19.966; D.S. N° 29/2025 MINSAL',
        'website_url': 'https://www.superdesalud.gob.cl/tax-temas-de-orientacion/garantias-explicitas-en-salud-ges-1962/',
        'all_items_free': False,
    },
    {
        'code': 'ricarte_soto',
        'name': 'Ley Ricarte Soto',
        'country': 'cl',
        'description': 'Protección financiera universal con cobertura 100% gratuita de medicamentos de alto costo para 27 enfermedades graves, raras o de alto costo.',
        'legal_reference': 'Ley N° 20.850/2015',
        'website_url': 'https://www.superdesalud.gob.cl/tax-temas-de-orientacion/ley-ricarte-soto-6088/',
        'all_items_free': True,
    },
]

# Active principles covered by FOFAR (free for hypertension, diabetes, dyslipidemia)
FOFAR_PRINCIPLES = [
    # Hypertension
    'amlodipino', 'atenolol', 'carvedilol', 'enalapril', 'espironolactona',
    'furosemida', 'hidroclorotiazida', 'losartana', 'propranolol',
    # Diabetes
    'glibenclamida', 'metformina',
    # Dyslipidemia
    'atorvastatina',
    # Antiplatelet (cardiovascular prevention)
    'ácido acetilsalicílico',
]


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Link all BR medications to CL (shared essential catalog)
    conn.execute(text("""
        INSERT INTO medication_countries (medication_id, country_code)
        SELECT id, 'cl' FROM medications WHERE country = 'br'
        ON CONFLICT DO NOTHING
    """))

    # 2. Insert Chile government programs
    for prog in CL_PROGRAMS:
        conn.execute(text("""
            INSERT INTO government_programs (code, name, country, description, legal_reference, website_url, is_active, all_items_free)
            VALUES (:code, :name, :country, :description, :legal_reference, :website_url, true, :all_items_free)
            ON CONFLICT (code) DO NOTHING
        """), prog)

    # 3. Link FOFAR-covered medications (by active_principle match)
    fofar_id = conn.execute(
        text("SELECT id FROM government_programs WHERE code = 'fofar'")
    ).scalar()

    if fofar_id:
        for principle in FOFAR_PRINCIPLES:
            conn.execute(text("""
                INSERT INTO medication_government_programs (medication_id, program_id, copay, is_active)
                SELECT m.id, :prog_id, 0, true
                FROM medications m
                WHERE LOWER(m.active_principle) = LOWER(:principle)
                AND NOT EXISTS (
                    SELECT 1 FROM medication_government_programs mgp
                    WHERE mgp.medication_id = m.id AND mgp.program_id = :prog_id
                )
            """), {'prog_id': fofar_id, 'principle': principle})


def downgrade() -> None:
    conn = op.get_bind()

    # Remove CL program links
    conn.execute(text("""
        DELETE FROM medication_government_programs
        WHERE program_id IN (SELECT id FROM government_programs WHERE code IN ('fofar', 'ges_auge', 'ricarte_soto'))
    """))

    # Remove CL programs
    conn.execute(text("""
        DELETE FROM government_programs WHERE code IN ('fofar', 'ges_auge', 'ricarte_soto')
    """))

    # Remove CL country links
    conn.execute(text("""
        DELETE FROM medication_countries WHERE country_code = 'cl'
    """))
