# qython/backend/routes/consultation_routes.py

import logging
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import Consultation, User, Transaction, Patient, TrainingData
from ..services.llm_services import improve_consultation_notes, generate_case_summary, extract_icd10_from_notes
from ..services.billing_service import debit_dracmas_for_feature, FEATURE_COSTS
from ..services.data_collector_service import collect_data
from ..services.preference_service import collect_regeneration_pair, collect_preference_pair
from ..services import audit_service
from ..services.self_critique_service import evaluate_and_refine, extract_critique_metrics
from ..security import get_current_active_user
from ..services.activity_service import track_activity

# Self-critique feature flag (desabilitado por padrão até validação)
ENABLE_SELF_CRITIQUE = os.getenv("ENABLE_SELF_CRITIQUE", "0") == "1"

# Configurar logging
logger = logging.getLogger("qython_logger")

router = APIRouter()

# --- Pydantic Models ---

class ConsultationPayload(BaseModel):
    specialty: str = Field(..., max_length=100)
    raw_notes: str = Field(..., alias='rawNotes', max_length=50000)
    is_first_consultation: bool = Field(True, alias='isFirstConsultation')
    improved_notes: Optional[str] = Field(None, alias='improvedNotes', max_length=100000)
    summary: Optional[str] = Field(None, max_length=50000)
    patient_id: Optional[int] = Field(None, alias='patient_id')
    # Original AI-generated content (before user edits) for DPO pair creation
    original_improved_notes: Optional[str] = Field(None, alias='originalImprovedNotes', max_length=100000)
    original_summary: Optional[str] = Field(None, alias='originalSummary', max_length=50000)
    # Engagement metrics for training data quality
    regeneration_count_improved: int = Field(0, alias='regenerationCountImproved')
    regeneration_count_summary: int = Field(0, alias='regenerationCountSummary')
    time_to_first_edit_ms: Optional[int] = Field(None, alias='timeToFirstEditMs')
    total_edit_time_ms: Optional[int] = Field(None, alias='totalEditTimeMs')
    # Consultation duration in minutes
    duration_minutes: Optional[int] = Field(None, alias='durationMinutes')

    class Config:
        populate_by_name = True

class PatientInfo(BaseModel):
    """Informações resumidas do paciente para exibição na consulta."""
    id: int
    full_name: str
    birth_date: Optional[datetime] = None
    gender: Optional[str] = None
    allergies: Optional[List[str]] = None
    chronic_conditions: Optional[List[str]] = None
    current_medications: Optional[List[str]] = None

    class Config:
        from_attributes = True

class ConsultationResponse(BaseModel):
    id: int
    specialty: str
    is_first_consultation: bool
    raw_notes: str
    improved_notes: Optional[str] = ""
    summary: Optional[str] = ""
    patient_id: Optional[int] = None
    patient_name: Optional[str] = None
    patient: Optional[PatientInfo] = None
    created_at: datetime
    training_data_id_improved: Optional[int] = None  # id do TrainingData de improved_notes
    training_data_id_summary: Optional[int] = None   # id do TrainingData de summary

    class Config:
        from_attributes = True

class DraftPayload(BaseModel):
    specialty: str
    raw_notes: str = Field(..., alias='rawNotes')
    is_first_consultation: bool = Field(True, alias='isFirstConsultation')
    patient_id: Optional[int] = Field(None, alias='patientId')
    # DPO/Regeneration fields
    is_regeneration: bool = Field(False, alias='isRegeneration')
    previous_response: Optional[str] = Field(None, alias='previousResponse')

    class Config:
        populate_by_name = True

class DraftResponse(BaseModel):
    draft_notes: str = Field(..., alias='draftNotes')

class SummaryPayload(BaseModel):
    improved_text: str = Field(..., alias='improvedText')
    # DPO/Regeneration fields
    is_regeneration: bool = Field(False, alias='isRegeneration')
    previous_response: Optional[str] = Field(None, alias='previousResponse')

    class Config:
        populate_by_name = True

class SummaryResponse(BaseModel):
    summary: str

class DeletePayload(BaseModel):
    ids: List[int]

class ICD10ExtractionPayload(BaseModel):
    clinical_notes: str = Field(..., alias='clinicalNotes')
    specialty: Optional[str] = ""

    class Config:
        populate_by_name = True

class ICD10ExtractionResponse(BaseModel):
    suggested_codes: List[dict] = Field(..., alias='suggestedCodes')

    class Config:
        populate_by_name = True

# --- Cost Check Endpoints ---

