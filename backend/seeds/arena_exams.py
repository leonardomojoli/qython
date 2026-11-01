"""Catálogo de concursos da Arena (ENAMED, USMLE, MIR...).

Ficava em backend/seed.py, um script manual que nem rodava mais (importava uma
sessão síncrona que saiu de database.py). Instalação nova abria a Arena sem
nenhum concurso para escolher. Agora o catálogo é semeado no boot, como os
medicamentos e os prompts do copiloto.

Diferente dos prompts, aqui entra "o que faltar": o catálogo é do projeto, o
usuário não edita nem apaga concursos, e um concurso novo nesta lista chega a
quem já tem o Qython instalado.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ArenaExam

# context_filename aponta para backend/exam_contexts/ (exam_generation_service).
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


async def seed_arena_exams(db: AsyncSession) -> int:
    """Insere os concursos que ainda não existem. Retorna quantos inseriu."""
    existing = set((await db.execute(select(ArenaExam.exam_code))).scalars().all())
    missing = [ArenaExam(**exam) for exam in INITIAL_EXAMS if exam["exam_code"] not in existing]
    if missing:
        db.add_all(missing)
        await db.commit()
    return len(missing)
