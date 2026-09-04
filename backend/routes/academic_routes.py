# qython/backend/routes/academic_routes.py

import logging
import os
import re
from typing import Optional, Any, List, Dict, Union
from datetime import datetime, timedelta, timezone

import random
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, BackgroundTasks, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from sqlalchemy import text as sqltext
from sqlalchemy.orm import selectinload
from werkzeug.utils import secure_filename
from starlette.concurrency import run_in_threadpool

from google import genai
from google.genai import types

from ..database import get_db, AsyncSessionLocal
from ..models import User, Transaction, QuizAttempt, UserStats, Achievement, AcademicLibrary, AcademicDocument, AcademicMaterial, PodcastGenerationJob, VideoLessonJob, SimuladoGenerationJob, ArenaExam, CustomExamCard, CustomCardSource
from ..services.billing_service import debit_dracmas_for_feature
from ..services.academic_services import library_service, vector_db_service
from ..services.academic_services.transcription_service import transcribe_audio
from ..services.academic_services import exam_generation_service
from ..services.academic_services import exam_research_service
from ..services.academic_services.material_generation_service import generate_study_material, generate_narration_script_from_slideshow
from ..services.academic_services.question_qa import check_questions, build_repair_instruction, summarize, should_repair
from ..services.academic_services import audio_generation_service
from ..services.academic_services import video_generation_service
from ..services.academic_services import file_processing_service
from ..utils import allowed_file, UPLOAD_FOLDER, THUMBNAIL_FOLDER
from ..security import get_current_active_user
from ..services import llm_services
from ..services.data_collector_service import collect_data
from ..services.activity_service import track_activity
from fastapi.responses import FileResponse
from ..config import Config

logger = logging.getLogger("qython_logger")

router = APIRouter()

# Constantes para a nova lógica de podcast
PODCAST_CONTENT_TARGET_LENGTH = 45000
PODCAST_CONTENT_TRIGGER_LENGTH = 50000

class UploadResponse(BaseModel):
    message: str
    filepath: str

class ProcessPayload(BaseModel):
    source_type: str
    source_value: Union[str, int]
    material_type: str
    question_count: int = 5
    question_type: str = 'objective'

class ProcessResponse(BaseModel):
    data: Any

class LibraryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None  # nome FA ('heart-pulse') ou emoji; vazio = heurística local

class LibraryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None

class LibraryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    icon: Optional[str] = 'book'
    created_at: datetime
    document_count: int = 0   # setado pelo serviço; permite ao front travar geração em lib vazia
    processing_count: int = 0  # docs pending/processing — o front avisa que a geração sairá sem eles

    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id: int
    library_id: int
    original_filename: str
    thumbnail_url: Optional[str] = None
    storage_path: Optional[str] = None          # NULL p/ docs Drive-only (original na nuvem do usuário)
    storage_provider: Optional[str] = None      # NULL = legado server-side | 'gdrive'
    status: str
    error_code: Optional[str] = None            # falha acionável (drive_quota_full, cloud_reauth_required, ...)
    created_at: datetime
    updated_at: datetime
    thumbnail_filename: Optional[str] = None

    class Config:
        from_attributes = True

class QuizRequest(BaseModel):
    specialty: str
    mode: str
    language: Optional[str] = 'pt-BR' # Add language field

class QuizSubmitPayload(BaseModel):
    specialty: str
    mode: str
    answers: Any  # dict {str(index): answer_index} or list
    questions: List[Any]
    time_elapsed_seconds: Optional[int] = None
    challenge_id: Optional[int] = None

class LibraryChatPayload(BaseModel):
    message: str = Field(..., max_length=10000)
    history: Optional[List[Dict[str, str]]] = None

class DriveImportPayload(BaseModel):
    file_ids: List[str] = Field(..., min_length=1, max_length=50)

class PodcastGenerationJobResponse(BaseModel):
    id: int
    user_id: int
    status: str
    result_path: Optional[str] = None
    error_message: Optional[str] = None
    progress_percent: int = 0
    current_step: Optional[str] = None
    total_chunks: int = 0
    completed_chunks: int = 0
    expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    training_data_id: Optional[int] = None

    class Config:
        from_attributes = True

class VideoLessonJobResponse(BaseModel):
    id: int
    user_id: int
    status: str
    result_path: Optional[str] = None
    srt_path: Optional[str] = None
    error_message: Optional[str] = None
    progress_percent: int = 0
    current_step: Optional[str] = None
    total_steps: int = 0
    completed_steps: int = 0
    expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    training_data_id: Optional[int] = None

    class Config:
        from_attributes = True

class SimuladoGenerationJobResponse(BaseModel):
    id: int
    user_id: int
    status: str
    result_content: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    training_data_id: Optional[int] = None

    class Config:
        from_attributes = True

class AcademicMaterialResponse(BaseModel):
    id: int
    user_id: int
    material_type: str
    card_id: Optional[int] = None
    content: Dict[str, Any]
    status: str
    expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    training_data_id: Optional[int] = None

    class Config:
        from_attributes = True

@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_200_OK)
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user)
):
    if not allowed_file(file.filename):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de arquivo não permitido")

    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)

        with open(filepath, "wb") as buffer:
            content = await file.read()
            if len(content) > 50 * 1024 * 1024:
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Arquivo excede o limite de 50MB.")
            buffer.write(content)
            
        logger.info(f"Arquivo salvo por {current_user.email}: {filepath}")
        return {"message": "Arquivo enviado com sucesso", "filepath": filepath}
    except Exception as e:
        logger.error(f"Erro no upload para o usuário {current_user.email}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro no upload do arquivo")

def _summarize_text_for_podcast(content: str) -> str:
    """
    Usa um LLM para sumarizar um texto longo, transformando-o em um roteiro de podcast
    com um tamanho alvo.
    """
    logger.info(f"Conteúdo extenso detectado ({len(content)} chars). Iniciando sumarização para podcast...")
    
    prompt = f"""
    Você é um especialista em roteirização de conteúdo educacional para podcasts.
    Sua tarefa é ler o extenso material fornecido abaixo e criar um roteiro coeso e informativo para um podcast.

    REGRAS CRÍTICAS:
    1.  **Formato de Saída:** O roteiro DEVE ser um diálogo entre "Dr. Qython" e "Dra. Epione".
    2.  **Tamanho Alvo:** O roteiro final deve ter aproximadamente {PODCAST_CONTENT_TARGET_LENGTH} caracteres. Você deve condensar, sumarizar e extrair os pontos mais importantes do material original para atingir este alvo.
    3.  **Qualidade:** O roteiro deve fluir naturalmente e ser didático, não apenas uma lista de fatos.

    MATERIAL EXTENSO PARA SUMARIZAR:
    ---
    {content}
    ---
    """
    
    try:
        response = llm_services.client.models.generate_content(
            model=f'models/{llm_services.PRIMARY_LLM_MODEL}',
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.5, max_output_tokens=8192) # Aumentar tokens se necessário
        )
        summarized_script = response.text
        logger.info(f"Sumarização concluída. Novo tamanho do roteiro: {len(summarized_script)} chars.")
        return summarized_script
    except Exception as e:
        logger.error(f"Falha ao sumarizar o conteúdo para o podcast: {e}", exc_info=True)
        raise RuntimeError("Falha ao processar e sumarizar o conteúdo da biblioteca.")


async def _run_podcast_generation_task(job_id: int, input_data: str, user_id: int):
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(PodcastGenerationJob).filter_by(id=job_id))
            job = result.scalars().first()
            if not job:
                logger.error(f"Tarefa de podcast com ID {job_id} não encontrada.")
                return

            job.status = 'processing'
            job.current_step = 'Preparando conteúdo...'
            job.progress_percent = 5
            await db.commit()

            if len(input_data) > PODCAST_CONTENT_TRIGGER_LENGTH:
                job.current_step = 'Sumarizando conteúdo extenso...'
                job.progress_percent = 10
                await db.commit()
                processed_input_data = await run_in_threadpool(_summarize_text_for_podcast, input_data)
            else:
                processed_input_data = input_data

            job.current_step = 'Gerando roteiro do podcast...'
            job.progress_percent = 20
            await db.commit()

            # Agora, usamos o 'processed_input_data' para gerar o roteiro final (se necessário) e o áudio
            material_content, _, _ = await run_in_threadpool(generate_study_material, processed_input_data, 'podcast', user_id)

            script = material_content.get('podcast_script')
            if not script:
                raise RuntimeError("Falha ao gerar o roteiro do podcast a partir do conteúdo processado.")

            job.current_step = 'Iniciando síntese de áudio...'
            job.progress_percent = 30
            await db.commit()

            # Progress callback for audio generation
            def update_audio_progress(current, total, percent, step):
                # Scale percent from 30-95% range (30% is script done, 95% is audio done)
                scaled_percent = 30 + int((percent / 100) * 65)
                # We need to update in a sync context, so we'll do it after
                pass

            # Store progress info for final update
            audio_path = await run_in_threadpool(
                audio_generation_service.generate_podcast_from_script,
                script
            )
            if not audio_path:
                raise RuntimeError("Geração de áudio retornou um caminho vazio.")

            job.current_step = 'Finalizando...'
            job.progress_percent = 95
            await db.commit()

            # --- DATA FLYWHEEL: Salvar roteiro do podcast ---
            job.training_data_id = await collect_data(
                db, user_id, "podcast_script",
                processed_input_data[:5000], script,  # Limitar input para economia
                {"type": "podcast"}, quality=1
            )

            # Save podcast script to a text file alongside the audio
            script_path = None
            if audio_path and script:
                import os
                script_file = audio_path.rsplit('.', 1)[0] + '_script.txt'
                script_full_path = os.path.join('static', script_file) if not script_file.startswith('static') else script_file
                try:
                    with open(script_full_path, 'w', encoding='utf-8') as f:
                        f.write(script)
                    script_path = script_file if not script_file.startswith('static') else script_file.replace('static/', '', 1)
                except Exception as script_error:
                    logger.warning(f"Failed to save podcast script: {script_error}")

            job.result_path = audio_path
            job.script_path = script_path
            job.status = 'completed'
            job.progress_percent = 100
            job.current_step = 'Concluído'
            job.expires_at = datetime.now(timezone.utc) + timedelta(hours=Config.GENERATED_CONTENT_TTL_HOURS)
            await db.commit()
            logger.info(f"Podcast para a tarefa {job_id} gerado com sucesso. Expires at: {job.expires_at}")

            # Send notification: material ready (podcast)
            try:
                from ..services.notification_service import send_notification, NotificationType
                user_result = await db.execute(select(User).where(User.id == user_id))
                user = user_result.scalar_one_or_none()
                lang = getattr(user, 'language_preference', 'pt-BR') or 'pt-BR'
                lang_short = lang.split('-')[0]
                titles = {'pt': 'Material pronto!', 'en': 'Material ready!', 'es': '¡Material listo!'}
                bodies = {'pt': 'Seu podcast foi gerado com sucesso.', 'en': 'Your podcast was generated successfully.', 'es': 'Su podcast fue generado con éxito.'}
                await send_notification(
                    db, user_id, NotificationType.MATERIAL_READY,
                    titles.get(lang_short, titles['pt']),
                    bodies.get(lang_short, bodies['pt']),
                    data={'route': f'/academic/job/{job_id}'},
                )
                await db.commit()

                # Send email notification if user has email_enabled
                if user:
                    prefs = user.notification_preferences or {}
                    if prefs.get('email_enabled', True):
                        from ..services.email_service import send_material_ready_email
                        send_material_ready_email(
                            user.email, user.full_name, 'podcast',
                            bodies.get(lang_short, bodies['pt']),
                            f'{Config.WEB_BASE_URL}/academic/job/{job_id}', lang_short
                        )
            except Exception as ne:
                logger.error(f"[NOTIFICATIONS] Failed to send material ready notification: {ne}")

        except Exception as e:
            logger.error(f"Erro na tarefa de fundo (job_id={job_id}): {e}", exc_info=True)
            if 'job' in locals() and job:
                job.status = 'error'
                job.error_message = str(e)
                await db.commit()

                # Send notification: material failed (podcast)
                try:
                    from ..services.notification_service import send_notification, NotificationType
                    user_result = await db.execute(select(User).where(User.id == user_id))
                    user = user_result.scalar_one_or_none()
                    lang = getattr(user, 'language_preference', 'pt-BR') or 'pt-BR'
                    lang_short = lang.split('-')[0]
                    fail_titles = {'pt': 'Erro na geração', 'en': 'Generation failed', 'es': 'Error en la generación'}
                    fail_bodies = {'pt': 'Ocorreu um erro ao gerar seu material. Tente novamente.', 'en': 'An error occurred generating your material. Please try again.', 'es': 'Ocurrió un error al generar su material. Intente nuevamente.'}
                    await send_notification(
                        db, user_id, NotificationType.MATERIAL_FAILED,
                        fail_titles.get(lang_short, fail_titles['pt']),
                        fail_bodies.get(lang_short, fail_bodies['pt']),
                        data={'route': '/academic'},
                    )
                    await db.commit()
                except Exception as ne:
                    logger.error(f"[NOTIFICATIONS] Failed to send material failed notification: {ne}")

