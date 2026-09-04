"""Add Paraguay government programs and link BR meds to PY

Revision ID: 2026_02_09_py_programs
Revises: 2026_02_09_med_countries
Create Date: 2026-02-09

"""
from alembic import op
from sqlalchemy import text

revision = '2026_02_09_py_programs'
down_revision = '2026_02_09_med_countries'
branch_labels = None
depends_on = None

# Paraguay government programs
PY_PROGRAMS = [
    {
        'code': 'msp_lme',
        'name': 'MSP - Medicamentos Esenciales',
        'country': 'py',
        'description': 'Medicamentos del Listado Nacional de Medicamentos Esenciales (LME) dispensados gratuitamente en hospitales, centros de salud y USFs del Ministerio de Salud Pública.',
        'legal_reference': 'Ley 5099/2013; Resolución S.G. N° 1050',
        'website_url': 'https://www.mspbs.gov.py/dggies/listado.html',
        'all_items_free': True,
    },
    {
        'code': 'ips_py',
        'name': 'IPS - Instituto de Previsión Social',
        'country': 'py',
        'description': 'Cobertura de medicamentos del Vademécum IPS para asegurados del seguro social obligatorio (trabajadores formales y beneficiarios). Aprox. 1,66 millones de afiliados.',
        'legal_reference': 'Decreto-Ley 1860/1950; Ley 375; Ley 1286/1987',
        'website_url': 'https://portal.ips.gov.py/',
        'all_items_free': True,
    },
    {
        'code': 'pronac',
        'name': 'PRONAC/INCAN - Control del Cáncer',
        'country': 'py',
        'description': 'Programa Nacional de Control del Cáncer: medicamentos oncológicos gratuitos a través del Hospital Oncológico Nacional y centros regionales.',
        'legal_reference': 'Ley 6266/2018',
        'website_url': 'https://www.mspbs.gov.py/programa-nacional-control-cancer.html',
        'all_items_free': True,
    },
]

# Active principles covered by MSP LME (core essential medications in Paraguay)
MSP_LME_PRINCIPLES = [
    'paracetamol', 'ibuprofeno', 'diclofenaco', 'dipirona',
    'enalapril', 'losartana', 'captopril', 'atenolol', 'amlodipino',
    'hidroclorotiazida', 'furosemida', 'espironolactona',
    'metformina', 'glibenclamida',
    'salbutamol', 'beclometasona',
    'amoxicilina', 'azitromicina', 'ciprofloxacina', 'metronidazol',
    'claritromicina', 'cefalexina', 'sulfametoxazol + trimetoprima',
    'omeprazol', 'ranitidina',
    'loratadina', 'cetirizina',
    'prednisona', 'prednisolona', 'dexametasona',
    'sulfato ferroso', 'ácido fólico',
    'insulina nph', 'insulina regular',
    'carbamazepina', 'fenitoína', 'fenobarbital',
    'fluoxetina', 'amitriptilina', 'haloperidol', 'diazepam',
    'isoniazida', 'rifampicina', 'pirazinamida', 'etambutol',
]


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Link all BR medications to PY (shared essential catalog)
    conn.execute(text("""
        INSERT INTO medication_countries (medication_id, country_code)
        SELECT id, 'py' FROM medications WHERE country = 'br'
        ON CONFLICT DO NOTHING
    """))

    # 2. Insert Paraguay government programs
    for prog in PY_PROGRAMS:
        conn.execute(text("""
            INSERT INTO government_programs (code, name, country, description, legal_reference, website_url, is_active, all_items_free)
            VALUES (:code, :name, :country, :description, :legal_reference, :website_url, true, :all_items_free)
            ON CONFLICT (code) DO NOTHING
        """), prog)

    # 3. Link MSP LME-covered medications (by active_principle match)
    msp_id = conn.execute(
        text("SELECT id FROM government_programs WHERE code = 'msp_lme'")
    ).scalar()

    if msp_id:
        for principle in MSP_LME_PRINCIPLES:
            conn.execute(text("""
                INSERT INTO medication_government_programs (medication_id, program_id, copay, is_active)
                SELECT m.id, :prog_id, 0, true
                FROM medications m
                WHERE LOWER(m.active_principle) = LOWER(:principle)
                AND NOT EXISTS (
                    SELECT 1 FROM medication_government_programs mgp
                    WHERE mgp.medication_id = m.id AND mgp.program_id = :prog_id
                )
            """), {'prog_id': msp_id, 'principle': principle})


def downgrade() -> None:
    conn = op.get_bind()

    # Remove PY program links
    conn.execute(text("""
        DELETE FROM medication_government_programs
        WHERE program_id IN (SELECT id FROM government_programs WHERE code IN ('msp_lme', 'ips_py', 'pronac'))
    """))

    # Remove PY programs
    conn.execute(text("""
        DELETE FROM government_programs WHERE code IN ('msp_lme', 'ips_py', 'pronac')
    """))

    # Remove PY country links
    conn.execute(text("""
        DELETE FROM medication_countries WHERE country_code = 'py'
    """))
