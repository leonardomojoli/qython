# backend/routes/orientation_routes.py
"""
Patient Orientations API - Templates and AI-generated patient education materials
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import PatientOrientation, Patient, User
from ..security import get_current_active_user
from ..services.billing_service import debit_dracmas_for_feature
from ..services.pdf_service import render_orientation_pdf
from ..services.data_collector_service import collect_data

import logging
import io

logger = logging.getLogger("qython_logger")

router = APIRouter()


# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

class OrientationCreate(BaseModel):
    patient_id: Optional[int] = None
    generation_type: str = 'template'  # 'template' | 'ai_generated'
    template_key: Optional[str] = None
    title: str
    content: str  # HTML content
    specialty: Optional[str] = None


class OrientationGenerate(BaseModel):
    patient_id: Optional[int] = None
    prompt: str
    specialty: Optional[str] = None
    language_code: Optional[str] = 'pt-BR'


class OrientationResponse(BaseModel):
    id: int
    patient_id: Optional[int] = None
    patient_name: Optional[str] = None
    generation_type: str
    template_key: Optional[str] = None
    title: str
    content: str
    ai_prompt: Optional[str] = None
    specialty: Optional[str] = None
    created_at: datetime
    training_data_id: Optional[int] = None  # id do TrainingData (match de feedback à prova de balas)

    class Config:
        from_attributes = True


# =============================================================================
# CRUD ENDPOINTS
# =============================================================================

@router.get("", response_model=List[OrientationResponse])
async def list_orientations(
    patient_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all orientations created by the current doctor."""
    query = select(PatientOrientation).options(
        selectinload(PatientOrientation.patient)
    ).filter(PatientOrientation.doctor_id == current_user.id)

    if patient_id:
        query = query.filter(PatientOrientation.patient_id == patient_id)

    query = query.order_by(PatientOrientation.created_at.desc())

    result = await db.execute(query)
    orientations = result.scalars().all()

    return [
        OrientationResponse(
            id=o.id,
            patient_id=o.patient_id,
            patient_name=o.patient.full_name if o.patient else None,
            generation_type=o.generation_type,
            template_key=o.template_key,
            title=o.title,
            content=o.content,
            ai_prompt=o.ai_prompt,
            specialty=o.specialty,
            created_at=o.created_at
        )
        for o in orientations
    ]