@router.post("/draft/cost")
async def get_draft_cost(current_user: User = Depends(get_current_active_user)):
    """Retorna o custo em dracmas para aprimorar consulta."""
    return {"cost": FEATURE_COSTS.get("improve_notes", 10)}


@router.post("/summary/cost")
async def get_summary_cost(current_user: User = Depends(get_current_active_user)):
    """Retorna o custo em dracmas para gerar resumo."""
    return {"cost": FEATURE_COSTS.get("generate_summary", 5)}


@router.post("/save/cost")
async def get_save_cost(current_user: User = Depends(get_current_active_user)):
    """Retorna o custo em dracmas para salvar consulta (gratuito)."""
    return {"cost": 0}


# --- Endpoints ---

@router.post("", response_model=ConsultationResponse, status_code=status.HTTP_201_CREATED)
async def create_consultation(
    payload: ConsultationPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Cria e salva uma nova consulta no banco de dados."""
    try:
        # Cache user attributes before any commit to avoid lazy-loading issues
        user_id = current_user.id
        user_lang = current_user.language_preference or 'pt-BR'

        # Verify patient ownership if patient_id provided
        if payload.patient_id:
            pat_check = await db.execute(
                select(Patient).where(Patient.id == payload.patient_id, Patient.doctor_id == user_id)
            )
            if not pat_check.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Paciente não encontrado.")

        new_consultation = Consultation(
            user_id=user_id,
            specialty=payload.specialty,
            is_first_consultation=payload.is_first_consultation,
            raw_notes=payload.raw_notes,
            improved_notes=payload.improved_notes,
            summary=payload.summary,
            patient_id=payload.patient_id,
            duration_minutes=payload.duration_minutes,
            created_at=datetime.now(timezone.utc)
        )
        db.add(new_consultation)
        await db.commit()
        await db.refresh(new_consultation)

        # ids do TrainingData p/ match exato de feedback (improved_notes e summary)
        training_data_id_improved = None
        training_data_id_summary = None

        # --- DATA FLYWHEEL: Coletar TODAS as consultas ---
        # Wrapped in try/except: data collection must never block consultation save
        try:
            # Quality tiers: -1=dislike, 0=neutro, 1=like, 2=gold (editado), 3=platinum (100% manual)

            # Metadata de engajamento
            engagement_meta = {
                "specialty": payload.specialty,
                "is_first": payload.is_first_consultation,
                "regeneration_count_improved": payload.regeneration_count_improved,
                "regeneration_count_summary": payload.regeneration_count_summary,
                "time_to_first_edit_ms": payload.time_to_first_edit_ms,
                "total_edit_time_ms": payload.total_edit_time_ms
            }

            if not payload.improved_notes:
                # Consulta 100% manual (sem IA) = Platinum (quality=3)
                # Estes dados são extremamente valiosos: escrita real de médicos
                await collect_data(
                    db, user_id, "consultation_raw_only",
                    payload.raw_notes, payload.raw_notes,
                    engagement_meta,
                    quality=3,
                    lang=user_lang
                )
            else:
                # Determinar se foi editado pelo usuário
                was_edited = (payload.original_improved_notes and
                              payload.original_improved_notes.strip() != payload.improved_notes.strip())

                # Consulta com IA = Gold (quality=2) - médico revisou/editou
                training_data_id_improved = await collect_data(
                    db, user_id, "consultation_improvement",
                    payload.raw_notes, payload.improved_notes,
                    {**engagement_meta, "user_edited": was_edited, "accepted_without_edit": not was_edited},
                    quality=2,
                    lang=user_lang
                )

                # --- DPO: Se o médico editou o conteúdo da IA, criar par de preferência ---
                # Esta é uma das formas mais valiosas de feedback: correção humana direta
                if was_edited and payload.original_improved_notes:
                    await collect_preference_pair(
                        db=db,
                        user_id=user_id,
                        prompt=payload.raw_notes,
                        chosen=payload.improved_notes,  # Versão editada pelo médico
                        rejected=payload.original_improved_notes,  # Versão original da IA
                        source_type="consultation_improvement_edit",
                        preference_source='human',  # Correção humana = máxima confiança
                        confidence_score=1.0,
                        metadata={
                            "specialty": payload.specialty,
                            "is_first": payload.is_first_consultation,
                            "time_to_first_edit_ms": payload.time_to_first_edit_ms,
                            "total_edit_time_ms": payload.total_edit_time_ms
                        },
                        language=user_lang
                    )
                    logger.info(f"[DPO] Par de edição manual de improved_notes capturado para user {user_id}")

                # Resumo (se existir)
                if payload.summary:
                    summary_was_edited = (payload.original_summary and
                                          payload.original_summary.strip() != payload.summary.strip())

                    training_data_id_summary = await collect_data(
                        db, user_id, "consultation_summary",
                        payload.improved_notes, payload.summary,
                        {"specialty": payload.specialty, "user_edited": summary_was_edited},
                        quality=1,
                        lang=user_lang
                    )

                    # --- DPO: Se o médico editou o resumo, criar par de preferência ---
                    if summary_was_edited and payload.original_summary:
                        await collect_preference_pair(
                            db=db,
                            user_id=user_id,
                            prompt=payload.improved_notes,
                            chosen=payload.summary,  # Versão editada pelo médico
                            rejected=payload.original_summary,  # Versão original da IA
                            source_type="consultation_summary_edit",
                            preference_source='human',
                            confidence_score=1.0,
                            metadata={"specialty": payload.specialty},
                            language=user_lang
                        )
                        logger.info(f"[DPO] Par de edição manual de summary capturado para user {user_id}")
        except Exception as flywheel_error:
            logger.warning(f"[FLYWHEEL] Data collection failed for consultation (non-blocking): {flywheel_error}")

        logger.info(f"Consulta salva. ID: {new_consultation.id}, User ID: {user_id}")

        # --- Adicionar consulta ao histórico clínico do paciente ---
        # Usar o resumo como entrada do histórico (conforme decisão do usuário)
        if payload.patient_id and payload.summary:
            try:
                patient_result = await db.execute(
                    select(Patient).where(Patient.id == payload.patient_id, Patient.doctor_id == user_id)
                )
                patient = patient_result.scalar_one_or_none()

                if patient:
                    # Extrair queixa principal do resumo (primeira linha ou até primeiro ponto)
                    summary_text = payload.summary.strip()
                    chief_complaint = ""
                    if summary_text:
                        # Tentar extrair do formato "QP: ..." ou primeira frase
                        lines = summary_text.split('\n')
                        first_line = lines[0].strip() if lines else ""
                        if first_line.upper().startswith('QP:'):
                            chief_complaint = first_line[3:].strip()
                        elif first_line.upper().startswith('QUEIXA PRINCIPAL:'):
                            chief_complaint = first_line[17:].strip()
                        else:
                            # Usar primeira frase (até 100 chars)
                            first_sentence = summary_text.split('.')[0]
                            chief_complaint = first_sentence[:100] if len(first_sentence) > 100 else first_sentence

                    # Criar entrada de histórico
                    new_history_entry = {
                        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        "chief_complaint": chief_complaint,
                        "notes": payload.summary,
                        "diagnosis": "",
                        "plan": "",
                        "provider": current_user.full_name or "Qython",
                        "source": "qython",
                        "consultation_id": new_consultation.id,
                        "specialty": payload.specialty
                    }

                    # Adicionar ao histórico existente (mais recente primeiro)
                    existing_history = patient.clinical_history_parsed or []
                    existing_history.insert(0, new_history_entry)
                    patient.clinical_history_parsed = existing_history
                    patient.updated_at = datetime.now(timezone.utc)

                    await db.commit()
                    logger.info(f"Consulta {new_consultation.id} adicionada ao histórico do paciente {payload.patient_id}")
            except Exception as history_error:
                # Não falhar a consulta se o histórico falhar
                logger.warning(f"Erro ao adicionar consulta ao histórico do paciente: {history_error}")

        await audit_service.log(
            db,
            action='consultation.create',
            actor_user_id=current_user.id,
            actor_role='medico',
            target_type='Consultation',
            target_id=new_consultation.id,
            affected_user_id=current_user.id,
            metadata={
                'specialty': new_consultation.specialty,
                'patient_id': new_consultation.patient_id,
            },
            commit=True,
        )

        # Return consultation data directly (avoid lazy loading issues)
        return ConsultationResponse(
            id=new_consultation.id,
            specialty=new_consultation.specialty,
            is_first_consultation=new_consultation.is_first_consultation,
            raw_notes=new_consultation.raw_notes,
            improved_notes=new_consultation.improved_notes or "",
            summary=new_consultation.summary or "",
            patient_id=new_consultation.patient_id,
            patient_name=None,
            created_at=new_consultation.created_at,
            training_data_id_improved=training_data_id_improved,
            training_data_id_summary=training_data_id_summary
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Erro ao salvar consulta para o usuário ID {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha ao salvar a consulta.")

@router.get("", response_model=List[ConsultationResponse])
async def get_consultations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Retorna todas as consultas do usuário autenticado com info de paciente."""
    result = await db.execute(
        select(Consultation)
        .options(selectinload(Consultation.patient))
        .filter_by(user_id=current_user.id)
        .order_by(Consultation.created_at.desc())
    )
    consultations = result.scalars().all()
    logger.debug(f"{len(consultations)} consultas recuperadas para o usuário {current_user.email}")
    
    # Map to response with patient info
    return [
        ConsultationResponse(
            id=c.id,
            specialty=c.specialty,
            is_first_consultation=c.is_first_consultation,
            raw_notes=c.raw_notes or "",
            improved_notes=c.improved_notes or "",
            summary=c.summary or "",
            patient_id=c.patient_id,
            patient_name=c.patient.full_name if c.patient else None,
            patient=PatientInfo(
                id=c.patient.id,
                full_name=c.patient.full_name,
                birth_date=c.patient.birth_date,
                gender=c.patient.gender,
                allergies=c.patient.allergies,
                chronic_conditions=c.patient.chronic_conditions,
                current_medications=c.patient.current_medications
            ) if c.patient else None,
            created_at=c.created_at
        )
        for c in consultations
    ]

@router.get("/{consultation_id}", response_model=ConsultationResponse)
async def get_consultation(
    consultation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Retorna uma consulta específica pelo ID."""
    result = await db.execute(
        select(Consultation).filter_by(id=consultation_id, user_id=current_user.id)
    )
    consultation = result.scalars().first()
    
    if not consultation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consulta não encontrada ou não pertence ao usuário.")

    await audit_service.log(
        db,
        action='consultation.read',
        actor_user_id=current_user.id,
        actor_role='medico',
        target_type='Consultation',
        target_id=consultation.id,
        affected_user_id=current_user.id,
        metadata={'patient_id': consultation.patient_id},
        commit=True,
    )

    logger.debug(f"Consulta recuperada: ID {consultation_id} para User ID {current_user.id}")
    return consultation

@router.post("/draft", response_model=DraftResponse)
async def get_draft_consultation(
    payload: DraftPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Gera um rascunho aprimorado de anotações de consulta."""
    # Cache user attributes before any DB operations to avoid lazy-loading issues
    user_id = current_user.id
    user_email = current_user.email
    language_code = current_user.language_preference or 'pt-BR'

    try:
        # 1. Debita o custo ANTES de executar a ação
        await debit_dracmas_for_feature(current_user, "improve_notes", db)

        # 2. If patient_id provided, fetch patient data for context
        clinical_context = ""
        if payload.patient_id:
            patient_result = await db.execute(
                select(Patient).where(
                    Patient.id == payload.patient_id,
                    Patient.doctor_id == user_id
                )
            )
            patient = patient_result.scalar_one_or_none()
            if patient:
                context_parts = []

                # 2a. Patient demographics (CRITICAL: prevents model from inventing data)
                demographics = []
                if patient.full_name:
                    demographics.append(f"Nome: {patient.full_name}")
                if patient.birth_date:
                    from datetime import date
                    today = date.today()
                    age = today.year - patient.birth_date.year - ((today.month, today.day) < (patient.birth_date.month, patient.birth_date.day))
                    demographics.append(f"Idade: {age} anos")
                    demographics.append(f"Data de Nascimento: {patient.birth_date.strftime('%d/%m/%Y')}")
                if patient.gender:
                    gender_map = {'male': 'Masculino', 'female': 'Feminino', 'other': 'Outro'}
                    demographics.append(f"Sexo: {gender_map.get(patient.gender, patient.gender)}")

                if demographics:
                    context_parts.append("DADOS DO PACIENTE:\n" + " | ".join(demographics))

                # 2b. Clinical alerts (allergies, conditions, medications)
                alerts = []
                if patient.allergies:
                    alerts.append(f"Alergias: {', '.join(patient.allergies)}")
                if patient.chronic_conditions:
                    alerts.append(f"Condições crônicas: {', '.join(patient.chronic_conditions)}")
                if patient.current_medications:
                    alerts.append(f"Medicamentos em uso: {', '.join(patient.current_medications)}")

                if alerts:
                    context_parts.append("ALERTAS CLÍNICOS:\n" + "\n".join(alerts))

                # 2c. Clinical history (last 5 entries)
                if patient.clinical_history_parsed:
                    history_entries = []
                    for entry in patient.clinical_history_parsed[:5]:
                        entry_text = []
                        if entry.get('date'):
                            entry_text.append(f"Data: {entry['date']}")
                        if entry.get('chief_complaint'):
                            entry_text.append(f"QP: {entry['chief_complaint']}")
                        if entry.get('diagnosis'):
                            entry_text.append(f"HD: {entry['diagnosis']}")
                        if entry.get('plan'):
                            entry_text.append(f"Conduta: {entry['plan']}")
                        if entry_text:
                            history_entries.append(" | ".join(entry_text))

                    if history_entries:
                        context_parts.append("HISTÓRICO CLÍNICO PRÉVIO:\n" + "\n".join(history_entries))

                # Build final context with clear instructions
                if context_parts:
                    clinical_context = (
                        "--- CONTEXTO DO PACIENTE (use APENAS estas informações, NÃO invente dados) ---\n"
                        "IMPORTANTE: Use SOMENTE os dados fornecidos abaixo. Se uma informação não estiver disponível, NÃO a inclua no texto. NUNCA invente idade, sexo, ou qualquer outro dado do paciente.\n\n"
                        + "\n\n".join(context_parts)
                        + "\n--- FIM DO CONTEXTO ---\n\n"
                    )

        # 3. Prepend clinical context to raw notes
        notes_with_context = clinical_context + payload.raw_notes if clinical_context else payload.raw_notes

        # Executa a função síncrona de LLM em uma thread separada para não bloquear o loop
        result, _, _ = await run_in_threadpool(
            improve_consultation_notes,
            payload.specialty,
            payload.is_first_consultation,
            notes_with_context,
            language_code
        )

        if not result or "Erro:" in result:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha na geração do rascunho")

        # --- SELF-CRITIQUE: Avaliar e refinar resposta (Constitutional AI) ---
        critique_metrics = {}
        if ENABLE_SELF_CRITIQUE:
            try:
                result, critique_result = await evaluate_and_refine(
                    response=result,
                    specialty=payload.specialty,
                    context_type="consultation",
                    auto_refine=True
                )
                critique_metrics = extract_critique_metrics(critique_result)
                logger.info(f"[SELF-CRITIQUE] Draft avaliado. Score: {critique_metrics.get('self_critique_score', 'N/A')}, "
                           f"Refinado: {critique_metrics.get('self_critique_was_refined', False)}")
            except Exception as e:
                logger.warning(f"[SELF-CRITIQUE] Falha na avaliação (continuando sem critique): {e}")

        # --- DATA FLYWHEEL: Salvar par de draft (quality=0 até salvar consulta) ---
        meta = {
            "specialty": payload.specialty,
            "is_first": payload.is_first_consultation,
            **critique_metrics  # Inclui métricas de self-critique se disponíveis
        }
        await collect_data(
            db, user_id, "draft_generation",
            payload.raw_notes, result,
            meta,
            quality=0,
            lang=language_code
        )

        # --- DPO: Se é regeneração, criar par de preferência ---
        if payload.is_regeneration and payload.previous_response:
            await collect_regeneration_pair(
                db=db,
                user_id=user_id,
                prompt=payload.raw_notes,
                original_response=payload.previous_response,
                new_response=result,
                source_type="consultation_draft_regeneration",
                use_llm_judge=True,
                metadata={
                    "specialty": payload.specialty,
                    "is_first": payload.is_first_consultation
                },
                language=language_code
            )
            logger.info(f"[DPO] Par de regeneração de draft capturado para: {user_email}")

        await track_activity(db, user_id, 'consultation', 'generate')
        await db.commit() # Salva a transação de dracmas
        logger.info(f"Rascunho gerado para: {user_email}")
        return {"draftNotes": result}
    except HTTPException as http_exc:
        await db.rollback()
        raise http_exc # Re-levanta a exceção de saldo insuficiente
    except Exception as e:
        await db.rollback()
        logger.error(f"Erro em /consultations/draft para {user_email}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro no processamento do rascunho.")

@router.post("/summary", response_model=SummaryResponse)
async def get_summary(
    payload: SummaryPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Gera um resumo a partir de um texto aprimorado."""
    # Cache user attributes before any DB operations to avoid lazy-loading issues
    user_id = current_user.id
    user_email = current_user.email
    language_code = current_user.language_preference or 'pt-BR'

    try:
        await debit_dracmas_for_feature(current_user, "generate_summary", db)

        # Executa a função síncrona de LLM em uma thread separada
        summary, usage, model_name = await run_in_threadpool(
            generate_case_summary,
            payload.improved_text,
            language_code
        )

        if not summary or "Erro:" in summary:
            logger.error(f"Falha na geração do resumo para {user_email}. Retorno do serviço: {summary}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha na geração do resumo")

        # --- SELF-CRITIQUE: Avaliar e refinar resumo (Constitutional AI) ---
        critique_metrics = {}
        if ENABLE_SELF_CRITIQUE:
            try:
                summary, critique_result = await evaluate_and_refine(
                    response=summary,
                    specialty="",  # Summary é genérico
                    context_type="summary",
                    auto_refine=True
                )
                critique_metrics = extract_critique_metrics(critique_result)
                logger.info(f"[SELF-CRITIQUE] Summary avaliado. Score: {critique_metrics.get('self_critique_score', 'N/A')}, "
                           f"Refinado: {critique_metrics.get('self_critique_was_refined', False)}")
            except Exception as e:
                logger.warning(f"[SELF-CRITIQUE] Falha na avaliação de summary: {e}")

        # --- DATA FLYWHEEL: Salvar par de summary (quality=0 até salvar consulta) ---
        await collect_data(
            db, user_id, "summary_generation",
            payload.improved_text, summary,
            critique_metrics,  # Inclui métricas de self-critique
            quality=0,
            lang=language_code
        )

        # --- DPO: Se é regeneração, criar par de preferência ---
        if payload.is_regeneration and payload.previous_response:
            await collect_regeneration_pair(
                db=db,
                user_id=user_id,
                prompt=payload.improved_text,
                original_response=payload.previous_response,
                new_response=summary,
                source_type="consultation_summary_regeneration",
                use_llm_judge=True,
                metadata={},
                language=language_code
            )
            logger.info(f"[DPO] Par de regeneração de summary capturado para: {user_email}")

        await db.commit()
        logger.info(f"Resumo gerado para: {user_email}")
        return {"summary": summary}
    except HTTPException as http_exc:
        await db.rollback()
        raise http_exc
    except Exception as e:
        await db.rollback()
        logger.error(f"Erro em /consultations/summary para {user_email}: {e}", exc_info=True)
        if not isinstance(e, HTTPException):
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro no processamento do resumo.")
        raise e


@router.post("/extract-icd10", response_model=ICD10ExtractionResponse)
async def extract_icd10(
    payload: ICD10ExtractionPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Extrai códigos CID-10 sugeridos a partir das notas clínicas.
    """
    try:
        # Cobrar pela extração de CID-10 (2 dracmas)
        await debit_dracmas_for_feature(current_user, "extract_icd10", db)

        language_code = current_user.language_preference or 'pt-BR'

        # Executa a extração em thread separada
        suggested_codes = await run_in_threadpool(
            extract_icd10_from_notes,
            payload.clinical_notes,
            payload.specialty,
            language_code
        )

        # --- DATA FLYWHEEL: Salvar extração de CID-10 ---
        import json
        await collect_data(
            db, current_user.id, "icd10_extraction",
            payload.clinical_notes, json.dumps(suggested_codes, ensure_ascii=False),
            {"specialty": payload.specialty, "num_codes": len(suggested_codes)},
            quality=0,
            lang=language_code
        )
        await db.commit()

        logger.info(f"CID-10 extraídos para {current_user.email}: {len(suggested_codes)} códigos")
        return {"suggestedCodes": suggested_codes}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.error(f"Erro em /consultations/extract-icd10: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao extrair CID-10")

@router.delete("", status_code=status.HTTP_200_OK)
async def delete_consultations(
    payload: DeletePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Exclui uma ou mais consultas pelo ID."""
    if not payload.ids:
        return {"message": "Nenhuma consulta selecionada para exclusão."}

    # Query para buscar as consultas que pertencem ao usuário e estão na lista de IDs
    result = await db.execute(
        select(Consultation).filter(
            Consultation.id.in_(payload.ids),
            Consultation.user_id == current_user.id
        )
    )
    consultations_to_delete = result.scalars().all()

    if not consultations_to_delete:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma consulta correspondente encontrada para exclusão.")

    deleted_count = len(consultations_to_delete)
    for consultation in consultations_to_delete:
        await db.delete(consultation)
    
    await db.commit()
    logger.info(f"{deleted_count} consulta(s) excluída(s) com sucesso pelo usuário {current_user.email}.")
    return {"message": f"{deleted_count} consulta(s) excluída(s) com sucesso."}