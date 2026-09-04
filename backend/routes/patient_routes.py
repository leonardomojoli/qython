# qython/backend/routes/patient_routes.py
"""
Patient management API endpoints for the ambulatory module.
Allows doctors to register and manage their patients.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User, Patient, Consultation
from ..security import get_current_active_user
from ..services.llm_services import normalize_clinical_terms, parse_clinical_history, parse_and_extract_from_history, extract_patient_updates
from ..services.billing_service import debit_dracmas_for_feature
from ..services.data_collector_service import collect_data
from ..services.preference_service import collect_preference_pair
from ..services import audit_service

logger = logging.getLogger("qython_logger")
router = APIRouter()

# Prepositions/articles that stay lowercase in names (pt/es/en/de/it)
_NAME_LOWERCASE = {'de', 'da', 'do', 'das', 'dos', 'e', 'del', 'la', 'las', 'los', 'van', 'von', 'di'}
# Apostrophe prefixes that stay lowercase (d'Ávila, l'Amour)
_APOSTROPHE_LOWER = {'d', 'l'}

def _capitalize_part(part: str) -> str:
    """Capitalize a single name part, handling apostrophes (d'Ávila, O'Brien)."""
    if "'" in part:
        segments = part.split("'", 1)
        prefix = segments[0]
        suffix = segments[1].capitalize() if len(segments) > 1 else ''
        if prefix.lower() in _APOSTROPHE_LOWER:
            return f"{prefix.lower()}'{suffix}"
        return f"{prefix.capitalize()}'{suffix}"
    return part.capitalize()

def _capitalize_name(name: str) -> str:
    """Title-case a patient name, keeping prepositions lowercase."""
    parts = name.strip().split()
    if not parts:
        return name
    result = [_capitalize_part(parts[0])]
    for part in parts[1:]:
        if part.lower() in _NAME_LOWERCASE:
            result.append(part.lower())
        else:
            result.append(_capitalize_part(part))
    return ' '.join(result)


# --- Pydantic Models ---

class PatientCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    birth_date: Optional[datetime] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    country: Optional[str] = None  # Patient nationality (br, co, ar, mx, etc.)
    document_id: Optional[str] = None  # National ID (CPF, CC, DNI, CURP, etc.)
    address: Optional[str] = None  # Patient address (important for family medicine)
    allergies: Optional[List[str]] = None
    chronic_conditions: Optional[List[str]] = None
    current_medications: Optional[List[str]] = None
    notes: Optional[str] = None
    clinical_history: Optional[str] = None  # Raw imported history text
    clinical_history_parsed: Optional[List[dict]] = None  # AI-structured consultation records


class PatientUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=150)
    birth_date: Optional[datetime] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    country: Optional[str] = None  # Patient nationality (br, co, ar, mx, etc.)
    document_id: Optional[str] = None  # National ID (CPF, CC, DNI, CURP, etc.)
    address: Optional[str] = None  # Patient address (important for family medicine)
    allergies: Optional[List[str]] = None
    chronic_conditions: Optional[List[str]] = None
    current_medications: Optional[List[str]] = None
    notes: Optional[str] = None
    clinical_history: Optional[str] = None  # Raw imported history text


class PatientResponse(BaseModel):
    id: int
    full_name: str
    birth_date: Optional[datetime]
    gender: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    country: Optional[str]
    document_id: Optional[str]
    address: Optional[str]
    allergies: Optional[List[str]]
    chronic_conditions: Optional[List[str]]
    current_medications: Optional[List[str]]
    notes: Optional[str]
    clinical_history: Optional[str]
    clinical_history_parsed: Optional[List[dict]]
    created_at: datetime

    class Config:
        from_attributes = True


class ClinicalHistoryPayload(BaseModel):
    raw_history: str = Field(..., min_length=10, alias='rawHistory')

    class Config:
        populate_by_name = True


class ClinicalHistoryResponse(BaseModel):
    raw_history: str = Field(..., alias='rawHistory')
    parsed_history: Optional[List[dict]] = Field(None, alias='parsedHistory')
    training_data_id: Optional[int] = Field(None, alias='trainingDataId')  # match de feedback à prova de balas

    class Config:
        populate_by_name = True


class SaveHistoryPayload(BaseModel):
    """Payload para salvar o histórico organizado/editado"""
    parsed_history: List[dict] = Field(..., alias='parsedHistory')
    raw_history: Optional[str] = Field(None, alias='rawHistory')

    class Config:
        populate_by_name = True


class HistoryEntryPayload(BaseModel):
    """Payload para editar uma entrada específica do histórico"""
    date: Optional[str] = Field(None, max_length=50)
    chief_complaint: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=10000)
    diagnosis: Optional[str] = Field(None, max_length=1000)
    plan: Optional[str] = Field(None, max_length=5000)
    provider: Optional[str] = Field(None, max_length=200)


class HistoryImportPreviewPayload(BaseModel):
    """Payload for previewing history import (no patient_id required)."""
    raw_history: str = Field(..., min_length=20, alias='rawHistory')

    class Config:
        populate_by_name = True


class HistoryImportPreviewResponse(BaseModel):
    """Response with parsed consultations + extracted patient fields."""
    parsed_history: Optional[List[dict]] = Field(None, alias='parsedHistory')
    extracted_fields: Optional[dict] = Field(None, alias='extractedFields')

    class Config:
        populate_by_name = True


class ExtractUpdatesPayload(BaseModel):
    """Payload for extracting patient info updates from consultation notes."""
    consultation_id: int = Field(..., alias='consultationId')
    notes: str = Field(..., max_length=100000)
    summary: Optional[str] = Field(None, max_length=50000)

    class Config:
        populate_by_name = True


class ProposedChange(BaseModel):
    category: str       # "medications", "chronic_conditions", "allergies", "demographics"
    action: str         # "add", "remove", "modify", "update"
    value: str
    old_value: Optional[str] = None
    reasoning: str


class ExtractUpdatesResponse(BaseModel):
    has_changes: bool
    changes: List[ProposedChange]


class ApplyUpdatesPayload(BaseModel):
    """Payload for applying accepted patient info updates."""
    consultation_id: int = Field(..., alias='consultationId')
    accepted_changes: List[dict]
    rejected_changes: List[dict] = []

    class Config:
        populate_by_name = True


# --- Endpoints ---

@router.get("", response_model=List[PatientResponse])
async def list_patients(
    search: Optional[str] = Query(None, description="Search by name, email, phone or document ID"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all patients registered by the current doctor."""
    query = select(Patient).where(Patient.doctor_id == current_user.id)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Patient.full_name.ilike(search_term),
                Patient.email.ilike(search_term),
                Patient.phone.ilike(search_term),
                Patient.document_id.ilike(search_term)
            )
        )
    
    query = query.order_by(Patient.full_name).offset(offset).limit(limit)
    
    result = await db.execute(query)
    patients = result.scalars().all()
    
    return patients


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_patient(
    payload: PatientCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Register a new patient with AI-normalized clinical terms."""
    # Cobrar por normalizações (1 dracma cada campo com conteúdo)
    campos_para_normalizar = [payload.allergies, payload.chronic_conditions, payload.current_medications]
    for campo in campos_para_normalizar:
        if campo and len(campo) > 0:
            await debit_dracmas_for_feature(current_user, "normalize_clinical_terms", db)

    # Normalize clinical terms using Gemini Flash Lite
    # This converts "pressão alta" -> "Hipertensão Arterial Sistêmica"
    # and detects negations like "nega" -> None
    import json
    language_code = current_user.language_preference or 'pt-BR'

    normalized_allergies = await normalize_clinical_terms('allergies', payload.allergies)
    normalized_conditions = await normalize_clinical_terms('chronic_conditions', payload.chronic_conditions)
    normalized_medications = await normalize_clinical_terms('current_medications', payload.current_medications)

    # --- DATA FLYWHEEL: Salvar normalizações clínicas ---
    normalization_pairs = [
        ('allergies', payload.allergies, normalized_allergies),
        ('chronic_conditions', payload.chronic_conditions, normalized_conditions),
        ('current_medications', payload.current_medications, normalized_medications)
    ]
    for field_type, raw_terms, normalized_terms in normalization_pairs:
        if raw_terms and len(raw_terms) > 0:
            await collect_data(
                db, current_user.id, "clinical_term_normalization",
                json.dumps(raw_terms, ensure_ascii=False),
                json.dumps(normalized_terms, ensure_ascii=False) if normalized_terms else "[]",
                {"field_type": field_type},
                quality=0,
                lang=language_code
            )

    # Auto-capitalize patient name
    formatted_name = _capitalize_name(payload.full_name)

    new_patient = Patient(
        doctor_id=current_user.id,
        full_name=formatted_name,
        birth_date=payload.birth_date,
        gender=payload.gender,
        phone=payload.phone,
        email=payload.email,
        country=payload.country,
        document_id=payload.document_id,
        address=payload.address,
        allergies=normalized_allergies,
        chronic_conditions=normalized_conditions,
        current_medications=normalized_medications,
        clinical_history=payload.clinical_history,
        clinical_history_parsed=payload.clinical_history_parsed,
        notes=payload.notes
    )

    db.add(new_patient)
    await db.commit()
    await db.refresh(new_patient)

    await audit_service.log(
        db,
        action='patient.create',
        actor_user_id=current_user.id,
        actor_role='medico',
        target_type='Patient',
        target_id=new_patient.id,
        affected_user_id=current_user.id,
        commit=True,
    )

    logger.info(f"Patient created: {new_patient.id} by doctor {current_user.id}")
    return new_patient


@router.post("/preview-history-import", response_model=HistoryImportPreviewResponse)
async def preview_history_import(
    payload: HistoryImportPreviewPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Preview clinical history import: parse consultations and extract patient data.
    No patient_id required — used before patient creation to auto-fill the form.
    """
    import json

    try:
        # Charge for history parsing (5 dracmas)
        await debit_dracmas_for_feature(current_user, "parse_clinical_history", db)

        language_code = current_user.language_preference or 'pt-BR'

        result = await parse_and_extract_from_history(
            payload.raw_history,
            language_code
        )

        if not result:
            return {"parsedHistory": None, "extractedFields": None}

        # --- DATA FLYWHEEL ---
        try:
            await collect_data(
                db, current_user.id, "clinical_history_parsing",
                payload.raw_history,
                json.dumps(result.get('consultations', []), ensure_ascii=False),
                {"source": "preview_import", "num_entries": len(result.get('consultations', []))},
                quality=0,
                lang=language_code
            )
        except Exception:
            pass  # Data flywheel must not block

        await db.commit()

        logger.info(f"History import preview by doctor {current_user.id}: "
                     f"{len(result.get('consultations', []))} consultations extracted")

        return {
            "parsedHistory": result.get('consultations'),
            "extractedFields": result.get('patient_data')
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in preview history import: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao processar histórico clínico"
        )


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific patient by ID."""
    result = await db.execute(
        select(Patient).where(
            Patient.id == patient_id,
            Patient.doctor_id == current_user.id
        )
    )
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado"
        )

    await audit_service.log(
        db,
        action='patient.read',
        actor_user_id=current_user.id,
        actor_role='medico',
        target_type='Patient',
        target_id=patient.id,
        affected_user_id=current_user.id,
        commit=True,
    )

    return patient


@router.put("/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: int,
    payload: PatientUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a patient's information with AI-normalized clinical terms."""
    result = await db.execute(
        select(Patient).where(
            Patient.id == patient_id,
            Patient.doctor_id == current_user.id
        )
    )
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado"
        )

    # Update only provided fields
    update_data = payload.model_dump(exclude_unset=True)

    # Capitalize patient name if provided
    if 'full_name' in update_data and update_data['full_name']:
        update_data['full_name'] = _capitalize_name(update_data['full_name'])

    # Cobrar por normalizações (1 dracma cada campo clínico atualizado)
    clinical_fields = ['allergies', 'chronic_conditions', 'current_medications']
    for field in clinical_fields:
        if field in update_data and update_data[field] is not None and len(update_data[field]) > 0:
            await debit_dracmas_for_feature(current_user, "normalize_clinical_terms", db)

    # Normalize clinical terms if they are being updated
    import json
    language_code = current_user.language_preference or 'pt-BR'

    for field in clinical_fields:
        if field in update_data and update_data[field] is not None:
            raw_terms = update_data[field]
            normalized_terms = await normalize_clinical_terms(field, raw_terms)
            update_data[field] = normalized_terms

            # --- DATA FLYWHEEL: Salvar normalizações clínicas ---
            if raw_terms and len(raw_terms) > 0:
                await collect_data(
                    db, current_user.id, "clinical_term_normalization",
                    json.dumps(raw_terms, ensure_ascii=False),
                    json.dumps(normalized_terms, ensure_ascii=False) if normalized_terms else "[]",
                    {"field_type": field},
                    quality=0,
                    lang=language_code
                )

    for field, value in update_data.items():
        setattr(patient, field, value)

    patient.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(patient)

    await audit_service.log(
        db,
        action='patient.update',
        actor_user_id=current_user.id,
        actor_role='medico',
        target_type='Patient',
        target_id=patient.id,
        affected_user_id=current_user.id,
        metadata={'fields': list(update_data.keys())},
        commit=True,
    )

    logger.info(f"Patient updated: {patient_id} by doctor {current_user.id}")
    return patient


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a patient (and all related records)."""
    result = await db.execute(
        select(Patient).where(
            Patient.id == patient_id,
            Patient.doctor_id == current_user.id
        )
    )
    patient = result.scalar_one_or_none()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado"
        )
    
    deleted_id = patient.id
    await db.delete(patient)
    await db.commit()

    await audit_service.log(
        db,
        action='patient.delete',
        actor_user_id=current_user.id,
        actor_role='medico',
        target_type='Patient',
        target_id=deleted_id,
        affected_user_id=current_user.id,
        commit=True,
    )

    logger.info(f"Patient deleted: {patient_id} by doctor {current_user.id}")
    return None


@router.post("/{patient_id}/extract-updates", response_model=ExtractUpdatesResponse)
async def extract_updates(
    patient_id: int,
    payload: ExtractUpdatesPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Extract patient info updates from consultation notes using LLM.
    Compares notes with current patient data and proposes changes for confirmation.
    """
    result = await db.execute(
        select(Patient).where(
            Patient.id == patient_id,
            Patient.doctor_id == current_user.id
        )
    )
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado"
        )

    try:
        await debit_dracmas_for_feature(current_user, "extract_patient_updates", db)

        language_code = current_user.language_preference or 'pt-BR'

        # Read the SAVED consultation from DB — this is the source of truth
        # (includes any manual edits the doctor made after AI improvement)
        notes_to_use = payload.notes
        summary_to_use = payload.summary or ''
        if payload.consultation_id:
            consultation_result = await db.execute(
                select(Consultation).where(
                    Consultation.id == payload.consultation_id,
                    Consultation.user_id == current_user.id
                )
            )
            saved_consultation = consultation_result.scalar_one_or_none()
            if saved_consultation:
                db_notes = saved_consultation.improved_notes or saved_consultation.raw_notes or ''
                db_summary = saved_consultation.summary or ''
                if db_notes and db_notes != notes_to_use:
                    logger.warning(
                        f"[EXTRACT_UPDATES] Notes mismatch: payload={len(notes_to_use)} chars, "
                        f"db={len(db_notes)} chars. Using DB version (source of truth)."
                    )
                notes_to_use = db_notes or notes_to_use
                summary_to_use = db_summary or summary_to_use

        current_patient_info = {
            'allergies': patient.allergies or [],
            'chronic_conditions': patient.chronic_conditions or [],
            'current_medications': patient.current_medications or [],
            'phone': patient.phone or '',
            'email': patient.email or '',
            'address': patient.address or '',
        }

        llm_result = await run_in_threadpool(
            extract_patient_updates,
            consultation_notes=notes_to_use,
            summary=summary_to_use,
            current_patient_info=current_patient_info,
            language_code=language_code
        )

        if not llm_result or not llm_result.get('has_changes'):
            return ExtractUpdatesResponse(has_changes=False, changes=[])

        # Convert LLM output to flat list of ProposedChange
        changes = []
        reasoning = llm_result.get('reasoning', {})

        # Medications
        meds = llm_result.get('medications', {})
        for med in meds.get('add', []):
            changes.append(ProposedChange(
                category='medications', action='add', value=med,
                reasoning=reasoning.get(med, '')
            ))
        for med in meds.get('remove', []):
            changes.append(ProposedChange(
                category='medications', action='remove', value=med,
                reasoning=reasoning.get(med, '')
            ))
        for mod in meds.get('modify', []):
            changes.append(ProposedChange(
                category='medications', action='modify',
                value=mod.get('to', ''), old_value=mod.get('from', ''),
                reasoning=reasoning.get(mod.get('to', ''), reasoning.get(mod.get('from', ''), ''))
            ))

        # Chronic conditions
        conditions = llm_result.get('chronic_conditions', {})
        for cond in conditions.get('add', []):
            changes.append(ProposedChange(
                category='chronic_conditions', action='add', value=cond,
                reasoning=reasoning.get(cond, '')
            ))
        for cond in conditions.get('remove', []):
            changes.append(ProposedChange(
                category='chronic_conditions', action='remove', value=cond,
                reasoning=reasoning.get(cond, '')
            ))

        # Allergies
        allergies = llm_result.get('allergies', {})
        for allergy in allergies.get('add', []):
            changes.append(ProposedChange(
                category='allergies', action='add', value=allergy,
                reasoning=reasoning.get(allergy, '')
            ))
        for allergy in allergies.get('remove', []):
            changes.append(ProposedChange(
                category='allergies', action='remove', value=allergy,
                reasoning=reasoning.get(allergy, '')
            ))

        # Demographics (category includes field name: demographics.phone, etc.)
        demographics = llm_result.get('demographics', {})
        for field in ['phone', 'email', 'address']:
            val = demographics.get(field, '')
            if val:
                old = current_patient_info.get(field, '')
                changes.append(ProposedChange(
                    category=f'demographics.{field}', action='update', value=val,
                    old_value=old if old else None,
                    reasoning=reasoning.get(field, reasoning.get(val, ''))
                ))

        logger.info(f"Extract updates for patient {patient_id}: {len(changes)} changes detected")
        return ExtractUpdatesResponse(has_changes=len(changes) > 0, changes=changes)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in extract_updates: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao extrair atualizações do paciente"
        )


