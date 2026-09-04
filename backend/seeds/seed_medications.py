# qython/backend/seeds/seed_medications.py
"""
Idempotent seed script for medications and drug interactions.
Checks existence before inserting to allow safe re-runs.
"""

import json
import logging
import os
from typing import Tuple

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Medication, MedicationCountry, MedicationBrand, MedicationTranslation, DrugInteraction, GovernmentProgram, MedicationGovernmentProgram

logger = logging.getLogger("qython_logger")

SEEDS_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SEEDS_DIR, "data")


async def seed_medications(db: AsyncSession) -> int:
    """
    Seed medications from medications.json.
    Idempotent: skips existing medications (matched by name + active_principle).
    Returns number of new medications added.
    """
    json_path = os.path.join(DATA_DIR, "medications.json")
    if not os.path.exists(json_path):
        logger.warning(f"Medications seed file not found: {json_path}")
        return 0

    with open(json_path, "r", encoding="utf-8") as f:
        medications_data = json.load(f)

    # Get existing medications for dedup
    result = await db.execute(
        select(
            func.lower(Medication.name),
            func.lower(Medication.active_principle)
        )
    )
    existing = set((row[0], row[1]) for row in result.all())

    # Also fetch full existing meds for upsert of FP fields
    existing_meds_result = await db.execute(select(Medication))
    existing_meds = {
        (m.name.lower(), m.active_principle.lower()): m
        for m in existing_meds_result.scalars().all()
    }

    created = 0
    updated = 0
    for med_data in medications_data:
        key = (med_data["name"].lower(), med_data["active_principle"].lower())
        fp = med_data.get("farmacia_popular", False)
        fp_copay = med_data.get("farmacia_popular_copay")
        country = med_data.get("country", "br")
        item_type = med_data.get("item_type", "medication")

        # Clinical reference fields
        clinical_fields = {
            'common_brands': med_data.get("common_brands"),
            'administration_route': med_data.get("administration_route", "oral"),
            'usual_posology': med_data.get("usual_posology"),
            'max_daily_dose': med_data.get("max_daily_dose"),
            'common_indications': med_data.get("common_indications"),
            'pregnancy_category': med_data.get("pregnancy_category"),
            'renal_adjustment': med_data.get("renal_adjustment", False),
            'hepatic_adjustment': med_data.get("hepatic_adjustment", False),
        }

        if key in existing_meds:
            # Upsert: update FP, country, and clinical fields if they changed
            med = existing_meds[key]
            changed = False
            if med.farmacia_popular != fp or med.farmacia_popular_copay != fp_copay:
                med.farmacia_popular = fp
                med.farmacia_popular_copay = fp_copay
                changed = True
            if hasattr(med, 'country') and med.country != country:
                med.country = country
                changed = True
            if hasattr(med, 'item_type') and med.item_type != item_type:
                med.item_type = item_type
                changed = True
            # Update clinical fields if new data is available
            for field, value in clinical_fields.items():
                if value is not None and hasattr(med, field) and getattr(med, field) != value:
                    setattr(med, field, value)
                    changed = True
            if changed:
                updated += 1
            continue

        medication = Medication(
            name=med_data["name"],
            active_principle=med_data["active_principle"],
            presentation=med_data.get("presentation"),
            atc_code=med_data.get("atc_code"),
            therapeutic_class=med_data.get("therapeutic_class"),
            requires_prescription=med_data.get("requires_prescription", True),
            controlled_type=med_data.get("controlled_type"),
            farmacia_popular=fp,
            farmacia_popular_copay=fp_copay,
            country=country,
            item_type=item_type,
            **{k: v for k, v in clinical_fields.items() if v is not None},
        )
        db.add(medication)
        existing_meds[key] = medication
        created += 1

    if created > 0 or updated > 0:
        await db.commit()

    if updated > 0:
        logger.info(f"Updated FP/country status for {updated} existing medications")

    return created