async def _run_simulado_generation_task(job_id: int, exam: ArenaExam, user_id: int):
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(SimuladoGenerationJob).filter_by(id=job_id))
            job = result.scalars().first()
            if not job:
                logger.error(f"Tarefa de simulado com ID {job_id} não encontrada.")
                return
            
            job.status = 'processing'
            await db.commit()

            quiz_data, _, _ = await run_in_threadpool(
                exam_generation_service.generate_exam,
                exam=exam,
                user_id=user_id
            )

            if not quiz_data.get("questionario_objetivo"):
                raise RuntimeError("Falha ao gerar perguntas para o simulado no backend.")

            job.result_content = quiz_data
            job.status = 'completed'
            await db.commit()

            # --- DATA FLYWHEEL: Salvar questões geradas para treinamento ---
            try:
                import json
                questions = quiz_data.get("questionario_objetivo", [])
                input_summary = f"Exam: {exam.title}\nSpecialty: {exam.specialty}\nQuestions: {len(questions)}"
                output_summary = json.dumps(questions[:3], ensure_ascii=False)[:5000]  # Sample for training
                job.training_data_id = await collect_data(
                    db, user_id, "simulado_generation",
                    input_summary, output_summary,
                    {"exam_title": exam.title, "specialty": exam.specialty, "num_questions": len(questions)},
                    quality=0
                )
                await db.commit()
            except Exception as flywheel_err:
                logger.warning(f"[FLYWHEEL] Erro ao coletar dados do simulado: {flywheel_err}")

            logger.info(f"Simulado para a tarefa {job_id} gerado com sucesso.")

            # Send notification: material ready (simulado)
            try:
                from ..services.notification_service import send_notification, NotificationType
                user_result = await db.execute(select(User).where(User.id == user_id))
                user = user_result.scalar_one_or_none()
                lang = getattr(user, 'language_preference', 'pt-BR') or 'pt-BR'
                lang_short = lang.split('-')[0]
                titles = {'pt': 'Material pronto!', 'en': 'Material ready!', 'es': '¡Material listo!'}
                bodies = {'pt': 'Seu simulado foi gerado com sucesso.', 'en': 'Your quiz was generated successfully.', 'es': 'Su simulacro fue generado con éxito.'}
                await send_notification(
                    db, user_id, NotificationType.MATERIAL_READY,
                    titles.get(lang_short, titles['pt']),
                    bodies.get(lang_short, bodies['pt']),
                    data={'route': f'/academic/job/{job_id}'},
                )
                await db.commit()

                # Send email notification if user has email_enabled
                if user:
                    prefs = user.notification_preferences or {}
                    if prefs.get('email_enabled', True):
                        from ..services.email_service import send_material_ready_email
                        send_material_ready_email(
                            user.email, user.full_name, 'simulado',
                            bodies.get(lang_short, bodies['pt']),
                            f'{Config.WEB_BASE_URL}/academic/job/{job_id}', lang_short
                        )
            except Exception as ne:
                logger.error(f"[NOTIFICATIONS] Failed to send material ready notification: {ne}")

        except Exception as e:
            logger.error(f"Erro na tarefa de fundo do simulado (job_id={job_id}): {e}", exc_info=True)
            if 'job' in locals() and job:
                job.status = 'error'
                job.error_message = str(e)
                await db.commit()

                # Send notification: material failed (simulado)
                try:
                    from ..services.notification_service import send_notification, NotificationType
                    user_result = await db.execute(select(User).where(User.id == user_id))
                    user = user_result.scalar_one_or_none()
                    lang = getattr(user, 'language_preference', 'pt-BR') or 'pt-BR'
                    lang_short = lang.split('-')[0]
                    fail_titles = {'pt': 'Erro na geração', 'en': 'Generation failed', 'es': 'Error en la generación'}
                    fail_bodies = {'pt': 'Ocorreu um erro ao gerar seu material. Tente novamente.', 'en': 'An error occurred generating your material. Please try again.', 'es': 'Ocurrió un error al generar su material. Intente nuevamente.'}
                    await send_notification(
                        db, user_id, NotificationType.MATERIAL_FAILED,
                        fail_titles.get(lang_short, fail_titles['pt']),
                        fail_bodies.get(lang_short, fail_bodies['pt']),
                        data={'route': '/academic'},
                    )
                    await db.commit()
                except Exception as ne:
                    logger.error(f"[NOTIFICATIONS] Failed to send material failed notification: {ne}")

def _prior_line(q):
    """Uma linha da avoid-list: enunciado + o NÚCLEO já cobrado.

    Só o enunciado não basta — medido no card de concurso: 15 gabaritos reapareceram
    em provas diferentes (IMAP 3×, "5 anos, 15 anos e 25 anos" 3×) porque o modelo
    reescrevia a pergunta e passava pela lista. Levando o gabarito e o tópico, ele vê
    que o ponto já foi cobrado, não só a frase."""
    stem = (q.get('pergunta') or '').strip()
    if not stem:
        return None
    alts = q.get('alternativas') or []
    key = str(q.get('resposta_correta') or '').strip().lower()
    gab = ''
    if len(key) == 1 and 'a' <= key <= 'f':
        idx = ord(key) - 97
        if isinstance(alts, list) and idx < len(alts):
            gab = str(alts[idx]).strip()
    marca = []
    if gab:
        marca.append(f"cobrou: {gab[:110]}")
    if q.get('topico'):
        marca.append(str(q['topico']))
    return f"{stem}" + (f"  [{' · '.join(marca)}]" if marca else "")


async def _prior_questions_rows(db, user_id, library_id=None, card_id=None, limit_materials=30):
    """Questões (dicts) das provas/questionários já gerados, das mais recentes p/ as antigas."""
    if not library_id and not card_id:
        return []
    scope = (AcademicMaterial.card_id == card_id) if card_id else (AcademicMaterial.library_id == library_id)
    result = await db.execute(
        select(AcademicMaterial.content)
        .where(
            AcademicMaterial.user_id == user_id,
            scope,
            AcademicMaterial.material_type.in_(['questionnaire_objective', 'questionnaire_subjective']),
            AcademicMaterial.status == 'completed',
        )
        .order_by(AcademicMaterial.id.desc())
        .limit(limit_materials)
    )
    out = []
    for (content,) in result.all():
        if not isinstance(content, dict):
            continue
        arr = content.get('questionario_objetivo') or content.get('questionario_subjetivo') or []
        if isinstance(arr, dict):
            arr = list(arr.values())
        if isinstance(arr, list):
            out.extend(q for q in arr if isinstance(q, dict))
    return out


async def _collect_prior_quiz_stems(db, user_id, library_id=None, card_id=None, max_stems=150):
    """Avoid-list PLANA (Produtor de Materiais e provas sem blueprint): enunciados já
    cobrados + o núcleo de cada um, deduplicados, dos mais recentes. Chaveado por CARD
    quando card_id é dado; senão pela biblioteca (comportamento legado)."""
    lines, seen = [], set()
    for q in await _prior_questions_rows(db, user_id, library_id, card_id):
        stem = (q.get('pergunta') or '').strip().lower()
        if not stem or stem in seen:
            continue
        seen.add(stem)
        line = _prior_line(q)
        if line:
            lines.append(line)
        if len(lines) >= max_stems:
            break
    return lines


async def _collect_prior_by_block(db, user_id, card_id, per_block=None):
    """Avoid-list POR BLOCO (prova de concurso com blueprint).

    Antes, a MESMA lista plana de 150 enunciados ia para todos os blocos. Com 7 provas
    de 40 questões, 130 dos 280 enunciados ficavam FORA do teto — as provas mais antigas
    simplesmente não existiam para o gerador, e ele recriava questões delas (4 dos 5
    pares quase idênticos medidos vinham desse buraco). Por bloco, cada chamada recebe
    só o histórico do SEU bloco: fica completo (o bloco maior tem ~70) e, somando os
    blocos, gasta MENOS contexto que a lista plana replicada 6×.

    Devolve {label_minúsculo: [linhas]} + a chave '' com as questões sem bloco (materiais
    antigos/Produtor), que são anexadas a todos os blocos."""
    cap = per_block or getattr(Config, 'EXAM_AVOID_PER_BLOCK', 200)
    por_bloco, seen = {}, set()
    for q in await _prior_questions_rows(db, user_id, card_id=card_id):
        stem = (q.get('pergunta') or '').strip().lower()
        if not stem or stem in seen:
            continue
        seen.add(stem)
        line = _prior_line(q)
        if not line:
            continue
        chave = str(q.get('bloco') or '').strip().lower()
        bucket = por_bloco.setdefault(chave, [])
        if len(bucket) < cap:
            bucket.append(line)
    return por_bloco


# Tipos de material que passam pelo QA de questões (ver services/question_qa.py)
_QUESTION_KEYS = {
    'questionnaire_objective': 'questionario_objetivo',
    'questionnaire_subjective': 'questionario_subjetivo',
}


_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']


def _support_texts_of(content: dict) -> list:
    """Textos de apoio declarados pelo modelo (lista ou dict {idx: item})."""
    raw = (content or {}).get('textos_base')
    if isinstance(raw, dict):
        raw = list(raw.values())
    return [t for t in raw if isinstance(t, dict)] if isinstance(raw, list) else []


def _support_labels(content: dict) -> set:
    return {str(t.get('rotulo') or '').strip().lower()
            for t in _support_texts_of(content) if str(t.get('conteudo') or '').strip()}


def _absorb_support_texts(content: dict, qlist: list, collected: list) -> None:
    """Move os textos de apoio de um bloco para a lista global RENUMERANDO os rótulos
    ("Texto I", "Texto II", … na ordem de aparição) e reescrevendo a referência das
    questões. Cada bloco é uma chamada de LLM independente, então dois blocos
    entregariam, cada um, o seu próprio "Texto I" — sem a renumeração, a prova teria
    dois textos diferentes com o mesmo nome. Referência órfã é descartada: melhor a
    questão perder o rótulo do que apontar para um texto que não existe."""
    mapping = {}
    for item in _support_texts_of(content):
        conteudo = str(item.get('conteudo') or '').strip()
        if not conteudo:
            continue
        idx = len(collected)
        novo = f"Texto {_ROMAN[idx]}" if idx < len(_ROMAN) else f"Texto {idx + 1}"
        collected.append({
            'rotulo': novo,
            'conteudo': conteudo,
            'fonte': str(item.get('fonte') or '').strip() or None,
        })
        antigo = str(item.get('rotulo') or '').strip().lower()
        if antigo:
            mapping[antigo] = novo
    for q in qlist:
        if not isinstance(q, dict):
            continue
        ref = str(q.get('texto_base') or '').strip()
        if not ref:
            continue
        novo = mapping.get(ref.lower())
        if novo:
            q['texto_base'] = novo
        else:
            q.pop('texto_base', None)


def _extract_question_list(content: dict, content_key: str) -> list:
    """A lista de questões sob a chave esperada; se o modelo trocar o nome da
    chave, cai na primeira lista do dicionário (comportamento já existente)."""
    if not isinstance(content, dict):
        return []
    qlist = content.get(content_key)
    if not isinstance(qlist, list):
        qlist = next((v for v in content.values() if isinstance(v, list)), [])
    return qlist or []


async def _run_material_generation_task(material_id: int, input_data: str, material_type: str, user_id: int, model_name_for_cost: str, prior_questions=None, question_count=None, banca_profile=None, num_alternatives=5, model_override=None, fallback_override=None, thinking_override=None, allow_support_texts: bool = False):
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(AcademicMaterial).filter(AcademicMaterial.id == material_id))
            material = result.scalars().first()
            if not material:
                logger.error(f"Tarefa de geração de material com ID {material_id} não encontrada.")
                return

            material.status = 'processing'
            await db.commit()

            material_content, usage, model_name = await run_in_threadpool(generate_study_material, input_data, material_type, user_id, prior_questions or [], question_count, banca_profile, num_alternatives, model_override, fallback_override, thinking_override, allow_support_texts)

            # QA + AUTO-REPARO (mesma rede do gerador de provas; ver _run_blueprint_generation_task)
            qa_key = _QUESTION_KEYS.get(material_type)
            if qa_key:
                qlist = _extract_question_list(material_content, qa_key)
                # `prior_questions` é a MESMA avoid-list mandada ao modelo. Sem passá-la
                # aqui, a repetição não era verificada no Produtor — e a instrução sozinha
                # não segura: medido na biblioteca de Cardiologia, 4 questionários geraram
                # 39 pares com similaridade >= 0,90, vários IDÊNTICOS, mesmo com a lista
                # completa no prompt (100 questões, abaixo do teto de 150).
                report = check_questions(qlist, num_alternatives,
                                         support_labels=_support_labels(material_content),
                                         prior_stems=prior_questions or [])
                if report and not should_repair(report, len(qlist)):
                    logger.info(f"[QA] material {material_id}: {summarize(report)} — dentro da tolerância, sem refazer")
                elif report:
                    logger.warning(f"[QA] material {material_id} ({material_type}): {summarize(report)} "
                                   f"em {len(report)}/{len(qlist)} questões — refazendo")
                    try:
                        repaired, _u2, _m2 = await run_in_threadpool(
                            generate_study_material, input_data, material_type, user_id,
                            prior_questions or [], question_count,
                            f"{banca_profile or ''}\n\n{build_repair_instruction(report, qlist)}".strip(),
                            num_alternatives, model_override, fallback_override, thinking_override,
                            allow_support_texts)
                        qlist2 = _extract_question_list(repaired, qa_key)
                        report2 = check_questions(qlist2, num_alternatives,
                                                  support_labels=_support_labels(repaired),
                                                  prior_stems=prior_questions or [])
                        if qlist2 and len(report2) < len(report):
                            logger.info(f"[QA] material {material_id}: reparo aceito ({summarize(report2)})")
                            material_content = repaired
                        else:
                            logger.warning(f"[QA] material {material_id}: reparo NÃO melhorou ({summarize(report2)})")
                    except Exception as qa_err:
                        logger.error(f"[QA] falha ao refazer o material {material_id}: {qa_err}")
                # normaliza rótulos dos textos de apoio (mesma regra do gerador de provas)
                normalized = []
                _absorb_support_texts(material_content, _extract_question_list(material_content, qa_key), normalized)
                if normalized:
                    material_content['textos_base'] = normalized
                elif 'textos_base' in material_content:
                    material_content.pop('textos_base')

            material.content = material_content
            material.status = 'completed'

            # Set TTL for slideshow materials that have files on disk
            if material_type == 'slideshow_only' and material_content.get('slideshow_file_path'):
                material.expires_at = datetime.now(timezone.utc) + timedelta(hours=Config.GENERATED_CONTENT_TTL_HOURS)

            # --- DATA FLYWHEEL: Salvar material gerado ---
            import json
            material.training_data_id = await collect_data(
                db, user_id, f"study_material_{material_type}",
                input_data[:5000],  # Limitar input para economia
                json.dumps(material_content, ensure_ascii=False)[:10000],  # Limitar output
                {"material_type": material_type}, quality=1
            )
            
            await db.commit()
            logger.info(f"Material ID {material_id} (tipo: {material_type}) gerado com sucesso.")

        except Exception as e:
            logger.error(f"Erro na tarefa de geração de material (material_id={material_id}): {e}", exc_info=True)
            if 'material' in locals() and material:
                material.status = 'error'
                material.content = {"error": str(e)}
                await db.commit()


