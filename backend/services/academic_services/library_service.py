# qython/backend/services/academic_services/library_service.py

import asyncio
import logging
import os
import re
import shutil
import time
import uuid
from typing import List, Optional

import magic
from fastapi import BackgroundTasks, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from werkzeug.utils import secure_filename

from ...database import AsyncSessionLocal
from ...models import AcademicDocument, AcademicLibrary, DocumentImage, User
from ...services.storage_service import check_storage_quota, check_library_limits, check_document_limits, update_storage_used
from ...services import connector_service
from ...services import cloud_storage
from ...services.cloud_storage import (
    CloudStorageError, CloudAuthRevoked, CloudQuotaExceeded,
    CloudFileNotFound, CloudTransientError,
)
from ...config import Config
from ...utils import UPLOAD_FOLDER, allowed_file
from . import file_processing_service, vector_db_service
from .transcription_service import TranscriptionRateLimitError

logger = logging.getLogger("qython_logger")

# Temps de write-through da Biblioteca (upload → Drive do usuário → descarte local).
# Subdiretório dedicado dentro de UPLOAD_FOLDER: o janitor de temp_upload varre só os
# ARQUIVOS da raiz (os.path.isfile pula subdirs), então nunca toca aqui — órfãos têm
# sweep próprio, age-gated e pulando docs ativos (ver scheduler).
LIBRARY_STAGING_FOLDER = os.path.join(Config.UPLOAD_FOLDER, 'library_staging')

# Cache EFÊMERO do original p/ o viewer de PDF (pdf.js precisa de Range requests, que o
# FileResponse serve a partir de um arquivo local). NÃO é retenção: é varrido por idade e
# a fonte durável continua sendo o Drive do usuário.
DRIVE_CACHE_FOLDER = os.path.join(Config.UPLOAD_FOLDER, 'drive_cache')
DRIVE_CACHE_TTL_SECONDS = 3600


# Heurística LOCAL (sem LLM) p/ sugerir um ícone Font Awesome pelo nome da biblioteca.
# Substitui a antiga chamada ao Gemini: escolher 1 de ~24 ícones é tarefa de keyword,
# não precisa de IA (custo + latência + dependência num caminho crítico de criação).
_ICON_KEYWORDS = [
    (("cardio", "coração", "coracao", "heart", "corazón", "corazon", "cardía", "cardia", "valvul", "coronar"), "heart-pulse"),
    (("neuro", "cérebro", "cerebro", "brain", "avc", "epileps", "demênc", "demenc", "parkinson"), "brain"),
    (("pneumo", "pulm", "lung", "respirat", "tórax", "torax", "asma", "dpoc"), "lungs"),
    (("orto", "osso", "ósse", "osse", "bone", "fratura", "hueso", "articul", "coluna"), "bone"),
    (("infecto", "vírus", "virus", "infecc", "microbi", "hiv", "sepse", "antibiót", "antibiot", "covid"), "virus"),
    (("farmac", "medicament", "fármaco", "farmaco", "posolog", "droga"), "pills"),
    (("pediatr", "criança", "crianca", "infantil", "neonat", "recém", "recem", "baby", "niño", "nino"), "baby"),
    (("gineco", "obstet", "gestaç", "gestac", "gravidez", "amament", "breastfeed", "materno", "puerpér", "puerper", "mir gineco"), "person-breastfeeding"),
    (("oftalmo", "olho", "ocular", "eye", "visão", "visao", "ojo", "retina", "glaucom", "catarat"), "eye"),
    (("odonto", "dent", "tooth", "bucal", "buco", "endodont", "ortodont"), "tooth"),
    (("otorrino", "ouvido", "auditiv", "audição", "audicao", "ear", "surdez"), "ear-listen"),
    (("radio", "raio", "x-ray", "imagem", "ressonânc", "ressonanc", "tomograf", "ultrassom", "ecograf"), "x-ray"),
    (("laborat", "patolog", "análise", "analise", "histolog", "citolog", "microbiolog", "hematolog"), "microscope"),
    (("genét", "genet", "dna", "genom", "molecular"), "dna"),
    (("vacin", "imuniz", "injeç", "injec"), "syringe"),
    (("cirurg", "surg", "operaç", "operac", "bisturi", "anestes"), "user-doctor"),
    (("emergênc", "emergenc", "urgênc", "urgenc", "emergency", "pronto-socorro", "pronto socorro", "uti", "intensiv", "trauma"), "star-of-life"),
    (("reumat", "muscul", "fisioter", "reabilit", "esport"), "person-running"),
    (("prontuár", "prontuar", "evoluç", "evoluc", "anamnese", "semiolog", "registro"), "notes-medical"),
    (("receita", "prescriç", "prescric", "prescription"), "file-prescription"),
    (("clínic", "clinic", "estetoscóp", "estetoscop", "consulta", "atenção primária", "atencao primaria", "atenção básica", "atencao basica", "esf", "pnab", "saúde da família", "saude da familia", "exame"), "stethoscope"),
    # Transversais (saúde coletiva/gestão e segurança/humanização) — depois das
    # especialidades clínicas, p/ que estas vençam quando presentes.
    (("gestão", "gestao", "administraç", "administrac", "política de saúde", "politica de saude", "financiament", "controle social", "planejament", "auditoria", "indicador"), "notes-medical"),
    (("humaniz", "acolhi", "segurança do paciente", "seguranca do paciente", "segurança", "seguranca", "biosseg", "biossegur", "proteç", "protec", "paramentaç", "paramentac", "qualidade assistencial"), "shield-heart"),
    # --- Áreas NÃO-clínicas / gerais (concursos cobrem todas as áreas). Vêm DEPOIS das
    # especialidades clínicas p/ que estas vençam na sobreposição (ex.: "história clínica" casa
    # "clínic"→stethoscope antes de "históri"→📜; "exame físico" casa "exame"→stethoscope antes
    # de "físic"→⚛️). Retornam EMOJI (não há ícone FA próprio); o campo `icon` aceita emoji.
    (("informát", "informat", "computaç", "computac", "programaç", "programac", "software", "hardware", "algoritm", "ciberseg", "banco de dados", "redes de comput", "código", "codigo", "python", "java"), "💻"),
    (("estatíst", "estatist", "probabilidad", "ciência de dados", "ciencia de dados", "análise de dados", "analise de dados"), "📊"),
    (("matemát", "matemat", "cálculo", "calculo", "álgebra", "algebra", "geometria", "aritmét", "aritmet", "trigonom", "raciocínio lógico", "raciocinio logico"), "🧮"),
    (("químic", "quimic", "bioquímic", "bioquimic"), "🧪"),
    (("físic", "fisic"), "⚛️"),
    (("biolog", "botân", "botan", "zoolog", "ecolog"), "🧬"),
    (("direito", "jurídic", "juridic", "legislaç", "legislac", "constituc", "penal", "tributár", "tributar", "processual", "administrativo"), "⚖️"),
    (("históri", "histor"), "📜"),
    (("geografi", "geopolít", "geopolit", "cartograf", "atualidad"), "🗺️"),
    (("filosof", "sociolog", "antropolog"), "🏛️"),
    (("portugu", "redaç", "redac", "gramát", "gramat", "literatura", "linguíst", "linguist", "interpretação de text", "interpretacao de text"), "📝"),
    (("inglês", "ingles", "espanhol", "francês", "frances", "idioma", "língua estrang", "lingua estrang"), "🔤"),
    (("economi", "finanç", "financ", "contábil", "contabil", "contabilidad", "mercado financ"), "💰"),
    (("marketing", "logíst", "logist", "empreend", "vendas"), "📈"),
    (("engenhar", "mecânic", "mecanic", "elétric", "eletric", "eletrôn", "eletron"), "⚙️"),
    (("arquitet", "urbanism", "construç civil", "construc civil"), "🏗️"),
    (("agronom", "agrícol", "agricol", "agropec", "zootec", "veterinár", "veterinar", "ambient"), "🌱"),
    (("arte", "música", "musica", "teatro", "desenho", "pintura", "design"), "🎨"),
    (("psicolog",), "🧠"),
    (("nutri", "dietét", "dietet", "aliment"), "🥗"),
    (("educaç", "educac", "pedagog", "didát", "didat", "ensino", "docên", "docen"), "🏫"),
    (("concurso", "edital", "vestibular", "enem", "oab", "simulado", "questões de prova", "questoes de prova"), "🎓"),
]