async def seed_drug_interactions(db: AsyncSession) -> int:
    """
    Seed drug interactions from drug_interactions.json.
    Idempotent: skips existing pairs.
    Normalizes pair order (alphabetical a < b) to prevent duplicates.
    Returns number of new interactions added.
    """
    json_path = os.path.join(DATA_DIR, "drug_interactions.json")
    if not os.path.exists(json_path):
        logger.warning(f"Drug interactions seed file not found: {json_path}")
        return 0

    with open(json_path, "r", encoding="utf-8") as f:
        interactions_data = json.load(f)

    # Get existing pairs for dedup
    result = await db.execute(
        select(
            func.lower(DrugInteraction.active_principle_a),
            func.lower(DrugInteraction.active_principle_b)
        )
    )
    existing = set((row[0], row[1]) for row in result.all())

    created = 0
    for interaction_data in interactions_data:
        # Normalize pair order: alphabetical
        a = interaction_data["active_principle_a"].strip().lower()
        b = interaction_data["active_principle_b"].strip().lower()
        if a > b:
            a, b = b, a

        if (a, b) in existing:
            continue

        interaction = DrugInteraction(
            active_principle_a=a,
            active_principle_b=b,
            severity=interaction_data["severity"],
            description=interaction_data["description"],
            mechanism=interaction_data.get("mechanism"),
            clinical_management=interaction_data.get("clinical_management"),
            source=interaction_data.get("source"),
            evidence_level=interaction_data.get("evidence_level"),
        )
        db.add(interaction)
        existing.add((a, b))
        created += 1

    if created > 0:
        await db.commit()

    return created


