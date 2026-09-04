# qython/backend/routes/medication_routes.py
"""
Medication catalog API endpoints.
Search, filter, and manage medications including Farmácia Popular integration.
"""

import logging
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, or_, and_, func, exists
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User, Medication, MedicationCountry, MedicationBrand, MedicationTranslation, DrugInteraction, GovernmentProgram, MedicationGovernmentProgram
from ..security import get_current_active_user
from ..services.pharmacy_service import check_interactions
from ..services.activity_service import track_activity
from ..i18n.pharma_translations import translate_medication_response

logger = logging.getLogger("qython_logger")
router = APIRouter()


# --- Pydantic Models ---

class GovernmentProgramBrief(BaseModel):
    code: str
    name: str
    all_items_free: bool


class MedicationResponse(BaseModel):
    id: int
    name: str
    active_principle: str
    presentation: Optional[str] = None
    atc_code: Optional[str] = None
    therapeutic_class: Optional[str] = None
    requires_prescription: bool
    controlled_type: Optional[str] = None
    item_type: str = 'medication'
    country: str = 'br'
    countries: List[str] = []
    farmacia_popular: bool
    farmacia_popular_copay: Optional[float] = None
    common_brands: Optional[str] = None
    administration_route: Optional[str] = None
    usual_posology: Optional[str] = None
    max_daily_dose: Optional[str] = None
    common_indications: Optional[str] = None
    pregnancy_category: Optional[str] = None
    renal_adjustment: bool = False
    hepatic_adjustment: bool = False
    is_active: bool
    government_programs: List[GovernmentProgramBrief] = []

    class Config:
        from_attributes = True


class MedicationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    active_principle: str = Field(..., min_length=1, max_length=255)
    presentation: Optional[str] = None
    atc_code: Optional[str] = None
    therapeutic_class: Optional[str] = None
    requires_prescription: bool = True
    controlled_type: Optional[str] = None
    country: str = 'br'
    farmacia_popular: bool = False
    farmacia_popular_copay: Optional[float] = None


class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    active_principle: Optional[str] = None
    presentation: Optional[str] = None
    atc_code: Optional[str] = None
    therapeutic_class: Optional[str] = None
    requires_prescription: Optional[bool] = None
    controlled_type: Optional[str] = None
    country: Optional[str] = None
    farmacia_popular: Optional[bool] = None
    farmacia_popular_copay: Optional[float] = None
    is_active: Optional[bool] = None


class GovernmentProgramResponse(BaseModel):
    id: int
    code: str
    name: str
    country: str
    description: Optional[str] = None
    legal_reference: Optional[str] = None
    website_url: Optional[str] = None
    is_active: bool
    all_items_free: bool

    class Config:
        from_attributes = True


class InteractionCheckRequest(BaseModel):
    active_principles: List[str] = Field(..., min_length=2)


class InteractionResponse(BaseModel):
    id: int
    active_principle_a: str
    active_principle_b: str
    severity: str
    description: str
    mechanism: Optional[str] = None
    clinical_management: Optional[str] = None
    source: Optional[str] = None
    evidence_level: Optional[str] = None


class BulkImportItem(BaseModel):
    name: str
    active_principle: str
    presentation: Optional[str] = None
    atc_code: Optional[str] = None
    therapeutic_class: Optional[str] = None
    requires_prescription: bool = True
    controlled_type: Optional[str] = None
    country: str = 'br'
    farmacia_popular: bool = False
    farmacia_popular_copay: Optional[float] = None


# --- Endpoints ---