def suggest_icon_for_topic(name: str) -> str:
    """Heurística local (sem LLM): mapeia o nome da biblioteca p/ um ícone Font Awesome.

    Casa a keyword no INÍCIO de uma palavra (limite \\b), NÃO como substring solta —
    senão "osse" (de 'ósseo') casava dentro de "bi-osse-gurança" → osso, e curtas como
    "uti"/"esf" casariam dentro de outras palavras. Sem match → ícone neutro
    (book-medical), nunca um ícone aleatório.
    """
    n = (name or "").lower()
    for keywords, icon in _ICON_KEYWORDS:
        if any(re.search(r"\b" + re.escape(k), n) for k in keywords):
            return icon
    return "book-medical"


async def create_library(db: AsyncSession, name: str, description: Optional[str], user: User, icon: Optional[str] = None) -> AcademicLibrary:
    if not name or not name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O nome da biblioteca não pode ser vazio."
        )

    # Check library count limit for user's plan
    if not await check_library_limits(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você atingiu o limite de bibliotecas do seu plano. Faça upgrade para criar mais."
        )

    result = await db.execute(select(AcademicLibrary).filter_by(name=name, user_id=user.id))
    existing_library = result.scalars().first()
    
    if existing_library:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Você já possui uma biblioteca com o nome '{name}'."
        )

    # Ícone: usa o escolhido pelo usuário (nome FA ou emoji), senão a heurística local.
    chosen_icon = (icon or "").strip()
    library_icon = chosen_icon if chosen_icon else suggest_icon_for_topic(name)

    new_library = AcademicLibrary(
        name=name,
        description=description,
        user_id=user.id,
        icon=library_icon
    )
    db.add(new_library)
    await db.commit()
    await db.refresh(new_library)
    new_library.document_count = 0  # biblioteca recém-criada (p/ LibraryResponse.document_count)
    new_library.processing_count = 0
    logger.info(f"Biblioteca '{name}' (ícone: {library_icon}) criada para o usuário ID {user.id}.")
    return new_library


async def update_library(db: AsyncSession, library_id: int, user: User, name: Optional[str] = None, description: Optional[str] = None, icon: Optional[str] = None) -> AcademicLibrary:
    result = await db.execute(select(AcademicLibrary).filter_by(id=library_id, user_id=user.id))
    library = result.scalars().first()

    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Biblioteca não encontrada ou não pertence ao usuário."
        )

    if name is not None:
        name = name.strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O nome da biblioteca não pode ser vazio."
            )
        # Check for duplicate name (excluding current library)
        dup_result = await db.execute(
            select(AcademicLibrary).filter(
                AcademicLibrary.name == name,
                AcademicLibrary.user_id == user.id,
                AcademicLibrary.id != library_id
            )
        )
        if dup_result.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Você já possui uma biblioteca com o nome '{name}'."
            )
        library.name = name

    if description is not None:
        library.description = description if description.strip() else None

    if icon is not None:
        ic = icon.strip()
        library.icon = ic if ic else 'book-medical'

    await db.commit()
    await db.refresh(library)
    library.document_count = (await db.execute(
        select(func.count(AcademicDocument.id)).where(AcademicDocument.library_id == library_id)
    )).scalar_one()
    library.processing_count = (await db.execute(
        select(func.count(AcademicDocument.id)).where(
            AcademicDocument.library_id == library_id,
            AcademicDocument.status.in_(('pending', 'processing')),
        )
    )).scalar_one()
    logger.info(f"Biblioteca ID {library_id} atualizada pelo usuário ID {user.id}.")
    return library