GOVERNMENT_PROGRAMS = [
    {
        'code': 'farmacia_popular',
        'name': 'Farmácia Popular do Brasil',
        'country': 'br',
        'description': 'Programa do governo federal que disponibiliza medicamentos essenciais gratuitamente em farmácias credenciadas.',
        'legal_reference': 'Portaria GM/MS 6.613/2025',
        'website_url': 'https://www.gov.br/saude/pt-br/composicao/sctie/daf/programa-farmacia-popular',
        'all_items_free': True,
    },
    {
        'code': 'fnr',
        'name': 'FNR - Fondo Nacional de Recursos',
        'country': 'uy',
        'description': 'Fondo Nacional de Recursos: cobertura 100% gratuita de medicamentos de alto costo para 46 patologías y 76 principios activos.',
        'legal_reference': 'Ley 16.343',
        'website_url': 'https://www.fnr.gub.uy/',
        'all_items_free': True,
    },
    {
        'code': 'asse',
        'name': 'ASSE - Administración de los Servicios de Salud del Estado',
        'country': 'uy',
        'description': 'Sistema público de salud uruguayo que dispensa medicamentos del Formulario Terapéutico de Medicamentos (FTM) de forma gratuita a afiliados.',
        'legal_reference': 'Ley 18.161',
        'website_url': 'https://www.asse.com.uy/',
        'all_items_free': True,
    },
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
    # --- Paraguay ---
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
    # --- Brasil (SUS) ---
    {
        'code': 'cbaf',
        'name': 'SUS/UBS',
        'country': 'br',
        'description': 'Componente Básico da Assistência Farmacêutica (CBAF) - medicamentos essenciais da RENAME dispensados gratuitamente em Unidades Básicas de Saúde (UBS/postos de saúde).',
        'legal_reference': 'Portaria GM/MS 3.916/1998; RENAME 2024',
        'website_url': 'https://www.gov.br/saude/pt-br/composicao/sctie/daf/rename',
        'all_items_free': True,
    },
    {
        'code': 'ceaf',
        'name': 'SUS Especializado',
        'country': 'br',
        'description': 'Componente Especializado da Assistência Farmacêutica (CEAF) - medicamentos de alto custo dispensados em farmácias especializadas do SUS, mediante autorização via Laudo para Medicamento Especializado (LME).',
        'legal_reference': 'Portaria GM/MS 1.554/2013; RENAME 2024',
        'website_url': 'https://www.gov.br/saude/pt-br/composicao/sctie/daf/ceaf',
        'all_items_free': True,
    },
    # --- Bolivia ---
    {
        'code': 'sus_bo',
        'name': 'Sistema Único de Salud',
        'country': 'bo',
        'description': 'Sistema Único de Salud (Ley 1152/2019). Cobertura universal e gratuita com 777 medicamentos essenciais (LINAME).',
        'legal_reference': 'Ley 1152 de 2019',
        'website_url': 'https://www.minsalud.gob.bo',
        'all_items_free': True,
    },
    # --- Colombia ---
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
    # --- Mexico ---
    {
        'code': 'imss_bienestar',
        'name': 'IMSS-Bienestar',
        'country': 'mx',
        'description': 'Programa de saúde gratuito para população sem seguro social. Substitui o INSABI desde 2023. Baseado no CNIS (14806 claves).',
        'legal_reference': 'Decreto 29/08/2022',
        'website_url': 'https://www.gob.mx/imssbienestar',
        'all_items_free': True,
    },
    # --- Peru ---
    {
        'code': 'sis_pe',
        'name': 'Seguro Integral de Salud (SIS)',
        'country': 'pe',
        'description': 'Seguro público gratuito que cobre 62% da população peruana. Medicamentos do PNUME (Petitorio Nacional).',
        'legal_reference': 'Ley 27657',
        'website_url': 'https://www.gob.pe/sis',
        'all_items_free': True,
    },
    # --- Ecuador ---
    {
        'code': 'cnmb_ec',
        'name': 'Cuadro Nacional de Medicamentos Básicos (MSP)',
        'country': 'ec',
        'description': 'Lista oficial de ~500 medicamentos essenciais dispensados gratuitamente na rede pública do MSP.',
        'legal_reference': 'CNMB 9ª edición',
        'website_url': 'https://www.salud.gob.ec',
        'all_items_free': True,
    },
    # --- Chile ---
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
    # --- Portugal ---
    {
        'code': 'sns_pt',
        'name': 'SNS - Comparticipação',
        'country': 'pt',
        'description': 'Sistema Nacional de Saúde — comparticipação de medicamentos por escalões: A (95%), B (69%), C (37%), D (15%). Pensionistas recebem +5-15%. Genéricos têm comparticipação majorada.',
        'legal_reference': 'Decreto-Lei 118/92',
        'website_url': 'https://www.sns.gov.pt',
        'all_items_free': False,
    },
    # --- Espanha ---
    {
        'code': 'sns_es',
        'name': 'SNS - Prestación Farmacéutica',
        'country': 'es',
        'description': 'Sistema Nacional de Salud — aportación farmacéutica: activos 40-60%, pensionistas 10% (máximo €8-18/mes según renta), grupos exentos 0%. Medicamentos de aportación reducida con visado.',
        'legal_reference': 'Real Decreto-ley 16/2012',
        'website_url': 'https://www.sanidad.gob.es',
        'all_items_free': False,
    },
    # --- Itália ---
    {
        'code': 'ssn_it',
        'name': 'SSN Fascia A',
        'country': 'it',
        'description': 'Servizio Sanitario Nazionale — Fascia A: farmaci essenziali e per malattie croniche. Ticket regionale EUR 0-4/confezione + eventuale differenza sul prezzo di riferimento.',
        'legal_reference': 'D.Lgs. 219/2006; L. 537/1993',
        'website_url': 'https://www.aifa.gov.it',
        'all_items_free': False,
    },
    # --- Alemanha ---
    {
        'code': 'gkv',
        'name': 'GKV Arzneimittelversorgung',
        'country': 'de',
        'description': 'Gesetzliche Krankenversicherung — copagamento 10% (mín. EUR 5, máx. EUR 10/item). Teto anual de 2% da renda bruta (1% para doenças crônicas). Isenção para menores de 18 anos.',
        'legal_reference': 'SGB V, §31, §61, §62',
        'website_url': 'https://www.g-ba.de',
        'all_items_free': False,
    },
    # --- França ---
    {
        'code': 'assurance_maladie',
        'name': 'Assurance Maladie',
        'country': 'fr',
        'description': 'Assurance Maladie — reembolso conforme SMR: 100% (vignette blanche barrée), 65% (vignette blanche), 30% (vignette bleue), 15% (vignette orange). ALD (doenças crônicas) = 100%.',
        'legal_reference': 'CSS Art. L.322-2, R.322-1',
        'website_url': 'https://www.ameli.fr',
        'all_items_free': False,
    },
    # --- Suíça ---
    {
        'code': 'lamal',
        'name': 'LAMal Liste des Spécialités',
        'country': 'ch',
        'description': 'LAMal/KVG — Liste des Spécialités (LS): franquia anual CHF 300-2500 + cosseguro 10% (20% para genéricos sem substituição, 40% para originais com genérico disponível). Teto CHF 700/ano.',
        'legal_reference': 'LAMal/KVG Art. 25, 64',
        'website_url': 'https://www.bag.admin.ch',
        'all_items_free': False,
    },
    # --- Reino Unido ---
    {
        'code': 'nhs_uk',
        'name': 'NHS Prescriptions',
        'country': 'gb',
        'description': 'NHS — England: GBP 9.90/item (89% dos pacientes isentos por idade, renda, condição crônica ou PPC). Scotland, Wales e Northern Ireland: totalmente gratuito.',
        'legal_reference': 'NHS Act 2006, s.172',
        'website_url': 'https://www.nhs.uk',
        'all_items_free': False,
    },
    # --- Estados Unidos ---
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
    # --- Canadá ---
    {
        'code': 'pharmacare_ca',
        'name': 'Canada Pharmacare',
        'country': 'ca',
        'description': 'National Pharmacare program (Phase 1, 2024): diabetes and contraceptive medications free. Provincial formularies cover additional drugs with varying copayments.',
        'legal_reference': 'Pharmacare Act (C-64, 2024)',
        'website_url': 'https://www.canada.ca/en/health-canada/topics/pharmacare.html',
        'all_items_free': False,
    },
    # --- Austrália ---
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
        'description': 'Repatriation Pharmaceutical Benefits Scheme: free medications for eligible veterans and war widows/widowers under the Veterans\' Entitlements Act.',
        'legal_reference': "Veterans' Entitlements Act 1986 (Cth)",
        'website_url': 'https://www.dva.gov.au/health-and-treatment/help-cover-healthcare-costs',
        'all_items_free': True,
    },
]