async def _run_blueprint_generation_task(material_id: int, blocks: list, material_type: str, user_id: int, model_name_for_cost: str, prior_questions=None, banca_profile=None, num_alternatives=5, model_override=None, fallback_override=None, thinking_override=None, prior_by_block=None, allow_support_texts: bool = True):
    """Geração de prova por BLOCOS (distribuição estilo banca): cada bloco gera seu nº de questões
    SÓ a partir das suas bibliotecas; tudo é combinado numa prova só (mesma chave de conteúdo).
    Tipo de questão e nº de alternativas são GLOBAIS.

    Anti-repetição: cada bloco recebe o histórico do PRÓPRIO bloco (`prior_by_block`) em vez da
    lista plana com teto, mais os enunciados gerados até agora nesta rodada (protege contra
    repetição entre blocos). `prior_questions` fica como fallback quando o mapa não vem."""
    content_key = 'questionario_objetivo' if material_type == 'questionnaire_objective' else 'questionario_subjetivo'
    async with AsyncSessionLocal() as db:
        try:
            material = (await db.execute(select(AcademicMaterial).filter(AcademicMaterial.id == material_id))).scalars().first()
            if not material:
                logger.error(f"Tarefa de geração (blueprint) com ID {material_id} não encontrada.")
                return
            material.status = 'processing'
            await db.commit()

            import json
            prior_by_block = prior_by_block or {}
            gerais = prior_by_block.get('', [])          # questões sem bloco (materiais antigos)
            stems_rodada = []                            # enunciados criados NESTA prova
            combined = []
            input_samples = []
            support_texts = []  # textos-base agregados de todos os blocos
            for blk in blocks:
                btext = (blk.get('text') or '')
                try:
                    bcount = int(blk.get('num_questions') or 0)
                except (TypeError, ValueError):
                    bcount = 0
                blabel = blk.get('label') or 'Bloco'
                if not btext.strip() or bcount <= 0:
                    continue
                # avoid-list DESTE bloco: histórico próprio + sem-bloco + o que já saiu nesta prova
                historico = prior_by_block.get(blabel.strip().lower())
                if historico is None and not prior_by_block:
                    historico = list(prior_questions or [])   # fallback (chamada antiga)
                stems = (historico or []) + gerais + stems_rodada
                # ESCOPO POR BLOCO: sem isto o modelo não sabe QUAL bloco está gerando — recebe só
                # o texto + o perfil da banca, e o perfil (descrição do card, dossiê, provas
                # anteriores) descreve a prova INTEIRA. Resultado real: questão de queimadura/trauma
                # dentro do bloco "Específicos — SUS e Saúde Coletiva", tema que não existe em
                # nenhuma das fontes daquele bloco (veio da descrição, que cita 'trauma'). Com o
                # escopo explícito, cada bloco fica preso ao próprio material.
                block_profile = (
                    f"⚠️ ESCOPO DESTE BLOCO — você está gerando SOMENTE as questões do bloco "
                    f"\"{blabel}\". Os TEMAS têm de sair EXCLUSIVAMENTE do material-fonte deste "
                    f"bloco. NÃO introduza assunto que não esteja nesse material, mesmo que a "
                    f"descrição do concurso, o dossiê ou as provas anteriores citem outras "
                    f"matérias — eles descrevem a prova INTEIRA, e este bloco é só uma parte dela. "
                    f"Se um tema não está no material deste bloco, ele pertence a OUTRO bloco: "
                    f"ignore-o aqui. O perfil abaixo vale para FORMATO, ESTILO e nível de "
                    f"dificuldade; o CONTEÚDO é o do material deste bloco.\n\n"
                    + (banca_profile or "")
                ) if banca_profile else (
                    f"⚠️ ESCOPO DESTE BLOCO — gere SOMENTE questões do bloco \"{blabel}\", com temas "
                    f"exclusivamente do material-fonte fornecido. Não introduza assunto ausente dele."
                )
                content, _usage, _model = await run_in_threadpool(
                    generate_study_material, btext, material_type, user_id, stems, bcount, block_profile,
                    num_alternatives, model_override, fallback_override, thinking_override, allow_support_texts)
                qlist = _extract_question_list(content, content_key)

                # QA + AUTO-REPARO: defeito estrutural (sem acento, lacuna que não veio,
                # destaque inexistente, texto de apoio inexistente, gabarito fora da faixa)
                # é detectável — refazemos o bloco UMA vez com a lista exata dos defeitos
                # em vez de entregar torto.
                report = check_questions(qlist, num_alternatives,
                                         support_labels=_support_labels(content),
                                         prior_stems=stems)
                if report and not should_repair(report, len(qlist)):
                    logger.info(f"[QA] bloco '{blabel}': {summarize(report)} em {len(report)}/{len(qlist)} "
                                f"— dentro da tolerância (fonte estreita repete mesmo), sem refazer")
                elif report:
                    logger.warning(f"[QA] bloco '{blabel}' (material {material_id}): {summarize(report)} "
                                   f"em {len(report)}/{len(qlist)} questões — refazendo o bloco")
                    repair = build_repair_instruction(report, qlist)
                    try:
                        content2, _u2, _m2 = await run_in_threadpool(
                            generate_study_material, btext, material_type, user_id, stems, bcount,
                            f"{block_profile}\n\n{repair}", num_alternatives, model_override,
                            fallback_override, thinking_override, allow_support_texts)
                        qlist2 = _extract_question_list(content2, content_key)
                        report2 = check_questions(qlist2, num_alternatives,
                                                  support_labels=_support_labels(content2),
                                                  prior_stems=stems)
                        if qlist2 and len(report2) < len(report):
                            logger.info(f"[QA] bloco '{blabel}': reparo aceito ({summarize(report2)})")
                            qlist, report, content = qlist2, report2, content2
                        else:
                            logger.warning(f"[QA] bloco '{blabel}': reparo NÃO melhorou "
                                           f"({summarize(report2)}) — mantida a 1ª tentativa")
                    except Exception as qa_err:  # reparo é best-effort: nunca derruba a geração
                        logger.error(f"[QA] falha ao refazer o bloco '{blabel}': {qa_err}")
                    if report:
                        logger.warning(f"[QA] bloco '{blabel}' entregue com defeito residual: {summarize(report)}")

                # Textos de apoio do bloco entram na lista global com rótulo ÚNICO
                # (dois blocos entregariam, cada um, o seu "Texto I").
                _absorb_support_texts(content, qlist, support_texts)
                for q in qlist:
                    if isinstance(q, dict):
                        q.setdefault('bloco', blabel)  # rótulo do bloco p/ exibição/agrupamento
                        stem = q.get('pergunta')
                        if stem:
                            stems_rodada.append(stem)  # próximos blocos evitam estes
                    combined.append(q)
                input_samples.append(btext[:1500])

            if not combined:
                raise RuntimeError("Nenhuma questão gerada para os blocos.")

            material.content = {content_key: combined}
            if support_texts:
                material.content['textos_base'] = support_texts
                logger.info(f"[QA] material {material_id}: {len(support_texts)} texto(s) de apoio")
            material.status = 'completed'
            material.training_data_id = await collect_data(
                db, user_id, f"study_material_{material_type}",
                ("\n\n".join(input_samples))[:5000],
                json.dumps(material.content, ensure_ascii=False)[:10000],
                {"material_type": material_type, "blueprint": True, "blocks": len(blocks)}, quality=1)
            await db.commit()
            logger.info(f"Material ID {material_id} (blueprint: {len(blocks)} blocos, {len(combined)} questões) gerado.")
        except Exception as e:
            logger.error(f"Erro na geração por blocos (material_id={material_id}): {e}", exc_info=True)
            if 'material' in locals() and material:
                material.status = 'error'
                material.content = {"error": str(e)}
                await db.commit()


async def _run_video_lesson_generation_task(job_id: int, input_data: str, user_id: int):
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(VideoLessonJob).filter_by(id=job_id))
            job = result.scalars().first()
            if not job:
                logger.error(f"Video lesson job with ID {job_id} not found.")
                return

            job.status = 'processing'
            job.current_step = 'Gerando slides...'
            job.progress_percent = 10
            job.total_steps = 4
            job.completed_steps = 0
            await db.commit()

            # 1. Generate slideshow content
            slideshow_material, _, _ = await run_in_threadpool(generate_study_material, input_data, 'slideshow_only', user_id)

            # Validate the generated slideshow content
            slideshow_json = slideshow_material.get("slideshow_content")
            if not slideshow_json or not isinstance(slideshow_json, dict) or not slideshow_json.get("slides"):
                raise ValueError("Failed to generate valid slideshow content from the source material. The returned JSON was empty or malformed.")

            job.current_step = 'Gerando roteiro de narração...'
            job.progress_percent = 30
            job.completed_steps = 1
            await db.commit()

            # 2. Generate a narration script *from* the slideshow JSON
            script = await run_in_threadpool(generate_narration_script_from_slideshow, slideshow_json)
            if not script:
                raise RuntimeError("Failed to generate narration script for the video lesson.")

            job.current_step = 'Sintetizando áudio...'
            job.progress_percent = 50
            job.completed_steps = 2
            await db.commit()

            # 3. Generate audio from the new script
            audio_path = await run_in_threadpool(audio_generation_service.generate_podcast_from_script, script)
            if not audio_path:
                raise RuntimeError("Audio generation returned an empty path.")

            job.current_step = 'Renderizando vídeo...'
            job.progress_percent = 75
            job.completed_steps = 3
            await db.commit()

            # 4. Generate video from slideshow and audio (passing script for SRT generation)
            video_result = await run_in_threadpool(
                video_generation_service.create_video_from_slideshow,
                slideshow_json, audio_path, user_id, script
            )

            # Handle both tuple (video_path, srt_path) and string returns
            if isinstance(video_result, tuple):
                video_path, srt_path = video_result
            else:
                video_path = video_result
                srt_path = None

            if not video_path:
                raise RuntimeError("Video generation returned an empty path.")

            job.result_path = video_path
            job.srt_path = srt_path
            job.status = 'completed'
            job.current_step = 'Concluído'
            job.progress_percent = 100
            job.completed_steps = 4
            job.expires_at = datetime.now(timezone.utc) + timedelta(hours=Config.GENERATED_CONTENT_TTL_HOURS)

            # --- DATA FLYWHEEL: Salvar roteiro de video-aula ---
            job.training_data_id = await collect_data(
                db, user_id, "video_lesson_script",
                input_data[:5000], script,
                {"type": "video_lesson"}, quality=1
            )

            await db.commit()
            logger.info(f"Video lesson for job {job_id} generated successfully.")

            # Send notification: material ready (video)
            try:
                from ..services.notification_service import send_notification, NotificationType
                user_result = await db.execute(select(User).where(User.id == user_id))
                user = user_result.scalar_one_or_none()
                lang = getattr(user, 'language_preference', 'pt-BR') or 'pt-BR'
                lang_short = lang.split('-')[0]
                titles = {'pt': 'Material pronto!', 'en': 'Material ready!', 'es': '¡Material listo!'}
                bodies = {'pt': 'Sua videoaula foi gerada com sucesso.', 'en': 'Your video lesson was generated successfully.', 'es': 'Su videolección fue generada con éxito.'}
                await send_notification(
                    db, user_id, NotificationType.MATERIAL_READY,
                    titles.get(lang_short, titles['pt']),
                    bodies.get(lang_short, bodies['pt']),
                    data={'route': f'/academic/job/{job_id}'},
                )
                await db.commit()

                # Send email notification if user has email_enabled
                if user:
                    prefs = user.notification_preferences or {}
                    if prefs.get('email_enabled', True):
                        from ..services.email_service import send_material_ready_email
                        send_material_ready_email(
                            user.email, user.full_name, 'video',
                            bodies.get(lang_short, bodies['pt']),
                            f'{Config.WEB_BASE_URL}/academic/job/{job_id}', lang_short
                        )
            except Exception as ne:
                logger.error(f"[NOTIFICATIONS] Failed to send material ready notification: {ne}")

        except Exception as e:
            logger.error(f"Error in video lesson background task (job_id={job_id}): {e}", exc_info=True)
            if 'job' in locals() and job:
                job.status = 'error'
                job.error_message = str(e)
                await db.commit()

                # Send notification: material failed (video)
                try:
                    from ..services.notification_service import send_notification, NotificationType
                    user_result = await db.execute(select(User).where(User.id == user_id))
                    user = user_result.scalar_one_or_none()
                    lang = getattr(user, 'language_preference', 'pt-BR') or 'pt-BR'
                    lang_short = lang.split('-')[0]
                    fail_titles = {'pt': 'Erro na geração', 'en': 'Generation failed', 'es': 'Error en la generación'}
                    fail_bodies = {'pt': 'Ocorreu um erro ao gerar seu material. Tente novamente.', 'en': 'An error occurred generating your material. Please try again.', 'es': 'Ocurrió un error al generar su material. Intente nuevamente.'}
                    await send_notification(
                        db, user_id, NotificationType.MATERIAL_FAILED,
                        fail_titles.get(lang_short, fail_titles['pt']),
                        fail_bodies.get(lang_short, fail_bodies['pt']),
                        data={'route': '/academic'},
                    )
                    await db.commit()
                except Exception as ne:
                    logger.error(f"[NOTIFICATIONS] Failed to send material failed notification: {ne}")