async def _build_medication_response(med: Medication, db: AsyncSession, country_filter: Optional[str] = None, lang: Optional[str] = None) -> dict:
    """Build response dict with countries, government programs, country-specific brands, and i18n."""
    # Get countries from junction table
    countries_result = await db.execute(
        select(MedicationCountry.country_code).where(MedicationCountry.medication_id == med.id)
    )
    countries = [row[0] for row in countries_result.all()]

    # Get government programs for this medication
    programs_result = await db.execute(
        select(GovernmentProgram).join(
            MedicationGovernmentProgram,
            and_(
                MedicationGovernmentProgram.program_id == GovernmentProgram.id,
                MedicationGovernmentProgram.medication_id == med.id,
                MedicationGovernmentProgram.is_active == True,
            )
        ).where(GovernmentProgram.is_active == True)
    )
    all_programs = programs_result.scalars().all()

    # If filtering by country, only show programs for that country
    if country_filter:
        programs = [p for p in all_programs if p.country == country_filter]
    else:
        programs = all_programs

    # Get country-specific brand names
    brands = med.common_brands  # default: origin country brands
    if country_filter:
        brand_result = await db.execute(
            select(MedicationBrand.brand_names).where(
                and_(
                    MedicationBrand.medication_id == med.id,
                    MedicationBrand.country_code == country_filter,
                )
            )
        )
        country_brands = brand_result.scalar_one_or_none()
        if country_brands:
            brands = country_brands

    response = {
        "id": med.id,
        "name": med.name,
        "active_principle": med.active_principle,
        "presentation": med.presentation,
        "atc_code": med.atc_code,
        "therapeutic_class": med.therapeutic_class,
        "requires_prescription": med.requires_prescription,
        "controlled_type": med.controlled_type,
        "item_type": med.item_type,
        "country": med.country,
        "countries": countries,
        "farmacia_popular": med.farmacia_popular,
        "farmacia_popular_copay": med.farmacia_popular_copay,
        "common_brands": brands,
        "administration_route": med.administration_route,
        "usual_posology": med.usual_posology,
        "max_daily_dose": med.max_daily_dose,
        "common_indications": med.common_indications,
        "pregnancy_category": med.pregnancy_category,
        "renal_adjustment": med.renal_adjustment,
        "hepatic_adjustment": med.hepatic_adjustment,
        "is_active": med.is_active,
        "government_programs": [
            {"code": p.code, "name": p.name, "all_items_free": p.all_items_free}
            for p in programs
        ],
    }

    # i18n: always look up a DB translation if `lang` is provided —
    # including PT, so a UY medication whose base `name` is in Spanish
    # can be served in Portuguese once a translation row is seeded.
    if lang:
        translation_result = await db.execute(
            select(MedicationTranslation).where(
                and_(
                    MedicationTranslation.medication_id == med.id,
                    MedicationTranslation.locale == lang,
                )
            )
        )
        translation = translation_result.scalar_one_or_none()
        if translation:
            response['name'] = translation.name
            response['active_principle'] = translation.active_principle

        # Dictionary-based fallback (presentation, therapeutic_class, route)
        # only makes sense for EN/ES — the dictionaries are PT → target.
        if lang != 'pt':
            db_override = (
                {
                    'name': translation.name,
                    'active_principle': translation.active_principle,
                }
                if translation
                else None
            )
            response = translate_medication_response(response, lang, db_override)

    return response


