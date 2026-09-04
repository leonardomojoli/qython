# transcriber.py

import subprocess
import traceback
import os
import time
import json
import math
import re
import logging
import requests # Para chamadas HTTP à API

from dotenv import load_dotenv

# --- Configuração do Logger ---
logger = logging.getLogger(__name__)
logger.propagate = False
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
if not logger.handlers:
    handler.setFormatter(formatter)
    logger.addHandler(handler)

# Carrega variáveis de ambiente do arquivo .env na raiz do projeto
# __file__ é /opt/qython/backend/services/academic_services/transcription_service.py
# PROJECT_ROOT_DIR será /opt/qython
PROJECT_ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DOTENV_PATH = os.path.join(PROJECT_ROOT_DIR, '.env')

if os.path.exists(DOTENV_PATH):
    load_dotenv(dotenv_path=DOTENV_PATH)
else:
    # Fallback silencioso - variáveis já podem estar carregadas pelo config.py
    load_dotenv()

# --- Configuração da API de transcrição (Groq Whisper) ---
# A Groq expõe o Whisper large-v3 / turbo via endpoint compatível com OpenAI.
# Free tier: 28.800 s de áudio/dia e arquivos até 25 MB — o limite de tamanho é
# coberto pelo chunking em FLAC 16kHz mono feito por split_direct_to_flac_chunks.
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    logger.warning("GROQ_API_KEY não encontrada nas variáveis de ambiente. As transcrições de áudio/vídeo falharão.")

GROQ_TRANSCRIPTION_MODEL = os.getenv("GROQ_TRANSCRIPTION_MODEL", "whisper-large-v3-turbo")
GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
# Idioma opcional (ISO-639-1, ex.: "pt"). Vazio = detecção automática do Whisper,
# recomendado porque bibliotecas podem conter material em pt/en/es.
TRANSCRIPTION_LANGUAGE = os.getenv("TRANSCRIPTION_LANGUAGE", "").strip()

# --- Self-host (faster-whisper) ---
# Se WHISPER_SERVER_URL estiver setado, a transcrição usa o serviço local
# (whisper.service, large-v3-turbo) em vez da Groq — sem cota/API externa.
WHISPER_SERVER_URL = os.getenv("WHISPER_SERVER_URL", "").strip()
WHISPER_REQUEST_TIMEOUT = int(os.getenv("WHISPER_REQUEST_TIMEOUT", "5400"))  # 1.5h p/ áudios longos

# --- Constantes ---
MAX_RETRIES = 3
INITIAL_BACKOFF = 5
# 300s (~5 MB em FLAC 16kHz mono) por chunk. Chunks de 600s (~10,5 MB) travam
# reprodutivelmente na chamada à Groq; testado: até 480s/8,2 MB respondem em ~1,5s.
# Manter abaixo desse limite mantém cada request rápido e bem dentro dos 25 MB do free tier.
CHUNK_DURATION_SECONDS = 300
# Espaçamento entre requests de chunk à Groq. Mandar os chunks em rajada (~1,5s cada)
# fazia o free tier pendurar os últimos. ~4s/chunk fica bem abaixo de 20 RPM.
INTER_CHUNK_DELAY = 4


class TranscriptionRateLimitError(RuntimeError):
    """Erro transitório/retryable da API de transcrição: rate limit (429), erro de
    servidor (5xx) ou timeout/falha de conexão.

    Sinaliza ao caller que o documento deve ser reprocessado depois (defer), em vez
    de ser marcado como erro permanente. O job scheduled_document_retry retoma quando
    a Groq normalizar / a cota voltar.
    """
    pass


def remove_duplicate_lines(text: str) -> str:
    lines = text.split('\n')
    new_lines = [line for i, line in enumerate(lines) if i == 0 or line.strip() != lines[i-1].strip()]
    return "\n".join(new_lines)