@router.post("/process", response_model=Union[PodcastGenerationJobResponse, VideoLessonJobResponse, AcademicMaterialResponse], status_code=status.HTTP_202_ACCEPTED)
async def process_file(
    payload: ProcessPayload,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    input_data = ""
    temp_filepath_to_delete = None
    source_library_id = None  # biblioteca de origem (quando source_type='library_id')
    # Capture user info before try block to avoid lazy-loading issues in except block
    user_email = current_user.email
    user_id = current_user.id

    try:
        # Normalize 'slideshow' to 'slideshow_only' to match the service layer.
        # This makes the API more robust to variations from the client.
        if payload.material_type == 'slideshow':
            payload.material_type = 'slideshow_only'

        if payload.source_type == 'filepath':
            filepath = str(payload.source_value)
            real_path = os.path.realpath(filepath)
            allowed_dir = os.path.realpath(Config.UPLOAD_FOLDER)
            if not real_path.startswith(allowed_dir):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Caminho de arquivo inválido.")
            if not os.path.exists(filepath):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo não encontrado no servidor.")
            ext = os.path.splitext(filepath)[1].lower().lstrip('.')
            input_data = await run_in_threadpool(file_processing_service.get_input_data, filepath, ext)
            temp_filepath_to_delete = filepath

        elif payload.source_type == 'library_id':
            library_id = int(payload.source_value)
            source_library_id = library_id
            result = await db.execute(select(AcademicLibrary).filter(AcademicLibrary.id == library_id, AcademicLibrary.user_id == current_user.id))
            library = result.scalars().first()
            if not library:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Biblioteca não encontrada ou não pertence ao usuário.")

            logger.info(f"Recuperando todo o conteúdo da biblioteca ID {library_id} para gerar '{payload.material_type}'...")
            
            input_data = await run_in_threadpool(vector_db_service.get_all_text_for_library, library_id=library_id)

            if not input_data:
                # Sem texto processado: distingue biblioteca VAZIA × ainda PROCESSANDO ×
                # documentos SEM texto extraído — cada um com uma mensagem acionável (em vez
                # do inútil "tente novamente" numa biblioteca que sozinha nunca terá texto).
                # detail = {code, message}: o front localiza pelo code; message é fallback PT.
                doc_statuses = (await db.execute(
                    select(AcademicDocument.status).where(AcademicDocument.library_id == library_id)
                )).scalars().all()
                if not doc_statuses:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={"code": "LIBRARY_EMPTY",
                                "message": f'A biblioteca "{library.name}" está vazia. Adicione documentos antes de gerar material.'},
                    )
                if any(s in ('pending', 'processing') for s in doc_statuses):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={"code": "LIBRARY_PROCESSING",
                                "message": "Os documentos desta biblioteca ainda estão sendo processados. Aguarde a conclusão e tente novamente."},
                    )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "LIBRARY_NO_TEXT",
                            "message": "A biblioteca selecionada não contém texto processado para gerar material. Verifique se os documentos foram processados corretamente."},
                )
            
            logger.info(f"Conteúdo completo da biblioteca ID {library_id} recuperado. Tamanho total: {len(input_data)} caracteres.")

        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_type inválido.")

        # Premium features require Residente+ plan
        PREMIUM_MATERIAL_TYPES = ['podcast', 'video_lesson', 'mind_map']
        PREMIUM_ALLOWED_PLANS = ['resident', 'staff', 'specialist']

        if payload.material_type in PREMIUM_MATERIAL_TYPES:
            if not current_user.is_admin and current_user.subscription_plan not in PREMIUM_ALLOWED_PLANS:
                feature_names = {
                    'podcast': 'Podcasts',
                    'video_lesson': 'Videoaulas',
                    'mind_map': 'Mapas Mentais com IA'
                }
                feature_name = feature_names.get(payload.material_type, 'Este recurso')
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"{feature_name} estão disponíveis a partir do Plano Residente. Faça upgrade para acessar!"
                )

        await track_activity(db, current_user.id, 'academic', 'material_generate', {'type': payload.material_type})

        if payload.material_type == 'podcast':
            if payload.source_type != 'library_id':
                raise HTTPException(status_code=400, detail="Podcasts só podem ser gerados a partir de uma biblioteca.")

            await debit_dracmas_for_feature(current_user, "generate_podcast", db)

            result = await db.execute(select(PodcastGenerationJob).filter(
                PodcastGenerationJob.user_id == current_user.id,
                PodcastGenerationJob.status.in_(['pending', 'processing'])
            ))
            active_job = result.scalars().first()
            if active_job:
                raise HTTPException(status_code=409, detail="Você já tem uma geração de podcast em andamento.")

            await run_in_threadpool(audio_generation_service.cleanup_dangling_jobs, db, current_user.id)

            new_job = PodcastGenerationJob(user_id=current_user.id)
            db.add(new_job)
            
            background_tasks.add_task(_run_podcast_generation_task, new_job.id, input_data, current_user.id)
            
            await db.commit()
            await db.refresh(new_job)
            return new_job

        elif payload.material_type == 'video_lesson':
            await debit_dracmas_for_feature(current_user, "generate_video_lesson", db)

            result = await db.execute(select(VideoLessonJob).filter(
                VideoLessonJob.user_id == current_user.id,
                VideoLessonJob.status.in_(['pending', 'processing'])
            ))
            active_job = result.scalars().first()
            if active_job:
                raise HTTPException(status_code=409, detail="Você já tem uma geração de videoaula em andamento.")

            new_job = VideoLessonJob(user_id=current_user.id)
            db.add(new_job)
            
            background_tasks.add_task(_run_video_lesson_generation_task, new_job.id, input_data, current_user.id)
            
            await db.commit()
            await db.refresh(new_job)
            return new_job

        elif payload.material_type in ['summary', 'detailed_text', 'mind_map', 'flashcards', 'slideshow_only', 'questionnaire_objective', 'questionnaire_subjective', 'comparative_table', 'clinical_case', 'critical_appraisal']:
            # Cobrar pela geração de material de estudo
            # Mapa mental usa modelo Pro (mais caro)
            feature_cost_key = "generate_mind_map" if payload.material_type == 'mind_map' else "generate_study_material"
            await debit_dracmas_for_feature(current_user, feature_cost_key, db)

            new_material = AcademicMaterial(
                user_id=current_user.id,
                library_id=source_library_id,
                material_type=payload.material_type,
                content={"status": "pending"},
                status='pending'
            )
            db.add(new_material)
            await db.commit()
            await db.refresh(new_material)

            # Memória anti-repetição: enunciados já gerados para esta biblioteca, p/ o
            # modelo NÃO repetir as mesmas questões em provas sucessivas.
            prior_questions = []
            if payload.material_type in ('questionnaire_objective', 'questionnaire_subjective'):
                prior_questions = await _collect_prior_quiz_stems(db, current_user.id, source_library_id)

            background_tasks.add_task(
                _run_material_generation_task,
                new_material.id,
                input_data,
                payload.material_type,
                current_user.id,
                llm_services.PRIMARY_LLM_MODEL,
                prior_questions,
            )

            return new_material

        elif payload.material_type == 'transcription':
            if payload.source_type != 'filepath':
                 raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Transcrição só é suportada para arquivos de áudio/vídeo únicos.")

            # Cobrar pela transcrição de áudio (3 dracmas)
            await debit_dracmas_for_feature(current_user, "transcribe_audio", db)

            transcription = await run_in_threadpool(transcribe_audio, str(payload.source_value))
            new_material = AcademicMaterial(
                user_id=current_user.id,
                material_type='transcription',
                content={"transcription": transcription},
                status='completed'
            )
            db.add(new_material)
            await db.commit()
            return new_material
        
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de material inválido")

    except Exception as e:
        await db.rollback()
        error_message = str(e)
        truncated_error = error_message[:500]
        logger.error(f"Erro em /process para {user_email}: {truncated_error}", exc_info=True)
        if not isinstance(e, HTTPException):
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro no processamento do arquivo.")
        raise e
    finally:
        if temp_filepath_to_delete and os.path.exists(temp_filepath_to_delete):
            os.remove(temp_filepath_to_delete)