async def get_user_libraries(db: AsyncSession, user: User) -> List[AcademicLibrary]:
    result = await db.execute(select(AcademicLibrary).filter_by(user_id=user.id).order_by(AcademicLibrary.name))
    libraries = result.scalars().all()
    # Contagens por biblioteca em 1 query (evita N+1), como atributos transitórios:
    # document_count (front trava geração em lib vazia) e processing_count (docs
    # pending/processing — o front avisa que a geração sairia sem eles).
    if libraries:
        counts_result = await db.execute(
            select(
                AcademicDocument.library_id,
                func.count(AcademicDocument.id),
                func.count(AcademicDocument.id).filter(AcademicDocument.status.in_(('pending', 'processing'))),
            )
            .where(AcademicDocument.library_id.in_([lib.id for lib in libraries]))
            .group_by(AcademicDocument.library_id)
        )
        counts = {lib_id: (total, proc) for lib_id, total, proc in counts_result.all()}
        for lib in libraries:
            total, proc = counts.get(lib.id, (0, 0))
            lib.document_count = total
            lib.processing_count = proc
    logger.debug(f"{len(libraries)} bibliotecas encontradas para o usuário ID {user.id}.")
    return libraries


async def get_library_documents(db: AsyncSession, user: User, library_id: int) -> List[AcademicDocument]:
    # Need to load documents relationship.
    result = await db.execute(
        select(AcademicLibrary)
        .filter_by(id=library_id, user_id=user.id)
        .options(selectinload(AcademicLibrary.documents))
    )
    library = result.scalars().first()
    
    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Biblioteca não encontrada ou não pertence ao usuário."
        )
    return sorted(library.documents, key=lambda doc: doc.created_at, reverse=True)


async def delete_library(db: AsyncSession, library_id: int, user: User) -> dict:
    result = await db.execute(
        select(AcademicLibrary)
        .filter_by(id=library_id, user_id=user.id)
        .options(selectinload(AcademicLibrary.documents))
    )
    library_to_delete = result.scalars().first()

    if not library_to_delete:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Biblioteca não encontrada ou não pertence ao usuário."
        )
    
    # Drop the whole ChromaDB collection in ONE op (best-effort). Per-document
    # get+delete loaded the HNSW index and was segfaulting the worker (502) under
    # concurrent multi-process access; delete_collection does not load the index.
    try:
        vector_db_service.delete_library_collection(library_id)
    except Exception as e:
        logger.error(
            f"Falha ao remover a coleção ChromaDB da biblioteca {library_id}; "
            f"seguindo com a exclusão: {e}"
        )

    # Remove the physical files for each document (vectors already dropped above).
    for document in library_to_delete.documents:
        # Original no Drive do usuário: lixeira só p/ o que criamos ('uploaded').
        if document.drive_file_id and document.drive_origin == 'uploaded':
            await _trash_drive_original(db, document)

        if document.storage_path and os.path.exists(document.storage_path):
            try:
                os.remove(document.storage_path)
            except OSError as e:
                logger.error(f"Erro ao remover arquivo físico {document.storage_path} durante exclusão de biblioteca: {e}")

        if document.thumbnail_url and os.path.exists(document.thumbnail_url):
            try:
                os.remove(document.thumbnail_url)
            except OSError as e:
                logger.error(f"Erro ao remover thumbnail {document.thumbnail_url} durante exclusão de biblioteca: {e}")

        # Clean up extracted document images directory
        doc_images_dir = os.path.join(Config.DOCUMENT_IMAGES_FOLDER, str(document.id))
        if os.path.isdir(doc_images_dir):
            try:
                shutil.rmtree(doc_images_dir)
            except OSError as e:
                logger.error(f"Erro ao remover imagens do documento {document.id}: {e}")

    # Total liberado só dos documentos LEGADOS (Drive-backed nunca entrou na quota).
    total_freed = sum(
        doc.file_size_bytes or 0
        for doc in library_to_delete.documents
        if doc.storage_provider != 'gdrive'
    )

    await db.delete(library_to_delete)
    await db.commit()

    # Decrement user's storage tracking
    if total_freed > 0:
        await update_storage_used(db, user, -total_freed)

    logger.info(f"Biblioteca ID {library_id} e seus conteúdos foram excluídos pelo usuário ID {user.id}. Storage freed: {total_freed} bytes.")
    return {"message": "Biblioteca excluída com sucesso."}


def _safe_remove(path: Optional[str]) -> None:
    """Remove um arquivo ignorando ausência/erro (best-effort)."""
    if not path:
        return
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError as e:
        logger.error(f"Falha ao remover arquivo {path}: {e}")


async def _resolve_owner_connection(db: AsyncSession, library_id: int):
    """Conexão de nuvem ATIVA do dono da biblioteca (ou None)."""
    result = await db.execute(select(AcademicLibrary.user_id).filter_by(id=library_id))
    row = result.first()
    if not row:
        return None
    return await connector_service.get_connection(db, row[0], 'gdrive')