def normalize_transcript(text: str) -> str:
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def run_ffmpeg_command(cmd, error_context="", retries=2, delay=3):
    logger.debug(f"Executando comando FFmpeg: {' '.join(cmd)}")
    for attempt in range(retries + 1):
        try:
            result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
            if result.stderr:
                logger.debug(f"FFmpeg stderr (sucesso, tentativa {attempt+1}):\n{result.stderr}")
            logger.debug(f"Comando FFmpeg concluído com sucesso (tentativa {attempt+1}).")
            return
        except subprocess.CalledProcessError as e:
            stderr_output = e.stderr if e.stderr else "Nenhuma saída de erro capturada."
            if attempt == retries:
                error_msg = f"{error_context}\nErro: {stderr_output}\nComando: {' '.join(e.cmd)}"
                logger.error(error_msg)
                raise RuntimeError(error_msg)
            logger.warning(f"Erro FFmpeg (tentativa {attempt+1}). Aguardando {delay}s...")
            time.sleep(delay)

def wait_for_file_stability(file_path, timeout=30, check_interval=1):
    start_time = time.time()
    last_size = -1
    stable_since = start_time
    stability_duration_needed = 2

    while (time.time() - start_time) < timeout:
        try:
            if not os.path.exists(file_path):
                logger.warning(f"Arquivo {file_path} não encontrado durante a verificação de estabilidade.")
                time.sleep(check_interval)
                continue

            current_size = os.path.getsize(file_path)
            if current_size == last_size:
                if (time.time() - stable_since) >= stability_duration_needed:
                    logger.info(f"Arquivo {file_path} está estável por {stability_duration_needed}s. Tamanho: {current_size} bytes.")
                    return
            else:
                last_size = current_size
                stable_since = time.time()
            time.sleep(check_interval)
        except FileNotFoundError:
            logger.warning(f"Arquivo {file_path} desapareceu durante a verificação de estabilidade.")
            time.sleep(check_interval)
        except Exception as e:
            logger.error(f"Erro ao verificar estabilidade do arquivo {file_path}: {e}")
            time.sleep(check_interval)

    logger.warning(f"Arquivo {file_path} não estabilizou após {timeout}s (último tamanho: {last_size}). Continuando com o processamento.")

def split_direct_to_flac_chunks(original_file_path, chunk_duration=CHUNK_DURATION_SECONDS):
    logger.info(f"Iniciando split_direct_to_flac_chunks para: {original_file_path}")
    output_dir = os.path.dirname(original_file_path)
    base_name = os.path.basename(original_file_path)
    chunk_pattern = os.path.join(output_dir, f"{base_name}.chunk%03d.flac")

    cmd_segment = [
        "ffmpeg", "-y",
        "-i", original_file_path,
        "-vn",
        '-af', 'highpass=f=100,aresample=resampler=soxr:precision=28',
        "-c:a", "flac",
        "-compression_level", "5",
        "-ar", "16000", # Whisper foi treinado com áudio de 16kHz
        "-ac", "1",
        "-sample_fmt", "s16",
        "-f", "segment",
        "-segment_time", str(chunk_duration),
        "-segment_format", "flac",
        "-reset_timestamps", "1",
        chunk_pattern
    ]

    try:
        logger.info(f"Prestes a executar ffmpeg para segmentação: {' '.join(cmd_segment)}")
        run_ffmpeg_command(cmd_segment, "Divisão direta para chunks FLAC com segment muxer")
        logger.info(f"Comando ffmpeg para segmentação concluído.")
    except Exception as e:
        logger.error(f"Erro durante a execução do ffmpeg para segmentação: {e}")
        partial_chunks = [f for f in os.listdir(output_dir) if f.startswith(f"{base_name}.chunk") and f.endswith(".flac")]
        for chunk_file in partial_chunks:
            try:
                os.remove(os.path.join(output_dir, chunk_file))
            except OSError:
                pass
        raise RuntimeError(f"Falha na divisão direta para chunks FLAC: {e}")

    chunk_files = sorted([
        os.path.join(output_dir, f) for f in os.listdir(output_dir)
        if f.startswith(f"{base_name}.chunk") and f.endswith(".flac")
    ])

    if not chunk_files:
        logger.warning(f"Nenhum chunk FLAC foi gerado para {original_file_path}. Verifique logs do ffmpeg.")

    logger.info(f"Arquivo original dividido em {len(chunk_files)} chunks FLAC.")
    return chunk_files

