# qython/backend/routes/feedback_routes.py

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User, Feedback, TrainingData
from sqlalchemy.future import select
from sqlalchemy import or_
from ..security import get_current_active_user
from ..services.preference_service import collect_preference_pair

# Configurar logging
logger = logging.getLogger("qython_logger")

router = APIRouter()

# --- Pydantic Model ---

class FeedbackPayload(BaseModel):
    feedback_type: str  # 'like' or 'dislike'
    content_type: str   # e.g., 'chat_response', 'improved_notes', 'summary', 'icd10_extraction'
    original_content: str
    user_prompt: Optional[str] = None
    content_id: Optional[str] = None
    conversation_context: Optional[List[Any]] = None
    feedback_text: Optional[str] = None
    contact_permission: bool = False
    # DPO: Conteúdo corrigido pelo usuário (se fornecido, cria par de preferência)
    corrected_content: Optional[str] = None
    # ID exato do TrainingData ao qual o feedback se refere (match à prova de balas).
    # Ausente → backend cai no match por source_type + conteúdo.
    training_data_id: Optional[int] = None


# --- Mapeamento feedback → flywheel ---
# content_type (frontend) → source_types do TrainingData, para promover a qualidade
# da entrada CORRETA. Cobre tipos exatos, materiais acadêmicos (study_material_{tipo})
# e content_types dinâmicos por prefixo. Entradas terminando em '*' viram match por
# prefixo no source_type (ex.: 'study_material*' casa study_material_flashcards etc.).
FEEDBACK_TO_SOURCE = {
    'chat_response': ['chat_interaction', 'chat_clinical_discussion'],
    'improved_notes': ['consultation_improvement', 'consultation_raw_only', 'draft_generation'],
    'summary': ['summary_generation', 'consultation_summary', 'study_material_summary'],
    'icd10_extraction': ['icd10_extraction'],
    'library_rag_chat': ['library_rag_chat'],
    'clinical_history_parsing': ['clinical_history_parsing', 'patient_info_extraction'],
    'patient_orientation': ['patient_orientation', 'patient_orientation_ai_generated'],
    'podcast': ['podcast_script'],
    'video_lesson': ['video_lesson_script'],
}

# Materiais do MaterialProducer: o frontend manda content_type == material_type,
# coletado como study_material_{material_type}.
ACADEMIC_MATERIAL_TYPES = {
    'mind_map', 'flashcards', 'detailed_text', 'slideshow_only', 'comparative_table',
    'clinical_case', 'critical_appraisal', 'questionnaire_objective', 'questionnaire_subjective',
}

# content_type por prefixo → source_types (itens '*' = prefixo no source_type).
FEEDBACK_PREFIX_TO_SOURCE = {
    'medical_document': ['medical_document*', 'prescription', 'exam_order', 'exam_request', 'patient_orientation*'],
}

# Excluídos do flywheel: dado estático/não gerado por IA (feedback ainda é gravado).
FEEDBACK_NO_FLYWHEEL = {'medication_detail'}


def _resolve_feedback_sources(content_type: str):
    """content_type do frontend → lista de source_types (ou None se não deve promover)."""
    if not content_type or content_type in FEEDBACK_NO_FLYWHEEL:
        return None
    if content_type in FEEDBACK_TO_SOURCE:
        return FEEDBACK_TO_SOURCE[content_type]
    if content_type in ACADEMIC_MATERIAL_TYPES:
        return [f'study_material_{content_type}', 'study_material*']
    if content_type == 'material_gerado':  # fallback genérico do MaterialResultModal
        return ['study_material*', 'simulado_generation', 'podcast_script', 'video_lesson_script']
    for prefix, sources in FEEDBACK_PREFIX_TO_SOURCE.items():
        if content_type.startswith(prefix):
            return sources
    return None


def _source_type_filter(sources):
    """Filtro SQLAlchemy a partir de source_types exatos ou prefixos ('*' no fim)."""
    conds = [
        TrainingData.source_type.startswith(s[:-1]) if s.endswith('*')
        else TrainingData.source_type == s
        for s in sources
    ]
    return or_(*conds)


# --- Endpoint ---

