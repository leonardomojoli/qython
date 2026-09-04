"""Europe pharmacy expansion phase 2b: IT, DE, FR, CH, GB programs and country links

Adds 5 government programs for Italy, Germany, France, Switzerland, and UK
(all with copayment systems), links BR medications to those countries,
and tags essential meds to the new programs.

Revision ID: 2026_02_15_europe_it_de_fr_ch_gb
Revises: 2026_02_14_europe_pt_es
Create Date: 2026-02-15
"""
from alembic import op
from sqlalchemy import text

revision = '2026_02_15_europe_it_de_fr_ch_gb'
down_revision = '2026_02_14_europe_pt_es'
branch_labels = None
depends_on = None

NEW_COUNTRIES = ['it', 'de', 'fr', 'ch', 'gb']

EU_PROGRAMS = [
    {
        'code': 'ssn_it',
        'name': 'SSN Fascia A',
        'country': 'it',
        'description': 'Servizio Sanitario Nazionale — Fascia A: farmaci essenziali e per malattie croniche. Ticket regionale EUR 0-4/confezione + eventuale differenza sul prezzo di riferimento.',
        'legal_reference': 'D.Lgs. 219/2006; L. 537/1993',
        'website_url': 'https://www.aifa.gov.it',
        'all_items_free': False,
    },
    {
        'code': 'gkv',
        'name': 'GKV Arzneimittelversorgung',
        'country': 'de',
        'description': 'Gesetzliche Krankenversicherung — copagamento 10% (mín. EUR 5, máx. EUR 10/item). Teto anual de 2% da renda bruta (1% para doenças crônicas). Isenção para menores de 18 anos.',
        'legal_reference': 'SGB V, §31, §61, §62',
        'website_url': 'https://www.g-ba.de',
        'all_items_free': False,
    },
    {
        'code': 'assurance_maladie',
        'name': 'Assurance Maladie',
        'country': 'fr',
        'description': 'Assurance Maladie — reembolso conforme SMR: 100% (vignette blanche barrée), 65% (vignette blanche), 30% (vignette bleue), 15% (vignette orange). ALD (doenças crônicas) = 100%.',
        'legal_reference': 'CSS Art. L.322-2, R.322-1',
        'website_url': 'https://www.ameli.fr',
        'all_items_free': False,
    },
    {
        'code': 'lamal',
        'name': 'LAMal Liste des Spécialités',
        'country': 'ch',
        'description': 'LAMal/KVG — Liste des Spécialités (LS): franquia anual CHF 300-2500 + cosseguro 10% (20% para genéricos sem substituição, 40% para originais com genérico disponível). Teto CHF 700/ano.',
        'legal_reference': 'LAMal/KVG Art. 25, 64',
        'website_url': 'https://www.bag.admin.ch',
        'all_items_free': False,
    },
    {
        'code': 'nhs_uk',
        'name': 'NHS Prescriptions',
        'country': 'gb',
        'description': 'NHS — England: GBP 9.90/item (89% dos pacientes isentos por idade, renda, condição crônica ou PPC). Scotland, Wales e Northern Ireland: totalmente gratuito.',
        'legal_reference': 'NHS Act 2006, s.172',
        'website_url': 'https://www.nhs.uk',
        'all_items_free': False,
    },
]

# Essential active principles covered by all 5 EU national health systems
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
    'ssn_it': ESSENTIAL_PRINCIPLES,
    'gkv': ESSENTIAL_PRINCIPLES,
    'assurance_maladie': ESSENTIAL_PRINCIPLES,
    'lamal': ESSENTIAL_PRINCIPLES,
    'nhs_uk': ESSENTIAL_PRINCIPLES,
}


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Link all BR medications to IT, DE, FR, CH, GB
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

    # Remove country links for IT, DE, FR, CH, GB
    for country in NEW_COUNTRIES:
        conn.execute(text("""
            DELETE FROM medication_countries WHERE country_code = :country
        """), {'country': country})