def transcrever_chunk_com_groq(file_path: str) -> str:
    """Transcreve um único chunk de áudio via Groq (endpoint compatível com OpenAI).

    Levanta TranscriptionRateLimitError em caso de rate limit (429) persistente, e
    RuntimeError em outras falhas, para que o caller decida entre adiar (retry) ou
    marcar o documento como erro — nunca indexa conteúdo inválido.
    """
    logger.debug(f"Iniciando transcrição com Groq para: {file_path}")
    last_exception = None

    if not GROQ_API_KEY:
        logger.error("GROQ_API_KEY não configurada.")
        raise ValueError("GROQ_API_KEY não definida nas variáveis de ambiente.")

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Arquivo de áudio para transcrição não encontrado: {file_path}")

    headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
    data = {
        "model": GROQ_TRANSCRIPTION_MODEL,
        "response_format": "json",
        "temperature": "0",
    }
    if TRANSCRIPTION_LANGUAGE:
        data["language"] = TRANSCRIPTION_LANGUAGE

    retryable = False
    for attempt in range(1, MAX_RETRIES + 1):
        override_wait = None
        try:
            with open(file_path, "rb") as audio_file:
                files = {"file": (os.path.basename(file_path), audio_file, "audio/flac")}
                logger.debug(
                    f"Enviando chunk para Groq (tentativa {attempt}): {file_path}, modelo: {GROQ_TRANSCRIPTION_MODEL}"
                )
                response = requests.post(
                    GROQ_API_URL,
                    headers=headers,
                    data=data,
                    files=files,
                    timeout=120,  # chunk de ~5 MB transcreve em ~1,5s; 120s é folga e evita travar por minutos
                )

            response.raise_for_status()

            transcription_data = response.json()
            transcribed_text = (transcription_data.get("text") or "").strip()
            logger.debug(
                f"Transcrição Groq bem-sucedida para {file_path} (tentativa {attempt}). "
                f"Tamanho: {len(transcribed_text)} chars."
            )
            return transcribed_text

        except requests.exceptions.HTTPError as http_err:
            response_obj = http_err.response
            status_code = response_obj.status_code if response_obj is not None else 'N/A'
            error_content = response_obj.text if response_obj is not None else "Nenhum conteúdo de erro."
            logger.error(
                f"Erro HTTP da Groq (tentativa {attempt}, status: {status_code}): {http_err}. "
                f"Conteúdo: {error_content}"
            )
            last_exception = http_err

            # 429 (rate limit) e 5xx (erro de servidor) são transitórios → defer/retry;
            # respeitamos Retry-After se vier. Demais 4xx (400/401/403/413/415) são
            # definitivos (request/arquivo inválido) — repetir não adianta.
            if status_code == 429:
                retryable = True
                if response_obj is not None:
                    try:
                        override_wait = float(response_obj.headers.get("retry-after", 0)) or None
                    except (TypeError, ValueError):
                        override_wait = None
            elif isinstance(status_code, int) and status_code >= 500:
                retryable = True
            elif isinstance(status_code, int) and 400 <= status_code < 500:
                raise RuntimeError(
                    f"Erro HTTP {status_code} da Groq não recuperável: {error_content}"
                ) from http_err
        except requests.exceptions.RequestException as req_err:
            # timeout de leitura, conexão recusada, etc. — transitório → defer/retry
            logger.error(f"Erro de requisição à Groq (tentativa {attempt}): {req_err}")
            last_exception = req_err
            retryable = True
        except Exception as e:
            logger.error(
                f"Erro inesperado durante transcrição com Groq (tentativa {attempt}): {e}",
                exc_info=True,
            )
            last_exception = e

        if attempt < MAX_RETRIES:
            backoff = override_wait if override_wait else INITIAL_BACKOFF * (2 ** (attempt - 1))
            backoff = min(backoff, 120)
            logger.info(f"Aguardando {backoff:.1f}s antes da próxima tentativa para Groq ({file_path})...")
            time.sleep(backoff)
        else:
            error_message = (
                f"Falha na transcrição com Groq para {file_path} após {MAX_RETRIES} tentativas. "
                f"Último erro: {last_exception}"
            )
            logger.error(error_message)
            if retryable:
                raise TranscriptionRateLimitError(error_message) from last_exception
            raise RuntimeError(error_message) from last_exception

    raise RuntimeError(
        f"Falha inesperada na transcrição com Groq para {file_path}. Último erro: {last_exception}"
    )