@router.post("/{patient_id}/apply-updates", response_model=PatientResponse)
async def apply_updates(
    patient_id: int,
    payload: ApplyUpdatesPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Apply accepted patient info updates extracted from consultation notes.
    Also collects data flywheel entries for training.
    """
    result = await db.execute(
        select(Patient).where(
            Patient.id == patient_id,
            Patient.doctor_id == current_user.id
        )
    )
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado"
        )

    import json
    language_code = current_user.language_preference or 'pt-BR'

    try:
        for change in payload.accepted_changes:
            category = change.get('category')
            action = change.get('action')
            value = change.get('value', '')
            old_value = change.get('old_value', '')

            if category == 'medications':
                meds = list(patient.current_medications or [])
                if action == 'add':
                    normalized = await normalize_clinical_terms('current_medications', [value])
                    if normalized:
                        meds.extend(normalized)
                elif action == 'remove':
                    meds = [m for m in meds if m.lower() != value.lower()]
                elif action == 'modify':
                    meds = [m for m in meds if m.lower() != old_value.lower()]
                    normalized = await normalize_clinical_terms('current_medications', [value])
                    if normalized:
                        meds.extend(normalized)
                patient.current_medications = meds

            elif category == 'chronic_conditions':
                conditions = list(patient.chronic_conditions or [])
                if action == 'add':
                    normalized = await normalize_clinical_terms('chronic_conditions', [value])
                    if normalized:
                        conditions.extend(normalized)
                elif action == 'remove':
                    conditions = [c for c in conditions if c.lower() != value.lower()]
                patient.chronic_conditions = conditions

            elif category == 'allergies':
                allergies = list(patient.allergies or [])
                if action == 'add':
                    normalized = await normalize_clinical_terms('allergies', [value])
                    if normalized:
                        allergies.extend(normalized)
                elif action == 'remove':
                    allergies = [a for a in allergies if a.lower() != value.lower()]
                patient.allergies = allergies

            elif category.startswith('demographics.'):
                demo_field = category.split('.', 1)[1]
                if demo_field in ('phone', 'email', 'address') and value:
                    setattr(patient, demo_field, value)

        patient.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(patient)

        # --- DATA FLYWHEEL (non-blocking) ---
        try:
            await collect_data(
                db, current_user.id, "patient_info_extraction",
                json.dumps({"consultation_id": payload.consultation_id, "patient_id": patient_id}, ensure_ascii=False),
                json.dumps(payload.accepted_changes, ensure_ascii=False),
                {"num_accepted": len(payload.accepted_changes), "num_rejected": len(payload.rejected_changes)},
                quality=1,
                lang=language_code
            )

            # If there are rejections, collect preference pair for DPO
            if payload.rejected_changes:
                await collect_preference_pair(
                    db=db,
                    user_id=current_user.id,
                    prompt=json.dumps({"consultation_id": payload.consultation_id, "patient_id": patient_id}, ensure_ascii=False),
                    chosen=json.dumps(payload.accepted_changes, ensure_ascii=False),
                    rejected=json.dumps(payload.rejected_changes, ensure_ascii=False),
                    source_type="patient_info_extraction_correction",
                    preference_source='human',
                    confidence_score=1.0,
                    metadata={
                        "consultation_id": payload.consultation_id,
                        "patient_id": patient_id,
                    },
                    language=language_code
                )
        except Exception:
            pass  # Data flywheel must not block

        logger.info(f"Applied {len(payload.accepted_changes)} updates to patient {patient_id} "
                     f"(rejected {len(payload.rejected_changes)})")
        return patient

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in apply_updates: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao aplicar atualizações do paciente"
        )


@router.post("/{patient_id}/parse-history", response_model=ClinicalHistoryResponse)
async def parse_patient_history(
    patient_id: int,
    payload: ClinicalHistoryPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Parse and organize raw clinical history text using AI.
    Structures the text into individual consultations with dates, complaints, etc.
    """
    result = await db.execute(
        select(Patient).where(
            Patient.id == patient_id,
            Patient.doctor_id == current_user.id
        )
    )
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado"
        )

    try:
        # Cobrar pela importação de histórico clínico (5 dracmas)
        await debit_dracmas_for_feature(current_user, "parse_clinical_history", db)

        language_code = current_user.language_preference or 'pt-BR'

        # Parse the clinical history using AI
        parsed_history = await parse_clinical_history(
            payload.raw_history,
            language_code
        )

        # --- DATA FLYWHEEL: Salvar parsing de histórico clínico ---
        import json
        training_data_id = await collect_data(
            db, current_user.id, "clinical_history_parsing",
            payload.raw_history,
            json.dumps(parsed_history, ensure_ascii=False) if parsed_history else "[]",
            {"patient_id": patient_id, "num_entries": len(parsed_history) if parsed_history else 0},
            quality=0,
            lang=language_code
        )

        # Save both raw and parsed history to the patient
        patient.clinical_history = payload.raw_history
        patient.clinical_history_parsed = parsed_history
        patient.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(patient)

        logger.info(f"Clinical history parsed for patient {patient_id} by doctor {current_user.id}")

        return {
            "rawHistory": payload.raw_history,
            "parsedHistory": parsed_history,
            "trainingDataId": training_data_id
        }
    except Exception as e:
        await db.rollback()
        logger.error(f"Error parsing clinical history for patient {patient_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao processar histórico clínico"
        )