async def seed_government_programs(db: AsyncSession) -> int:
    """
    Seed government programs and link medications.
    Idempotent: skips existing programs (matched by code).
    Links medications based on government_program_codes in medications.json.
    Returns number of new links created.
    """
    # Ensure all programs exist
    programs_by_code = {}
    for prog_def in GOVERNMENT_PROGRAMS:
        result = await db.execute(
            select(GovernmentProgram).where(GovernmentProgram.code == prog_def['code'])
        )
        program = result.scalar_one_or_none()
        if not program:
            program = GovernmentProgram(
                code=prog_def['code'],
                name=prog_def['name'],
                country=prog_def['country'],
                description=prog_def['description'],
                legal_reference=prog_def['legal_reference'],
                website_url=prog_def['website_url'],
                is_active=True,
                all_items_free=prog_def['all_items_free'],
            )
            db.add(program)
            await db.flush()
            logger.info(f"Created government program: {prog_def['name']}")
        programs_by_code[prog_def['code']] = program

    # Load medications.json to get government_program_codes mapping
    json_path = os.path.join(DATA_DIR, "medications.json")
    med_program_map = {}  # (name_lower, principle_lower) -> [program_codes]
    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            medications_data = json.load(f)
        for med_data in medications_data:
            codes = med_data.get("government_program_codes", [])
            if not codes and med_data.get("farmacia_popular") and med_data.get("country", "br") == "br":
                codes = ["farmacia_popular"]
            if codes:
                key = (med_data["name"].lower(), med_data["active_principle"].lower())
                med_program_map[key] = codes

    # Get all medications
    all_meds_result = await db.execute(select(Medication))
    all_meds = all_meds_result.scalars().all()

    # Get all existing links
    existing_links_result = await db.execute(
        select(MedicationGovernmentProgram.medication_id, MedicationGovernmentProgram.program_id)
    )
    existing_links = set((row[0], row[1]) for row in existing_links_result.all())

    created = 0
    for med in all_meds:
        key = (med.name.lower(), med.active_principle.lower())
        codes = med_program_map.get(key, [])
        # Fallback: BR meds with farmacia_popular flag
        if not codes and med.farmacia_popular and med.country == 'br':
            codes = ['farmacia_popular']
        for code in codes:
            program = programs_by_code.get(code)
            if not program:
                continue
            if (med.id, program.id) in existing_links:
                continue
            link = MedicationGovernmentProgram(
                medication_id=med.id,
                program_id=program.id,
                copay=0,
                is_active=True,
            )
            db.add(link)
            existing_links.add((med.id, program.id))
            created += 1

    if created > 0:
        await db.commit()
        logger.info(f"Linked {created} medications to government programs")

    return created


async def seed_medication_countries(db: AsyncSession) -> int:
    """
    Seed medication_countries junction table from existing medication.country.
    Also links all BR medications to AR (shared essential catalog).
    Idempotent: skips existing links.
    Returns number of new links created.
    """
    # Get all medications
    all_meds_result = await db.execute(select(Medication))
    all_meds = all_meds_result.scalars().all()

    # Get existing links
    existing_result = await db.execute(
        select(MedicationCountry.medication_id, MedicationCountry.country_code)
    )
    existing = set((row[0], row[1]) for row in existing_result.all())

    created = 0
    for med in all_meds:
        # Link to its original country
        if (med.id, med.country) not in existing:
            db.add(MedicationCountry(medication_id=med.id, country_code=med.country))
            existing.add((med.id, med.country))
            created += 1

        # BR medications also available in LATAM + Europe + North America + Oceania (shared essential catalog)
        for shared_country in ('ar', 'py', 'cl', 'uy', 'bo', 'co', 'mx', 'pe', 'ec', 'pt', 'es', 'it', 'de', 'fr', 'ch', 'gb', 'us', 'ca', 'au'):
            if med.country == 'br' and (med.id, shared_country) not in existing:
                db.add(MedicationCountry(medication_id=med.id, country_code=shared_country))
                existing.add((med.id, shared_country))
                created += 1

    if created > 0:
        await db.commit()
        logger.info(f"Seeded {created} medication-country links")

    return created


