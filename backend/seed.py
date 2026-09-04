# /opt/qython/backend/seed.py

import logging
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from .database import SessionLocal, engine
from .models import ArenaExam, Base

# Configuração básica de logging para vermos o que está acontecendo
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- LISTA COMPLETA DE EXAMES COM CHAVES DE TRADUÇÃO ---
# Esta é a "fonte da verdade". Adicione novos exames aqui no futuro.
INITIAL_EXAMS = [
    {
        "exam_code": "ENAMED_BR",
        "title_key": "exam_title_enamed",
        "description_key": "exam_desc_enamed",
        "country": "Brasil",
        "flag": "🇧🇷",
        "language": "pt-BR",
        "context_filename": "enamed_exam_context.txt"
    },
    {
        "exam_code": "USMLE_STEP1_US",
        "title_key": "exam_title_usmle",
        "description_key": "exam_desc_usmle",
        "country": "Estados Unidos",
        "flag": "🇺🇸",
        "language": "en-US",
        "context_filename": "usmle_step1_context.txt"
    },
    {
        "exam_code": "MIR_ES",
        "title_key": "exam_title_mir",
        "description_key": "exam_desc_mir",
        "country": "Espanha",
        "flag": "🇪🇸",
        "language": "es-ES",
        "context_filename": "mir_exam_context.txt"
    },
    {
        "exam_code": "AMC_CAT_MCQ_AU",
        "title_key": "exam_title_amc",
        "description_key": "exam_desc_amc",
        "country": "Austrália",
        "flag": "🇦🇺",
        "language": "en-AU",
        "context_filename": "amc_cat_mcq_context.txt"
    },
    {
        "exam_code": "MCCQE_PART1_CA",
        "title_key": "exam_title_mccqe",
        "description_key": "exam_desc_mccqe",
        "country": "Canadá",
        "flag": "🇨🇦",
        "language": "en-CA",
        "context_filename": "mccqe_part1_context.txt"
    },
    {
        "exam_code": "SSM_IT",
        "title_key": "exam_title_ssm",
        "description_key": "exam_desc_ssm",
        "country": "Itália",
        "flag": "🇮🇹",
        "language": "it-IT",
        "context_filename": "ssm_exam_context.txt"
    },
    {
        "exam_code": "RESIDENCIA_UY",
        "title_key": "exam_title_residencia_uy",
        "description_key": "exam_desc_residencia_uy",
        "country": "Uruguai",
        "flag": "🇺🇾",
        "language": "es-UY",
        "context_filename": "uruguay_residencia_context.txt"
    }
]

def seed_exams():
    """
    Popula a tabela arena_exams com dados, adicionando apenas os exames que não existem.
    É seguro executar este script múltiplas vezes.
    """
    db = SessionLocal()
    try:
        logger.info("Iniciando o processo de seeding para a tabela 'arena_exams'...")
        
        # Busca todos os códigos de exame que já existem no banco
        existing_codes_tuples = db.query(ArenaExam.exam_code).all()
        existing_codes = {code[0] for code in existing_codes_tuples}
        logger.info(f"Exames já existentes no banco: {existing_codes if existing_codes else 'Nenhum'}")

        exams_to_add = []
        for exam_data in INITIAL_EXAMS:
            # Verifica se o exame da lista já existe no banco de dados
            if exam_data["exam_code"] not in existing_codes:
                exams_to_add.append(ArenaExam(**exam_data))
                logger.info(f"Preparando para adicionar o novo exame: {exam_data['exam_code']}")

        if not exams_to_add:
            logger.info("Nenhum exame novo para adicionar. O banco de dados já está atualizado com a lista atual.")
            return

        db.add_all(exams_to_add)
        db.commit()
        logger.info(f"SUCESSO: {len(exams_to_add)} novo(s) exame(s) foram adicionados ao banco de dados.")

    except Exception as e:
        logger.error(f"ERRO: Ocorreu um erro ao popular o banco de dados: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()
        logger.info("Sessão do banco de dados fechada.")

if __name__ == "__main__":
    logger.info("Verificando se a estrutura de tabelas está atualizada antes de popular...")
    # Garante que a tabela exista antes de tentar inserir dados.
    Base.metadata.create_all(bind=engine)
    logger.info("Estrutura de tabelas verificada. Iniciando o script de seeding...")
    seed_exams()