def transcribe_audio(original_file_path):
    """Transcreve um arquivo de áudio/vídeo.

    Usa o serviço local faster-whisper (whisper.service) se WHISPER_SERVER_URL estiver
    setado — sem cota/API externa. Senão, cai no caminho Groq (chunking + resume).
    """
    if WHISPER_SERVER_URL:
        return _transcribe_audio_local(original_file_path)
    return _transcribe_audio_groq(original_file_path)


def _transcribe_audio_local(original_file_path):
    """Self-host: envia o arquivo inteiro ao whisper.service (faster-whisper decodifica
    o container via PyAV e cuida do áudio longo internamente — sem chunking aqui).

    Erros transitórios (serviço caído/reiniciando, 5xx, timeout) levantam
    TranscriptionRateLimitError → o doc volta a 'pending' e o retry job reprocessa.
    Erros permanentes (4xx, resultado vazio) levantam RuntimeError → 'error'.
    """
    logger.info(f"Iniciando transcrição local (faster-whisper) para: {original_file_path}")
    if not os.path.exists(original_file_path):
        raise FileNotFoundError(f"Arquivo original não encontrado para transcrição: {original_file_path}")
    wait_for_file_stability(original_file_path)
    url = WHISPER_SERVER_URL.rstrip("/") + "/transcribe"
    try:
        with open(original_file_path, "rb") as audio_file:
            files = {"file": (os.path.basename(original_file_path), audio_file, "application/octet-stream")}
            response = requests.post(url, files=files, timeout=WHISPER_REQUEST_TIMEOUT)
        response.raise_for_status()
    except requests.exceptions.HTTPError as http_err:
        sc = http_err.response.status_code if http_err.response is not None else None
        if sc and 400 <= sc < 500:
            raise RuntimeError(f"whisper.service erro {sc} (não recuperável): {http_err}") from http_err
        raise TranscriptionRateLimitError(f"whisper.service {sc} (transitório): {http_err}") from http_err
    except requests.exceptions.RequestException as req_err:
        # conexão recusada (serviço caído/subindo) ou timeout → transitório → defer/retry
        raise TranscriptionRateLimitError(f"whisper.service inacessível (transitório): {req_err}") from req_err

    texto = (response.json().get("text") or "").strip()
    if not texto:
        raise RuntimeError(f"whisper.service retornou transcrição vazia para {original_file_path}.")
    logger.info(f"Transcrição local concluída para {original_file_path}: {len(texto)} chars.")
    return texto