@router.post("", status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    payload: FeedbackPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Recebe e armazena o feedback do usuário sobre um conteúdo gerado."""
    
    new_feedback = Feedback(
        user_id=current_user.id,
        user_occupation=current_user.occupation,
        user_prompt=payload.user_prompt,
        feedback_type=payload.feedback_type,
        content_type=payload.content_type,
        content_id=payload.content_id,
        original_content=payload.original_content,
        conversation_context=payload.conversation_context,
        feedback_text=payload.feedback_text,
        contact_permission=payload.contact_permission
    )

    # 1) Persistir o feedback base PRIMEIRO. Os efeitos de flywheel/DPO abaixo são
    #    best-effort e nunca podem fazer perder o registro do usuário.
    try:
        db.add(new_feedback)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Erro ao salvar feedback do usuário {current_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro interno ao salvar feedback."
        )

    # 2) DATA FLYWHEEL: promover quality_score na entrada CORRETA do TrainingData.
    #    Resolve o content_type (exato / material acadêmico / prefixo dinâmico) e casa
    #    por conteúdo. Best-effort: falha aqui não derruba o feedback base.
    try:
        matched_entry = None

        # 2a) Match à prova de balas: id explícito do TrainingData enviado pelo front.
        if payload.training_data_id:
            res = await db.execute(
                select(TrainingData).filter(
                    TrainingData.id == payload.training_data_id,
                    TrainingData.user_id == current_user.id,
                )
            )
            matched_entry = res.scalar_one_or_none()
            if matched_entry is None:
                logger.warning(
                    f"[DATA FLYWHEEL] training_data_id={payload.training_data_id} não encontrado "
                    f"para user {current_user.id}; caindo no match por conteúdo."
                )

        # 2b) Fallback: resolver por source_type + match de conteúdo.
        if matched_entry is None:
            mapped_sources = _resolve_feedback_sources(payload.content_type)
            if mapped_sources:
                result = await db.execute(
                    select(TrainingData)
                    .filter(
                        TrainingData.user_id == current_user.id,
                        _source_type_filter(mapped_sources),
                    )
                    .order_by(TrainingData.created_at.desc())
                    .limit(5)
                )
                candidates = result.scalars().all()

                # Match por conteúdo (normaliza espaços/caixa, compara o output COMPLETO).
                if payload.original_content and len(payload.original_content) >= 50 and candidates:
                    def _norm(s):
                        return " ".join((s or "").split()).lower()
                    content_norm = _norm(payload.original_content)
                    needle = content_norm[:300]
                    for entry in candidates:
                        haystack = _norm(entry.output_data)
                        if needle and (needle in haystack or haystack[:300] in content_norm):
                            matched_entry = entry
                            break

                # Fallback: candidato único recente (< 10 min) do tipo correto
                if matched_entry is None and len(candidates) == 1:
                    age = datetime.now(timezone.utc) - candidates[0].created_at
                    if age < timedelta(minutes=10):
                        matched_entry = candidates[0]

                if matched_entry is None:
                    logger.warning(
                        f"[DATA FLYWHEEL] Sem match para feedback '{payload.content_type}' "
                        f"do user {current_user.id} ({len(candidates)} candidatos)"
                    )
            elif payload.content_type not in FEEDBACK_NO_FLYWHEEL:
                logger.info(
                    f"[DATA FLYWHEEL] content_type '{payload.content_type}' sem mapeamento de "
                    f"source — feedback gravado, mas não promovido no flywheel."
                )

        # 2c) Promover a entrada encontrada (por id ou conteúdo).
        if matched_entry:
            is_like = payload.feedback_type == 'like'
            matched_entry.quality_score = 1 if is_like else -1
            # like marca pronto p/ treino; dislike DESMARCA (não treinar conteúdo ruim)
            matched_entry.ready_for_training = bool(is_like)

            # Acumular feedback como histórico (não sobrescrever)
            if payload.feedback_text:
                meta = matched_entry.metadata_info or {}
                feedback_history = meta.get('feedback_history', [])
                if isinstance(feedback_history, str):
                    feedback_history = [{'text': feedback_history, 'type': 'legacy'}]
                old_feedback = meta.pop('user_feedback', None)
                if old_feedback and isinstance(old_feedback, str):
                    feedback_history.insert(0, {'text': old_feedback, 'type': 'legacy'})
                feedback_history.append({
                    'text': payload.feedback_text,
                    'type': payload.feedback_type,
                    'ts': datetime.now(timezone.utc).isoformat(),
                })
                meta['feedback_history'] = feedback_history
                matched_entry.metadata_info = meta

            await db.commit()
            logger.info(
                f"[DATA FLYWHEEL] Quality={matched_entry.quality_score} para TrainingData "
                f"#{matched_entry.id} (source={matched_entry.source_type}, "
                f"via={'id' if payload.training_data_id and matched_entry else 'conteúdo'})"
            )
    except Exception as e:
        await db.rollback()
        logger.error(f"[DATA FLYWHEEL] Falha ao promover qualidade (feedback base preservado): {e}", exc_info=True)

    # 3) DPO: correção do usuário → par de preferência (chosen=correção, rejected=original).
    #    Funciona para qualquer content_type. Best-effort.
    if payload.corrected_content and payload.corrected_content.strip():
        try:
            await collect_preference_pair(
                db=db,
                user_id=current_user.id,
                prompt=payload.user_prompt or "",
                chosen=payload.corrected_content,
                rejected=payload.original_content,
                source_type=f"{payload.content_type}_correction",
                preference_source='human',  # Feedback humano direto = máxima confiança
                confidence_score=1.0,
                metadata={
                    "content_id": payload.content_id,
                    "feedback_text": payload.feedback_text,
                    "contact_permission": payload.contact_permission
                },
                language=current_user.language_preference or 'pt-BR'
            )
            await db.commit()
            logger.info(f"[DPO] Par de preferência criado a partir de correção humana para {payload.content_type}")
        except Exception as e:
            await db.rollback()
            logger.error(f"[DPO] Falha ao criar par de preferência (feedback base preservado): {e}", exc_info=True)

    logger.info(f"Feedback recebido do usuário {current_user.id} do tipo '{payload.feedback_type}'.")
    return {"message": "Feedback recebido com sucesso!"}