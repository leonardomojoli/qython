# qython/backend/routes/copilot_routes.py

import asyncio
import logging
import json
import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Form, UploadFile, File
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import User, ChatSession, ChatMessage, TrainingData, Patient, CopilotPrompt
from ..security import get_current_active_user
from ..services import llm_services
from ..services.academic_services import file_processing_service
from ..services.llm_services import generate_title_from_content
from ..services.billing_service import debit_dracmas_for_feature
from ..services.data_collector_service import collect_data
from ..services.preference_service import collect_regeneration_pair
from ..services.citation_collector import collect_citation_grounded_data
from ..config import Config
from ..services.activity_service import track_activity

logger = logging.getLogger("qython_logger")
router = APIRouter()

class ChatSessionResponse(BaseModel):
    id: int
    title: str

    class Config:
        from_attributes = True

class SourceItem(BaseModel):
    uri: str
    title: Optional[str] = None
    author: Optional[str] = None
    year: Optional[str] = None
    pmid: Optional[str] = None
    source: Optional[str] = None  # 'grounding', 'model_text', 'pubmed_lookup'
    source_type: Optional[str] = None  # classificação canônica p/ badge: label|guideline|pubmed|doi|journal|reference|gov|other

class GroundingSupportItem(BaseModel):
    start_index: int = 0
    end_index: int = 0
    text: Optional[str] = None
    chunk_indices: List[int] = []

    # O grounding do Gemini pode trazer start/end_index None (segmento que começa em 0).
    # Coerção defensiva None→0 p/ nunca estourar 500 na validação do ChatResponse.
    @field_validator('start_index', 'end_index', mode='before')
    @classmethod
    def _none_to_zero(cls, v):
        return 0 if v is None else v

class ChatMessageResponse(BaseModel):
    sender: str
    content: str
    image_url: Optional[str] = None
    file_name: Optional[str] = None
    sources: Optional[List[SourceItem]] = None
    supports: Optional[List[GroundingSupportItem]] = None

    class Config:
        from_attributes = True

class ChatResponse(BaseModel):
    response: str
    session_id: Optional[int] = None
    new_title: Optional[str] = None
    sources: Optional[List[SourceItem]] = None
    supports: Optional[List[GroundingSupportItem]] = None
    training_data_id: Optional[int] = None  # id do TrainingData desta resposta (match de feedback à prova de balas)

class ChatPayload(BaseModel):
    message: str
    include_reasoning: bool = False
    session_id: Optional[int] = None
    library_id: Optional[int] = None
    is_regeneration: bool = False
    consultation_context: Optional[dict] = None  # Consultation context for reference

class SuggestedPromptItem(BaseModel):
    slug: str
    category: Optional[str] = None
    icon: Optional[str] = None
    label_key: Optional[str] = None
    label: str
    opener: str

    class Config:
        from_attributes = True