def _transcribe_audio_groq(original_file_path):
    logger.info(f"Iniciando transcrever_audio (Groq) para: {original_file_path}")
    all_transcripts = []
    chunk_files = []

    try:
        if not os.path.exists(original_file_path):
            logger.error(f"Arquivo original não encontrado em transcrever_audio (Groq): {original_file_path}")
            raise FileNotFoundError(f"Arquivo original não encontrado para transcrição: {original_file_path}")

        logger.info(f"Aguardando estabilidade do arquivo: {original_file_path}")
        wait_for_file_stability(original_file_path)
        logger.info(f"Verificação de estabilidade concluída. Chamando split_direct_to_flac_chunks.")
        chunk_files = split_direct_to_flac_chunks(original_file_path)
        logger.info(f"split_direct_to_flac_chunks retornou {len(chunk_files)} chunks.")

        if not chunk_files:
            logger.warning(f"Nenhum chunk gerado para {original_file_path}, não há o que transcrever.")
            if not os.path.exists(original_file_path):
                 logger.warning(f"O arquivo original {original_file_path} não existe mais ao verificar por que nenhum chunk foi gerado.")
            raise RuntimeError(f"Nenhum chunk de áudio foi gerado para {original_file_path}.")

        logger.info(f"Iniciando transcrição de {len(chunk_files)} chunks com Groq...")
        failed_chunks = 0
        for i, chunk_path in enumerate(chunk_files):
            logger.debug(f"Transcrevendo chunk {i+1}/{len(chunk_files)} com Groq: {chunk_path}")
            cache_path = chunk_path + ".txt"
            # Resume-on-retry: se este chunk já foi transcrito numa tentativa anterior
            # (cache em disco), reusa em vez de re-chamar a Groq — não re-queima cota.
            if os.path.exists(cache_path):
                try:
                    with open(cache_path, "r", encoding="utf-8") as cf:
                        all_transcripts.append(cf.read())
                    logger.info(f"Chunk {i+1}/{len(chunk_files)}: reusando transcrição em cache.")
                    continue
                except Exception as e_cache_read:
                    logger.warning(f"Cache do chunk {i+1} ilegível ({e_cache_read}); re-transcrevendo.")
            if not os.path.exists(chunk_path):
                logger.error(f"Chunk {chunk_path} não encontrado antes da transcrição. Pulando este chunk.")
                failed_chunks += 1
                continue
            # Espaça as requisições para ficar bem abaixo do rate limit da Groq — a rajada
            # de chunks em sequência fazia o free tier pendurar os últimos.
            if i > 0:
                time.sleep(INTER_CHUNK_DELAY)
            try:
                texto_chunk = transcrever_chunk_com_groq(chunk_path)
                if texto_chunk:
                    all_transcripts.append(texto_chunk)
                    # Persiste o transcript do chunk p/ resume numa retentativa futura.
                    try:
                        with open(cache_path, "w", encoding="utf-8") as cf:
                            cf.write(texto_chunk)
                    except Exception as e_cache_write:
                        logger.warning(f"Não foi possível cachear o chunk {i+1}: {e_cache_write}")
                logger.debug(f"Chunk {i+1} transcrito com sucesso via Groq.")
            except TranscriptionRateLimitError:
                # Transitório (rate limit/timeout): adia o documento. Os chunks já
                # transcritos ficam em cache (.txt) → a retentativa resume do que faltou,
                # sem re-queimar cota nos que já passaram.
                logger.warning(
                    f"Rate limit da Groq no chunk {i+1}/{len(chunk_files)} de {original_file_path}. "
                    f"Adiando; {len(all_transcripts)} chunk(s) já em cache para resume."
                )
                raise
            except Exception as e_transcribe:
                logger.error(f"Falha ao transcrever chunk {chunk_path} com Groq: {e_transcribe}")
                failed_chunks += 1

        # Se nenhum chunk produziu texto, a transcrição falhou de fato — propaga o erro
        # para o caller marcar o documento como 'error' em vez de indexar lixo no ChromaDB.
        if not all_transcripts:
            raise RuntimeError(
                f"Nenhum chunk pôde ser transcrito para {original_file_path} "
                f"({failed_chunks}/{len(chunk_files)} falharam)."
            )
        if failed_chunks:
            logger.warning(
                f"Transcrição parcial para {original_file_path}: "
                f"{failed_chunks}/{len(chunk_files)} chunks falharam."
            )

        logger.info("Concatenando transcrições dos chunks (Groq).")
        texto_completo = " ".join(all_transcripts)
        texto_final = remove_duplicate_lines(texto_completo)
        texto_final = normalize_transcript(texto_final)
        logger.info("Transcrição final (Groq) concatenada e normalizada.")
        # Sucesso total: remove os caches de chunk (.txt), não são mais necessários.
        for cf_path in (c + ".txt" for c in chunk_files):
            try:
                if os.path.exists(cf_path):
                    os.remove(cf_path)
            except OSError:
                pass
        return texto_final

    except Exception as e:
        logger.error(f"ERRO GERAL durante o processo de transcrição (Groq) em transcrever_audio: {e}", exc_info=True)
        raise

    finally:
        logger.info(f"Bloco finally de transcrever_audio (Groq) alcançado.")
        if chunk_files:
            logger.info(f"Limpando {len(chunk_files)} arquivos de chunk FLAC...")
            for chunk_path_to_delete in chunk_files:
                try:
                    if os.path.exists(chunk_path_to_delete):
                        os.remove(chunk_path_to_delete)
                        logger.debug(f"Chunk removido: {chunk_path_to_delete}")
                    else:
                        logger.warning(f"Tentativa de remover chunk inexistente: {chunk_path_to_delete}")
                except Exception as e_remove:
                    logger.warning(f"Não foi possível remover o chunk {chunk_path_to_delete}: {e_remove}")
        else:
            logger.info("Nenhum chunk file foi listado para limpeza (chunk_files está vazio).")