async def _write_through_to_drive(db: AsyncSession, document: AcademicDocument, filepath: str) -> bool:
    """Sobe o original p/ o Drive do dono (pasta 'Qython') e grava `drive_file_id`.
    Em falha, seta `status`/`error_code` do documento e retorna False (o chamador aborta).
    Erro transitório volta o doc p/ 'pending' (o retry job re-tenta) — os demais são 'error'.
    """
    conn = await _resolve_owner_connection(db, document.library_id)
    if conn is None:
        document.status = 'error'
        document.error_code = 'cloud_not_connected'
        await db.commit()
        return False
    provider = cloud_storage.get_provider(conn.provider)
    try:
        access_token = await connector_service.get_access_token(db, conn)
        folder_id = await provider.ensure_root_folder(access_token, conn.root_folder_id)
        if folder_id != conn.root_folder_id:
            conn.root_folder_id = folder_id
            await db.commit()
        try:
            mime = magic.from_file(filepath, mime=True)
        except Exception:
            mime = None
        file_id = await provider.upload_file(
            access_token, folder_id, filepath, document.original_filename, mime
        )
        document.drive_file_id = file_id
        await db.commit()
        logger.info(f"[CONNECTOR] Doc {document.id} → Drive OK (file_id={file_id}).")
        return True
    except CloudQuotaExceeded:
        document.status = 'error'
        document.error_code = 'drive_quota_full'
        await db.commit()
        logger.warning(f"[CONNECTOR] Doc {document.id}: Drive do usuário cheio.")
        return False
    except CloudAuthRevoked:
        document.status = 'error'
        document.error_code = 'cloud_reauth_required'
        await db.commit()
        logger.warning(f"[CONNECTOR] Doc {document.id}: acesso ao Drive revogado.")
        return False
    except CloudTransientError as e:
        document.status = 'pending'
        document.error_code = 'drive_unavailable'
        await db.commit()
        logger.warning(f"[CONNECTOR] Doc {document.id}: Drive transitório no upload ({e}); adiado.")
        return False
    except CloudStorageError as e:
        document.status = 'error'
        document.error_code = 'drive_upload_failed'
        await db.commit()
        logger.error(f"[CONNECTOR] Doc {document.id}: falha no upload ao Drive: {e}")
        return False


async def _download_original_from_drive(db: AsyncSession, document: AcademicDocument) -> Optional[str]:
    """Re-baixa o original do Drive p/ um temp de staging (usado quando o temp local
    sumiu — reboot/limpeza — antes do processamento). Retorna o path, ou None em falha
    (com `status`/`error_code` já setados)."""
    conn = await _resolve_owner_connection(db, document.library_id)
    if conn is None:
        document.status = 'error'
        document.error_code = 'cloud_not_connected'
        await db.commit()
        return None
    provider = cloud_storage.get_provider(conn.provider)
    os.makedirs(LIBRARY_STAGING_FOLDER, exist_ok=True)
    ext = os.path.splitext(document.original_filename or '')[1]
    dest = os.path.join(LIBRARY_STAGING_FOLDER, f"{uuid.uuid4()}{ext}")
    try:
        access_token = await connector_service.get_access_token(db, conn)
        await provider.download_to_file(access_token, document.drive_file_id, dest)
        return dest
    except CloudFileNotFound:
        document.status = 'error'
        document.error_code = 'drive_file_missing'
        await db.commit()
        logger.warning(f"[CONNECTOR] Doc {document.id}: original ausente no Drive do usuário.")
        return None
    except CloudAuthRevoked:
        document.status = 'error'
        document.error_code = 'cloud_reauth_required'
        await db.commit()
        return None
    except CloudTransientError as e:
        document.status = 'pending'
        document.error_code = 'drive_unavailable'
        await db.commit()
        logger.warning(f"[CONNECTOR] Doc {document.id}: Drive transitório no download ({e}); adiado.")
        return None
    except CloudStorageError as e:
        document.status = 'error'
        document.error_code = 'drive_download_failed'
        await db.commit()
        logger.error(f"[CONNECTOR] Doc {document.id}: falha no download do Drive: {e}")
        return None


async def _trash_drive_original(db: AsyncSession, document: AcademicDocument) -> None:
    """Manda p/ a lixeira do Drive do usuário o original que NÓS criamos (best-effort).
    Nunca falha o delete: erro aqui só deixa o arquivo na nuvem do usuário, que pode
    removê-lo manualmente. NÃO deve ser chamado p/ `drive_origin='imported'`."""
    try:
        conn = await _resolve_owner_connection(db, document.library_id)
        if conn is None:
            return
        provider = cloud_storage.get_provider(conn.provider)
        access_token = await connector_service.get_access_token(db, conn)
        await provider.trash_file(access_token, document.drive_file_id)
        logger.info(f"[CONNECTOR] Original do doc {document.id} enviado à lixeira do Drive.")
    except CloudStorageError as e:
        logger.warning(f"[CONNECTOR] Não removi o original do doc {document.id} no Drive: {e}")