@router.get("/suggested-prompts", response_model=List[SuggestedPromptItem])
async def get_suggested_prompts(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Pílulas de sugestão do copiloto (v2). Servidas do banco para curar sem deploy do
    front. O front amostra/embaralha client-side e cai na lista embutida se isto vier vazio."""
    result = await db.execute(
        select(CopilotPrompt)
        .filter(CopilotPrompt.is_active.is_(True))
        .order_by(CopilotPrompt.sort_order.asc(), CopilotPrompt.id.asc())
    )
    return result.scalars().all()


@router.post("/suggested-prompts/{slug}/click")
async def record_suggested_prompt_click(slug: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Sinal de uso p/ o flywheel: quais pílulas o usuário realmente escolhe. Incrementa
    usage_count e registra um UserActivity. Fire-and-forget — nunca quebra o fluxo do chat."""
    result = await db.execute(select(CopilotPrompt).filter(CopilotPrompt.slug == slug))
    prompt = result.scalars().first()
    if prompt is not None:
        prompt.usage_count = (prompt.usage_count or 0) + 1
    await track_activity(db, current_user.id, 'copilot', 'suggested_prompt_click', metadata={'slug': slug})
    await db.commit()
    return {"ok": True}


@router.get("/sessions", response_model=List[ChatSessionResponse])
async def get_chat_sessions(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Retrieves all chat sessions for the current user."""
    result = await db.execute(
        select(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.created_at.desc())
    )
    sessions = result.scalars().all()
    return sessions

@router.get("/sessions/{session_id}", response_model=List[ChatMessageResponse])
async def get_session_messages(session_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Retrieves all messages for a specific chat session."""
    result_session = await db.execute(
        select(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = result_session.scalars().first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    
    result_messages = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.timestamp.asc())
    )
    messages = result_messages.scalars().all()
    return messages

@router.post("", response_model=ChatResponse)
async def handle_chat_message(
    message: str = Form(...),
    include_reasoning: bool = Form(False),
    session_id: Optional[int] = Form(None),
    library_id: Optional[int] = Form(None),
    is_regeneration: bool = Form(False),
    consultation_context: Optional[str] = Form(None),
    patient_id: Optional[int] = Form(None),
    ephemeral_history: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Handles sending a message with optional multi-file uploads (up to 5 files).
    Supports mixed images and text documents in a single message.
    """
    # Capture user email early to avoid lazy loading issues in exception handler
    user_email = current_user.email

    try:
        session = None

        # === MULTI-FILE PROCESSING ===
        MAX_FILES = 5
        MAX_TOTAL_SIZE_MB = 20
        MAX_TOTAL_FILE_CONTEXT_CHARS = 12000  # ~3K tokens - protects API cost margins
        MAX_IMAGES = 3

        IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
        TEXT_EXTENSIONS = {'.txt', '.pdf', '.docx', '.md', '.csv', '.json', '.xml', '.html'}

        image_data_list = []    # [{'bytes': bytes, 'mime_type': str, 'saved_url': str}]
        text_extractions = []   # [{'name': str, 'text': str}]
        all_file_names = []
        saved_image_url = None
        file_content_context = None
        has_images = False
        total_size = 0

        if len(files) > MAX_FILES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                detail=f"Máximo de {MAX_FILES} arquivos por mensagem.")

        for uploaded_file in files:
            content_bytes = await uploaded_file.read()
            total_size += len(content_bytes)
            if total_size > MAX_TOTAL_SIZE_MB * 1024 * 1024:
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                    detail=f"Tamanho total dos arquivos excede {MAX_TOTAL_SIZE_MB}MB.")

            ext = os.path.splitext(uploaded_file.filename or '')[1].lower()
            all_file_names.append(uploaded_file.filename)

            if ext in IMAGE_EXTENSIONS or (uploaded_file.content_type and uploaded_file.content_type.startswith('image/')):
                # --- IMAGE FILE ---
                if len(image_data_list) >= MAX_IMAGES:
                    raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                        detail=f"Máximo de {MAX_IMAGES} imagens por mensagem.")

                has_images = True
                if len(content_bytes) > 10 * 1024 * 1024:
                    raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                        detail=f"Imagem {uploaded_file.filename} excede 10MB.")

                img_mime = uploaded_file.content_type or 'image/jpeg'

                # Compress and save for chat history
                os.makedirs(Config.CHAT_IMAGES_FOLDER, exist_ok=True)
                unique_filename = f"{uuid.uuid4().hex}.webp"
                image_path = os.path.join(Config.CHAT_IMAGES_FOLDER, unique_filename)
                try:
                    from PIL import Image as PILImage
                    from io import BytesIO
                    img = PILImage.open(BytesIO(content_bytes))
                    if img.mode in ("RGBA", "P", "LA"):
                        img = img.convert("RGB")
                    max_dim = 800
                    if max(img.size) > max_dim:
                        ratio = max_dim / max(img.size)
                        img = img.resize((int(img.width * ratio), int(img.height * ratio)), PILImage.Resampling.LANCZOS)
                    img.save(image_path, "WEBP", quality=70)
                except Exception as e:
                    logger.warning(f"[UPLOAD] Compression failed for {uploaded_file.filename}, saving original: {e}")
                    with open(image_path.replace('.webp', '.jpg'), 'wb') as f:
                        f.write(content_bytes)
                    unique_filename = unique_filename.replace('.webp', '.jpg')

                img_url = f"/static/uploads/chat_images/{unique_filename}"
                if not saved_image_url:
                    saved_image_url = img_url  # First image = chat bubble thumbnail
                image_data_list.append({'bytes': content_bytes, 'mime_type': img_mime, 'saved_url': img_url})
                logger.info(f"[UPLOAD] Image saved: {uploaded_file.filename} → {img_url}")

            elif ext in TEXT_EXTENSIONS:
                # --- TEXT/DOCUMENT FILE ---
                if len(content_bytes) > 5 * 1024 * 1024:
                    raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                        detail=f"Arquivo {uploaded_file.filename} excede 5MB.")
                file_ext = ext.lstrip('.')
                try:
                    extracted = file_processing_service.get_input_data_from_bytes(content_bytes, file_ext)
                    text_extractions.append({'name': uploaded_file.filename, 'text': extracted})
                    logger.info(f"[UPLOAD] Extracted {len(extracted)} chars from {uploaded_file.filename}")
                except Exception as e:
                    logger.error(f"[UPLOAD] Failed to process {uploaded_file.filename}: {e}")
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                        detail=f"Não foi possível processar {uploaded_file.filename}. Formatos suportados: txt, pdf, docx, md")
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Formato não suportado: {ext}. Use imagens (png, jpg, gif, webp) ou documentos (pdf, docx, txt, md).")

        # Build combined text context with per-document truncation to control token costs
        if text_extractions:
            chars_per_doc = MAX_TOTAL_FILE_CONTEXT_CHARS // len(text_extractions)
            doc_parts = []
            for i, doc in enumerate(text_extractions):
                truncated_text = doc['text'][:chars_per_doc]
                if len(doc['text']) > chars_per_doc:
                    truncated_text += f"\n[... documento truncado em {chars_per_doc} caracteres de {len(doc['text'])} total ...]"
                    logger.info(f"[UPLOAD] Truncated {doc['name']}: {len(doc['text'])} → {chars_per_doc} chars")
                doc_parts.append(f'<DOCUMENTO_{i+1} nome="{doc["name"]}">\n{truncated_text}\n</DOCUMENTO_{i+1}>')

            if len(text_extractions) == 1:
                file_content_context = f"O usuário anexou o seguinte documento. Analise-o cuidadosamente para responder à pergunta.\n\n{doc_parts[0]}"
            else:
                file_content_context = f"O usuário anexou {len(text_extractions)} documentos. Analise-os cuidadosamente para responder à pergunta.\n\n" + "\n\n".join(doc_parts)

        logger.info(f"[UPLOAD] Processed {len(files)} files: {len(image_data_list)} images, {len(text_extractions)} documents, context={len(file_content_context or '')} chars")
        
        # Process consultation context if provided
        if consultation_context:
            try:
                ctx_data = json.loads(consultation_context) if isinstance(consultation_context, str) else consultation_context
                consultation_text = ctx_data.get('content', '')
                specialty = ctx_data.get('specialty', 'unknown')
                if consultation_text:
                    context_header = f"\n\n--- CONSULTA DE REFERÊNCIA ({specialty.upper()}) ---\n"
                    if file_content_context:
                        file_content_context = file_content_context + context_header + consultation_text
                    else:
                        file_content_context = context_header + consultation_text
                    logger.info(f"[CONTEXT] Added consultation context: {len(consultation_text)} chars, specialty: {specialty}")
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning(f"[CONTEXT] Failed to parse consultation_context: {e}")

        # Process patient context if provided
        if patient_id:
            try:
                patient_result = await db.execute(
                    select(Patient).where(
                        Patient.id == patient_id,
                        Patient.doctor_id == current_user.id
                    )
                )
                patient = patient_result.scalar_one_or_none()
                if patient:
                    context_parts = []

                    # Demographics
                    demographics = []
                    if patient.full_name:
                        demographics.append(f"Nome: {patient.full_name}")
                    if patient.birth_date:
                        from datetime import date
                        today = date.today()
                        age = today.year - patient.birth_date.year - (
                            (today.month, today.day) < (patient.birth_date.month, patient.birth_date.day)
                        )
                        demographics.append(f"Idade: {age} anos")
                        demographics.append(f"Data de Nascimento: {patient.birth_date.strftime('%d/%m/%Y')}")
                    if patient.gender:
                        gender_map = {'male': 'Masculino', 'female': 'Feminino', 'other': 'Outro'}
                        demographics.append(f"Sexo: {gender_map.get(patient.gender, patient.gender)}")

                    if demographics:
                        context_parts.append("DADOS DO PACIENTE:\n" + " | ".join(demographics))

                    # Clinical alerts
                    alerts = []
                    if patient.allergies:
                        alerts.append(f"Alergias: {', '.join(patient.allergies)}")
                    if patient.chronic_conditions:
                        alerts.append(f"Condições crônicas: {', '.join(patient.chronic_conditions)}")
                    if patient.current_medications:
                        alerts.append(f"Medicamentos em uso: {', '.join(patient.current_medications)}")

                    if alerts:
                        context_parts.append("ALERTAS CLÍNICOS:\n" + "\n".join(alerts))

                    # Clinical history (last 5 entries)
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
                            if entry.get('specialty'):
                                entry_text.append(f"Especialidade: {entry['specialty']}")
                            if entry_text:
                                history_entries.append(" | ".join(entry_text))

                        if history_entries:
                            context_parts.append("HISTÓRICO CLÍNICO RECENTE:\n" + "\n".join(history_entries))

                    # Patient notes
                    if patient.notes:
                        context_parts.append(f"OBSERVAÇÕES DO MÉDICO:\n{patient.notes}")

                    # Build and inject
                    if context_parts:
                        patient_context_text = (
                            "\n\n--- CONTEXTO DO PACIENTE (use APENAS estas informações, NÃO invente dados) ---\n"
                            "IMPORTANTE: Use SOMENTE os dados fornecidos abaixo. Se uma informação não estiver disponível, "
                            "NÃO a inclua. NUNCA invente idade, sexo, ou qualquer outro dado do paciente.\n\n"
                            + "\n\n".join(context_parts)
                            + "\n--- FIM DO CONTEXTO DO PACIENTE ---\n"
                        )
                        if file_content_context:
                            file_content_context = patient_context_text + file_content_context
                        else:
                            file_content_context = patient_context_text

                        logger.info(f"[CONTEXT] Added patient context for patient_id={patient_id}, {len(patient_context_text)} chars")
                else:
                    logger.warning(f"[CONTEXT] Patient {patient_id} not found or not owned by user {current_user.id}")
            except Exception as e:
                logger.warning(f"[CONTEXT] Failed to build patient context: {e}")

        # Topic gating removed (2026-05): Qython now answers medical AND
        # medicine-adjacent / professional-context questions, letting the model
        # judge relevance in context (see the ESCOPO section of the system
        # prompt). The old pre-LLM classifier blocked legitimate medicine-adjacent
        # queries (biostatistics, CFM/ethics/LGPD, medical writing, health
        # economics, etc.) and added a Gemini call per message.
        effective_language = language or current_user.language_preference or 'pt'

        # Debit for the message before processing (3 tiers: texto, documento, imagem)
        if has_images:
            await debit_dracmas_for_feature(current_user, "chat_message_with_image", db)
        elif text_extractions:
            await debit_dracmas_for_feature(current_user, "chat_message_with_document", db)
        else:
            await debit_dracmas_for_feature(current_user, "chat_message", db)

        # If a session_id is provided, find it. Otherwise, create a new one.
        if session_id:
            result_session = await db.execute(
                select(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
            )
            session = result_session.scalars().first()
            if not session:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        else:
            session = ChatSession(user_id=current_user.id, title="Nova Conversa")
            db.add(session)
            await db.commit()
            await db.refresh(session)
            session_id = session.id
            is_new_session = True

        # Track if this is a new session for title generation later
        if 'is_new_session' not in dir():
            is_new_session = False

        # --- REGENERAÇÃO: o turno do usuário JÁ existe; vamos apenas re-responder. Captura a
        # resposta anterior (par DPO) e a REMOVE antes de montar o contexto — assim (1) não
        # duplica o par pergunta/resposta ao reabrir a conversa e (2) o modelo não recebe a
        # própria resposta que está sendo refeita como contexto. ---
        previous_response_for_dpo = None
        if is_regeneration:
            result_prev_msg = await db.execute(
                select(ChatMessage)
                .filter(ChatMessage.session_id == session_id, ChatMessage.sender == 'bot')
                .order_by(ChatMessage.timestamp.desc())
                .limit(1)
            )
            prev_bot_msg = result_prev_msg.scalars().first()
            if prev_bot_msg:
                previous_response_for_dpo = prev_bot_msg.content
                await db.delete(prev_bot_msg)
                logger.info(f"[DPO] Resposta anterior capturada ({len(previous_response_for_dpo)} chars) e removida para regeneração")

            # Marca a entrada antiga de TrainingData como dislike (compatibilidade com o flywheel)
            result_prev_td = await db.execute(
                select(TrainingData)
                .filter(TrainingData.user_id == current_user.id, TrainingData.source_type == "chat_interaction")
                .order_by(TrainingData.created_at.desc())
                .limit(1)
            )
            prev_entry = result_prev_td.scalars().first()
            if prev_entry:
                prev_entry.quality_score = -1
                meta = prev_entry.metadata_info or {}
                meta['regenerated'] = True
                prev_entry.metadata_info = meta
                logger.info(f"[DATA FLYWHEEL] Regeneração marcou entrada anterior como dislike")

        # Save the user's message — em regeneração o turno do usuário já está salvo, então NÃO
        # criamos outro (era o que duplicava a pergunta no reload).
        saved_file_name = json.dumps(all_file_names) if all_file_names else None
        if not is_regeneration:
            user_message = ChatMessage(session_id=session_id, sender='user', content=message, image_url=saved_image_url, file_name=saved_file_name)
            db.add(user_message)
        else:
            # Defensivo: se a sessão não tiver nenhum turno de usuário, cria um (evita resposta órfã).
            existing_user = await db.execute(
                select(ChatMessage.id).filter(ChatMessage.session_id == session_id, ChatMessage.sender == 'user').limit(1)
            )
            if existing_user.scalars().first() is None:
                user_message = ChatMessage(session_id=session_id, sender='user', content=message, image_url=saved_image_url, file_name=saved_file_name)
                db.add(user_message)

        # === ENTERPRISE CONTEXT MANAGEMENT ===
        # Use ContextWindowManager for robust multi-tier strategy
        from ..services.context_manager import ContextWindowManager
        from ..services.llm_services import client
        
        context_manager = ContextWindowManager(client)
        history_for_llm, total_tokens = await context_manager.get_managed_context(
            session_id=session_id,
            db=db,
            max_tokens=800_000  # 80% of Gemini 2.0 Flash capacity
        )
        logger.info(f"[CONTEXT] Managed context: {len(history_for_llm)} entries, {total_tokens} tokens")

        # Inject ephemeral history from off-topic exchanges (no session exists for these)
        # This gives the AI context when user follows up after an off-topic rejection
        if ephemeral_history and is_new_session:
            try:
                ephemeral_msgs = json.loads(ephemeral_history)
                if isinstance(ephemeral_msgs, list) and len(ephemeral_msgs) > 0:
                    history_for_llm = ephemeral_msgs + history_for_llm
                    logger.info(f"[CONTEXT] Injected {len(ephemeral_msgs)} ephemeral messages from off-topic exchange")
            except (json.JSONDecodeError, TypeError):
                pass  # Invalid ephemeral history, ignore

        # (Regeneração já foi tratada acima, antes do contexto: resposta anterior capturada/removida.)

        # Call the AI service with file context
        # skip_topic_check if we already checked at route level (new conversations)
        response_text, usage, model_used, grounding_sources, grounding_supports = await llm_services.chat_with_google_ai(
            message=message,
            history=history_for_llm,
            include_clinical_reasoning=include_reasoning,
            language_code=effective_language,
            file_content_context=file_content_context,
            image_data_list=image_data_list if image_data_list else None,
            library_id=library_id,
            db=db,
            skip_topic_check=True,  # topic gating removed; model judges relevance in context
            user_id=current_user.id,  # resolve [IMAGEM: ...] na biblioteca DESTE usuário
        )

        is_off_topic = False  # topic gating removed (kept for metadata compatibility)

        # Save the bot's response with sources
        bot_message = ChatMessage(
            session_id=session_id,
            sender='bot',
            content=response_text,
            sources=grounding_sources  # Store grounding sources from Google Search
        )
        db.add(bot_message)

        # --- DATA FLYWHEEL: Salvar par de conversa com contexto rico ---
        if include_reasoning:
            flywheel_source_type = "chat_clinical_discussion"
            flywheel_quality = 0  # Pending until explicit like
        else:
            flywheel_source_type = "chat_interaction"
            flywheel_quality = 0  # Pending until explicit like

        # Contexto conversacional: últimas 4 trocas para treinar modelos de chat
        rich_input = json.dumps({
            "ctx": history_for_llm[-4:] if history_for_llm else [],
            "q": message
        }, ensure_ascii=False)

        # grounding_sources já contém referências UNIFICADAS (Google Grounding + PubMed lookup)
        # vindas do process_references() em llm_services.py
        # Estas são referências verificadas anti-alucinação, valiosas para treinamento
        unified_refs = grounding_sources if grounding_sources else []

        # Contar por fonte para logging
        grounding_count = len([r for r in unified_refs if r.get('source') == 'grounding'])
        pubmed_count = len([r for r in unified_refs if r.get('source') == 'pubmed_lookup'])
        if not is_off_topic:
            logger.info(f"[DATA FLYWHEEL] Salvando {len(unified_refs)} referências para treinamento ({grounding_count} grounding, {pubmed_count} PubMed)")
        else:
            logger.info(f"[DATA FLYWHEEL] Salvando interação off-topic para treinamento de rejeição")

        training_data_id = await collect_data(
            db, current_user.id, flywheel_source_type,
            rich_input, response_text,
            {
                "reasoning": include_reasoning,
                "lib_id": library_id,
                "model": model_used,
                "has_image": bool(image_data_list),
                "off_topic": is_off_topic,
                "ref_count": len(unified_refs),
                "grounding_refs": grounding_count,
                "pubmed_refs": pubmed_count
            },
            quality=flywheel_quality,
            image_bytes=image_data_list[0]['bytes'] if image_data_list else None,
            lang=current_user.language_preference,
            references=unified_refs
        )

        # --- Citation-grounded training data (for teaching models to cite) ---
        # Skip for off-topic (no citations in off-topic responses)
        if unified_refs and not is_off_topic:
            try:
                await collect_citation_grounded_data(
                    db=db,
                    user_id=current_user.id,
                    question=message,
                    response_with_citations=response_text,
                    references=unified_refs,
                    specialty=None,
                    lang=current_user.language_preference or 'pt-BR',
                )
            except Exception:
                pass  # Citation collection must never block the response

        # --- DPO: Salvar par de preferência se foi regeneração ---
        if is_regeneration and previous_response_for_dpo and not is_off_topic:
            await collect_regeneration_pair(
                db=db,
                user_id=current_user.id,
                prompt=message,
                original_response=previous_response_for_dpo,
                new_response=response_text,
                source_type="chat_regeneration",
                use_llm_judge=True,
                metadata={
                    "reasoning": include_reasoning,
                    "lib_id": library_id,
                    "model": model_used,
                    "session_id": session_id
                },
                language=current_user.language_preference or 'pt-BR'
            )
            logger.info(f"[DPO] Par de preferência salvo para regeneração")

        await track_activity(db, current_user.id, 'copilot', 'chat')
        await db.commit()

        # Generate title for new sessions (after first exchange)
        new_title = None
        if is_new_session:  # Always generate for new sessions
            try:
                # Cobrar pela geração de título (1 dracma)
                await debit_dracmas_for_feature(current_user, "generate_chat_title", db)
                has_image = saved_image_url is not None
                generated_title = await asyncio.to_thread(generate_title_from_content, message, current_user.language_preference, has_image)
                session.title = generated_title
                await db.commit()
                new_title = generated_title
            except HTTPException:
                # Se não tiver saldo, mantém título padrão (não é crítico)
                logger.warning(f"Usuário {current_user.email} sem saldo para gerar título de chat")
            except Exception as e:
                logger.error(f"Erro ao gerar título: {e}")

        return ChatResponse(
            response=response_text,
            session_id=session_id,
            new_title=new_title,
            sources=grounding_sources,
            supports=grounding_supports,
            training_data_id=training_data_id
        )

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Erro no chat para {user_email}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro no processamento da mensagem.")

@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_session(session_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Deletes a chat session and all its messages."""
    result = await db.execute(
        select(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    
    await db.delete(session)
    await db.commit()
    return None
