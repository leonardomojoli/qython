"""Prepara o banco antes de a aplicação subir.

Existem dois caminhos, e escolher o errado quebra a instalação:

**Banco já existente** (tem `alembic_version`): aplica as migrations pendentes
com `alembic upgrade head`, preservando os dados. É o caminho de quem atualiza.

**Banco novo** (vazio): cria o schema direto dos modelos SQLAlchemy e marca o
Alembic como já estando no head, SEM replayar a cadeia.

O segundo caminho não é atalho — é necessidade. A migration inicial
(`b55e0451ef24`) foi autogerada como *snapshot* de um banco de produção que já
tinha história anterior, feita com yoyo-migrations. O snapshot capturou o
schema **daquele momento**, enquanto migrations posteriores continuam operando
sobre o schema **anterior** a ele: derrubam colunas que o snapshot nunca criou
(`invitations.user_id`, `invitations.filename`) e constraints que nunca
existiram (`invitations_user_id_fkey`), além das tabelas do próprio yoyo.

Em produção isso nunca apareceu, porque lá o banco tinha mesmo aquelas colunas.
Num banco limpo a cadeia falha — ou seja, ela nunca foi executável do zero.
Reescrever 96 migrations históricas para consertar isso seria arriscado e sem
retorno: o estado final que elas produzem é, por definição, o dos modelos.
"""

import logging
import os
import sys

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

# Permite `python -m backend.bootstrap_db` e execução direta.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config import Config as AppConfig  # noqa: E402
from backend.db_base import Base  # noqa: E402
from backend import models  # noqa: F401,E402  (registra os 66 modelos em Base.metadata)

logging.basicConfig(level=logging.INFO, format="%(levelname)s | bootstrap_db | %(message)s")
logger = logging.getLogger(__name__)

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))


def _alembic_config() -> Config:
    """Config do Alembic com script_location absoluto.

    O alembic.ini traz `script_location = alembic`, relativo ao diretório de
    trabalho. Resolvendo para caminho absoluto, este script roda de qualquer
    lugar sem depender de um `cd` prévio.
    """
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    return cfg


def main() -> int:
    url = AppConfig.SQLALCHEMY_DATABASE_URI
    if not url:
        logger.error("DATABASE_URL não definida.")
        return 1
    if "+asyncpg" in url:
        # As migrations rodam em engine SÍNCRONA; o driver async falha aqui com
        # MissingGreenlet. Quem converte para asyncpg é backend/database.py.
        logger.error("DATABASE_URL deve usar o driver síncrono (postgresql://), não asyncpg.")
        return 1

    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            tabelas = set(inspect(conn).get_table_names())
    except Exception as exc:
        logger.error("Sem conexão com o banco: %s", exc)
        return 1

    cfg = _alembic_config()

    if "alembic_version" in tabelas:
        logger.info("Banco existente (%d tabelas). Aplicando migrations pendentes.", len(tabelas))
        command.upgrade(cfg, "head")
        logger.info("Migrations aplicadas.")
    elif tabelas:
        # Tabelas sem controle de versão: mexer aqui poderia destruir dados.
        logger.error(
            "O banco tem %d tabelas mas nenhuma alembic_version. Recusando "
            "tocar num schema de origem desconhecida — verifique manualmente.",
            len(tabelas),
        )
        return 1
    else:
        logger.info("Banco vazio. Criando schema a partir dos modelos.")
        Base.metadata.create_all(engine)
        command.stamp(cfg, "head")
        logger.info("Schema criado (%d tabelas) e marcado no head.",
                    len(Base.metadata.tables))

    engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
