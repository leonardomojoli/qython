import os
import uuid
import logging
import wave
from ...config import Config
from ..llm_services import client, types
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...models import PodcastGenerationJob

logger = logging.getLogger(__name__)

TTS_MODEL_NAME = "models/gemini-2.5-pro-preview-tts"
CHUNK_CHAR_LIMIT = 2500

def generate_podcast_from_script(script_text: str, progress_callback=None, voice_config: str = 'pt-br') -> str:
    """
    Gera áudio do podcast a partir do roteiro.

    Args:
        script_text: O roteiro do podcast
        progress_callback: Função de callback para reportar progresso (current, total, percent, step)
        voice_config: Configuração de voz ('pt-br', 'en-us', 'es')
    """
    # Mapeamento de configurações de voz
    VOICE_CONFIGS = {
        'pt-br': {
            'speakers': [('Dra. Epione', 'Erinome'), ('Dr. Qython', 'Charon')],
        },
        'en-us': {
            'speakers': [('Dr. Smith', 'Kore'), ('Dr. Jones', 'Puck')],
        },
        'es': {
            'speakers': [('Dra. Garcia', 'Aoede'), ('Dr. Lopez', 'Fenrir')],
        }
    }

    voice_cfg = VOICE_CONFIGS.get(voice_config, VOICE_CONFIGS['pt-br'])

    initial_paragraphs = [p.strip() for p in script_text.split('\n\n') if p.strip()]

    if not initial_paragraphs:
        logger.error("O roteiro do podcast estava vazio ou continha apenas espaços em branco.")
        raise RuntimeError("O roteiro do podcast gerado estava vazio.")

    combined_chunks = []
    current_chunk = ""
    for paragraph in initial_paragraphs:
        if len(current_chunk) + len(paragraph) + 2 > CHUNK_CHAR_LIMIT:
            if current_chunk:
                combined_chunks.append(current_chunk)
            current_chunk = paragraph
        else:
            if current_chunk:
                current_chunk += "\n\n" + paragraph
            else:
                current_chunk = paragraph

    if current_chunk:
        combined_chunks.append(current_chunk)

    script_chunks = combined_chunks
    total_chunks = len(script_chunks)

    logger.info(f"Roteiro dividido em {total_chunks} chunks inteligentes para geração de áudio.")

    # Report initial progress
    if progress_callback:
        progress_callback(current=0, total=total_chunks, percent=0, step="Iniciando síntese de áudio")

    audio_data_parts = []

    try:
        for i, chunk in enumerate(script_chunks):
            logger.info(f"Gerando áudio para o chunk {i+1}/{total_chunks} (Tamanho: {len(chunk)} chars)...")

            # Build speaker configs dynamically from voice_cfg
            speaker_configs = [
                types.SpeakerVoiceConfig(
                    speaker=speaker_name,
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
                    )
                )
                for speaker_name, voice_name in voice_cfg['speakers']
            ]

            config = types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                        speaker_voice_configs=speaker_configs
                    )
                )
            )

            response = client.models.generate_content(
                model=TTS_MODEL_NAME,
                contents=[chunk],
                config=config
            )

            if not response.candidates or not response.candidates[0].content or not response.candidates[0].content.parts:
                logger.error(f"A resposta da API Gemini para o chunk {i+1} foi bloqueada ou retornou vazia. Causa provável: {response.prompt_feedback}")
                continue

            audio_data = response.candidates[0].content.parts[0].inline_data.data

            if audio_data:
                audio_data_parts.append(audio_data)
                logger.info(f"Áudio para o chunk {i+1} gerado com sucesso. Tamanho: {len(audio_data)} bytes.")

                # Report progress after each chunk
                if progress_callback:
                    percent = int(((i + 1) / total_chunks) * 100)
                    progress_callback(
                        current=i + 1,
                        total=total_chunks,
                        percent=percent,
                        step=f"Sintetizando áudio ({i + 1}/{total_chunks})"
                    )
            else:
                logger.warning(f"A API Gemini TTS retornou dados de áudio vazios para o chunk {i+1}.")

        if not audio_data_parts:
            raise RuntimeError("Nenhum chunk de áudio pôde ser gerado a partir do roteiro.")

        output_dir = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'podcasts')
        os.makedirs(output_dir, exist_ok=True)
        
        final_filename = f"podcast_{uuid.uuid4()}.wav"
        final_filepath = os.path.join(output_dir, final_filename)
        
        with wave.open(final_filepath, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            
            for part in audio_data_parts:
                wf.writeframes(part)
        
        logger.info(f"Podcast completo salvo com sucesso em: {final_filepath}")

        relative_path = os.path.join(Config.STATIC_URL_PATH_PREFIX.strip('/'), 'uploads', 'podcasts', final_filename)
        return relative_path.replace("\\", "/")

    except Exception as e:
        logger.error(f"Falha na chamada da API Gemini TTS com MultiSpeaker. Erro: {e}", exc_info=True)
        raise RuntimeError(f"Falha ao gerar áudio com a API Gemini: {e}")

async def clear_specific_podcast_job(db: AsyncSession, user_id: int, job_id: int) -> bool:
    logger.info(f"Tentativa de exclusão do job de podcast {job_id} para o usuário {user_id}.")
    result = await db.execute(select(PodcastGenerationJob).filter_by(id=job_id, user_id=user_id))
    job = result.scalars().first()

    if not job:
        logger.warning(f"Job de podcast {job_id} não encontrado para o usuário {user_id} ou permissão negada.")
        return False

    if job.result_path and 'static/uploads/podcasts/' in job.result_path:
        filename = os.path.basename(job.result_path)
        file_path = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'podcasts', filename)
        
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"Arquivo de áudio {file_path} deletado com sucesso.")
            except OSError as e:
                logger.error(f"Erro ao deletar o arquivo de áudio {file_path}: {e}", exc_info=True)
        else:
            logger.warning(f"Arquivo de áudio {file_path} não encontrado no disco para o job {job_id}.")

    try:
        await db.delete(job)
        await db.commit()
        logger.info(f"Registro do job de podcast {job_id} deletado do banco de dados.")
        return True
    except Exception as e:
        await db.rollback()
        logger.error(f"Erro ao deletar o registro do job {job_id} do banco de dados: {e}", exc_info=True)
        return False

async def cleanup_dangling_jobs(db: AsyncSession, user_id: int):
    logger.info(f"Iniciando limpeza de jobs de podcast antigos para o usuário {user_id}.")
    result = await db.execute(select(PodcastGenerationJob).filter(
        PodcastGenerationJob.user_id == user_id,
        PodcastGenerationJob.status.in_(['completed', 'error'])
    ))
    dangling_jobs = result.scalars().all()

    if not dangling_jobs:
        logger.info(f"Nenhum job de podcast antigo encontrado para o usuário {user_id}.")
        return

    for job in dangling_jobs:
        logger.info(f"Limpando job antigo ID: {job.id} com status '{job.status}'.")
        await clear_specific_podcast_job(db=db, user_id=user_id, job_id=job.id)
