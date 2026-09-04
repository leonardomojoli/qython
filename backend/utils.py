# qython/backend/utils.py

import os
import logging
from .config import Config

# Configurar logging
logger = logging.getLogger(__name__)

# Definições globais para upload de fotos de perfil (movidas de routes.py)
UPLOAD_FOLDER_PROFILE = Config.UPLOAD_FOLDER_PROFILE
UPLOAD_FOLDER_DOCTOR_LOGOS = Config.UPLOAD_FOLDER_DOCTOR_LOGOS
ALLOWED_EXTENSIONS_PROFILE = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

os.makedirs(UPLOAD_FOLDER_PROFILE, exist_ok=True)
os.makedirs(UPLOAD_FOLDER_DOCTOR_LOGOS, exist_ok=True)

def allowed_file_profile(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS_PROFILE

# Definições globais para upload de arquivos (movidas de routes.py)
UPLOAD_FOLDER = Config.UPLOAD_FOLDER
THUMBNAIL_FOLDER = Config.THUMBNAIL_FOLDER
ALLOWED_EXTENSIONS = {'mp3', 'wav', 'm4a', 'pdf', 'pptx', 'mp4', 'avi', 'mov', 'txt', 'md', 'csv', 'docx', 'html'}

# CORREÇÃO: Cria os diretórios de forma segura, evitando erros se eles já existirem.
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(THUMBNAIL_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

logger.info("Utilitários gerais inicializados")