@router.get("/{patient_id}/history", response_model=ClinicalHistoryResponse)
async def get_patient_history(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get the clinical history for a patient."""
    result = await db.execute(
        select(Patient).where(
            Patient.id == patient_id,
            Patient.doctor_id == current_user.id
        )
    )
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado"
        )

    return {
        "rawHistory": patient.clinical_history or "",
        "parsedHistory": patient.clinical_history_parsed
    }


@router.put("/{patient_id}/history", response_model=ClinicalHistoryResponse)
async def save_patient_history(
    patient_id: int,
    payload: SaveHistoryPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Save/update the entire clinical history for a patient.
    Used when the user saves an organized history or makes bulk edits.
    """
    result = await db.execute(
        select(Patient).where(
            Patient.id == patient_id,
            Patient.doctor_id == current_user.id
        )
    )
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado"
        )

    try:
        patient.clinical_history_parsed = payload.parsed_history
        if payload.raw_history is not None:
            patient.clinical_history = payload.raw_history
        patient.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(patient)

        logger.info(f"Clinical history saved for patient {patient_id} by doctor {current_user.id}")

        return {
            "rawHistory": patient.clinical_history or "",
            "parsedHistory": patient.clinical_history_parsed
        }
    except Exception as e:
        await db.rollback()
        logger.error(f"Error saving clinical history for patient {patient_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao salvar histórico clínico"
        )