@router.get("", response_model=List[MedicationResponse])
async def search_medications(
    search: Optional[str] = None,
    farmacia_popular: Optional[bool] = None,
    has_gov_program: Optional[bool] = None,
    therapeutic_class: Optional[str] = None,
    controlled_type: Optional[str] = None,
    item_type: Optional[str] = Query('medication', description="Filter by item type: 'medication', 'supply', or 'all'"),
    country: Optional[str] = Query(None, description="Filter by country code (e.g. 'br')"),
    lang: Optional[str] = Query(None, description="Language for translated fields (en, es, pt)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Search medications with filters. Searches across name, active principle, brands, indications, posology, and more."""
    query = select(Medication).where(Medication.is_active == True)

    # Filter by item type (default: medication only)
    if item_type and item_type != 'all':
        query = query.where(Medication.item_type == item_type)

    if search:
        search_term = f"%{search}%"
        # Word boundary pattern for text fields (prevents "dor" matching "vasodilatador")
        word_pattern = f"\\m{re.escape(search)}\\M"
        query = query.where(
            or_(
                # Substring match for names/brands (allows partial drug name search)
                Medication.name.ilike(search_term),
                Medication.active_principle.ilike(search_term),
                Medication.common_brands.ilike(search_term),
                Medication.presentation.ilike(search_term),
                # Word boundary match for clinical text fields
                Medication.therapeutic_class.op('~*')(word_pattern),
                Medication.common_indications.op('~*')(word_pattern),
                Medication.usual_posology.op('~*')(word_pattern),
                Medication.max_daily_dose.op('~*')(word_pattern),
                # Also search country-specific brand names
                exists(
                    select(MedicationBrand.id).where(
                        and_(
                            MedicationBrand.medication_id == Medication.id,
                            MedicationBrand.brand_names.ilike(search_term),
                        )
                    )
                ),
            )
        )

    if farmacia_popular is not None:
        query = query.where(Medication.farmacia_popular == farmacia_popular)

    if has_gov_program:
        # Filter medications that have ANY active government program (optionally for a specific country)
        gov_subquery = select(MedicationGovernmentProgram.medication_id).join(
            GovernmentProgram,
            and_(
                GovernmentProgram.id == MedicationGovernmentProgram.program_id,
                GovernmentProgram.is_active == True,
                MedicationGovernmentProgram.is_active == True,
            )
        )
        if country:
            gov_subquery = gov_subquery.where(GovernmentProgram.country == country)
        query = query.where(Medication.id.in_(gov_subquery))

    if therapeutic_class:
        query = query.where(Medication.therapeutic_class.ilike(f"%{therapeutic_class}%"))

    if controlled_type:
        query = query.where(Medication.controlled_type == controlled_type)

    # Filter by country: a medication is available in a country if either
    # its origin `country` column matches, OR a MedicationCountry row exists
    # linking the medication to that country (for cross-listed drugs).
    if country:
        query = query.where(
            or_(
                Medication.country == country,
                Medication.id.in_(
                    select(MedicationCountry.medication_id).where(
                        MedicationCountry.country_code == country
                    )
                ),
            )
        )

    query = query.order_by(Medication.name).offset(offset).limit(limit)

    result = await db.execute(query)
    meds = result.scalars().all()

    await track_activity(db, current_user.id, 'pharmacy', 'search')
    await db.commit()

    return [await _build_medication_response(med, db, country, lang) for med in meds]


@router.get("/farmacia-popular", response_model=List[MedicationResponse])
async def list_farmacia_popular(
    therapeutic_class: Optional[str] = None,
    copay_free: Optional[bool] = None,  # Kept for backward compat; all items are free since Feb 2025
    search: Optional[str] = None,
    lang: Optional[str] = Query(None, description="Language for translated fields (en, es, pt)"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List Farmácia Popular medications. All items are 100% free since Feb 2025."""
    query = select(Medication).where(
        and_(
            Medication.is_active == True,
            Medication.farmacia_popular == True,
        )
    )

    if therapeutic_class:
        query = query.where(Medication.therapeutic_class.ilike(f"%{therapeutic_class}%"))

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Medication.name.ilike(search_term),
                Medication.active_principle.ilike(search_term),
            )
        )

    query = query.order_by(Medication.name).offset(offset).limit(limit)

    result = await db.execute(query)
    meds = result.scalars().all()

    return [await _build_medication_response(med, db, lang=lang) for med in meds]


@router.get("/government-programs", response_model=List[GovernmentProgramResponse])
async def list_government_programs(
    country: Optional[str] = Query(None, description="Filter by country code"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List active government medication programs."""
    query = select(GovernmentProgram).where(GovernmentProgram.is_active == True)
    if country:
        query = query.where(GovernmentProgram.country == country)
    query = query.order_by(GovernmentProgram.country, GovernmentProgram.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/government-programs/{code}", response_model=GovernmentProgramResponse)
async def get_government_program(
    code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific government program by code."""
    result = await db.execute(
        select(GovernmentProgram).where(GovernmentProgram.code == code)
    )
    program = result.scalar_one_or_none()
    if not program:
        raise HTTPException(status_code=404, detail="Government program not found")
    return program


@router.get("/{medication_id}", response_model=MedicationResponse)
async def get_medication(
    medication_id: int,
    lang: Optional[str] = Query(None, description="Language for translated fields (en, es, pt)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific medication by ID."""
    result = await db.execute(
        select(Medication).where(Medication.id == medication_id)
    )
    medication = result.scalar_one_or_none()
    if not medication:
        raise HTTPException(status_code=404, detail="Medication not found")
    return await _build_medication_response(medication, db, lang=lang)


@router.post("", response_model=MedicationResponse, status_code=status.HTTP_201_CREATED)
async def create_medication(
    payload: MedicationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a medication (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    medication = Medication(**payload.model_dump())
    db.add(medication)
    await db.commit()
    await db.refresh(medication)

    logger.info(f"Medication created: {medication.name} by {current_user.email}")
    return medication


@router.put("/{medication_id}", response_model=MedicationResponse)
async def update_medication(
    medication_id: int,
    payload: MedicationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a medication (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(Medication).where(Medication.id == medication_id)
    )
    medication = result.scalar_one_or_none()
    if not medication:
        raise HTTPException(status_code=404, detail="Medication not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(medication, key, value)

    await db.commit()
    await db.refresh(medication)

    logger.info(f"Medication updated: {medication.name} by {current_user.email}")
    return medication


@router.post("/check-interactions", response_model=List[InteractionResponse])
async def check_drug_interactions(
    payload: InteractionCheckRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Check drug interactions between active principles.
    FREE (0 dracmas) — strategic loss leader for engagement.
    """
    interactions = await check_interactions(payload.active_principles, db)
    return interactions


@router.post("/bulk-import")
async def bulk_import_medications(
    items: List[BulkImportItem],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Bulk import medications from JSON (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    created = 0
    skipped = 0

    for item in items:
        # Check if medication already exists by name + active_principle
        result = await db.execute(
            select(Medication).where(
                and_(
                    func.lower(Medication.name) == item.name.lower(),
                    func.lower(Medication.active_principle) == item.active_principle.lower(),
                )
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            skipped += 1
            continue

        medication = Medication(**item.model_dump())
        db.add(medication)
        created += 1

    await db.commit()
    logger.info(f"Bulk import: {created} created, {skipped} skipped by {current_user.email}")

    return {"created": created, "skipped": skipped, "total": len(items)}
