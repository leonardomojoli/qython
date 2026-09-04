# backend/routes/exam_routes.py
"""
Exam Orders API - Pedido de Exames Laboratoriais e de Imagem
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
from ..models import ExamOrder, Patient, User
from ..security import get_current_active_user
from ..services.pdf_service import render_exam_order_pdf
from ..services.data_collector_service import collect_data

import logging
import io

logger = logging.getLogger("qython_logger")

router = APIRouter()


# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

class ExamItem(BaseModel):
    name: str
    code: Optional[str] = None
    category: Optional[str] = None

class ExamOrderCreate(BaseModel):
    patient_id: int
    exams: List[ExamItem]
    clinical_indication: Optional[str] = None
    urgency: str = 'routine'  # 'routine', 'urgent', 'emergency'

class ExamOrderResponse(BaseModel):
    id: int
    patient_id: int
    patient_name: Optional[str] = None
    exams: List[dict]
    clinical_indication: Optional[str] = None
    urgency: str
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# CRUD ENDPOINTS
# =============================================================================

@router.get("", response_model=List[ExamOrderResponse])
async def list_exam_orders(
    patient_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all exam orders created by the current doctor."""
    query = select(ExamOrder).options(
        selectinload(ExamOrder.patient)
    ).filter(ExamOrder.doctor_id == current_user.id)
    
    if patient_id:
        query = query.filter(ExamOrder.patient_id == patient_id)
    
    query = query.order_by(ExamOrder.created_at.desc())
    
    result = await db.execute(query)
    orders = result.scalars().all()
    
    return [
        ExamOrderResponse(
            id=order.id,
            patient_id=order.patient_id,
            patient_name=order.patient.full_name if order.patient else None,
            exams=order.exams,
            clinical_indication=order.clinical_indication,
            urgency=order.urgency,
            created_at=order.created_at
        )
        for order in orders
    ]


@router.post("", response_model=ExamOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_exam_order(
    data: ExamOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new exam order."""
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
    
    if not data.exams:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selecione pelo menos um exame"
        )
    
    # Convert Pydantic models to dicts
    exams_data = [exam.model_dump() for exam in data.exams]
    
    # Create order
    order = ExamOrder(
        doctor_id=current_user.id,
        patient_id=data.patient_id,
        exams=exams_data,
        clinical_indication=data.clinical_indication,
        urgency=data.urgency
    )
    
    db.add(order)
    await db.commit()
    await db.refresh(order)

    from ..services import audit_service
    await audit_service.log(
        db,
        action='exam_order.create',
        actor_user_id=current_user.id,
        actor_role='medico',
        target_type='ExamOrder',
        target_id=order.id,
        affected_user_id=current_user.id,
        metadata={'patient_id': data.patient_id},
        commit=True,
    )

    logger.info(f"Exam order {order.id} created by doctor {current_user.id}")
    
    # DATA FLYWHEEL: Coletar dados para treinamento
    try:
        # Input: lista de exames solicitados
        exam_names = ", ".join([exam.name for exam in data.exams])
        input_text = f"Pedido de exames: {exam_names}"
        
        # Output: indicação clínica (campo mais valioso)
        output_text = data.clinical_indication or "Sem indicação clínica especificada"
        
        await collect_data(
            db=db,
            user_id=current_user.id,
            source_type="exam_order",
            input_data=input_text,
            output_data=output_text,
            meta={
                "num_exams": len(data.exams),
                "urgency": data.urgency,
                "order_id": order.id
            },
            quality=0  # Neutro
        )
    except Exception as e:
        logger.warning(f"[DATA FLYWHEEL] Falha ao coletar pedido de exames: {e}")
    
    return ExamOrderResponse(
        id=order.id,
        patient_id=order.patient_id,
        patient_name=patient.full_name,
        exams=order.exams,
        clinical_indication=order.clinical_indication,
        urgency=order.urgency,
        created_at=order.created_at
    )


@router.get("/{order_id}", response_model=ExamOrderResponse)
async def get_exam_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific exam order by ID."""
    result = await db.execute(
        select(ExamOrder).options(
            selectinload(ExamOrder.patient)
        ).filter(
            ExamOrder.id == order_id,
            ExamOrder.doctor_id == current_user.id
        )
    )
    order = result.scalars().first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pedido não encontrado"
        )
    
    return ExamOrderResponse(
        id=order.id,
        patient_id=order.patient_id,
        patient_name=order.patient.full_name if order.patient else None,
        exams=order.exams,
        clinical_indication=order.clinical_indication,
        urgency=order.urgency,
        created_at=order.created_at
    )


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete an exam order."""
    result = await db.execute(
        select(ExamOrder).filter(
            ExamOrder.id == order_id,
            ExamOrder.doctor_id == current_user.id
        )
    )
    order = result.scalars().first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pedido não encontrado"
        )
    
    await db.delete(order)
    await db.commit()
    
    logger.info(f"Exam order {order_id} deleted by doctor {current_user.id}")


# =============================================================================
# PDF GENERATION
# =============================================================================

@router.get("/{order_id}/pdf")
async def get_exam_order_pdf(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Generate PDF for an exam order."""
    result = await db.execute(
        select(ExamOrder).options(
            selectinload(ExamOrder.patient),
            selectinload(ExamOrder.doctor)
        ).filter(
            ExamOrder.id == order_id,
            ExamOrder.doctor_id == current_user.id
        )
    )
    order = result.scalars().first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pedido não encontrado"
        )
    
    try:
        pdf_bytes = render_exam_order_pdf(order, order.doctor, order.patient)
        
        filename = f"PedidoExames_{order.patient.full_name.replace(' ', '_')}_{order.created_at.strftime('%Y%m%d')}.pdf"
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        logger.error(f"Error generating exam order PDF: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao gerar PDF do pedido"
        )