@router.patch("/{patient_id}/history/{entry_index}", response_model=ClinicalHistoryResponse)
async def update_history_entry(
    patient_id: int,
    entry_index: int,
    payload: HistoryEntryPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update a specific entry in the patient's clinical history.
    Entry is identified by its index in the parsed_history array.
    """
    result = await db.execute(
        select(Patient).where(
            Patient.id == patient_id,
            Patient.doctor_id == current_user.id
        )
    )
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado"
        )

    existing_history = patient.clinical_history_parsed or []

    if entry_index < 0 or entry_index >= len(existing_history):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entrada de histórico não encontrada"
        )

    try:
        # Update only the fields that were provided
        entry = existing_history[entry_index]
        if payload.date is not None:
            entry["date"] = payload.date
        if payload.chief_complaint is not None:
            entry["chief_complaint"] = payload.chief_complaint
        if payload.notes is not None:
            entry["notes"] = payload.notes
        if payload.diagnosis is not None:
            entry["diagnosis"] = payload.diagnosis
        if payload.plan is not None:
            entry["plan"] = payload.plan
        if payload.provider is not None:
            entry["provider"] = payload.provider

        existing_history[entry_index] = entry
        patient.clinical_history_parsed = existing_history
        patient.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(patient)

        logger.info(f"Clinical history entry {entry_index} updated for patient {patient_id} by doctor {current_user.id}")

        return {
            "rawHistory": patient.clinical_history or "",
            "parsedHistory": patient.clinical_history_parsed
        }
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating clinical history entry for patient {patient_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao atualizar entrada do histórico"
        )