@router.post("/libraries/{library_id}/documents", status_code=status.HTTP_202_ACCEPTED)
async def upload_document_to_library(
    library_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    document = await library_service.handle_document_upload(
        db=db,
        user=current_user,
        library_id=library_id,
        file=file,
        background_tasks=background_tasks
    )
    # (O thumbnail de PDF é gerado dentro de _process_document_task — não duplicar aqui;
    # além disso, no fluxo Drive o storage_path é um temp que a task descarta.)
    return {"message": "Arquivo recebido. O processamento foi iniciado em segundo plano.", "document_id": document.id}

@router.post("/libraries/{library_id}/documents/from-drive", status_code=status.HTTP_202_ACCEPTED)
async def import_documents_from_drive(
    library_id: int,
    payload: DriveImportPayload,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Importa arquivos que o usuário já tem no Google Drive (selecionados via Picker)."""
    docs = await library_service.handle_document_import_from_drive(
        db=db, user=current_user, library_id=library_id,
        file_ids=payload.file_ids, background_tasks=background_tasks,
    )
    return {"imported": len(docs), "document_ids": [d.id for d in docs]}

@router.post("/libraries", response_model=LibraryResponse, status_code=status.HTTP_201_CREATED)
async def create_user_library(
    payload: LibraryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return await library_service.create_library(db=db, name=payload.name, description=payload.description, user=current_user, icon=payload.icon)

@router.patch("/libraries/{library_id}", response_model=LibraryResponse)
async def update_user_library(
    library_id: int,
    payload: LibraryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return await library_service.update_library(db=db, library_id=library_id, user=current_user, name=payload.name, description=payload.description, icon=payload.icon)

@router.get("/libraries", response_model=List[LibraryResponse])
async def get_all_user_libraries(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return await library_service.get_user_libraries(db=db, user=current_user)

@router.get("/libraries/{library_id}/documents", response_model=List[DocumentResponse])
async def get_documents_in_library(
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    documents = await library_service.get_library_documents(db=db, user=current_user, library_id=library_id)
    for doc in documents:
        if doc.thumbnail_url:
            doc.thumbnail_filename = os.path.basename(doc.thumbnail_url)
    return documents

@router.delete("/libraries/{library_id}", status_code=status.HTTP_200_OK)
async def delete_user_library(
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return await library_service.delete_library(db=db, library_id=library_id, user=current_user)

@router.post("/libraries/{library_id}/documents/{document_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_document_processing(
    library_id: int,
    document_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    document = await library_service.retry_document_processing(
        db=db, user=current_user, library_id=library_id,
        document_id=document_id, background_tasks=background_tasks
    )
    return {"id": document.id, "status": document.status, "message": "Reprocessamento agendado."}


@router.delete("/libraries/{library_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document_from_library(
    library_id: int,
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    success = await library_service.delete_document(
        db=db,
        user=current_user,
        library_id=library_id,
        document_id=document_id
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento não encontrado ou não pertence ao usuário."
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.post("/arena/start_quiz", response_model=SimuladoGenerationJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_quiz(
    payload: QuizRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Arena access requires Residente+ plan
    ARENA_ALLOWED_PLANS = ['resident', 'staff', 'specialist']
    if current_user.subscription_plan not in ARENA_ALLOWED_PLANS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A Arena Qython está disponível a partir do Plano Residente. Faça upgrade para competir!"
        )

    # Capture user info before try block to avoid lazy-loading issues in except block
    user_email = current_user.email

    try:
        await debit_dracmas_for_feature(current_user, "start_quiz", db)

        result = await db.execute(select(ArenaExam).filter(ArenaExam.exam_code == payload.mode))
        exam = result.scalars().first()
        if not exam:
            raise HTTPException(status_code=404, detail=f"O tipo de exame '{payload.mode}' não é válido ou não foi encontrado.")

        # Delete old jobs
        await db.execute(
            select(SimuladoGenerationJob).filter(
                SimuladoGenerationJob.user_id == current_user.id,
                SimuladoGenerationJob.status.in_(['completed', 'error'])
            )
        )
        # Note: delete with async session is a bit different if we want to use bulk delete, 
        # but fetching and deleting is safer for now or using delete() construct.
        # Let's use the delete construct.
        from sqlalchemy import delete
        await db.execute(delete(SimuladoGenerationJob).filter(
            SimuladoGenerationJob.user_id == current_user.id,
            SimuladoGenerationJob.status.in_(['completed', 'error'])
        ))

        result = await db.execute(select(SimuladoGenerationJob).filter(
            SimuladoGenerationJob.user_id == current_user.id,
            SimuladoGenerationJob.status.in_(['pending', 'processing'])
        ))
        active_job = result.scalars().first()
        if active_job:
            raise HTTPException(status_code=409, detail="Você já tem uma geração de simulado em andamento.")

        new_job = SimuladoGenerationJob(user_id=current_user.id)
        db.add(new_job)
        
        background_tasks.add_task(
            _run_simulado_generation_task,
            job_id=new_job.id,
            exam=exam,
            user_id=current_user.id
        )
        
        await db.commit()
        await db.refresh(new_job)
        return new_job

    except HTTPException as http_exc:
        await db.rollback()
        raise http_exc
    except Exception as e:
        logger.error(f"Erro ao iniciar job de quiz para {user_email}: {e}", exc_info=True)
        await db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Não foi possível iniciar a geração do simulado.")

@router.post("/arena/submit_quiz", status_code=status.HTTP_200_OK)
async def submit_quiz(
    payload: QuizSubmitPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    from ..services.xp_service import (
        calculate_xp, award_xp, update_streak,
        update_user_ranking, get_or_create_xp_profile, get_league_info
    )

    # Build answers dict (handle both dict and list formats)
    answers = payload.answers
    if isinstance(answers, list):
        answers = {str(i): v for i, v in enumerate(answers) if v is not None}
    elif not isinstance(answers, dict):
        answers = {}

    score = 0
    correct_count = 0
    incorrect_count = 0
    unanswered_count = 0
    total_questions = len(payload.questions)
    answers_detail = []

    for i, question in enumerate(payload.questions):
        user_answer_index = answers.get(str(i))
        correct_answer_char = question.get('resposta_correta')
        difficulty = question.get('dificuldade', 'medio')
        topic = question.get('topico', '')
        explanation = question.get('explicacao', '')
        alternatives = question.get('alternativas', [])

        # Determine correct answer index
        correct_answer_index = None
        if correct_answer_char:
            if isinstance(correct_answer_char, int):
                correct_answer_index = correct_answer_char
            elif isinstance(correct_answer_char, str) and len(correct_answer_char) == 1:
                correct_answer_index = ord(correct_answer_char.lower()) - ord('a')

        is_correct = False
        if user_answer_index is not None and correct_answer_index is not None:
            if user_answer_index == correct_answer_index:
                score += 10
                correct_count += 1
                is_correct = True
            else:
                score -= 2
                incorrect_count += 1
        else:
            unanswered_count += 1

        answers_detail.append({
            "question_index": i,
            "question_text": question.get('pergunta', ''),
            "alternatives": alternatives,
            "user_answer": user_answer_index,
            "correct_answer": correct_answer_index,
            "is_correct": is_correct,
            "difficulty": difficulty,
            "topic": topic,
            "explanation": explanation,
        })

    score = max(0, score)

    # Update streak
    streak_info = await update_streak(current_user.id, db)

    # Calculate XP
    xp_breakdown = calculate_xp(
        answers_detail=answers_detail,
        correct_count=correct_count,
        total_questions=total_questions,
        time_elapsed_seconds=payload.time_elapsed_seconds,
        current_streak=streak_info['current'],
        is_challenge=payload.challenge_id is not None,
        challenge_won=False,  # determined later for challenges
    )

    # Save quiz attempt with full data
    new_attempt = QuizAttempt(
        user_id=current_user.id,
        quiz_specialty=payload.specialty,
        score=score,
        mode=payload.mode,
        xp_earned=xp_breakdown['total'],
        correct_count=correct_count,
        incorrect_count=incorrect_count,
        unanswered_count=unanswered_count,
        total_questions=total_questions,
        time_elapsed_seconds=payload.time_elapsed_seconds,
        answers_detail=answers_detail,
    )
    db.add(new_attempt)
    await db.flush()  # Get the ID

    # Award XP
    profile = await award_xp(
        user_id=current_user.id,
        xp_breakdown=xp_breakdown,
        db=db,
        quiz_attempt_id=new_attempt.id,
        challenge_id=payload.challenge_id,
    )

    # Update legacy UserStats (backward compat)
    result = await db.execute(select(UserStats).filter_by(user_id=current_user.id))
    user_stats = result.scalars().first()
    if not user_stats:
        user_stats = UserStats(user_id=current_user.id)
        db.add(user_stats)

    user_stats.total_score += score
    user_stats.quizzes_completed += 1
    user_stats.correct_answers += correct_count
    user_stats.incorrect_answers += incorrect_count

    # Real-time ranking update
    ranking_update = await update_user_ranking(current_user.id, payload.specialty, db)

    await db.commit()

    # Build league info
    league_info = get_league_info(profile)

    accuracy_pct = round(correct_count / total_questions * 100, 1) if total_questions > 0 else 0

    return {
        "message": "Quiz submetido com sucesso!",
        "score": score,
        "xp_earned": xp_breakdown['total'],
        "xp_breakdown": xp_breakdown,
        "correct_count": correct_count,
        "incorrect_count": incorrect_count,
        "unanswered_count": unanswered_count,
        "total_questions": total_questions,
        "accuracy_pct": accuracy_pct,
        "answers_detail": answers_detail,
        "streak": streak_info,
        "league": league_info,
        "ranking_update": ranking_update,
    }

@router.get("/arena/rankings", status_code=status.HTTP_200_OK)
async def get_rankings(
    specialty: str = "Geral",
    period: str = "all_time",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    query = select(
        User.id.label('user_id'),
        func.sum(QuizAttempt.score).label('total_score')
    ).join(User, User.id == QuizAttempt.user_id).filter(QuizAttempt.mode == 'challenge')

    if specialty != "Geral":
        query = query.filter(QuizAttempt.quiz_specialty == specialty)
    
    query = query.group_by(User.id).order_by(func.sum(QuizAttempt.score).desc()).limit(100)
    result = await db.execute(query)
    rankings_data = result.all()

    anonymous_rankings = [{"rank": i + 1, "score": r.total_score} for i, r in enumerate(rankings_data)]

    user_rank = None
    user_score = None
    
    subquery = select(
        QuizAttempt.user_id,
        func.sum(QuizAttempt.score).label('total_score')
    ).filter(QuizAttempt.mode == 'challenge')
    if specialty != "Geral":
        subquery = subquery.filter(QuizAttempt.quiz_specialty == specialty)
    subquery = subquery.group_by(QuizAttempt.user_id).subquery()

    result = await db.execute(select(subquery.c.user_id, subquery.c.total_score).filter(subquery.c.user_id == current_user.id))
    user_result = result.first()
    
    if user_result:
        user_score = user_result.total_score
        # To count higher scores, we need to query the subquery again or use a CTE.
        # Let's construct a count query.
        count_query = select(func.count()).select_from(subquery).filter(subquery.c.total_score > user_score)
        result = await db.execute(count_query)
        higher_scores_count = result.scalar()
        user_rank = higher_scores_count + 1
            
    return {
        "anonymous_rankings": anonymous_rankings,
        "user_position": {
            "rank": user_rank,
            "score": user_score
        }
    }

@router.post("/libraries/{library_id}/chat", status_code=status.HTTP_200_OK)
async def chat_with_library(
    library_id: int,
    payload: LibraryChatPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(select(AcademicLibrary).filter(AcademicLibrary.id == library_id, AcademicLibrary.user_id == current_user.id))
    library = result.scalars().first()
    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Biblioteca não encontrada ou não pertence ao usuário."
        )

    # Cobrar por chat RAG com biblioteca (3 dracmas)
    await debit_dracmas_for_feature(current_user, "library_rag_chat", db)

    response_text = await llm_services.chat_with_library_rag(
        query=payload.message,
        library_id=library_id,
        db=db,
        history=payload.history
    )

    # --- DATA FLYWHEEL: Salvar interação RAG com biblioteca ---
    import json
    language_code = current_user.language_preference or 'pt-BR'
    rich_input = json.dumps({
        "query": payload.message,
        "history": payload.history[-4:] if payload.history else []
    }, ensure_ascii=False)

    training_data_id = await collect_data(
        db, current_user.id, "library_rag_chat",
        rich_input, response_text,
        {"library_id": library_id, "library_name": library.name},
        quality=0,
        lang=language_code
    )
    await track_activity(db, current_user.id, 'academic', 'rag_chat')
    await db.commit()

    return {"response": response_text, "training_data_id": training_data_id}

@router.get("/thumbnails/{filename}", status_code=status.HTTP_200_OK)
async def get_thumbnail(filename: str, current_user: User = Depends(get_current_active_user)):
    if '..' in filename or '/' in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome de arquivo inválido.")
    file_path = os.path.join(THUMBNAIL_FOLDER, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thumbnail não encontrada.")
    return FileResponse(file_path, media_type="image/png")

@router.get("/document-images/{image_id}", status_code=status.HTTP_200_OK)
async def get_document_image(image_id: int, u: int, t: str, db: AsyncSession = Depends(get_db)):
    """Imagem extraída de um documento da biblioteca, servida por URL ASSINADA.

    Sem autenticação por cabeçalho de propósito: esta URL vai dentro do Markdown da resposta
    do copiloto e é o `<img>` do navegador que a busca — ele não manda o Authorization. A
    assinatura HMAC amarra imagem + dono + validade (ver `image_lookup_service`), então o
    caminho não é adivinhável nem serve para varrer as imagens de outra pessoa."""
    from ..services.academic_services.image_lookup_service import verify_image_token, image_file_path
    if not verify_image_token(image_id, u, t):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Assinatura inválida ou expirada.")
    row = (await db.execute(sqltext("""
        SELECT di.document_id, di.image_filename
        FROM document_images di JOIN academic_libraries l ON l.id = di.library_id
        WHERE di.id = :id AND l.user_id = :uid
    """), {'id': image_id, 'uid': u})).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imagem não encontrada.")
    caminho = image_file_path(row['document_id'], row['image_filename'])
    if not os.path.exists(caminho):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo de imagem não encontrado.")
    ext = os.path.splitext(row['image_filename'])[1].lower()
    media = 'image/png' if ext == '.png' else 'image/jpeg'
    # cache longo: a imagem é derivada imutável (nome tem hash do conteúdo)
    return FileResponse(caminho, media_type=media, headers={'Cache-Control': 'private, max-age=604800'})


@router.get("/web-images/{cache_key}", status_code=status.HTTP_200_OK)
async def get_web_image(cache_key: str):
    """Serve imagem de acervo aberto que JÁ está no nosso cache.

    Só aceita a chave do cache — nunca uma URL — para o endpoint não virar um proxy
    aberto (alguém pedindo `?url=http://interno/...` seria SSRF). Quem baixa é o
    `web_image_service`, na hora de montar a resposta. O conteúdo é público e com
    licença aberta, então não leva assinatura como a imagem da biblioteca do usuário."""
    from ..services.web_image_service import cached_path
    if not re.fullmatch(r'[a-f0-9]{8,64}', cache_key or ''):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chave inválida.")
    caminho = cached_path(cache_key)
    if not os.path.exists(caminho):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imagem não encontrada.")
    return FileResponse(caminho, media_type="image/jpeg",
                        headers={'Cache-Control': 'public, max-age=2592000'})


@router.get("/documents/{filename}", status_code=status.HTTP_200_OK)
async def get_document_file(filename: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    if '..' in filename or '/' in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome de arquivo inválido.")

    # Verify file belongs to current user's library
    result = await db.execute(
        select(AcademicDocument).join(AcademicLibrary).where(
            AcademicDocument.storage_path.contains(filename),
            AcademicLibrary.user_id == current_user.id
        )
    )
    if not result.scalars().first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado.")

    file_path = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, filename)

    if not os.path.exists(file_path):
        logger.warning(f"Tentativa de acesso a documento inexistente: {file_path}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo de documento não encontrado.")

    return FileResponse(file_path)


@router.get("/documents/{document_id}/content", status_code=status.HTTP_200_OK)
async def get_document_content(document_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Serve o ORIGINAL de um documento por id (viewer). Legado → do disco; Drive-backed →
    stream do Drive do dono via cache efêmero local (Range p/ pdf.js). Substitui a rota
    por filename (`/documents/{filename}`), que fica p/ compat até a migração do legado."""
    result = await db.execute(
        select(AcademicDocument).join(AcademicLibrary).where(
            AcademicDocument.id == document_id,
            AcademicLibrary.user_id == current_user.id,
        )
    )
    document = result.scalars().first()
    if not document:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado.")

    # Legado server-side: serve do disco.
    if document.storage_provider != 'gdrive':
        if not document.storage_path or not os.path.exists(document.storage_path):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo de documento não encontrado.")
        return FileResponse(document.storage_path, filename=document.original_filename)

    # Drive-backed: cache efêmero local + FileResponse (get_drive_cached_file mapeia os erros).
    cache_path = await library_service.get_drive_cached_file(db, document)
    return FileResponse(cache_path, filename=document.original_filename)

@router.get("/podcast_job/active", response_model=Optional[PodcastGenerationJobResponse])
async def get_active_podcast_job(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    result = await db.execute(select(PodcastGenerationJob).filter(
        PodcastGenerationJob.user_id == current_user.id,
        PodcastGenerationJob.status.in_(['pending', 'processing'])
    ))
    return result.scalars().first()

@router.get("/podcast_job/{job_id}", response_model=PodcastGenerationJobResponse)
async def get_podcast_job_status(job_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    result = await db.execute(select(PodcastGenerationJob).filter_by(id=job_id, user_id=current_user.id))
    job = result.scalars().first()
    if not job:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    return job

@router.delete("/podcast_job/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def clear_podcast_job(job_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    success = await run_in_threadpool(audio_generation_service.clear_specific_podcast_job, db=db, user_id=current_user.id, job_id=job_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job não encontrado ou já foi removido.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/video_lesson_job/active", response_model=Optional[VideoLessonJobResponse])
async def get_active_video_lesson_job(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    result = await db.execute(select(VideoLessonJob).filter(
        VideoLessonJob.user_id == current_user.id,
        VideoLessonJob.status.in_(['pending', 'processing'])
    ))
    return result.scalars().first()

@router.get("/video_lesson_job/{job_id}", response_model=VideoLessonJobResponse)
async def get_video_lesson_job_status(job_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    result = await db.execute(select(VideoLessonJob).filter_by(id=job_id, user_id=current_user.id))
    job = result.scalars().first()
    if not job:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    return job

@router.delete("/video_lesson_job/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def clear_video_lesson_job(job_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    success = await run_in_threadpool(
        video_generation_service.clear_specific_video_lesson_job,
        db=db, user_id=current_user.id, job_id=job_id
    )
    if not success:
        raise HTTPException(status_code=404, detail="Job não encontrado ou já foi removido.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/material/{material_id}/status", response_model=AcademicMaterialResponse)
async def get_material_status(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(select(AcademicMaterial).filter(
        AcademicMaterial.id == material_id,
        AcademicMaterial.user_id == current_user.id
    ))
    material = result.scalars().first()
    if not material:
        raise HTTPException(status_code=404, detail="Material não encontrado.")
    return material


@router.get("/arena/simulado_job/active", response_model=Optional[SimuladoGenerationJobResponse])
async def get_active_simulado_job(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    result = await db.execute(select(SimuladoGenerationJob).filter(
        SimuladoGenerationJob.user_id == current_user.id,
        SimuladoGenerationJob.status.in_(['pending', 'processing'])
    ))
    return result.scalars().first()

@router.get("/arena/simulado_job/{job_id}", response_model=SimuladoGenerationJobResponse)
async def get_simulado_job_status(job_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    result = await db.execute(select(SimuladoGenerationJob).filter_by(id=job_id, user_id=current_user.id))
    job = result.scalars().first()
    if not job:
        raise HTTPException(status_code=404, detail="Tarefa de simulado não encontrada.")
    return job

@router.delete("/arena/simulado_job/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def clear_simulado_job(job_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    result = await db.execute(select(SimuladoGenerationJob).filter_by(id=job_id, user_id=current_user.id))
    job = result.scalars().first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job de simulado não encontrado ou já foi removido.")
    await db.delete(job)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/arena/exams", status_code=status.HTTP_200_OK)
async def get_available_exams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ArenaExam).order_by(ArenaExam.title_key))
    exams = result.scalars().all()
    return exams

@router.get("/arena/enrolled-exams", status_code=status.HTTP_200_OK)
async def get_user_enrolled_exams(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Explicitly load the enrolled_exams relationship to avoid lazy load errors in async context
    result = await db.execute(
        select(User).options(selectinload(User.enrolled_exams)).filter(User.id == current_user.id)
    )
    user_with_exams = result.scalars().first()
    if not user_with_exams:
        return {"enrolled_codes": []}
    return {"enrolled_codes": [exam.exam_code for exam in user_with_exams.enrolled_exams]}

class EnrollPayload(BaseModel):
    exam_code: str

@router.post("/arena/enroll", status_code=status.HTTP_200_OK)
async def enroll_in_exam(
    payload: EnrollPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Explicitly load the enrolled_exams relationship to avoid lazy load errors in async context
    result = await db.execute(
        select(User).options(selectinload(User.enrolled_exams)).filter(User.id == current_user.id)
    )
    user = result.scalars().first()

    if len(user.enrolled_exams) >= 3:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Limite de 3 inscrições em exames atingido.")

    result = await db.execute(select(ArenaExam).filter(ArenaExam.exam_code == payload.exam_code))
    exam_to_enroll = result.scalars().first()
    if not exam_to_enroll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exame não encontrado.")

    if exam_to_enroll in user.enrolled_exams:
        return {"message": "Usuário já inscrito neste exame."}

    user.enrolled_exams.append(exam_to_enroll)
    await db.commit()
    return {"message": "Inscrição realizada com sucesso."}

@router.post("/arena/unenroll", status_code=status.HTTP_200_OK)
async def unenroll_from_exam(
    payload: EnrollPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Explicitly load the enrolled_exams relationship to avoid lazy load errors in async context
    result = await db.execute(
        select(User).options(selectinload(User.enrolled_exams)).filter(User.id == current_user.id)
    )
    user = result.scalars().first()

    result = await db.execute(select(ArenaExam).filter(ArenaExam.exam_code == payload.exam_code))
    exam_to_unenroll = result.scalars().first()
    if not exam_to_unenroll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exame não encontrado.")

    if exam_to_unenroll in user.enrolled_exams:
        user.enrolled_exams.remove(exam_to_unenroll)
        await db.commit()

    return {"message": "Inscrição removida com sucesso."}

@router.get("/arena/ranking/{exam_code}", status_code=status.HTTP_200_OK)
async def get_exam_ranking(
    exam_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    XP-based ranking for an exam. Shows effort (XP), not just accuracy.
    Pads with bots to ensure minimum 20 participants.
    """
    from ..models import UserXpProfile

    # 1. Get real users with XP > 0 for this exam
    query = select(
        User.id,
        User.username,
        User.full_name,
        func.coalesce(func.sum(QuizAttempt.xp_earned), 0).label('total_xp'),
        func.count(QuizAttempt.id).label('quizzes_completed'),
    ).join(QuizAttempt).filter(
        QuizAttempt.mode == exam_code,
        QuizAttempt.mode != 'practice',
    ).group_by(User.id, User.username, User.full_name).having(
        func.coalesce(func.sum(QuizAttempt.xp_earned), 0) > 0
    )

    result = await db.execute(query)
    real_users = result.all()

    # Get league tiers for all real users
    user_ids = [u.id for u in real_users]
    tier_map = {}
    if user_ids:
        tier_result = await db.execute(
            select(UserXpProfile.user_id, UserXpProfile.league_tier)
            .filter(UserXpProfile.user_id.in_(user_ids))
        )
        tier_map = {row.user_id: row.league_tier for row in tier_result.all()}

    from ..models import LEAGUE_TIERS as LT
    tier_icon_map = {t['name']: t['icon'] for t in LT}

    ranking = []
    for user in real_users:
        tier = tier_map.get(user.id, 'bronze')
        ranking.append({
            "name": f"@{user.username}" if user.username else user.full_name,
            "xp": user.total_xp,
            "league_tier": tier,
            "league_icon": tier_icon_map.get(tier, '🥉'),
            "quizzes_completed": user.quizzes_completed,
            "isRealUser": True,
            "user_id": user.id,
        })

    current_user_display = f"@{current_user.username}" if current_user.username else current_user.full_name

    # 2. Pad with bots if fewer than 20
    num_bots_to_add = max(0, 20 - len(ranking))

    if num_bots_to_add > 0:
        # Handles verossímeis: maioria sem marcador "médico" (gente real raramente põe título
        # no username); a minoria titulada respeita o gênero (dra. p/ nomes femininos).
        bot_usernames = [
            "@juliana.rocha", "@ricardo_alves", "@camilaferraz", "@fe.moreira",
            "@pedrohenriq", "@nat.oliveira", "@lucasmartins", "@amanda.szb",
            "@rafa.torres", "@bruno_lima", "@carol.mvz", "@thiagocosta",
            "@marina.gpe", "@gui.santana", "@isadora.mk", "@matheus.vf",
            "@leticia.prado", "@andre.folli", "@bia.castro", "@vitorhugo.a",
            "@paula.regis", "@diegomaia", "@julia.sanches", "@renan.krz",
            "@larissa.b92", "@sofia.trt", "@gabizinha.st", "@marcosvin",
            "@dra.juliana.f", "@dr.fernando.lp", "@dra.beatriz.g", "@dr.carlosmg",
            "@manu.medufmg", "@joao.rezmed", "@anaclara.enare", "@hique.residencia",
        ]

        # Roster e progressão DETERMINÍSTICOS (seed por exame+temporada): o leaderboard
        # fica estável entre refreshes e o XP dos bots cresce dia a dia como o de gente real.
        from ..services.arena_service import get_active_season
        now = datetime.now(timezone.utc)
        active_season = await get_active_season(db)
        if active_season:
            season_key = f"season-{active_season.id}"
            days_elapsed = max(1, (now - active_season.start_date).days + 1)
        else:
            season_key = now.strftime("%Y-%m")
            days_elapsed = max(1, now.day)
        seed_base = f"{exam_code}:{season_key}"

        existing_names = {p['name'] for p in ranking}
        available_bots = [b for b in bot_usernames if b not in existing_names]
        roster_rng = random.Random(seed_base)
        roster_rng.shuffle(available_bots)
        selected_bots = available_bots[:num_bots_to_add]

        tier_names = [t['name'] for t in LT]
        today_key = now.date().isoformat()
        for bot_name in selected_bots:
            # Perfil fixo do bot na temporada (rng por nome, independente da ordem do loop)
            brng = random.Random(f"{seed_base}:{bot_name}")
            daily_rate = brng.uniform(3, 30)        # XP/dia: poucos grinders, muitos casuais
            consistency = brng.uniform(0.5, 0.95)   # fração de dias em que estuda
            tier_bump = brng.random() < 0.3         # XP de outros exames pode subir a liga
            quizzes_factor = brng.uniform(0.15, 0.5)
            # Sessão "de hoje" (muda diariamente, estável dentro do dia)
            jitter = random.Random(f"{seed_base}:{bot_name}:{today_key}").randint(0, int(daily_rate))
            bot_xp = max(15, int(daily_rate * days_elapsed * consistency) + jitter)

            bot_tier = tier_names[0]
            for t in LT:
                if bot_xp >= t['min_xp']:
                    bot_tier = t['name']
            if tier_bump:
                bump_idx = tier_names.index(bot_tier) + 1
                if bump_idx < len(tier_names):
                    bot_tier = tier_names[bump_idx]

            ranking.append({
                "name": bot_name,
                "xp": bot_xp,
                "league_tier": bot_tier,
                "league_icon": tier_icon_map.get(bot_tier, '🥉'),
                "quizzes_completed": max(1, int(days_elapsed * consistency * quizzes_factor)),
                "isRealUser": False,
                "user_id": None,
            })

    # 3. Sort by XP descending and assign ranks
    sorted_ranking = sorted(ranking, key=lambda x: x['xp'], reverse=True)

    final_ranking = []
    for i, player in enumerate(sorted_ranking):
        final_ranking.append({
            "rank": i + 1,
            "name": player['name'],
            "xp": player['xp'],
            "league_tier": player['league_tier'],
            "league_icon": player['league_icon'],
            "quizzes_completed": player['quizzes_completed'],
            "isRealUser": player['isRealUser'],
        })

    return {"ranking_data": final_ranking}


# =============================================================================
# SEASON ENDPOINTS
# =============================================================================

@router.get("/arena/current-season", status_code=status.HTTP_200_OK)
async def get_current_season(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get information about the current active season"""
    from ..services.arena_service import get_active_season, get_current_or_upcoming_season
    
    active = await get_active_season(db)
    if active:
        return {
            "season": {
                "id": active.id,
                "name": active.name,
                "start_date": active.start_date.isoformat(),
                "end_date": active.end_date.isoformat(),
                "is_active": True,
                "days_remaining": (active.end_date - datetime.now(timezone.utc)).days
            }
        }
    
    # Check for upcoming season
    upcoming = await get_current_or_upcoming_season(db)
    if upcoming:
        return {
            "season": {
                "id": upcoming.id,
                "name": upcoming.name,
                "start_date": upcoming.start_date.isoformat(),
                "end_date": upcoming.end_date.isoformat(),
                "is_active": False,
                "days_until_start": (upcoming.start_date - datetime.now(timezone.utc)).days
            }
        }
    
    return {"season": None}


@router.get("/arena/my-season-stats/{exam_code}", status_code=status.HTTP_200_OK)
async def get_my_season_stats(
    exam_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get user's ranking stats for the current season for a specific exam"""
    from ..services.arena_service import get_user_season_stats
    
    stats = await get_user_season_stats(current_user.id, exam_code, db)
    
    if not stats:
        return {
            "has_stats": False,
            "message": "Você ainda não participou desta competição nesta temporada."
        }
    
    return {
        "has_stats": True,
        **stats
    }


# =============================================================================
# SHARE CARD ENDPOINTS
# =============================================================================

class ShareCardRequest(BaseModel):
    exam_code: str
    exam_name: str
    exam_flag: str
    score: int
    rank_position: Optional[int] = None
    percentile: Optional[int] = None
    season_name: Optional[str] = None

@router.post("/arena/generate-share-card", status_code=status.HTTP_200_OK)
async def generate_share_card(
    payload: ShareCardRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Generate a shareable card image for quiz results.
    Returns the image as base64 encoded string.
    """
    from ..services.share_card_service import generate_quiz_result_card
    import base64
    
    try:
        image_bytes = generate_quiz_result_card(
            user_name=current_user.full_name,
            exam_name=payload.exam_name,
            exam_flag=payload.exam_flag,
            score=payload.score,
            rank_position=payload.rank_position,
            percentile=payload.percentile,
            season_name=payload.season_name
        )
        
        # Convert to base64 for easy frontend consumption
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')
        
        return {
            "success": True,
            "image_data": f"data:image/png;base64,{image_base64}",
            "share_text": f"Acabei de completar um simulado de {payload.exam_name} no Qython! 🏆 Minha pontuação: {payload.score} pts",
            "share_url": f"{Config.WEB_BASE_URL}/arena"
        }
        
    except Exception as e:
        logger.error(f"Error generating share card: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao gerar card de compartilhamento."
        )


# =============================================================================
# CHALLENGE ENDPOINTS
# =============================================================================

class CreateChallengeRequest(BaseModel):
    opponent_username: str
    exam_code: str
    # Opcional: o mobile não manda (422 histórico); fallback = exam_code
    exam_name: Optional[str] = None

class RespondChallengeRequest(BaseModel):
    accept: bool

class SubmitChallengeScoreRequest(BaseModel):
    score: int

@router.post("/arena/challenges", status_code=status.HTTP_201_CREATED)
async def create_challenge(
    payload: CreateChallengeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new head-to-head challenge"""
    from ..services.challenge_service import create_challenge as create_challenge_svc
    
    result = await create_challenge_svc(
        challenger=current_user,
        opponent_username=payload.opponent_username,
        exam_code=payload.exam_code,
        exam_name=payload.exam_name or payload.exam_code,
        db=db
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.get("/arena/challenges", status_code=status.HTTP_200_OK)
async def get_my_challenges(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all challenges for current user (sent and received)"""
    from ..services.challenge_service import get_my_challenges as get_my_challenges_svc
    
    return await get_my_challenges_svc(current_user, db)


@router.post("/arena/challenges/{challenge_id}/respond", status_code=status.HTTP_200_OK)
async def respond_to_challenge(
    challenge_id: int,
    payload: RespondChallengeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Accept or decline a challenge"""
    from ..services.challenge_service import respond_to_challenge as respond_svc
    
    result = await respond_svc(current_user, challenge_id, payload.accept, db)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/arena/challenges/{challenge_id}/submit-score", status_code=status.HTTP_200_OK)
async def submit_challenge_score(
    challenge_id: int,
    payload: SubmitChallengeScoreRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Submit score for a challenge after completing the quiz"""
    from ..services.challenge_service import submit_challenge_score as submit_svc

    result = await submit_svc(current_user, challenge_id, payload.score, db)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


# =============================================================================
# XP PROFILE & LEAGUE ENDPOINTS
# =============================================================================

@router.get("/arena/my-xp-profile", status_code=status.HTTP_200_OK)
async def get_my_xp_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get user's XP profile with streak, league tier, and recent XP history."""
    from ..services.xp_service import get_or_create_xp_profile, get_league_info
    from ..models import XpTransaction

    profile = await get_or_create_xp_profile(current_user.id, db)

    # Get last 10 XP transactions
    xp_history_result = await db.execute(
        select(XpTransaction)
        .filter(XpTransaction.user_id == current_user.id)
        .order_by(XpTransaction.created_at.desc())
        .limit(10)
    )
    xp_history = [
        {
            "amount": tx.amount,
            "source": tx.source,
            "created_at": tx.created_at.isoformat(),
        }
        for tx in xp_history_result.scalars().all()
    ]

    league = get_league_info(profile)

    return {
        "total_xp": profile.total_xp,
        "season_xp": profile.season_xp,
        "current_streak": profile.current_streak,
        "longest_streak": profile.longest_streak,
        "last_activity_date": profile.last_activity_date.isoformat() if profile.last_activity_date else None,
        "league": league,
        # Campos flat que web/mobile consomem (tier como SLUG p/ ícone + i18n; o
        # league.next_tier aninhado é display name e não serve de chave)
        "league_tier": league["tier"],
        "next_tier": league["next_tier_name"],
        "next_tier_icon": league["next_tier_icon"],
        "xp_to_next": league["xp_to_next"],
        "next_tier_min_xp": league["next_tier_min_xp"],
        "season_rank": profile.season_rank,
        "season_percentile": profile.season_percentile,
        "xp_history": xp_history,
    }


@router.get("/arena/league-tiers", status_code=status.HTTP_200_OK)
async def get_league_tiers():
    """Get all league tiers with their XP thresholds."""
    from ..models import LEAGUE_TIERS
    return {"tiers": LEAGUE_TIERS}


class MatchmakingRequest(BaseModel):
    exam_code: str

@router.post("/arena/matchmaking", status_code=status.HTTP_200_OK)
async def find_opponent(
    payload: MatchmakingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Find a random opponent for a challenge (skill-based matchmaking)."""
    from ..services.xp_service import find_random_opponent
    from ..services.challenge_service import create_challenge as create_challenge_svc

    opponent = await find_random_opponent(current_user, payload.exam_code, db)

    if not opponent:
        return {"success": False, "error": "Nenhum oponente encontrado. Tente novamente mais tarde."}

    # Get exam name for the challenge
    result = await db.execute(select(ArenaExam).filter(ArenaExam.exam_code == payload.exam_code))
    exam = result.scalars().first()
    exam_name = exam.title_key if exam else payload.exam_code

    # Auto-create challenge
    challenge_result = await create_challenge_svc(
        challenger=current_user,
        opponent_username=opponent.username,
        exam_code=payload.exam_code,
        exam_name=exam_name,
        db=db
    )

    return challenge_result


# =============================================================================
# ARENA — PROVAS CUSTOMIZADAS (CONCURSOS) — pilar "Meus Concursos"
# Card = gerador de prova do usuário (bibliotecas-fonte + dossiê de pesquisa web).
# Dele saem rounds congelados e competíveis numa TRILHA SEPARADA da liga oficial.
# Desenho: docs/ARENA_CUSTOM_EXAMS.md
# =============================================================================

CUSTOM_EXAM_ALLOWED_PLANS = ['resident', 'staff', 'specialist']


def _require_custom_exam_access(user: User):
    """Provas customizadas seguem o gate da Arena (Residente+)."""
    if getattr(user, 'is_admin', False):
        return
    if user.subscription_plan not in CUSTOM_EXAM_ALLOWED_PLANS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="As Provas Customizadas (Concursos) estão disponíveis a partir do Plano Residente. Faça upgrade para acessar!",
        )


class CardSourceOut(BaseModel):
    library_id: Optional[int] = None
    name: Optional[str] = None


class CustomCardCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    language: Optional[str] = 'pt-BR'
    config: Optional[Dict[str, Any]] = None
    source_library_ids: Optional[List[int]] = None
    # Subconjunto de source_library_ids que foi AUTO-CRIADO a partir de arquivos anexados
    # (não escolhido pelo usuário). Guardado em config['_attached_library_ids'] p/ permitir
    # a limpeza opcional dessas bibliotecas ao excluir o card (libera a cota).
    attached_library_ids: Optional[List[int]] = None
    past_exams_library_id: Optional[int] = None  # biblioteca de "provas anteriores" (estilo da banca + inspiração de conteúdo)


class CustomCardUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    description: Optional[str] = None
    language: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    source_library_ids: Optional[List[int]] = None
    attached_library_ids: Optional[List[int]] = None
    past_exams_library_id: Optional[int] = None  # biblioteca de "provas anteriores" (estilo da banca + inspiração de conteúdo)


class CustomCardResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    language: str
    config: Dict[str, Any] = {}
    dossier: Optional[Any] = None
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    sources: List[CardSourceOut] = []
    drafts_count: Optional[int] = None


async def _validate_owned_libraries(db: AsyncSession, library_ids, user_id: int) -> List[int]:
    """Dedup + checa que todas as bibliotecas pertencem ao usuário. 404 se faltar alguma."""
    ids = list(dict.fromkeys(int(i) for i in (library_ids or [])))
    if not ids:
        return []
    rows = (await db.execute(
        select(AcademicLibrary.id).where(
            AcademicLibrary.id.in_(ids),
            AcademicLibrary.user_id == user_id,
        )
    )).scalars().all()
    owned = set(rows)
    missing = [i for i in ids if i not in owned]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Biblioteca(s) não encontrada(s) ou não pertencem ao usuário: {missing}",
        )
    return ids


async def _get_owned_card(db: AsyncSession, card_id: int, user_id: int) -> CustomExamCard:
    card = (await db.execute(
        select(CustomExamCard).where(
            CustomExamCard.id == card_id,
            CustomExamCard.user_id == user_id,
        )
    )).scalars().first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card não encontrado ou não pertence ao usuário.")
    return card


async def _card_sources(db: AsyncSession, card_id: int) -> List[Dict[str, Any]]:
    rows = (await db.execute(
        select(CustomCardSource.library_id, AcademicLibrary.name)
        .outerjoin(AcademicLibrary, AcademicLibrary.id == CustomCardSource.library_id)
        .where(CustomCardSource.card_id == card_id)
    )).all()
    return [{"library_id": lib_id, "name": name} for (lib_id, name) in rows]


async def _serialize_card(db: AsyncSession, card: CustomExamCard, include_counts: bool = False) -> Dict[str, Any]:
    data = {
        "id": card.id,
        "name": card.name,
        "description": card.description,
        "language": card.language,
        "config": card.config or {},
        "dossier": card.dossier,
        "status": card.status,
        "created_at": card.created_at,
        "updated_at": card.updated_at,
        "sources": await _card_sources(db, card.id),
        "drafts_count": None,
    }
    if include_counts:
        data["drafts_count"] = await db.scalar(
            select(func.count()).select_from(AcademicMaterial).where(
                AcademicMaterial.card_id == card.id,
                AcademicMaterial.status == 'completed',
            )
        )
    return data


@router.post("/arena/cards", response_model=CustomCardResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_exam_card(
    payload: CustomCardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_custom_exam_access(current_user)
    lib_ids = await _validate_owned_libraries(db, payload.source_library_ids, current_user.id)

    cfg = dict(payload.config or {})
    if payload.attached_library_ids:
        cfg['_attached_library_ids'] = list(dict.fromkeys(int(i) for i in payload.attached_library_ids))
    if payload.past_exams_library_id is not None:
        cfg['_past_exams_library_id'] = int(payload.past_exams_library_id)
    card = CustomExamCard(
        user_id=current_user.id,
        name=payload.name.strip(),
        description=payload.description,
        language=(payload.language or 'pt-BR'),
        config=cfg,
        status='active',
    )
    db.add(card)
    await db.flush()  # garante card.id p/ as sources
    for lib_id in lib_ids:
        db.add(CustomCardSource(card_id=card.id, library_id=lib_id))

    await track_activity(db, current_user.id, 'academic', 'custom_card_create', {'card_id': card.id})
    await db.commit()
    await db.refresh(card)
    return await _serialize_card(db, card, include_counts=True)


@router.get("/arena/cards", response_model=List[CustomCardResponse])
async def list_custom_exam_cards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    cards = (await db.execute(
        select(CustomExamCard)
        .where(CustomExamCard.user_id == current_user.id)
        .order_by(CustomExamCard.id.desc())
    )).scalars().all()
    return [await _serialize_card(db, c, include_counts=True) for c in cards]


@router.get("/arena/cards/{card_id}", response_model=CustomCardResponse)
async def get_custom_exam_card(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    card = await _get_owned_card(db, card_id, current_user.id)
    return await _serialize_card(db, card, include_counts=True)


@router.patch("/arena/cards/{card_id}", response_model=CustomCardResponse)
async def update_custom_exam_card(
    card_id: int,
    payload: CustomCardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    card = await _get_owned_card(db, card_id, current_user.id)

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome não pode ser vazio.")
        card.name = name
    if payload.description is not None:
        card.description = payload.description
    if payload.language is not None:
        card.language = payload.language
    if payload.config is not None or payload.attached_library_ids is not None or payload.past_exams_library_id is not None:
        # Preserva chaves internas (_attached_library_ids, _past_exams_library_id) que vivem no
        # config e seriam perdidas num update de config (que vem sem elas).
        prev_cfg = card.config or {}
        prev_attached = prev_cfg.get('_attached_library_ids') or []
        new_cfg = dict(payload.config) if payload.config is not None else dict(prev_cfg)
        add = [int(i) for i in (payload.attached_library_ids or [])]
        new_cfg['_attached_library_ids'] = list(dict.fromkeys([*prev_attached, *add]))
        if payload.past_exams_library_id is not None:
            new_cfg['_past_exams_library_id'] = int(payload.past_exams_library_id)
        elif '_past_exams_library_id' in prev_cfg:
            new_cfg['_past_exams_library_id'] = prev_cfg['_past_exams_library_id']
        card.config = new_cfg
    if payload.status is not None:
        if payload.status not in ('active', 'archived'):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="status inválido (use 'active' ou 'archived').")
        card.status = payload.status

    if payload.source_library_ids is not None:
        lib_ids = await _validate_owned_libraries(db, payload.source_library_ids, current_user.id)
        existing = (await db.execute(
            select(CustomCardSource).where(CustomCardSource.card_id == card.id)
        )).scalars().all()
        for s in existing:
            await db.delete(s)
        await db.flush()
        for lib_id in lib_ids:
            db.add(CustomCardSource(card_id=card.id, library_id=lib_id))

    await db.commit()
    await db.refresh(card)
    return await _serialize_card(db, card, include_counts=True)


@router.delete("/arena/cards/{card_id}", status_code=status.HTTP_200_OK)
async def delete_custom_exam_card(
    card_id: int,
    delete_libraries: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    card = await _get_owned_card(db, card_id, current_user.id)

    # Opcional (delete_libraries=true): apaga também as bibliotecas de apoio AUTO-CRIADAS a
    # partir de arquivos anexados a este card — liberando a cota de armazenamento (ChromaDB +
    # arquivos físicos + storage_used_bytes via delete_library). Só apaga as que NENHUM outro
    # card ainda usa (nunca toca em bibliotecas escolhidas/compartilhadas pelo usuário).
    libraries_deleted = []
    if delete_libraries:
        attached = (card.config or {}).get('_attached_library_ids') or []
        for lib_id in attached:
            shared = (await db.execute(
                select(CustomCardSource.id).where(
                    CustomCardSource.library_id == int(lib_id),
                    CustomCardSource.card_id != card.id,
                ).limit(1)
            )).first()
            if shared:
                continue
            try:
                await library_service.delete_library(db=db, library_id=int(lib_id), user=current_user)
                libraries_deleted.append(int(lib_id))
            except Exception as e:
                logger.warning(f"[arena] Falha ao apagar biblioteca de apoio {lib_id} do card {card_id}: {e}")

    # cascade: sources + rounds (+ attempts) são apagados; drafts (AcademicMaterial)
    # têm card_id SET NULL e PERMANECEM (preserva o flywheel).
    await db.delete(card)
    await db.commit()
    return {"message": "Card removido.", "libraries_deleted": libraries_deleted}


def _sample_text_for_budget(text: str, budget: int, windows: int = 14) -> str:
    """Reduz `text` a ~budget chars SEM excluir nenhuma parte do material.

    NÃO truncar: cortar no limite descartaria todo o fim do programa (e a prova nasceria
    cega para os últimos temas). Em vez disso, recorta N janelas distribuídas
    uniformemente do início ao fim, na ordem original — todo trecho do material tem
    representação, só em resolução menor. Corta em espaço p/ não partir palavra."""
    if not text or budget <= 0 or len(text) <= budget:
        return text
    win = max(1500, budget // windows)
    step = max(1, (len(text) - win) // max(1, windows - 1))
    parts = []
    for i in range(windows):
        start = i * step
        chunk = text[start:start + win]
        if start > 0:
            cut = chunk.find(' ')
            if 0 <= cut <= 200:
                chunk = chunk[cut + 1:]
        parts.append(chunk.strip())
        if start + win >= len(text):
            break
    return "\n\n[... trecho omitido ...]\n\n".join(p for p in parts if p)


async def _aggregate_library_text(db: AsyncSession, library_ids: List[int], char_budget: Optional[int] = None) -> str:
    """Concatena o texto das bibliotecas-fonte do card.

    Com `char_budget`, cada biblioteca entra INTEIRA se couber; se passar do teto, entra
    amostrada por janelas distribuídas (ver _sample_text_for_budget). Isso derrubou o
    input da geração de prova (medido: 671k tokens/prova, $1,24 no 3.5-flash) sem deixar
    nenhum tema de fora — o que viabilizou o modelo forte nas provas de concurso."""
    parts = []
    per_lib = None
    if char_budget and library_ids:
        per_lib = max(8000, char_budget // len(library_ids))
    for lib_id in library_ids:
        text = await run_in_threadpool(vector_db_service.get_all_text_for_library, library_id=lib_id)
        if text and text.strip():
            text = text.strip()
            if per_lib and len(text) > per_lib:
                original = len(text)
                text = _sample_text_for_budget(text, per_lib)
                logger.info(f"[EXAM_CTX] biblioteca {lib_id}: {original} → {len(text)} chars (amostragem por janelas)")
            parts.append(text)
    return "\n\n".join(parts)


class CardGenerateRequest(BaseModel):
    question_type: Optional[str] = None  # 'objective' | 'subjective' (default: config do card → objective)
    num_questions: Optional[int] = None  # default: config do card → 25; clamp 5..50 na camada 1


@router.post("/arena/cards/{card_id}/generate", response_model=AcademicMaterialResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_custom_exam_draft(
    card_id: int,
    payload: CardGenerateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Gera uma prova-draft (AcademicMaterial) a partir das bibliotecas-fonte do card.
    Anti-repetição POR CARD; honra a quantidade de questões escolhida. O draft pode depois
    virar um round congelado (camada 3)."""
    _require_custom_exam_access(current_user)
    card = await _get_owned_card(db, card_id, current_user.id)
    cfg = card.config or {}

    qtype = (payload.question_type or cfg.get('question_type') or 'objective').lower()
    if qtype in ('subjective', 'subjetiva', 'discursive', 'discursiva'):
        material_type = 'questionnaire_subjective'
    else:
        material_type = 'questionnaire_objective'

    raw_n = payload.num_questions if payload.num_questions is not None else cfg.get('num_questions')
    try:
        num_q = int(raw_n) if raw_n is not None else 25
    except (TypeError, ValueError):
        num_q = 25
    num_q = max(5, min(50, num_q))

    # Bibliotecas-fonte do card (ignora vínculos órfãos com library_id NULL)
    lib_ids = (await db.execute(
        select(CustomCardSource.library_id).where(
            CustomCardSource.card_id == card.id,
            CustomCardSource.library_id.isnot(None),
        )
    )).scalars().all()
    lib_ids = [lid for lid in lib_ids if lid]
    if not lib_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este card não tem bibliotecas-fonte. Adicione ao menos uma para gerar a prova.")
    lib_ids = await _validate_owned_libraries(db, lib_ids, current_user.id)

    # Separa MATÉRIA (edital + bibliotecas-fonte) das PROVAS ANTERIORES: estas não entram no
    # pool de material-fonte, mas chegam ao gerador via banca_profile como referência de
    # estilo + inspiração de conteúdo (temas podem voltar reformulados).
    past_exams_lib = cfg.get('_past_exams_library_id')
    content_lib_ids = [l for l in lib_ids if l != past_exams_lib] or lib_ids

    # Modo AVANÇADO: distribuição por bloco (cota de questões por bibliotecas, estilo banca).
    # Cada bloco gera SÓ das suas bibliotecas; o total = soma dos blocos. Sem blueprint → caminho
    # de hoje (todas as bibliotecas juntas, um total único). Tipo/alternativas seguem GLOBAIS.
    blueprint_raw = cfg.get('blueprint')
    blueprint_blocks = None
    input_data = None
    if isinstance(blueprint_raw, list) and blueprint_raw:
        blueprint_blocks = []
        for blk in blueprint_raw:
            if not isinstance(blk, dict):
                continue
            blk_libs = [int(x) for x in (blk.get('library_ids') or []) if x]
            blk_libs = await _validate_owned_libraries(db, blk_libs, current_user.id)
            blk_libs = [l for l in blk_libs if l != past_exams_lib]
            try:
                blk_count = max(0, min(50, int(blk.get('num_questions') or 0)))
            except (TypeError, ValueError):
                blk_count = 0
            if not blk_libs or blk_count <= 0:
                continue
            blk_text = await _aggregate_library_text(db, blk_libs, char_budget=Config.EXAM_LIB_CHAR_BUDGET)
            if not blk_text or not blk_text.strip():
                continue
            blueprint_blocks.append({
                'label': ((blk.get('label') or '').strip()[:80]) or 'Bloco',
                'text': blk_text,
                'num_questions': blk_count,
            })
        if not blueprint_blocks:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum bloco válido: cada bloco precisa de ao menos uma biblioteca com texto e um nº de questões.")
        num_q = sum(b['num_questions'] for b in blueprint_blocks)  # total = soma dos blocos
    else:
        input_data = await _aggregate_library_text(db, content_lib_ids, char_budget=Config.EXAM_LIB_CHAR_BUDGET)
        if not input_data or not input_data.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="As bibliotecas-fonte não têm texto processado para gerar a prova.")

    # Cobrança: feature PRÓPRIA da prova de concurso (100 dracmas) — custo real muito
    # acima do material comum (1 chamada por bloco + modelo forte). Ver billing_service.
    await debit_dracmas_for_feature(current_user, "generate_custom_exam", db)

    new_material = AcademicMaterial(
        user_id=current_user.id,
        library_id=lib_ids[0],  # biblioteca primária (referência); a anti-repetição usa card_id
        card_id=card.id,
        material_type=material_type,
        content={"status": "pending"},
        status='pending',
    )
    db.add(new_material)
    await db.commit()
    await db.refresh(new_material)

    # Anti-repetição POR CARD. Com blueprint, a lista vai POR BLOCO (cada chamada recebe só
    # o histórico da própria matéria): a lista plana tinha teto de 150 e, com 7 provas de 40
    # questões, deixava 130 enunciados invisíveis — o gerador recriava questões das provas
    # antigas. Sem blueprint, segue a lista plana.
    prior_questions = await _collect_prior_quiz_stems(db, current_user.id, card_id=card.id)
    prior_by_block = await _collect_prior_by_block(db, current_user.id, card.id) if blueprint_blocks else None

    # Perfil da prova = concatenação de até 3 fontes:
    # (1) DESCRIÇÃO do card escrita pelo usuário — fonte de 1ª classe sobre banca/formato/
    #     distribuição (antes era só metadado exibido; o gerador não a via);
    # (2) dossiê pesquisado, SÓ se confirmado (human-in-the-loop);
    # (3) provas anteriores — formato/estilo + inspiração de conteúdo.
    dossier = card.dossier or {}
    profile_parts = []
    if (card.description or '').strip():
        profile_parts.append(
            "DESCRIÇÃO DA PROVA (escrita pelo usuário — trate como fonte de verdade sobre "
            "banca, formato, distribuição de temas, pesos e estilo de cobrança):\n"
            + card.description.strip()
        )
    if dossier.get('confirmed') and str(dossier.get('synthesis') or '').strip():
        profile_parts.append(str(dossier['synthesis']).strip())
    if past_exams_lib and past_exams_lib in lib_ids:
        past_text = await _aggregate_library_text(db, [past_exams_lib], char_budget=Config.EXAM_PAST_CHAR_BUDGET)
        if past_text and past_text.strip():
            fmt_block = ("PROVAS ANTERIORES desta banca/prova — use com DUPLA função:\n"
                         "(1) REFERÊNCIA DE FORMATO/ESTILO: imite o jeito de formular, o nível "
                         "de dificuldade e o tipo de pegadinha desta banca.\n"
                         "(2) INSPIRAÇÃO DE CONTEÚDO: os temas e conceitos cobrados aqui são "
                         "fortes candidatos a REAPARECER (bancas repetem assuntos e até questões). "
                         "PODE criar questões inspiradas nas anteriores — mesmo tema/conceito sob "
                         "NOVO ângulo, com enunciado e alternativas REFORMULADOS — mas NUNCA copie "
                         "uma questão literalmente nem apenas troque palavras/números.\n"
                         "EQUILÍBRIO (proporção aproximada, não cota rígida): a MAIORIA das "
                         "questões (~2/3) deve nascer do material-fonte (edital + bibliotecas), "
                         "varrendo AMPLAMENTE o programa — inclusive pontos que nunca apareceram "
                         "nas provas anteriores; uma MINORIA (até ~1/3) pode ser inspirada nos "
                         "temas das provas anteriores, ESPALHADA por temas diferentes (não "
                         "concentre a inspiração em 2-3 questões antigas):\n\n" + past_text.strip())
            profile_parts.append(fmt_block)
    banca_profile = "\n\n".join(profile_parts) if profile_parts else None
    # Nº de alternativas por questão objetiva (config do card; default 5, clamp 2..6).
    try:
        num_alts = max(2, min(6, int(cfg.get('num_alternatives')))) if cfg.get('num_alternatives') is not None else 5
    except (TypeError, ValueError):
        num_alts = 5

    await track_activity(db, current_user.id, 'academic', 'custom_card_generate',
                         {'card_id': card.id, 'material_id': new_material.id, 'type': material_type, 'num_questions': num_q})

    if blueprint_blocks:
        background_tasks.add_task(
            _run_blueprint_generation_task,
            new_material.id,
            blueprint_blocks,
            material_type,
            current_user.id,
            llm_services.PRIMARY_LLM_MODEL,
            prior_questions,
            banca_profile,
            num_alts,
            Config.EXAM_LLM_MODEL,
            Config.EXAM_FALLBACK_LLM_MODEL,
            Config.EXAM_THINKING_LEVEL,
            prior_by_block,
        )
    else:
        background_tasks.add_task(
            _run_material_generation_task,
            new_material.id,
            input_data,
            material_type,
            current_user.id,
            llm_services.PRIMARY_LLM_MODEL,
            prior_questions,
            num_q,
            banca_profile,
            num_alts,
            Config.EXAM_LLM_MODEL,
            Config.EXAM_FALLBACK_LLM_MODEL,
            Config.EXAM_THINKING_LEVEL,
            True,  # prova de concurso PODE usar texto-base ("Texto I"); o Produtor NÃO
        )
    return new_material


@router.get("/arena/cards/{card_id}/drafts", response_model=List[AcademicMaterialResponse])
async def list_custom_exam_drafts(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Provas-draft (AcademicMaterial) já geradas deste card, mais recentes primeiro."""
    card = await _get_owned_card(db, card_id, current_user.id)
    rows = (await db.execute(
        select(AcademicMaterial)
        .where(AcademicMaterial.card_id == card.id)
        .order_by(AcademicMaterial.id.desc())
    )).scalars().all()
    return rows


class MaterialAttemptPayload(BaseModel):
    """Entrega de uma prova de Meus Concursos: respostas + placar, persistidos no material."""
    answers: Dict[str, str] = {}
    correct: int = 0
    incorrect: int = 0
    unanswered: int = 0
    total: int = 0
    elapsed_seconds: int = 0
    auto_delivered: bool = False  # true = entregue pelo cronômetro/fechamento


@router.post("/material/{material_id}/attempt", status_code=status.HTTP_200_OK)
async def save_material_attempt(
    material_id: int,
    payload: MaterialAttemptPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Salva a ÚLTIMA entrega da prova em content.last_attempt (fechar = entregar).
    'Ver provas' exibe o resultado salvo; refazer sobrescreve na próxima entrega."""
    material = (await db.execute(
        select(AcademicMaterial).where(
            AcademicMaterial.id == material_id,
            AcademicMaterial.user_id == current_user.id,
        )
    )).scalars().first()
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material não encontrado.")

    # ⚠️ Gotcha SQLAlchemy: copiar o dict antes de mutar, senão o JSON não marca dirty
    content = dict(material.content or {})
    content['last_attempt'] = {
        'answers': payload.answers,
        'correct': payload.correct,
        'incorrect': payload.incorrect,
        'unanswered': payload.unanswered,
        'total': payload.total,
        'elapsed_seconds': payload.elapsed_seconds,
        'auto_delivered': payload.auto_delivered,
        'submitted_at': datetime.now(timezone.utc).isoformat(),
    }
    material.content = content
    await db.commit()
    return {"ok": True}


class CardDossierUpdate(BaseModel):
    synthesis: Optional[str] = None
    confirmed: Optional[bool] = None
    sources: Optional[List[Dict[str, Any]]] = None


@router.post("/arena/cards/{card_id}/research", response_model=CustomCardResponse)
async def research_custom_exam(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Pesquisa a banca/prova na web (grounded) e cacheia o dossiê no card (confirmed=false).
    O usuário revisa/confirma depois; só então o dossiê guia a geração."""
    _require_custom_exam_access(current_user)
    card = await _get_owned_card(db, card_id, current_user.id)

    # Amostra de conteúdo (1ª biblioteca-fonte) p/ ancorar a área — opcional.
    content_sample = None
    src = (await db.execute(
        select(CustomCardSource.library_id)
        .where(CustomCardSource.card_id == card.id, CustomCardSource.library_id.isnot(None))
        .limit(1)
    )).scalars().first()
    if src:
        try:
            text = await run_in_threadpool(vector_db_service.get_all_text_for_library, library_id=src)
            content_sample = (text or '')[:2000] or None
        except Exception:
            content_sample = None

    # Cobrança (chamada grounded; reusa a feature de geração de material por ora)
    await debit_dracmas_for_feature(current_user, "generate_study_material", db)

    result = await run_in_threadpool(
        exam_research_service.research_exam_dossier,
        card.name, card.description, card.language, content_sample,
    )

    card.dossier = {
        **result,
        'confirmed': False,
        'researched_at': datetime.now(timezone.utc).isoformat(),
    }
    await track_activity(db, current_user.id, 'academic', 'custom_card_research',
                         {'card_id': card.id, 'grounded': result.get('grounded')})
    await db.commit()
    await db.refresh(card)
    return await _serialize_card(db, card, include_counts=True)


@router.put("/arena/cards/{card_id}/dossier", response_model=CustomCardResponse)
async def update_custom_exam_dossier(
    card_id: int,
    payload: CardDossierUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Edita/confirma o dossiê (human-in-the-loop). confirmed=true libera o uso na geração."""
    card = await _get_owned_card(db, card_id, current_user.id)
    dossier = dict(card.dossier or {})
    if payload.synthesis is not None:
        dossier['synthesis'] = payload.synthesis
    if payload.sources is not None:
        dossier['sources'] = payload.sources
    if payload.confirmed is not None:
        dossier['confirmed'] = bool(payload.confirmed)
    card.dossier = dossier  # reatribui p/ o SQLAlchemy detectar a mudança no JSON
    await db.commit()
    await db.refresh(card)
    return await _serialize_card(db, card, include_counts=True)