async def seed_medication_brands(db: AsyncSession) -> int:
    """
    Seed medication_brands from brands_by_country in medications.json.
    Also ensures origin country brands exist from common_brands.
    Idempotent: skips existing (medication_id, country_code) pairs.
    Returns number of new brand entries created.
    """
    json_path = os.path.join(DATA_DIR, "medications.json")
    if not os.path.exists(json_path):
        return 0

    with open(json_path, "r", encoding="utf-8") as f:
        medications_data = json.load(f)

    # Build lookup: (name_lower, principle_lower) -> brands_by_country dict
    brands_map = {}
    for med_data in medications_data:
        bbc = med_data.get("brands_by_country", {})
        common = med_data.get("common_brands")
        country = med_data.get("country", "br")
        # Include origin country brands from common_brands if not in brands_by_country
        if common and country not in bbc:
            bbc[country] = common
        if bbc:
            key = (med_data["name"].lower(), med_data["active_principle"].lower())
            brands_map[key] = bbc

    if not brands_map:
        return 0

    # Get all medications
    all_meds_result = await db.execute(select(Medication))
    all_meds = {(m.name.lower(), m.active_principle.lower()): m for m in all_meds_result.scalars().all()}

    # Get existing brand entries
    existing_result = await db.execute(
        select(MedicationBrand.medication_id, MedicationBrand.country_code)
    )
    existing = set((row[0], row[1]) for row in existing_result.all())

    created = 0
    for key, country_brands in brands_map.items():
        med = all_meds.get(key)
        if not med:
            continue
        for country_code, brand_names in country_brands.items():
            if not brand_names or (med.id, country_code) in existing:
                continue
            db.add(MedicationBrand(
                medication_id=med.id,
                country_code=country_code,
                brand_names=brand_names,
            ))
            existing.add((med.id, country_code))
            created += 1

    if created > 0:
        await db.commit()
        logger.info(f"Seeded {created} medication brand entries")

    return created


async def seed_medication_translations(db: AsyncSession) -> int:
    """
    Seed medication_translations from names_i18n in medications.json.
    Idempotent: skips existing (medication_id, locale) pairs.
    Returns number of new translation entries created.
    """
    json_path = os.path.join(DATA_DIR, "medications.json")
    if not os.path.exists(json_path):
        return 0

    with open(json_path, "r", encoding="utf-8") as f:
        medications_data = json.load(f)

    # Build lookup: (name_lower, principle_lower) -> names_i18n dict
    i18n_map = {}
    for med_data in medications_data:
        i18n = med_data.get("names_i18n")
        if i18n:
            key = (med_data["name"].lower(), med_data["active_principle"].lower())
            i18n_map[key] = i18n

    if not i18n_map:
        return 0

    # Get all medications
    all_meds_result = await db.execute(select(Medication))
    all_meds = {(m.name.lower(), m.active_principle.lower()): m for m in all_meds_result.scalars().all()}

    # Get existing translations
    existing_result = await db.execute(
        select(MedicationTranslation.medication_id, MedicationTranslation.locale)
    )
    existing = set((row[0], row[1]) for row in existing_result.all())

    created = 0
    for key, i18n_data in i18n_map.items():
        med = all_meds.get(key)
        if not med:
            continue
        for locale, fields in i18n_data.items():
            if (med.id, locale) in existing:
                continue
            translation = MedicationTranslation(
                medication_id=med.id,
                locale=locale,
                name=fields.get('name'),
                active_principle=fields.get('active_principle'),
            )
            db.add(translation)
            existing.add((med.id, locale))
            created += 1

    if created > 0:
        await db.commit()
        logger.info(f"Seeded {created} medication translation entries")

    return created


async def seed_all(db: AsyncSession) -> Tuple[int, int]:
    """Run all pharmacy seeds. Returns (medications_added, interactions_added)."""
    meds = await seed_medications(db)
    interactions = await seed_drug_interactions(db)
    await seed_government_programs(db)
    await seed_medication_countries(db)
    await seed_medication_brands(db)
    await seed_medication_translations(db)
    return meds, interactions

