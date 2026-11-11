# backend/routes/document_routes.py
"""
Medical Documents API - Atestados, Declarações, Relatórios, Encaminhamentos
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
from ..models import MedicalDocument, Patient, User
from ..security import get_current_active_user
from ..services.pdf_service import render_document_pdf

import logging
import io
import json

logger = logging.getLogger("qython_logger")

router = APIRouter()


# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

class DocumentCreate(BaseModel):
    patient_id: int
    document_type: str  # 'sick_leave', 'fitness', 'attendance', 'report', 'referral'
    content: dict  # Type-specific fields

class DocumentResponse(BaseModel):
    id: int
    patient_id: int
    patient_name: Optional[str] = None
    document_type: str
    content: dict
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# CRUD ENDPOINTS
# =============================================================================

@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    patient_id: Optional[int] = None,
    document_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all documents created by the current doctor."""
    query = select(MedicalDocument).options(
        selectinload(MedicalDocument.patient)
    ).filter(MedicalDocument.doctor_id == current_user.id)
    
    if patient_id:
        query = query.filter(MedicalDocument.patient_id == patient_id)
    if document_type:
        query = query.filter(MedicalDocument.document_type == document_type)
    
    query = query.order_by(MedicalDocument.created_at.desc())
    
    result = await db.execute(query)
    documents = result.scalars().all()
    
    return [
        DocumentResponse(
            id=doc.id,
            patient_id=doc.patient_id,
            patient_name=doc.patient.full_name if doc.patient else None,
            document_type=doc.document_type,
            content=doc.content,
            created_at=doc.created_at
        )
        for doc in documents
    ]


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    data: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new medical document."""
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
    
    # Validate document type
    valid_types = ['sick_leave', 'fitness', 'attendance', 'report', 'referral']
    if data.document_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de documento inválido. Válidos: {', '.join(valid_types)}"
        )
    
    # Create document
    document = MedicalDocument(
        doctor_id=current_user.id,
        patient_id=data.patient_id,
        document_type=data.document_type,
        content=data.content
    )
    
    db.add(document)
    await db.commit()
    await db.refresh(document)

    from ..services import audit_service
    await audit_service.log(
        db,
        action='medical_document.create',
        actor_user_id=current_user.id,
        actor_role='medico',
        target_type='MedicalDocument',
        target_id=document.id,
        affected_user_id=current_user.id,
        metadata={'patient_id': data.patient_id,
                  'document_type': data.document_type},
        commit=True,
    )

    logger.info(f"Document {document.id} created by doctor {current_user.id}")
    
    
    return DocumentResponse(
        id=document.id,
        patient_id=document.patient_id,
        patient_name=patient.full_name,
        document_type=document.document_type,
        content=document.content,
        created_at=document.created_at,
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific document by ID."""
    result = await db.execute(
        select(MedicalDocument).options(
            selectinload(MedicalDocument.patient)
        ).filter(
            MedicalDocument.id == document_id,
            MedicalDocument.doctor_id == current_user.id
        )
    )
    document = result.scalars().first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento não encontrado"
        )
    
    return DocumentResponse(
        id=document.id,
        patient_id=document.patient_id,
        patient_name=document.patient.full_name if document.patient else None,
        document_type=document.document_type,
        content=document.content,
        created_at=document.created_at
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a document."""
    result = await db.execute(
        select(MedicalDocument).filter(
            MedicalDocument.id == document_id,
            MedicalDocument.doctor_id == current_user.id
        )
    )
    document = result.scalars().first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento não encontrado"
        )
    
    await db.delete(document)
    await db.commit()
    
    logger.info(f"Document {document_id} deleted by doctor {current_user.id}")


# =============================================================================
# PDF GENERATION
# =============================================================================

@router.get("/{document_id}/pdf")
async def get_document_pdf(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Generate PDF for a medical document."""
    # Fetch document with relationships
    result = await db.execute(
        select(MedicalDocument).options(
            selectinload(MedicalDocument.patient),
            selectinload(MedicalDocument.doctor)
        ).filter(
            MedicalDocument.id == document_id,
            MedicalDocument.doctor_id == current_user.id
        )
    )
    document = result.scalars().first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento não encontrado"
        )
    
    try:
        pdf_bytes = render_document_pdf(document, document.doctor, document.patient)
        
        # Type labels for filename
        type_labels = {
            'sick_leave': 'Atestado',
            'fitness': 'AptidaoFisica',
            'attendance': 'Comparecimento',
            'report': 'Relatorio',
            'referral': 'Encaminhamento'
        }
        type_label = type_labels.get(document.document_type, 'Documento')
        filename = f"{type_label}_{document.id}_{document.created_at.strftime('%Y%m%d')}.pdf"
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        logger.error(f"Error generating document PDF: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao gerar PDF do documento"
        )
