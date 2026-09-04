# qython/backend/routes/export_routes.py

import logging
import os
from datetime import datetime, timezone
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
import markdown

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import get_db
from ..models import User, AcademicMaterial
from ..security import get_current_active_user
# Importar o novo serviço unificado
from ..services.pdf_service import render_generic_pdf
from ..services.academic_services.material_generation_service import create_pdf_from_json
from ..services.academic_services.anki_export_service import anki_export_service

# Configurar logging
logger = logging.getLogger("qython_logger")

router = APIRouter()

# --- Pydantic Models ---

class ExportPayload(BaseModel):
    content: str
    language: str = 'pt'

class SlideshowExportPayload(BaseModel):
    material_id: int

class AnkiExportPayload(BaseModel):
    material_id: int
    deck_name: Optional[str] = "Qython Flashcards"

# --- Endpoints ---

@router.post("/pdf", status_code=status.HTTP_200_OK)
async def export_as_pdf(
    payload: ExportPayload,
    current_user: User = Depends(get_current_active_user)
):
    """Gera um arquivo PDF a partir de um conteúdo Markdown usando o serviço centralizado."""
    if not payload.content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum conteúdo fornecido")

    try:
        # 1. Converter Markdown para HTML (Isso continua sendo responsabilidade da rota/controller)
        html_body = markdown.markdown(payload.content, extensions=['markdown.extensions.tables'])

        # 2. Delegar a criação do PDF para o serviço (Padronização Visual)
        pdf_output = render_generic_pdf(html_body, title="Exportação Qython", language=payload.language)
        
        # 3. Preparar o nome do arquivo
        safe_filename = f"Qython_Export_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.pdf"
        
        # 4. Retornar a resposta
        return Response(
            content=pdf_output,
            media_type='application/pdf',
            headers={
                'Content-Disposition': f'inline; filename="{safe_filename}"',
                'Access-Control-Expose-Headers': 'Content-Disposition'
            }
        )

    except Exception as e:
        logger.error(f"Erro ao exportar PDF para o usuário {current_user.email}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao gerar o PDF no servidor"
        )