async def _process_document_task(document_id: int, filepath: str):
    # Background task must use its own session
    async with AsyncSessionLocal() as db:
        temp_files_to_clean = []

        try:
            result = await db.execute(select(AcademicDocument).filter_by(id=document_id))
            document = result.scalars().first()

            if not document:
                logger.error(f"Tarefa de background: Documento ID {document_id} não encontrado.")
                return 'not_found'

            is_drive = document.storage_provider == 'gdrive'

            # (1) Garante o original em disco. Se o temp sumiu (reboot/limpeza) mas já
            # está no Drive, re-baixa; sem cópia local e sem cópia no Drive → erro.
            if not filepath or not os.path.exists(filepath):
                if is_drive and document.drive_file_id:
                    filepath = await _download_original_from_drive(db, document)
                    if not filepath:
                        return document.status  # 'error' | 'pending' (setado no helper)
                else:
                    document.status = 'error'
                    document.error_code = 'original_missing'
                    await db.commit()
                    logger.error(f"Doc {document_id}: original ausente e sem cópia no Drive.")
                    return 'error'

            document.status = 'processing'
            document.error_code = None
            await db.commit()

            # (2) Write-through pro Drive ANTES de processar (só uploads nossos ainda sem
            # id). O Drive vira a fonte durável desde cedo; um retry re-baixa de lá.
            if is_drive and document.drive_origin == 'uploaded' and not document.drive_file_id:
                if not await _write_through_to_drive(db, document, filepath):
                    return document.status  # 'error' | 'pending' (setado no helper)

            ext = os.path.splitext(filepath)[1].lower().lstrip('.')
            doc_title = os.path.splitext(document.original_filename or "")[0].strip() or None

            os.makedirs(Config.THUMBNAIL_FOLDER, exist_ok=True)

            # pages = [(page_number, text), ...] p/ PDF/PPTX → metadata de página + contexto
            # no chunk (citação). None p/ áudio/docx/txt (chunk do texto inteiro).
            pages = None

            if ext in ('pdf', 'pptx'):
                # Thumbnail (blocking I/O → thread pool)
                thumbnail_relative_path = await asyncio.to_thread(file_processing_service.generate_thumbnail, filepath, document.id)
                if thumbnail_relative_path:
                    document.thumbnail_url = thumbnail_relative_path
                    document.thumbnail_filename = os.path.basename(thumbnail_relative_path)
                else:
                    document.thumbnail_url = None
                    document.thumbnail_filename = None
                    logger.warning(f"Nenhuma thumbnail pôde ser gerada para o documento {document.id}.")

                # Extração página a página: texto nativo (instantâneo) + OCR só nas páginas
                # escaneadas — PDF misto OK (antes era tudo-ou-nada pelo limiar global).
                if ext == 'pdf':
                    pages = await asyncio.to_thread(file_processing_service.extract_pages_from_pdf, filepath)
                else:
                    pages = await asyncio.to_thread(file_processing_service.extract_pages_from_pptx, filepath)
                document_text = "\n".join(t for _, t in (pages or [])).strip()
                logger.info(f"Documento ID {document.id}: {len(pages or [])} páginas/slides extraídos ({len(document_text)} chars).")
            else:
                document_text = await asyncio.to_thread(file_processing_service.get_input_data, filepath, ext)
                document.thumbnail_url = None
                document.thumbnail_filename = None

            # Indexação no ChromaDB (blocking I/O). pages/doc_title só são usados no RAG v2.
            await asyncio.to_thread(
                vector_db_service.process_and_store_document,
                document_text=document_text,
                library_id=document.library_id,
                document_id=document.id,
                pages=pages,
                doc_title=doc_title,
            )

            # Phase 1: Extract embedded images from PDF (non-blocking)
            if ext in ['pdf'] and os.path.exists(filepath):
                try:
                    image_output_dir = os.path.join(Config.DOCUMENT_IMAGES_FOLDER, str(document.id))
                    os.makedirs(image_output_dir, exist_ok=True)

                    image_results = await asyncio.to_thread(
                        file_processing_service.extract_images_from_pdf,
                        filepath, document.id, document.library_id, image_output_dir
                    )

                    if image_results:
                        for img_data in image_results:
                            db.add(DocumentImage(**img_data, vision_status='pending'))
                        await db.commit()
                        logger.info(f"Document {document_id}: {len(image_results)} images extracted, pending vision processing.")
                except Exception as img_err:
                    logger.error(f"Document {document_id}: Image extraction failed (non-blocking): {img_err}", exc_info=True)
                    # Don't fail the document — images are optional

            document.status = 'processed'
            document.error_code = None
            if is_drive:
                # Original agora vive no Drive do usuário — descarta a cópia local
                # (derivados no Chroma/thumbnail/imagens já foram persistidos acima).
                _safe_remove(filepath)
                document.storage_path = None
            await db.commit()
            logger.info(f"Tarefa de background: Documento ID {document_id} processado com sucesso.")
            return 'processed'

        except TranscriptionRateLimitError as e:
            # Rate limit transitório (ex.: Groq Whisper free tier). Não é falha
            # permanente: devolve para 'pending' (o frontend mostra "processando") e
            # o job scheduled_document_retry reprocessa quando a cota voltar.
            logger.warning(
                f"Tarefa de background: Documento ID {document_id} adiado por rate limit "
                f"de transcrição; será reprocessado pelo job de retentativa. Detalhe: {e}"
            )
            if 'document' in locals() and document:
                document.status = 'pending'
                await db.commit()
            return 'deferred'

        except Exception as e:
            logger.error(f"Tarefa de background: Falha ao processar documento ID {document_id}. Erro: {e}", exc_info=True)
            if 'document' in locals() and document:
                document.status = 'error'
                await db.commit()
            return 'error'
        finally:
            # db.close() is handled by context manager
            for temp_file in temp_files_to_clean:
                if os.path.exists(temp_file):
                    try:
                        os.remove(temp_file)
                    except OSError as e:
                        logger.error(f"Falha ao remover arquivo temporário {temp_file}: {e}")


