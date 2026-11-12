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
from ..models import Consultation, User, Patient
from ..services.llm_services import improve_consultation_notes, generate_case_summary, extract_icd10_from_notes
from ..services import audit_service
from ..security import get_current_active_user
from ..services.activity_service import track_activity


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

    class Config:
        from_attributes = True

class DraftPayload(BaseModel):
    specialty: str
    raw_notes: str = Field(..., alias='rawNotes')
    is_first_consultation: bool = Field(True, alias='isFirstConsultation')
    patient_id: Optional[int] = Field(None, alias='patientId')

    class Config:
        populate_by_name = True

class DraftResponse(BaseModel):
    draft_notes: str = Field(..., alias='draftNotes')

class SummaryPayload(BaseModel):
    improved_text: str = Field(..., alias='improvedText')

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

        # Executa a função síncrona de LLM em uma thread separada
        summary, usage, model_name = await run_in_threadpool(
            generate_case_summary,
            payload.improved_text,
            language_code
        )

        if not summary or "Erro:" in summary:
            logger.error(f"Falha na geração do resumo para {user_email}. Retorno do serviço: {summary}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha na geração do resumo")

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

        language_code = current_user.language_preference or 'pt-BR'

        # Busca os candidatos na tabela da CID-10 e roda o modelo fora do event loop
        suggested_codes = await extract_icd10_from_notes(
            db,
            payload.clinical_notes,
            payload.specialty,
            language_code
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