# Qython - Prescription Routes
"""
Prescription management API endpoints.
Allows doctors to create, list, and manage digital prescriptions for patients.
"""

import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Config
from ..database import get_db
from ..models import (
    User, Prescription, Patient, Consultation,
    PrescriptionShare, PharmacyPrescription, Pharmacy
)
from ..security import get_current_active_user
from ..services.pdf_service import render_prescription_pdf
from ..services.data_collector_service import collect_data

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
    
    # DATA FLYWHEEL: Coletar dados para treinamento
    try:
        # Input: lista de medicamentos prescritos
        meds_list = ", ".join([f"{item.medication} {item.dosage}" for item in payload.items])
        input_text = f"Prescrição para paciente: {meds_list}"
        
        # Output: detalhes completos (posologia, duração)
        output_lines = []
        for item in payload.items:
            line = f"- {item.medication}: {item.dosage}, {item.frequency}, por {item.duration}"
            if item.instructions:
                line += f" ({item.instructions})"
            output_lines.append(line)
        output_text = "\n".join(output_lines)
        if payload.notes:
            output_text += f"\n\nObservações: {payload.notes}"
        
        await collect_data(
            db=db,
            user_id=current_user.id,
            source_type="prescription",
            input_data=input_text,
            output_data=output_text,
            meta={
                "prescription_type": payload.prescription_type,
                "num_items": len(payload.items),
                "prescription_id": new_prescription.id
            },
            quality=0  # Neutro - pode ser atualizado com feedback
        )
    except Exception as e:
        logger.warning(f"[DATA FLYWHEEL] Falha ao coletar prescrição: {e}")
    
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

    # 3. Lazy-create share token for QR code
    share_token = None
    try:
        share_result = await db.execute(
            select(PrescriptionShare).where(
                PrescriptionShare.prescription_id == prescription_id,
                PrescriptionShare.status == 'active',
            )
        )
        existing_share = share_result.scalar_one_or_none()
        if existing_share:
            share_token = existing_share.share_token
        else:
            token = uuid.uuid4().hex
            share = PrescriptionShare(
                prescription_id=prescription_id,
                share_token=token,
                expires_at=datetime.now(timezone.utc) + timedelta(days=30),
            )
            db.add(share)
            await db.commit()
            share_token = token
    except Exception as e:
        logger.warning(f"Failed to create share token for QR code: {e}")

    # 4. Gerar PDF usando o serviço
    try:
        # Chamada síncrona, blocante, mas aceitável para MVP
        pdf_bytes = render_prescription_pdf(prescription, current_user, patient, share_token=share_token)
    except Exception as e:
        logger.error(f"Error generating PDF: {e}")
        raise HTTPException(status_code=500, detail="Error generating PDF file")

    # 5. Retornar como stream de arquivo
    safe_name = re.sub(r'[^\w\-.]', '_', patient.full_name)
    filename = f"receita_{safe_name}_{prescription.created_at.strftime('%Y%m%d')}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )


# --- Share & Send to Pharmacy Endpoints ---

class SendToPharmacyRequest(BaseModel):
    pharmacy_id: int


@router.post("/{prescription_id}/share")
async def create_share_link(
    prescription_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Generate a shareable link (UUID token, 30-day expiration) for a prescription."""
    # Verify prescription belongs to doctor
    result = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.doctor_id == current_user.id,
        )
    )
    prescription = result.scalar_one_or_none()
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")

    # Check for existing active share
    existing_result = await db.execute(
        select(PrescriptionShare).where(
            PrescriptionShare.prescription_id == prescription_id,
            PrescriptionShare.status == 'active',
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        return {
            "share_token": existing.share_token,
            "share_url": f"{Config.WEB_BASE_URL}/receita/{existing.share_token}",
            "expires_at": existing.expires_at.isoformat(),
            "already_existed": True,
        }

    # Create new share
    token = uuid.uuid4().hex
    share = PrescriptionShare(
        prescription_id=prescription_id,
        share_token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    logger.info(f"Share link created for prescription {prescription_id} by {current_user.email}")

    return {
        "share_token": share.share_token,
        "share_url": f"{Config.WEB_BASE_URL}/receita/{share.share_token}",
        "expires_at": share.expires_at.isoformat(),
        "already_existed": False,
    }


@router.delete("/{prescription_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share_links(
    prescription_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Revoke all active share links for a prescription."""
    # Verify prescription belongs to doctor
    result = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.doctor_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Prescription not found")

    # Revoke all active shares
    shares_result = await db.execute(
        select(PrescriptionShare).where(
            PrescriptionShare.prescription_id == prescription_id,
            PrescriptionShare.status == 'active',
        )
    )
    shares = shares_result.scalars().all()

    for share in shares:
        share.status = 'revoked'

    await db.commit()
    logger.info(f"Revoked {len(shares)} share links for prescription {prescription_id} by {current_user.email}")


@router.post("/{prescription_id}/send-to-pharmacy")
async def send_to_pharmacy(
    prescription_id: int,
    payload: SendToPharmacyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Send a prescription directly to a pharmacy."""
    # Verify prescription belongs to doctor
    result = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.doctor_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Prescription not found")

    # Verify pharmacy exists and is active
    pharmacy_result = await db.execute(
        select(Pharmacy).where(
            Pharmacy.id == payload.pharmacy_id,
            Pharmacy.is_active == True,
        )
    )
    pharmacy = pharmacy_result.scalar_one_or_none()
    if not pharmacy:
        raise HTTPException(status_code=404, detail="Pharmacy not found")

    # Check if already sent to this pharmacy
    existing_result = await db.execute(
        select(PharmacyPrescription).where(
            PharmacyPrescription.prescription_id == prescription_id,
            PharmacyPrescription.pharmacy_id == payload.pharmacy_id,
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Prescription already sent to this pharmacy")

    # Create send record
    send = PharmacyPrescription(
        prescription_id=prescription_id,
        pharmacy_id=payload.pharmacy_id,
        doctor_id=current_user.id,
    )
    db.add(send)
    await db.commit()
    await db.refresh(send)

    logger.info(f"Prescription {prescription_id} sent to pharmacy {payload.pharmacy_id} by {current_user.email}")

    return {
        "id": send.id,
        "prescription_id": send.prescription_id,
        "pharmacy_id": send.pharmacy_id,
        "pharmacy_name": pharmacy.name,
        "status": send.status,
        "sent_at": send.sent_at.isoformat(),
    }


@router.get("/{prescription_id}/pharmacy-sends")
async def get_pharmacy_sends(
    prescription_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get status of all pharmacy sends for a prescription."""
    # Verify prescription belongs to doctor
    result = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.doctor_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Prescription not found")

    sends_result = await db.execute(
        select(PharmacyPrescription, Pharmacy)
        .join(Pharmacy, PharmacyPrescription.pharmacy_id == Pharmacy.id)
        .where(PharmacyPrescription.prescription_id == prescription_id)
        .order_by(PharmacyPrescription.sent_at.desc())
    )
    rows = sends_result.all()

    return [
        {
            "id": send.id,
            "pharmacy_id": pharmacy.id,
            "pharmacy_name": pharmacy.name,
            "pharmacy_address": pharmacy.address,
            "pharmacy_phone": pharmacy.phone,
            "status": send.status,
            "sent_at": send.sent_at.isoformat() if send.sent_at else None,
            "viewed_at": send.viewed_at.isoformat() if send.viewed_at else None,
            "fulfilled_at": send.fulfilled_at.isoformat() if send.fulfilled_at else None,
            "pharmacy_notes": send.pharmacy_notes,
        }
        for send, pharmacy in rows
    ]