async def handle_document_upload(db: AsyncSession, user: User, library_id: int, file: UploadFile, background_tasks: BackgroundTasks) -> AcademicDocument:
    result = await db.execute(select(AcademicLibrary).filter_by(id=library_id, user_id=user.id))
    library = result.scalars().first()
    
    if not library:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Biblioteca não encontrada.")

    if not allowed_file(file.filename):
        raise HTTPException(status_code=400, detail=f"Tipo de arquivo não permitido: {os.path.splitext(file.filename)[1]}")

    file_content = await file.read()
    if not file_content:
        raise HTTPException(status_code=400, detail="Arquivo enviado está vazio.")
    await file.seek(0)

    file_size = len(file_content)

    # Conexão de nuvem do usuário: com ela, o original vai pro Drive dele (write-through)
    # e não consome quota nossa; sem ela, cai no caminho legado server-side — salvo se o
    # gate estrutural (CLOUD_LIBRARY_REQUIRED) estiver ligado, quando a conexão é exigida.
    connection = await connector_service.get_connection(db, user.id, 'gdrive')
    use_drive = connection is not None

    if not use_drive and Config.CLOUD_LIBRARY_REQUIRED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "CLOUD_NOT_CONNECTED",
                    "message": "Conecte seu Google Drive para adicionar arquivos à Biblioteca."},
        )

    # Quotas/limites só valem no caminho legado (Drive-backed = sem limite de arquivos).
    if not use_drive:
        if not await check_storage_quota(db, user, file_size):
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Você atingiu o limite de armazenamento do seu plano. Faça upgrade ou remova arquivos."
            )
        if not await check_document_limits(db, user, library_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você atingiu o limite de documentos por biblioteca do seu plano."
            )

    mime_type = magic.from_buffer(file_content, mime=True)
    allowed_mimes = [
        'application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/m4a', 'video/mp4', 'video/x-msvideo', 'video/quicktime',
        'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/xml',
        'application/json', 'application/csv', 'application/xml',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if mime_type not in allowed_mimes:
        raise HTTPException(status_code=400, detail=f"Conteúdo de arquivo inválido detectado. Tipo: {mime_type}")

    original_filename_for_display = secure_filename(file.filename)
    file_ext = os.path.splitext(original_filename_for_display)[1]
    unique_filename_on_disk = f"{uuid.uuid4()}{file_ext}"
    
    if use_drive:
        # Temp de staging: enviado ao Drive e descartado pelo _process_document_task.
        os.makedirs(LIBRARY_STAGING_FOLDER, exist_ok=True)
        filepath = os.path.join(LIBRARY_STAGING_FOLDER, unique_filename_on_disk)
    else:
        os.makedirs(Config.PERMANENT_UPLOAD_FOLDER, exist_ok=True)
        filepath = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, unique_filename_on_disk)

    # Writing to file is blocking I/O. In a perfect world, use aiofiles.
    with open(filepath, "wb") as buffer:
        buffer.write(file_content)

    new_document = AcademicDocument(
        library_id=library_id,
        original_filename=original_filename_for_display,
        storage_path=filepath.replace("\\", "/"),
        file_size_bytes=file_size,
        status='pending',
        storage_provider='gdrive' if use_drive else None,
        drive_origin='uploaded' if use_drive else None,
    )
    db.add(new_document)
    await db.commit()
    await db.refresh(new_document)

    # Quota tracking só no caminho legado (Drive-backed não consome nossa quota).
    if not use_drive:
        await update_storage_used(db, user, file_size)

    background_tasks.add_task(_process_document_task, new_document.id, filepath)

    dest = "Drive do usuário" if use_drive else "servidor (legado)"
    logger.info(f"Upload de '{original_filename_for_display}' → biblioteca {library_id} agendado ({dest}). Disco: {unique_filename_on_disk}")
    return new_document


async def reindex_library_documents(library_id: int) -> dict:
    """
    Re-indexes all documents of a library into ChromaDB.

    This is useful when:
    - ChromaDB data was lost/corrupted
    - Documents were uploaded but indexing failed
    - Migration from another vector store

    Returns dict with reindex stats.
    """
    from ...database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        # Get library and its documents
        result = await db.execute(
            select(AcademicLibrary)
            .filter_by(id=library_id)
            .options(selectinload(AcademicLibrary.documents))
        )
        library = result.scalars().first()

        if not library:
            return {"error": f"Library {library_id} not found", "success": False}

        reindexed = 0
        failed = 0
        skipped = 0
        errors = []

        for document in library.documents:
            if document.status != 'processed':
                skipped += 1
                continue

            if not document.storage_path or not os.path.exists(document.storage_path):
                # Drive-backed: o original está na nuvem do usuário e o texto já vive no
                # Chroma — reindexar do original é redundante aqui; pula sem falhar.
                if document.drive_file_id:
                    skipped += 1
                    continue
                failed += 1
                errors.append(f"Doc {document.id}: File not found at {document.storage_path}")
                continue

            try:
                filepath = document.storage_path
                ext = os.path.splitext(filepath)[1].lower().lstrip('.')
                doc_title = os.path.splitext(document.original_filename or "")[0].strip() or None

                # Extração por página p/ PDF/PPTX (página + contexto no v2); demais tipos
                # caem em get_input_data (áudio re-transcreve, docx/txt leem direto).
                pages = None
                if ext == 'pdf':
                    pages = file_processing_service.extract_pages_from_pdf(filepath)
                    document_text = "\n".join(t for _, t in (pages or [])).strip()
                elif ext == 'pptx':
                    pages = file_processing_service.extract_pages_from_pptx(filepath)
                    document_text = "\n".join(t for _, t in (pages or [])).strip()
                else:
                    document_text = file_processing_service.get_input_data(filepath, ext)

                if document_text:
                    # Delete existing vectors first (if any)
                    try:
                        vector_db_service.delete_document_vectors(library_id, document.id)
                    except Exception:
                        pass  # Collection might not exist yet

                    # Re-index
                    vector_db_service.process_and_store_document(
                        document_text=document_text,
                        library_id=library_id,
                        document_id=document.id,
                        pages=pages,
                        doc_title=doc_title,
                    )
                    reindexed += 1
                    logger.info(f"Re-indexed document {document.id} for library {library_id}")
                else:
                    failed += 1
                    errors.append(f"Doc {document.id}: No text extracted")

            except Exception as e:
                failed += 1
                errors.append(f"Doc {document.id}: {str(e)}")
                logger.error(f"Error re-indexing document {document.id}: {e}", exc_info=True)

        return {
            "success": True,
            "library_id": library_id,
            "library_name": library.name,
            "total_documents": len(library.documents),
            "reindexed": reindexed,
            "failed": failed,
            "skipped": skipped,
            "errors": errors[:10]  # Limit errors returned
        }


