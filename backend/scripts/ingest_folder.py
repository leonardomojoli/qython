"""Ingere uma pasta local de arquivos numa biblioteca do usuário.

Reusa o caminho de produção — cria os AcademicDocument como o upload faria e roda
`_process_document_task` de forma SÍNCRONA (não em background), de modo que a falha
de qualquer arquivo apareça na saída em vez de sumir num log. Respeita o fluxo
Drive-first: com conexão de nuvem ativa o original vai para o Drive do usuário e o
temp de staging é descartado; sem conexão, cai no caminho legado server-side.

Idempotente: pula arquivo cujo `original_filename` já existe na biblioteca, então
re-rodar depois de acrescentar arquivos na pasta ingere só os novos.

Uso (a partir de /opt/qython, com o venv):
    python -m backend.scripts.ingest_folder --user 2 --lib "Nome" --dir /caminho
    python -m backend.scripts.ingest_folder --user 2 --lib "Nome" --dir /caminho --execute

Sem `--execute` é dry-run: mostra o que criaria e o que subiria, sem tocar em nada.
A biblioteca é criada se não existir; se existir (mesmo nome, mesmo dono), é reusada.
"""
import argparse
import asyncio
import os
import shutil
import sys
import uuid

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)

from sqlalchemy.future import select  # noqa: E402
from werkzeug.utils import secure_filename  # noqa: E402

from backend.database import AsyncSessionLocal  # noqa: E402
from backend.models import AcademicDocument, AcademicLibrary, User  # noqa: E402
from backend.services import connector_service  # noqa: E402
from backend.services.academic_services import library_service  # noqa: E402
from backend.utils import allowed_file  # noqa: E402

LIBRARY_STAGING_FOLDER = library_service.LIBRARY_STAGING_FOLDER

# _process_document_task devolve o status final do documento; 'processed' é o sucesso.
STATUS_OK = 'processed'


async def _get_or_create_library(db, user, name, icon, description, execute):
    existente = (await db.execute(
        select(AcademicLibrary).filter_by(name=name, user_id=user.id)
    )).scalars().first()
    if existente:
        print(f"  biblioteca já existe: id={existente.id}")
        return existente
    if not execute:
        print(f"  [dry-run] criaria a biblioteca {name!r}")
        return None
    lib = await library_service.create_library(
        db=db, name=name, description=description, user=user, icon=icon
    )
    print(f"  biblioteca criada: id={lib.id}")
    return lib


async def ingest(user_id, lib_name, icon, description, directory, execute):
    if not os.path.isdir(directory):
        sys.exit(f"pasta não encontrada: {directory}")

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).filter_by(id=user_id))).scalars().first()
        if not user:
            sys.exit(f"usuário {user_id} não encontrado")

        print(f"\n=== {lib_name} (user {user.id}: {user.email}) ===")
        lib = await _get_or_create_library(db, user, lib_name, icon, description, execute)

        arquivos = sorted(
            f for f in os.listdir(directory)
            if os.path.isfile(os.path.join(directory, f)) and allowed_file(f)
        )
        if not arquivos:
            print("  nenhum arquivo elegível na pasta")
            return

        ja_existem = set()
        if lib:
            ja_existem = {
                d.original_filename for d in (await db.execute(
                    select(AcademicDocument).filter_by(library_id=lib.id)
                )).scalars().all()
            }

        connection = await connector_service.get_connection(db, user.id, 'gdrive')
        destino = "Drive do usuário" if connection else "servidor (legado)"
        print(f"  {len(arquivos)} arquivo(s) · destino do original: {destino}")

        pendentes = []
        for nome in arquivos:
            display = secure_filename(nome)
            if display in ja_existem:
                print(f"    · já na biblioteca, pulando: {display}")
                continue
            pendentes.append((nome, display))

        if not execute:
            for _, display in pendentes:
                print(f"    [dry-run] subiria: {display}")
            print(f"  [dry-run] {len(pendentes)} arquivo(s) seriam ingeridos")
            return

        os.makedirs(LIBRARY_STAGING_FOLDER, exist_ok=True)
        ok, falhou = 0, 0

        for nome, display in pendentes:
            origem = os.path.join(directory, nome)
            tamanho = os.path.getsize(origem)
            ext = os.path.splitext(display)[1]
            staging = os.path.join(LIBRARY_STAGING_FOLDER, f"{uuid.uuid4()}{ext}")
            shutil.copyfile(origem, staging)

            doc = AcademicDocument(
                library_id=lib.id,
                original_filename=display,
                storage_path=staging.replace("\\", "/"),
                file_size_bytes=tamanho,
                status='pending',
                storage_provider='gdrive' if connection else None,
                drive_origin='uploaded' if connection else None,
            )
            db.add(doc)
            await db.commit()
            await db.refresh(doc)

            resultado = await library_service._process_document_task(doc.id, staging)
            if resultado == STATUS_OK:
                ok += 1
                print(f"    ✓ {display}")
            else:
                falhou += 1
                await db.refresh(doc)
                print(f"    ✗ {display} → status={resultado} erro={doc.error_code}")

        print(f"  resultado: {ok} indexado(s), {falhou} com erro")


async def main():
    p = argparse.ArgumentParser(description="Ingere uma pasta local numa biblioteca.")
    p.add_argument("--user", type=int, required=True, help="id do usuário dono da biblioteca")
    p.add_argument("--lib", required=True, help="nome da biblioteca (criada se não existir)")
    p.add_argument("--dir", required=True, help="pasta local com os arquivos")
    p.add_argument("--icon", default=None, help="ícone da biblioteca (emoji), só na criação")
    p.add_argument("--desc", default=None, help="descrição da biblioteca, só na criação")
    p.add_argument("--execute", action="store_true", help="sem esta flag, é dry-run")
    a = p.parse_args()
    await ingest(a.user, a.lib, a.icon, a.desc, a.dir, a.execute)


if __name__ == "__main__":
    asyncio.run(main())