@router.post("/slideshow-to-pdf", status_code=status.HTTP_200_OK)
async def export_slideshow_to_pdf(
    payload: SlideshowExportPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Generates a high-fidelity PDF directly from slideshow JSON data."""
    # Mantemos esta rota como está, pois ela usa um serviço específico de slideshow (create_pdf_from_json)
    # que provavelmente lida com slides landscape e formatação muito específica.
    
    result = await db.execute(
        select(AcademicMaterial).filter(
            AcademicMaterial.id == payload.material_id,
            AcademicMaterial.user_id == current_user.id
        )
    )
    material = result.scalars().first()

    if not material or material.material_type != 'slideshow_only':
        raise HTTPException(status_code=404, detail="Material de slideshow não encontrado.")

    try:
        json_content = material.content.get("slideshow_content", {})
        if not json_content:
            raise HTTPException(status_code=400, detail="Conteúdo do slideshow está vazio ou inválido.")
            
        pdf_filepath = create_pdf_from_json(json_content, current_user.id)
        
        safe_filename = re.sub(r'[^a-zA-Z0-9 \._-]', '', json_content.get('title', 'presentation')).strip()
        
        return FileResponse(pdf_filepath, media_type='application/pdf', filename=f"{safe_filename}.pdf")
    except Exception as e:
        logger.error(f"Erro ao exportar slideshow para PDF para o usuário {current_user.email}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Falha ao gerar o arquivo PDF.")


@router.post("/flashcards-to-anki", status_code=status.HTTP_200_OK)
async def export_flashcards_to_anki(
    payload: AnkiExportPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Exports flashcards to Anki (.apkg) format."""
    result = await db.execute(
        select(AcademicMaterial).filter(
            AcademicMaterial.id == payload.material_id,
            AcademicMaterial.user_id == current_user.id,
            AcademicMaterial.material_type == 'flashcards'
        )
    )
    material = result.scalars().first()

    if not material:
        raise HTTPException(status_code=404, detail="Material de flashcards não encontrado.")

    flashcards = material.content.get('flashcards', [])
    if not flashcards:
        raise HTTPException(status_code=400, detail="Nenhum flashcard encontrado no material.")

    try:
        apkg_path = anki_export_service.export_flashcards(
            flashcards=flashcards,
            deck_name=payload.deck_name or "Qython Flashcards",
            user_id=current_user.id
        )

        # Clean up old exports periodically
        anki_export_service.cleanup_old_exports()

        safe_filename = re.sub(r'[^a-zA-Z0-9 \._-]', '_', payload.deck_name or 'flashcards').strip()

        return FileResponse(
            apkg_path,
            media_type='application/octet-stream',
            filename=f"{safe_filename}.apkg"
        )
    except Exception as e:
        logger.error(f"Erro ao exportar Anki para o usuário {current_user.email}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Falha ao exportar deck Anki.")


class FlashcardsPdfPayload(BaseModel):
    material_id: int
    language: str = 'pt'


@router.post("/flashcards-to-pdf", status_code=status.HTTP_200_OK)
async def export_flashcards_to_pdf(
    payload: FlashcardsPdfPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Exports flashcards to a styled PDF document."""
    from ..services.pdf_service import render_flashcards_pdf

    result = await db.execute(
        select(AcademicMaterial).filter(
            AcademicMaterial.id == payload.material_id,
            AcademicMaterial.user_id == current_user.id,
            AcademicMaterial.material_type == 'flashcards'
        )
    )
    material = result.scalars().first()

    if not material:
        raise HTTPException(status_code=404, detail="Material de flashcards não encontrado.")

    flashcards = material.content.get('flashcards', [])
    if not flashcards:
        raise HTTPException(status_code=400, detail="Nenhum flashcard encontrado no material.")

    try:
        pdf_output = render_flashcards_pdf(flashcards, language=payload.language)

        safe_filename = f"Qython_Flashcards_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.pdf"

        return Response(
            content=pdf_output,
            media_type='application/pdf',
            headers={
                'Content-Disposition': f'inline; filename="{safe_filename}"',
                'Access-Control-Expose-Headers': 'Content-Disposition'
            }
        )
    except Exception as e:
        logger.error(f"Erro ao exportar flashcards PDF para o usuário {current_user.email}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Falha ao gerar PDF dos flashcards.")


class MindMapPdfPayload(BaseModel):
    material_id: int
    language: str = 'pt'


@router.post("/mind-map-to-pdf", status_code=status.HTTP_200_OK)
async def export_mind_map_to_pdf(
    payload: MindMapPdfPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Exports mind map image to a styled PDF document (landscape)."""
    from ..services.pdf_service import render_mind_map_pdf

    result = await db.execute(
        select(AcademicMaterial).filter(
            AcademicMaterial.id == payload.material_id,
            AcademicMaterial.user_id == current_user.id,
            AcademicMaterial.material_type == 'mind_map'
        )
    )
    material = result.scalars().first()

    if not material:
        raise HTTPException(status_code=404, detail="Material de mapa mental não encontrado.")

    mind_map_image = material.content.get('mind_map_image')
    if not mind_map_image:
        raise HTTPException(status_code=400, detail="Imagem do mapa mental não encontrada.")

    # Get title from mind map data
    mind_map_data = material.content.get('mapa_mental', {})
    title = mind_map_data.get('tema_central', 'Mapa Mental')

    try:
        pdf_output = render_mind_map_pdf(mind_map_image, title=title, language=payload.language)

        safe_filename = f"Qython_MindMap_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.pdf"

        return Response(
            content=pdf_output,
            media_type='application/pdf',
            headers={
                'Content-Disposition': f'inline; filename="{safe_filename}"',
                'Access-Control-Expose-Headers': 'Content-Disposition'
            }
        )
    except Exception as e:
        logger.error(f"Erro ao exportar mapa mental PDF para o usuário {current_user.email}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Falha ao gerar PDF do mapa mental.")


class QuestionnairePdfPayload(BaseModel):
    material_id: int
    language: str = 'pt'


@router.post("/questionnaire-to-pdf", status_code=status.HTTP_200_OK)
async def export_questionnaire_to_pdf(
    payload: QuestionnairePdfPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Exporta um questionário (objetivo/subjetivo) p/ PDF estilizado, fiel ao modo não-quiz."""
    from ..services.pdf_service import render_questionnaire_pdf

    result = await db.execute(
        select(AcademicMaterial).filter(
            AcademicMaterial.id == payload.material_id,
            AcademicMaterial.user_id == current_user.id,
            AcademicMaterial.material_type.in_(['questionnaire_objective', 'questionnaire_subjective'])
        )
    )
    material = result.scalars().first()

    if not material:
        raise HTTPException(status_code=404, detail="Material de questionário não encontrado.")

    content = material.content or {}
    objective = content.get('questionario_objetivo') or []
    subjective = content.get('questionario_subjetivo') or []
    if not objective and not subjective:
        raise HTTPException(status_code=400, detail="Nenhuma questão encontrada no material.")

    try:
        pdf_output = render_questionnaire_pdf(objective, subjective, language=payload.language,
                                              support_texts=(content or {}).get('textos_base'))

        safe_filename = f"Qython_Questionario_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.pdf"

        return Response(
            content=pdf_output,
            media_type='application/pdf',
            headers={
                'Content-Disposition': f'inline; filename="{safe_filename}"',
                'Access-Control-Expose-Headers': 'Content-Disposition'
            }
        )
    except Exception as e:
        logger.error(f"Erro ao exportar questionário PDF para o usuário {current_user.email}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Falha ao gerar PDF do questionário.")