async def retry_document_processing(db: AsyncSession, user: User, library_id: int, document_id: int, background_tasks: BackgroundTasks) -> AcademicDocument:
    result = await db.execute(
        select(AcademicDocument)
        .join(AcademicLibrary)
        .filter(
            AcademicLibrary.id == library_id,
            AcademicLibrary.user_id == user.id,
            AcademicDocument.id == document_id
        )
    )
    document = result.scalars().first()

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado.")

    if document.status != 'error':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Somente documentos com erro podem ser reprocessados.")

    # Reprocessável se o original está no disco OU no Drive (o process task re-baixa de lá).
    has_local = bool(document.storage_path) and os.path.exists(document.storage_path)
    has_drive = bool(document.drive_file_id)
    if not has_local and not has_drive:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo original não encontrado (nem local, nem na nuvem).")

    document.status = 'pending'
    document.error_code = None
    await db.commit()
    await db.refresh(document)

    background_tasks.add_task(_process_document_task, document.id, document.storage_path)
    logger.info(f"Reprocessamento do documento ID {document_id} agendado pelo usuário ID {user.id}.")
    return document


async def delete_document(db: AsyncSession, user: User, library_id: int, document_id: int) -> bool:
    result = await db.execute(
        select(AcademicDocument)
        .join(AcademicLibrary)
        .filter(
            AcademicLibrary.id == library_id,
            AcademicLibrary.user_id == user.id,
            AcademicDocument.id == document_id
        )
    )
    document = result.scalars().first()

    if not document:
        return False

    vector_db_service.delete_document_vectors(library_id=library_id, document_id=document_id)

    # Original na nuvem do usuário: só mandamos p/ a lixeira o que NÓS criamos
    # ('uploaded'); importados via Picker são do usuário e não tocamos no Drive dele.
    if document.drive_file_id and document.drive_origin == 'uploaded':
        await _trash_drive_original(db, document)

    if document.storage_path and os.path.exists(document.storage_path):
        try:
            os.remove(document.storage_path)
        except OSError as e:
            logger.error(f"Erro ao remover arquivo físico {document.storage_path}: {e}")

    if document.thumbnail_url and os.path.exists(document.thumbnail_url):
        try:
            os.remove(document.thumbnail_url)
        except OSError as e:
            logger.error(f"Erro ao remover thumbnail {document.thumbnail_url}: {e}")

    # Clean up extracted document images directory
    doc_images_dir = os.path.join(Config.DOCUMENT_IMAGES_FOLDER, str(document_id))
    if os.path.isdir(doc_images_dir):
        try:
            shutil.rmtree(doc_images_dir)
            logger.info(f"Removed document images directory: {doc_images_dir}")
        except OSError as e:
            logger.error(f"Erro ao remover diretório de imagens {doc_images_dir}: {e}")

    doc_size = document.file_size_bytes or 0
    # Só o caminho legado entrou na quota (Drive-backed não consome nossa quota).
    is_legacy = document.storage_provider != 'gdrive'

    await db.delete(document)
    await db.commit()

    # Decrement user's storage tracking (apenas docs legados)
    if doc_size > 0 and is_legacy:
        await update_storage_used(db, user, -doc_size)

    logger.info(f"Documento ID {document_id} excluído com sucesso pelo usuário ID {user.id}. Storage freed: {doc_size} bytes.")
    return True


async def get_drive_cached_file(db: AsyncSession, document: AcademicDocument) -> str:
    """Garante uma cópia local (cache efêmero) do original que está no Drive, p/ o viewer.
    Baixa se ausente/expirado e devolve o path (servido via FileResponse → Range p/ pdf.js).
    Levanta HTTPException mapeada quando o Drive não coopera."""
    if not document.drive_file_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail={"code": "DOCUMENT_NOT_READY", "message": "Documento ainda em processamento."})
    os.makedirs(DRIVE_CACHE_FOLDER, exist_ok=True)
    ext = os.path.splitext(document.original_filename or '')[1]
    cache_path = os.path.join(DRIVE_CACHE_FOLDER, f"{document.drive_file_id}{ext}")
    if os.path.exists(cache_path) and (time.time() - os.path.getmtime(cache_path)) < DRIVE_CACHE_TTL_SECONDS:
        return cache_path

    conn = await _resolve_owner_connection(db, document.library_id)
    if conn is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail={"code": "CLOUD_REAUTH_REQUIRED", "message": "Reconecte seu Google Drive."})
    provider = cloud_storage.get_provider(conn.provider)
    try:
        access_token = await connector_service.get_access_token(db, conn)
        await provider.download_to_file(access_token, document.drive_file_id, cache_path)
        return cache_path
    except CloudFileNotFound:
        raise HTTPException(status_code=status.HTTP_410_GONE,
                            detail={"code": "DRIVE_FILE_MISSING", "message": "O arquivo foi removido do seu Google Drive."})
    except CloudAuthRevoked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail={"code": "CLOUD_REAUTH_REQUIRED", "message": "Reconecte seu Google Drive."})
    except CloudStorageError as e:
        logger.error(f"[CONNECTOR] Viewer: falha ao baixar doc {document.id} do Drive: {e}")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Google Drive indisponível no momento.")