@router.post("", response_model=OrientationResponse, status_code=status.HTTP_201_CREATED)
async def create_orientation(
    data: OrientationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Save an orientation (template or edited content)."""
    patient = None
    if data.patient_id:
        # Verify patient belongs to doctor
        result = await db.execute(
            select(Patient).filter(
                Patient.id == data.patient_id,
                Patient.doctor_id == current_user.id
            )
        )
        patient = result.scalars().first()

        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paciente não encontrado"
            )

    orientation = PatientOrientation(
        doctor_id=current_user.id,
        patient_id=data.patient_id,
        generation_type=data.generation_type,
        template_key=data.template_key,
        title=data.title,
        content=data.content,
        specialty=data.specialty
    )

    db.add(orientation)
    await db.commit()
    await db.refresh(orientation)

    logger.info(f"Orientation {orientation.id} created by doctor {current_user.id} (type={data.generation_type})")

    # DATA FLYWHEEL: Coletar dados de orientações baseadas em templates (editadas pelo médico)
    training_data_id = None
    try:
        training_data_id = await collect_data(
            db=db,
            user_id=current_user.id,
            source_type=f"patient_orientation_{data.generation_type}",
            input_data=data.template_key or data.title,
            output_data=data.content[:2000],  # Limitar tamanho
            meta={
                "orientation_id": orientation.id,
                "generation_type": data.generation_type,
                "template_key": data.template_key,
                "specialty": data.specialty
            },
            quality=0
        )
    except Exception as e:
        logger.warning(f"[DATA FLYWHEEL] Falha ao coletar orientação: {e}")

    return OrientationResponse(
        id=orientation.id,
        patient_id=orientation.patient_id,
        patient_name=patient.full_name if patient else None,
        generation_type=orientation.generation_type,
        template_key=orientation.template_key,
        title=orientation.title,
        content=orientation.content,
        ai_prompt=orientation.ai_prompt,
        specialty=orientation.specialty,
        created_at=orientation.created_at,
        training_data_id=training_data_id
    )


@router.post("/generate", response_model=OrientationResponse, status_code=status.HTTP_201_CREATED)
async def generate_orientation(
    data: OrientationGenerate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Generate a patient orientation using AI (costs 5 dracmas)."""
    from ..services.llm_services import generate_patient_orientation

    patient = None
    if data.patient_id:
        # Verify patient belongs to doctor
        result = await db.execute(
            select(Patient).filter(
                Patient.id == data.patient_id,
                Patient.doctor_id == current_user.id
            )
        )
        patient = result.scalars().first()

        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paciente não encontrado"
            )

    # Charge dracmas BEFORE generating
    await debit_dracmas_for_feature(current_user, "generate_orientation", db)

    # Generate with AI
    result = generate_patient_orientation(
        prompt=data.prompt,
        specialty=data.specialty or '',
        language_code=data.language_code or 'pt-BR'
    )

    # Save the generated orientation
    orientation = PatientOrientation(
        doctor_id=current_user.id,
        patient_id=data.patient_id,
        generation_type='ai_generated',
        title=result['title'],
        content=result['content'],
        ai_prompt=data.prompt,
        specialty=data.specialty
    )

    db.add(orientation)
    await db.commit()
    await db.refresh(orientation)

    logger.info(f"AI Orientation {orientation.id} generated for doctor {current_user.id}")

    # DATA FLYWHEEL: Coletar dados de orientações geradas por IA
    training_data_id = None
    try:
        training_data_id = await collect_data(
            db=db,
            user_id=current_user.id,
            source_type="patient_orientation_ai_generated",
            input_data=data.prompt,
            output_data=result['content'][:2000],
            meta={
                "orientation_id": orientation.id,
                "specialty": data.specialty,
                "language": data.language_code,
                "title": result['title']
            },
            quality=1  # AI-generated, higher quality for training
        )
    except Exception as e:
        logger.warning(f"[DATA FLYWHEEL] Falha ao coletar orientação AI: {e}")

    return OrientationResponse(
        id=orientation.id,
        patient_id=orientation.patient_id,
        patient_name=patient.full_name if patient else None,
        generation_type=orientation.generation_type,
        template_key=orientation.template_key,
        title=orientation.title,
        content=orientation.content,
        ai_prompt=orientation.ai_prompt,
        specialty=orientation.specialty,
        created_at=orientation.created_at,
        training_data_id=training_data_id
    )


@router.get("/{orientation_id}", response_model=OrientationResponse)
async def get_orientation(
    orientation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific orientation by ID."""
    result = await db.execute(
        select(PatientOrientation).options(
            selectinload(PatientOrientation.patient)
        ).filter(
            PatientOrientation.id == orientation_id,
            PatientOrientation.doctor_id == current_user.id
        )
    )
    orientation = result.scalars().first()

    if not orientation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orientação não encontrada"
        )

    return OrientationResponse(
        id=orientation.id,
        patient_id=orientation.patient_id,
        patient_name=orientation.patient.full_name if orientation.patient else None,
        generation_type=orientation.generation_type,
        template_key=orientation.template_key,
        title=orientation.title,
        content=orientation.content,
        ai_prompt=orientation.ai_prompt,
        specialty=orientation.specialty,
        created_at=orientation.created_at
    )


@router.get("/{orientation_id}/pdf")
async def get_orientation_pdf(
    orientation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Generate PDF for a patient orientation."""
    # Fetch orientation with relationships
    result = await db.execute(
        select(PatientOrientation).options(
            selectinload(PatientOrientation.patient),
            selectinload(PatientOrientation.doctor)
        ).filter(
            PatientOrientation.id == orientation_id,
            PatientOrientation.doctor_id == current_user.id
        )
    )
    orientation = result.scalars().first()

    if not orientation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orientação não encontrada"
        )

    try:
        pdf_bytes = render_orientation_pdf(
            orientation,
            orientation.doctor,
            orientation.patient
        )

        filename = f"Orientacao_{orientation.id}_{orientation.created_at.strftime('%Y%m%d')}.pdf"

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        logger.error(f"Error generating orientation PDF: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao gerar PDF da orientação"
        )


@router.delete("/{orientation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_orientation(
    orientation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete an orientation."""
    result = await db.execute(
        select(PatientOrientation).filter(
            PatientOrientation.id == orientation_id,
            PatientOrientation.doctor_id == current_user.id
        )
    )
    orientation = result.scalars().first()

    if not orientation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orientação não encontrada"
        )

    await db.delete(orientation)
    await db.commit()

    logger.info(f"Orientation {orientation_id} deleted by doctor {current_user.id}")
