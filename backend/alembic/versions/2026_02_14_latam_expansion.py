"""LATAM pharmacy expansion: BO, CO, MX, PE, EC programs and country links

Adds 6 government programs for 5 new LATAM countries,
links BR medications to those countries, and tags essential
meds to the new programs.

Revision ID: 2026_02_14_latam_expansion
Revises: 2026_02_13_anesthesia_monitoring
Create Date: 2026-02-14
"""
from alembic import op
from sqlalchemy import text

revision = '2026_02_14_latam_expansion'
down_revision = '2026_02_13_anesthesia_monitoring'
branch_labels = None
depends_on = None

NEW_COUNTRIES = ['bo', 'co', 'mx', 'pe', 'ec']

LATAM_PROGRAMS = [
    {
        'code': 'sus_bo',
        'name': 'Sistema Único de Salud',
        'country': 'bo',
        'description': 'Sistema Único de Salud (Ley 1152/2019). Cobertura universal e gratuita com 777 medicamentos essenciais (LINAME).',
        'legal_reference': 'Ley 1152 de 2019',
        'website_url': 'https://www.minsalud.gob.bo',
        'all_items_free': True,
    },
    {
        'code': 'pbs_co',
        'name': 'Plan de Beneficios en Salud (PBS)',
        'country': 'co',
        'description': 'Plan de Beneficios en Salud com cobertura de 8300+ códigos de medicamentos via EPS (contributivo e subsidiado).',
        'legal_reference': 'Resolución 2718 de 2024',
        'website_url': 'https://www.minsalud.gov.co',
        'all_items_free': True,
    },
    {
        'code': 'mipres_co',
        'name': 'MIPRES (Medicamentos No PBS)',
        'country': 'co',
        'description': 'Mi Prescripción — plataforma para medicamentos de alto custo não incluídos no PBS. Requer autorização.',
        'legal_reference': 'Resolución 1885 de 2018',
        'website_url': 'https://www.sispro.gov.co/central-prestadores-de-servicios/Pages/MIPRES.aspx',
        'all_items_free': True,
    },
    {
        'code': 'imss_bienestar',
        'name': 'IMSS-Bienestar',
        'country': 'mx',
        'description': 'Programa de saúde gratuito para população sem seguro social. Substitui o INSABI desde 2023. Baseado no CNIS (14806 claves).',
        'legal_reference': 'Decreto 29/08/2022',
        'website_url': 'https://www.gob.mx/imssbienestar',
        'all_items_free': True,
    },
    {
        'code': 'sis_pe',
        'name': 'Seguro Integral de Salud (SIS)',
        'country': 'pe',
        'description': 'Seguro público gratuito que cobre 62% da população peruana. Medicamentos do PNUME (Petitorio Nacional).',
        'legal_reference': 'Ley 27657',
        'website_url': 'https://www.gob.pe/sis',
        'all_items_free': True,
    },
    {
        'code': 'cnmb_ec',
        'name': 'Cuadro Nacional de Medicamentos Básicos (MSP)',
        'country': 'ec',
        'description': 'Lista oficial de ~500 medicamentos essenciais dispensados gratuitamente na rede pública do MSP.',
        'legal_reference': 'CNMB 9ª edición',
        'website_url': 'https://www.salud.gob.ec',
        'all_items_free': True,
    },
]

# Essential active principles covered by all LATAM universal health programs (OMS-based)
ESSENTIAL_PRINCIPLES = [
    'paracetamol', 'ibuprofeno', 'diclofenaco', 'dipirona',
    'enalapril', 'losartana', 'captopril', 'atenolol', 'anlodipino',
    'hidroclorotiazida', 'furosemida', 'espironolactona',
    'metformina', 'glibenclamida',
    'salbutamol', 'beclometasona', 'budesonida',
    'amoxicilina', 'azitromicina', 'ciprofloxacina', 'metronidazol',
    'claritromicina', 'cefalexina', 'sulfametoxazol + trimetoprima',
    'omeprazol', 'ranitidina',
    'loratadina', 'cetirizina',
    'prednisona', 'prednisolona', 'dexametasona', 'hidrocortisona',
    'sulfato ferroso', 'ácido fólico',
    'insulina nph', 'insulina regular',
    'carbamazepina', 'fenitoína', 'fenobarbital', 'ácido valproico',
    'fluoxetina', 'amitriptilina', 'haloperidol', 'diazepam', 'clonazepam',
    'isoniazida', 'rifampicina', 'pirazinamida', 'etambutol',
    'sinvastatina', 'atorvastatina',
    'propranolol', 'metoprolol',
    'ácido acetilsalicílico', 'varfarina',
    'levotiroxina',
    'alopurinol',
    'sertralina',
    'glicazida',
    'albendazol', 'mebendazol',
    'nistatina', 'fluconazol',
    'aciclovir',
    'clindamicina', 'gentamicina', 'amicacina',
    'ceftriaxona', 'cefazolina',
    'doxiciclina', 'tetraciclina',
    'metoclopramida', 'ondansetrona',
    'tramadol', 'morfina', 'codeína',
    'midazolam', 'fentanil',
    'oxitocina', 'misoprostol',
    'enoxaparina', 'heparina',
    'noradrenalina', 'adrenalina', 'dobutamina', 'dopamina',
    'atropina',
    'manitol',
    'cloreto de potássio',
    'bicarbonato de sódio',
    'lidocaína', 'bupivacaína',
    'cetamina', 'propofol', 'succinilcolina',
    'neostigmina', 'sugamadex',
]

# Map: program_code -> list of active principles it covers
# All 5 universal programs cover the same OMS essential list
PROGRAM_PRINCIPLES = {
    'sus_bo': ESSENTIAL_PRINCIPLES,
    'pbs_co': ESSENTIAL_PRINCIPLES,
    'imss_bienestar': ESSENTIAL_PRINCIPLES,
    'sis_pe': ESSENTIAL_PRINCIPLES,
    'cnmb_ec': ESSENTIAL_PRINCIPLES,
}


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Link all BR medications to the 5 new countries
    for country in NEW_COUNTRIES:
        conn.execute(text("""
            INSERT INTO medication_countries (medication_id, country_code)
            SELECT id, :country FROM medications WHERE country = 'br'
            ON CONFLICT DO NOTHING
        """), {'country': country})

    # 2. Insert government programs (idempotent)
    for prog in LATAM_PROGRAMS:
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

    prog_codes = [p['code'] for p in LATAM_PROGRAMS]
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

    # Remove country links for the 5 new countries
    for country in NEW_COUNTRIES:
        conn.execute(text("""
            DELETE FROM medication_countries WHERE country_code = :country
        """), {'country': country})
