"""North America & Oceania pharmacy expansion: US, CA, AU programs and country links

Adds 6 government programs for USA (Medicare Part D, Medicaid, VA Formulary),
Canada (Pharmacare), and Australia (PBS, RPBS), links BR medications to those
countries, and tags essential meds to the new programs.

Revision ID: 2026_02_15_northamerica_oceania
Revises: 2026_02_15_europe_it_de_fr_ch_gb
Create Date: 2026-02-15
"""
from alembic import op
from sqlalchemy import text

revision = '2026_02_15_northamerica_oceania'
down_revision = '2026_02_15_europe_it_de_fr_ch_gb'
branch_labels = None
depends_on = None

NEW_COUNTRIES = ['us', 'ca', 'au']

PROGRAMS = [
    {
        'code': 'medicare_part_d',
        'name': 'Medicare Part D',
        'country': 'us',
        'description': 'Medicare prescription drug benefit: 25% coinsurance after deductible (USD 615/year). Annual out-of-pocket cap USD 2,100 (2025). Covers 65+ and eligible disabled individuals.',
        'legal_reference': 'Social Security Act Title XVIII',
        'website_url': 'https://www.medicare.gov/drug-coverage-part-d',
        'all_items_free': False,
    },
    {
        'code': 'medicaid',
        'name': 'Medicaid',
        'country': 'us',
        'description': 'Federal-state program covering low-income individuals. Copays USD 1.60-4.90 (generic/brand). Exempt below 100% FPL. Covers ~90 million Americans.',
        'legal_reference': 'Social Security Act Title XIX',
        'website_url': 'https://www.medicaid.gov',
        'all_items_free': True,
    },
    {
        'code': 'va_formulary',
        'name': 'VA Formulary',
        'country': 'us',
        'description': 'Department of Veterans Affairs national formulary. Free medications for eligible veterans (service-connected disabilities, low income). Copay USD 5-11 for non-exempt.',
        'legal_reference': 'Title 38 U.S.C.',
        'website_url': 'https://www.va.gov/health-care/prescriptions',
        'all_items_free': True,
    },
    {
        'code': 'pharmacare_ca',
        'name': 'Canada Pharmacare',
        'country': 'ca',
        'description': 'National Pharmacare program (Phase 1, 2024): diabetes and contraceptive medications free. Provincial formularies cover additional drugs with varying copayments.',
        'legal_reference': 'Pharmacare Act (C-64, 2024)',
        'website_url': 'https://www.canada.ca/en/health-canada/topics/pharmacare.html',
        'all_items_free': False,
    },
    {
        'code': 'pbs_au',
        'name': 'PBS (Pharmaceutical Benefits Scheme)',
        'country': 'au',
        'description': 'National scheme subsidising prescription medications. General copay AUD 25/item (Jan 2026). Concessional copay AUD 7.70. Safety net thresholds reduce costs further.',
        'legal_reference': 'National Health Act 1953 (Cth)',
        'website_url': 'https://www.pbs.gov.au',
        'all_items_free': False,
    },
    {
        'code': 'rpbs_au',
        'name': 'RPBS (Veterans)',
        'country': 'au',
        'description': "Repatriation Pharmaceutical Benefits Scheme: free medications for eligible veterans and war widows/widowers under the Veterans' Entitlements Act.",
        'legal_reference': "Veterans' Entitlements Act 1986 (Cth)",
        'website_url': 'https://www.dva.gov.au/health-and-treatment/help-cover-healthcare-costs',
        'all_items_free': True,
    },
]

# Essential active principles covered by all new programs
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
    'medicare_part_d': ESSENTIAL_PRINCIPLES,
    'medicaid': ESSENTIAL_PRINCIPLES,
    'va_formulary': ESSENTIAL_PRINCIPLES,
    'pharmacare_ca': ESSENTIAL_PRINCIPLES,
    'pbs_au': ESSENTIAL_PRINCIPLES,
    'rpbs_au': ESSENTIAL_PRINCIPLES,
}


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Link all BR medications to US, CA, AU
    for country in NEW_COUNTRIES:
        conn.execute(text("""
            INSERT INTO medication_countries (medication_id, country_code)
            SELECT id, :country FROM medications WHERE country = 'br'
            ON CONFLICT DO NOTHING
        """), {'country': country})

    # 2. Insert government programs (idempotent)
    for prog in PROGRAMS:
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

    prog_codes = [p['code'] for p in PROGRAMS]
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

    # Remove country links for US, CA, AU
    for country in NEW_COUNTRIES:
        conn.execute(text("""
            DELETE FROM medication_countries WHERE country_code = :country
        """), {'country': country})
