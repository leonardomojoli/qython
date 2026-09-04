"""
Sync API endpoints for offline mode.
Provides delta-sync for medications, drug interactions, and user data.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from typing import Optional

from ..database import get_db
from ..models import (
    User, Medication, DrugInteraction, MedicationGovernmentProgram,
    GovernmentProgram, Patient, Consultation
)
from ..security import get_current_active_user

router = APIRouter()


@router.get("/medications")
async def sync_medications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    since: Optional[str] = Query(None, description="ISO timestamp for delta sync"),
    country: Optional[str] = Query(None, description="Country code filter"),
):
    """Sync medications -- full dump or filtered by country."""
    server_timestamp = datetime.now(timezone.utc).isoformat()

    query = select(Medication).options(
        selectinload(Medication.country_links),
        selectinload(Medication.brands),
    )

    if country:
        query = query.where(Medication.country == country)

    # Medications have updated_at but data is relatively static.
    # Support delta sync if 'since' is provided.
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            query = query.where(
                (Medication.updated_at > since_dt) |
                (Medication.created_at > since_dt)
            )
            is_full_sync = False
        except ValueError:
            is_full_sync = True
    else:
        is_full_sync = True

    result = await db.execute(query)
    medications = result.scalars().all()

    return {
        "medications": [_medication_to_dict(m) for m in medications],
        "server_timestamp": server_timestamp,
        "total_count": len(medications),
        "is_full_sync": is_full_sync,
    }


@router.get("/interactions")
async def sync_interactions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    since: Optional[str] = Query(None, description="ISO timestamp for delta sync"),
):
    """Sync drug interactions -- full dump or delta since timestamp."""
    server_timestamp = datetime.now(timezone.utc).isoformat()

    query = select(DrugInteraction)
    is_full_sync = True

    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            query = query.where(
                (DrugInteraction.updated_at > since_dt) |
                (DrugInteraction.created_at > since_dt)
            )
            is_full_sync = False
        except ValueError:
            pass  # Invalid date, return full sync

    result = await db.execute(query)
    interactions = result.scalars().all()

    return {
        "interactions": [_interaction_to_dict(i) for i in interactions],
        "server_timestamp": server_timestamp,
        "total_count": len(interactions),
        "is_full_sync": is_full_sync,
    }


@router.get("/user-data")
async def sync_user_data(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    since: Optional[str] = Query(None, description="ISO timestamp for delta sync"),
):
    """Sync user's patients and recent consultations."""
    server_timestamp = datetime.now(timezone.utc).isoformat()

    # Patients query
    patients_query = select(Patient).where(Patient.doctor_id == user.id)
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            patients_query = patients_query.where(Patient.updated_at > since_dt)
        except ValueError:
            pass

    patients_result = await db.execute(patients_query)
    patients = patients_result.scalars().all()

    # Consultations query -- last 50
    consultations_query = (
        select(Consultation)
        .where(Consultation.user_id == user.id)
        .order_by(Consultation.created_at.desc())
        .limit(50)
    )
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            consultations_query = (
                select(Consultation)
                .where(Consultation.user_id == user.id)
                .where(Consultation.updated_at > since_dt)
                .order_by(Consultation.created_at.desc())
                .limit(50)
            )
        except ValueError:
            pass

    consultations_result = await db.execute(consultations_query)
    consultations = consultations_result.scalars().all()

    return {
        "patients": [_patient_to_dict(p) for p in patients],
        "consultations": [_consultation_to_dict(c) for c in consultations],
        "server_timestamp": server_timestamp,
    }


# --- Serialization helpers ---

def _medication_to_dict(m: Medication) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "active_principle": m.active_principle,
        "presentation": m.presentation,
        "atc_code": m.atc_code,
        "therapeutic_class": m.therapeutic_class,
        "requires_prescription": m.requires_prescription,
        "controlled_type": m.controlled_type,
        "item_type": m.item_type,
        "country": m.country,
        "farmacia_popular": m.farmacia_popular,
        "farmacia_popular_copay": m.farmacia_popular_copay,
        "common_brands": m.common_brands,
        "administration_route": m.administration_route,
        "usual_posology": m.usual_posology,
        "max_daily_dose": m.max_daily_dose,
        "common_indications": m.common_indications,
        "pregnancy_category": m.pregnancy_category,
        "renal_adjustment": m.renal_adjustment,
        "hepatic_adjustment": m.hepatic_adjustment,
    }


def _interaction_to_dict(i: DrugInteraction) -> dict:
    return {
        "id": i.id,
        "active_principle_a": i.active_principle_a,
        "active_principle_b": i.active_principle_b,
        "severity": i.severity,
        "description": i.description,
        "mechanism": i.mechanism,
        "clinical_management": i.clinical_management,
        "source": i.source,
        "evidence_level": i.evidence_level,
    }


def _patient_to_dict(p: Patient) -> dict:
    return {
        "id": p.id,
        "full_name": p.full_name,
        "birth_date": p.birth_date.isoformat() if p.birth_date else None,
        "gender": p.gender,
        "phone": p.phone,
        "email": p.email,
        "country": p.country,
        "document_id": p.document_id,
        "address": p.address,
        "allergies": p.allergies or [],
        "chronic_conditions": p.chronic_conditions or [],
        "current_medications": p.current_medications or [],
        "clinical_history": p.clinical_history,
        "clinical_history_parsed": p.clinical_history_parsed,
        "notes": p.notes,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _consultation_to_dict(c: Consultation) -> dict:
    return {
        "id": c.id,
        "user_id": c.user_id,
        "patient_id": c.patient_id,
        "specialty": c.specialty,
        "is_first_consultation": c.is_first_consultation,
        "raw_notes": c.raw_notes,
        "improved_notes": c.improved_notes,
        "summary": c.summary,
        "chief_complaint": c.chief_complaint,
        "icd_codes": c.icd_codes,
        "vital_signs": c.vital_signs,
        "physical_exam": c.physical_exam,
        "duration_minutes": c.duration_minutes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }
