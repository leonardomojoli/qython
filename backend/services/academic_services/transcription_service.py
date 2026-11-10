# transcription_service.py
"""Transcrição de áudio e vídeo da biblioteca, pelo faster-whisper local (whisper.service).

O Qython roda só com IA local: o arquivo vai ao serviço de transcrição da própria instalação
(WHISPER_SERVER_URL; o app desktop sobe o whisper sob demanda, o docker compose tem o serviço
`whisper`). Não há serviço de transcrição em nuvem.
"""

import os
import time
import logging
import requests  # Para chamadas HTTP ao serviço local

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

# --- Serviço local (faster-whisper, large-v3-turbo) ---
WHISPER_SERVER_URL = os.getenv("WHISPER_SERVER_URL", "").strip()
WHISPER_REQUEST_TIMEOUT = int(os.getenv("WHISPER_REQUEST_TIMEOUT", "5400"))  # 1.5h p/ áudios longos
if not WHISPER_SERVER_URL:
    logger.warning("Transcrição sem destino: defina WHISPER_SERVER_URL (o serviço whisper local).")


class TranscriptionTransientError(RuntimeError):
    """Erro transitório do serviço de transcrição: serviço fora do ar ou subindo, erro de
    servidor (5xx), timeout ou falha de conexão.

    Sinaliza ao caller que o documento deve ser reprocessado depois (defer), em vez
    de ser marcado como erro permanente. O job scheduled_document_retry retoma quando
    o serviço voltar.
    """
    pass


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



def transcribe_audio(original_file_path):
    """Transcreve um arquivo de áudio/vídeo pelo serviço local faster-whisper.

    Sem WHISPER_SERVER_URL não há para onde mandar: erro permanente, com a causa dita.
    """
    if not WHISPER_SERVER_URL:
        raise RuntimeError("Transcrição indisponível: defina WHISPER_SERVER_URL (o serviço whisper local).")
    return _transcribe_audio_local(original_file_path)


def _transcribe_audio_local(original_file_path):
    """Self-host: envia o arquivo inteiro ao whisper.service (faster-whisper decodifica
    o container via PyAV e cuida do áudio longo internamente — sem chunking aqui).

    Erros transitórios (serviço caído/reiniciando, 5xx, timeout) levantam
    TranscriptionTransientError → o doc volta a 'pending' e o retry job reprocessa.
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
        raise TranscriptionTransientError(f"whisper.service {sc} (transitório): {http_err}") from http_err
    except requests.exceptions.RequestException as req_err:
        # conexão recusada (serviço caído/subindo) ou timeout → transitório → defer/retry
        raise TranscriptionTransientError(f"whisper.service inacessível (transitório): {req_err}") from req_err

    texto = (response.json().get("text") or "").strip()
    if not texto:
        raise RuntimeError(f"whisper.service retornou transcrição vazia para {original_file_path}.")
    logger.info(f"Transcrição local concluída para {original_file_path}: {len(texto)} chars.")
    return texto
