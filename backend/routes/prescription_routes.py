# Qython - Prescription Routes
"""
Prescription management API endpoints.
Allows doctors to create, list, and manage digital prescriptions for patients.
"""

import logging
import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Config
from ..database import get_db
from ..models import User, Prescription, Patient
from ..security import get_current_active_user
from ..services.pdf_service import render_prescription_pdf

logger = logging.getLogger("qython_logger")
router = APIRouter()


# --- Pydantic Models ---

class PrescriptionItem(BaseModel):
    medication: str = Field(..., min_length=1)
    dosage: str = Field(..., min_length=1)
    frequency: str = Field(..., min_length=1)
    duration: str = Field(..., min_length=1)
    quantity: Optional[str] = None
    instructions: Optional[str] = None


class PrescriptionCreate(BaseModel):
    patient_id: int
    consultation_id: Optional[int] = None
    prescription_type: str = Field('simple', description="simple, controlled_c1, etc")
    items: List[PrescriptionItem]
    notes: Optional[str] = None


class PrescriptionResponse(BaseModel):
    id: int
    doctor_id: int
    patient_id: int
    consultation_id: Optional[int]
    prescription_type: str
    items: List[dict] # JSON items
    notes: Optional[str]
    created_at: datetime
    
    # We might want to include patient info in the response for display purposes
    patient_name: Optional[str] = None

    class Config:
        from_attributes = True


# --- Endpoints ---

@router.get("", response_model=List[PrescriptionResponse])
async def list_prescriptions(
    patient_id: Optional[int] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List prescriptions created by the current doctor, optionally filtered by patient."""
    query = select(Prescription).where(Prescription.doctor_id == current_user.id)
    
    if patient_id:
        query = query.where(Prescription.patient_id == patient_id)
    
    query = query.order_by(desc(Prescription.created_at)).offset(offset).limit(limit)
    
    result = await db.execute(query)
    prescriptions = result.scalars().all()
    
    # Enrich response with patient name logic could be added here if needed, 
    # but frontend likely has patient context or we can use a join.
    # For now, simplistic return.
    return prescriptions


@router.post("", response_model=PrescriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_prescription(
    payload: PrescriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new digital prescription."""
    # Verify patient belongs to doctor or exists in context (privacy check)
    # For simplicity, assuming if doctor knows patient_id, they can prescribe. 
    # Ideally should check if patient exists.
    
    result = await db.execute(select(Patient).where(
        Patient.id == payload.patient_id,
        Patient.doctor_id == current_user.id
    ))
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Serialize items to JSON-compatible format for DB storage
    items_json = [item.model_dump() for item in payload.items]

    new_prescription = Prescription(
        doctor_id=current_user.id,
        patient_id=payload.patient_id,
        consultation_id=payload.consultation_id,
        prescription_type=payload.prescription_type,
        items=items_json,
        notes=payload.notes,
        created_at=datetime.now(timezone.utc)
    )
    
    db.add(new_prescription)
    await db.commit()
    await db.refresh(new_prescription)

    from ..services import audit_service
    await audit_service.log(
        db,
        action='prescription.create',
        actor_user_id=current_user.id,
        actor_role='medico',
        target_type='Prescription',
        target_id=new_prescription.id,
        affected_user_id=current_user.id,
        metadata={'patient_id': payload.patient_id,
                  'prescription_type': payload.prescription_type},
        commit=True,
    )

    logger.info(f"Prescription created: {new_prescription.id} for patient {payload.patient_id} by doctor {current_user.email}")
    
    
    return new_prescription


@router.get("/{prescription_id}", response_model=PrescriptionResponse)
async def get_prescription(
    prescription_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific prescription by ID."""
    result = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.doctor_id == current_user.id
        )
    )
    prescription = result.scalar_one_or_none()
    
    if not prescription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prescription not found"
        )
        
    return prescription


@router.delete("/{prescription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prescription(
    prescription_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a prescription."""
    result = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.doctor_id == current_user.id
        )
    )
    prescription = result.scalar_one_or_none()
    
    if not prescription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prescription not found"
        )
    
    await db.delete(prescription)
    await db.commit()
    
    logger.info(f"Prescription deleted: {prescription_id} by doctor {current_user.email}")
    return None

# Placeholder for PDF generation
@router.get("/{prescription_id}/pdf")
async def get_prescription_pdf(
    prescription_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Generate PDF for a prescription."""
    
    # 1. Buscar Prescrição
    result_presc = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.doctor_id == current_user.id
        )
    )
    prescription = result_presc.scalar_one_or_none()
    
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")

    # 2. Buscar Paciente
    result_patient = await db.execute(select(Patient).where(Patient.id == prescription.patient_id))
    patient = result_patient.scalar_one_or_none()
    
    if not patient:
         raise HTTPException(status_code=404, detail="Patient data associated with prescription not found")

    # 3. Gerar PDF usando o serviço (a receita vai ao paciente como o próprio PDF)
    try:
        # Chamada síncrona, blocante, mas aceitável para MVP
        pdf_bytes = render_prescription_pdf(prescription, current_user, patient)
    except Exception as e:
        logger.error(f"Error generating PDF: {e}")
        raise HTTPException(status_code=500, detail="Error generating PDF file")

    # 4. Retornar como stream de arquivo
    safe_name = re.sub(r'[^\w\-.]', '_', patient.full_name)
    filename = f"receita_{safe_name}_{prescription.created_at.strftime('%Y%m%d')}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )
