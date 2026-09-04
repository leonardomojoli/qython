"""Migra documentos LEGADOS (server-side) da Biblioteca para o Drive do dono.

Usa library_service.migrate_user_legacy_docs (idempotente, só toca docs
storage_provider IS NULL com arquivo local; sobe o original pro Drive do usuário,
apaga a cópia local, storage_path=NULL; NÃO toca Chroma/thumbnail).

Uso (a partir de /opt/qython, com o venv):
    python -m backend.scripts.migrate_docs_to_drive                 # dry-run (todos)
    python -m backend.scripts.migrate_docs_to_drive --user 2        # dry-run do user 2
    python -m backend.scripts.migrate_docs_to_drive --user 2 --execute
    python -m backend.scripts.migrate_docs_to_drive --all --execute # todos com conexão ativa

Só migra docs de usuários com conexão de nuvem ATIVA (sem Drive não há destino).
"""
import argparse
import asyncio
import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)

from sqlalchemy.future import select  # noqa: E402
from backend.database import AsyncSessionLocal  # noqa: E402
from backend.models import AcademicDocument, AcademicLibrary, UserCloudConnection  # noqa: E402
from backend.services.academic_services.library_service import migrate_user_legacy_docs  # noqa: E402


async def _survey(user_id=None):
    """Conta docs legados por usuário e quem tem conexão ativa."""
    async with AsyncSessionLocal() as db:
        stmt = select(AcademicLibrary.user_id).select_from(AcademicDocument).join(AcademicLibrary).filter(
            AcademicDocument.storage_provider.is_(None),
            AcademicDocument.storage_path.isnot(None),
        )
        if user_id:
            stmt = stmt.filter(AcademicLibrary.user_id == user_id)
        rows = (await db.execute(stmt)).all()
        by_user = {}
        for (uid,) in rows:
            by_user[uid] = by_user.get(uid, 0) + 1

        conns = {
            c.user_id for c in (await db.execute(
                select(UserCloudConnection).filter(UserCloudConnection.status == 'active')
            )).scalars().all()
        }
    return by_user, conns


def _print_survey(by_user, conns):
    print("=== Docs legados por usuário ===")
    if not by_user:
        print("  (nenhum documento legado a migrar)")
    for uid, count in sorted(by_user.items()):
        tag = "TEM conexão ativa" if uid in conns else "SEM conexão (não migra)"
        print(f"  user {uid}: {count} docs legados — {tag}")


async def dry_run(user_id=None):
    by_user, conns = await _survey(user_id)
    _print_survey(by_user, conns)
    print("\n[DRY RUN] Nada foi migrado. Use --execute para executar.")


async def run(user_id=None, all_users=False):
    by_user, conns = await _survey(user_id)
    _print_survey(by_user, conns)
    if user_id:
        targets = [user_id] if user_id in conns else []
    elif all_users:
        targets = sorted(u for u in by_user if u in conns)
    else:
        targets = []
    print(f"\n=== Executando migração para {len(targets)} usuário(s) ===")
    for uid in targets:
        res = await migrate_user_legacy_docs(uid)
        print(f"  user {uid}: {res}")


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description="Migra docs legados da Biblioteca para o Drive do dono.")
    ap.add_argument('--user', type=int, help='migrar só este user_id')
    ap.add_argument('--all', action='store_true', help='migrar todos os usuários com conexão ativa')
    ap.add_argument('--execute', action='store_true', help='executa de fato (sem isto = dry-run)')
    args = ap.parse_args()

    if not args.execute:
        asyncio.run(dry_run(args.user))
    elif not args.user and not args.all:
        print("Especifique --user <id> ou --all junto com --execute.")
    else:
        asyncio.run(run(user_id=args.user, all_users=args.all))