async def handle_document_import_from_drive(
    db: AsyncSession, user: User, library_id: int, file_ids: List[str], background_tasks: BackgroundTasks
) -> List[AcademicDocument]:
    """Importa arquivos que o usuário JÁ tem no Drive (escolhidos via Picker). Baixa cada
    um p/ staging e processa como qualquer doc — mas com `drive_origin='imported'`: o
    `drive_file_id` é o do arquivo original do usuário e NUNCA fazemos write-back nem o
    mandamos p/ a lixeira no delete (é dele, não nosso)."""
    result = await db.execute(select(AcademicLibrary).filter_by(id=library_id, user_id=user.id))
    library = result.scalars().first()
    if not library:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Biblioteca não encontrada.")

    conn = await connector_service.get_connection(db, user.id, 'gdrive')
    if conn is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail={"code": "CLOUD_NOT_CONNECTED", "message": "Conecte seu Google Drive para importar."})

    provider = cloud_storage.get_provider(conn.provider)
    try:
        access_token = await connector_service.get_access_token(db, conn)
    except CloudAuthRevoked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail={"code": "CLOUD_REAUTH_REQUIRED", "message": "Reconecte seu Google Drive."})

    os.makedirs(LIBRARY_STAGING_FOLDER, exist_ok=True)
    created: List[AcademicDocument] = []
    for file_id in file_ids:
        try:
            meta = await provider.get_metadata(access_token, file_id)
        except CloudStorageError as e:
            logger.warning(f"[CONNECTOR] Import: metadata falhou p/ {file_id}: {e}")
            continue
        name = meta.get('name') or str(file_id)
        if not allowed_file(name):
            logger.warning(f"[CONNECTOR] Import: tipo não permitido, pulado: {name}")
            continue
        ext = os.path.splitext(name)[1]
        temp_path = os.path.join(LIBRARY_STAGING_FOLDER, f"{uuid.uuid4()}{ext}")
        try:
            await provider.download_to_file(access_token, file_id, temp_path)
        except CloudStorageError as e:
            logger.error(f"[CONNECTOR] Import: download falhou p/ {file_id}: {e}")
            _safe_remove(temp_path)
            continue

        doc = AcademicDocument(
            library_id=library_id,
            original_filename=secure_filename(name),
            storage_path=temp_path.replace("\\", "/"),
            file_size_bytes=meta.get('size'),
            status='pending',
            storage_provider='gdrive',
            drive_origin='imported',
            drive_file_id=file_id,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        background_tasks.add_task(_process_document_task, doc.id, temp_path)
        created.append(doc)

    return created


async def migrate_user_legacy_docs(user_id: int) -> dict:
    """Migra os documentos LEGADOS (server-side) de um usuário para o Drive dele.
    Chamado no pós-connect (connector_service.schedule_legacy_migration) e pelo script
    batch. Idempotente: só toca docs `storage_provider IS NULL` com arquivo local.

    O doc só é alterado APÓS o upload dar certo (sem estado híbrido). NÃO toca Chroma
    nem thumbnail — o texto já está indexado; só o ORIGINAL muda de lugar."""
    from ...services.storage_service import update_storage_used

    migrated = skipped = failed = 0
    async with AsyncSessionLocal() as db:
        conn = await connector_service.get_connection(db, user_id, 'gdrive')
        if conn is None:
            return {"error": "no_connection", "migrated": 0, "skipped": 0, "failed": 0}

        result = await db.execute(
            select(AcademicDocument).join(AcademicLibrary).filter(
                AcademicLibrary.user_id == user_id,
                AcademicDocument.storage_provider.is_(None),
                AcademicDocument.storage_path.isnot(None),
            )
        )
        docs = result.scalars().all()
        provider = cloud_storage.get_provider(conn.provider)

        user = (await db.execute(select(User).filter_by(id=user_id))).scalars().first()

        for doc in docs:
            local_path = doc.storage_path
            if not local_path or not os.path.exists(local_path):
                skipped += 1
                continue
            try:
                access_token = await connector_service.get_access_token(db, conn)
                folder_id = await provider.ensure_root_folder(access_token, conn.root_folder_id)
                if folder_id != conn.root_folder_id:
                    conn.root_folder_id = folder_id
                    await db.commit()
                try:
                    mime = magic.from_file(local_path, mime=True)
                except Exception:
                    mime = None
                file_id = await provider.upload_file(
                    access_token, folder_id, local_path, doc.original_filename, mime
                )
            except CloudStorageError as e:
                logger.error(f"[MIGRATE] Doc {doc.id}: upload ao Drive falhou: {e}")
                failed += 1
                continue

            # Sucesso: agora sim vira Drive-backed e descarta o original local.
            size = doc.file_size_bytes or 0
            doc.drive_file_id = file_id
            doc.storage_provider = 'gdrive'
            doc.drive_origin = 'uploaded'
            doc.storage_path = None
            await db.commit()
            _safe_remove(local_path)
            if size > 0 and user:
                await update_storage_used(db, user, -size)
            migrated += 1

    logger.info(f"[MIGRATE] user {user_id}: migrados={migrated} pulados={skipped} falhas={failed}")
    return {"migrated": migrated, "skipped": skipped, "failed": failed}
