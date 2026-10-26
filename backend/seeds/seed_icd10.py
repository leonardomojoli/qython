# qython/backend/seeds/seed_icd10.py
"""
Seed idempotente da tabela oficial da CID-10 (icd10_codes).

Fonte: CID-10 versão 2008 do DATASUS, arquivo CID10CSV.zip guardado sem alteração
em seeds/data (SHA-256 e termos de uso no NOTICE). Entram os códigos de
CID-10-SUBCATEGORIAS.CSV, que segundo o próprio DATASUS "são os que podem ser
utilizados para codificação de causas, diagnósticos etc.": as subcategorias e as
categorias sem subdivisão. A descrição da categoria vem de CID-10-CATEGORIAS.CSV.

Roda a cada boot: insere o que falta e atualiza o que mudou (uma tabela nova ou um
ajuste em services/icd10_search.normalize), sem apagar nada.
"""

import csv
import io
import logging
import os
import zipfile
from typing import Dict, List

from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Icd10Code
from ..services.icd10_search import normalize

logger = logging.getLogger("qython_logger")

SEEDS_DIR = os.path.dirname(os.path.abspath(__file__))
ICD10_ZIP = os.path.join(SEEDS_DIR, "data", "CID10CSV.zip")

_FIELDS = ("description", "category", "category_description", "classification",
           "sex_restriction", "search_description", "search_category")


def _read_csv(zf: zipfile.ZipFile, name: str) -> List[Dict[str, str]]:
    # ISO-8859-1 e ponto e vírgula, como descrito pelo DATASUS (descrcsv.htm). Sem
    # aspas como delimitador: nenhum campo tem ";" dentro, e as aspas fazem parte do
    # texto oficial ('"Flutter" e fibrilação atrial').
    with zf.open(name) as raw:
        return list(csv.DictReader(io.TextIOWrapper(raw, encoding="latin-1"),
                                   delimiter=";", quoting=csv.QUOTE_NONE))


def load_icd10_rows(zip_path: str = ICD10_ZIP) -> List[Dict]:
    """Linhas da tabela a partir do zip do DATASUS, já no formato do modelo."""
    with zipfile.ZipFile(zip_path) as zf:
        categories = {r["CAT"].strip(): r["DESCRICAO"].strip()
                      for r in _read_csv(zf, "CID-10-CATEGORIAS.CSV")}
        subcategories = _read_csv(zf, "CID-10-SUBCATEGORIAS.CSV")

    rows = []
    for r in subcategories:
        raw = r["SUBCAT"].strip().upper()
        category = raw[:3]
        description = r["DESCRICAO"].strip()
        category_description = categories.get(category, description)
        rows.append({
            "code": f"{category}.{raw[3:]}" if len(raw) > 3 else category,
            "description": description,
            "category": category,
            "category_description": category_description,
            "classification": (r.get("CLASSIF") or "").strip() or None,
            "sex_restriction": (r.get("RESTRSEXO") or "").strip() or None,
            "search_description": normalize(description),
            "search_category": normalize(category_description),
        })
    return rows


async def seed_icd10(db: AsyncSession) -> int:
    """Semeia a CID-10. Devolve quantos códigos foram inseridos ou atualizados."""
    if not os.path.exists(ICD10_ZIP):
        logger.warning(f"Tabela da CID-10 não encontrada: {ICD10_ZIP}")
        return 0

    rows = load_icd10_rows()
    result = await db.execute(select(Icd10Code.code, *(getattr(Icd10Code, f) for f in _FIELDS)))
    existing = {row[0]: tuple(row[1:]) for row in result.all()}

    new = [r for r in rows if r["code"] not in existing]
    changed = [r for r in rows
               if r["code"] in existing and existing[r["code"]] != tuple(r[f] for f in _FIELDS)]

    if new:
        await db.execute(insert(Icd10Code), new)
    for r in changed:
        await db.execute(update(Icd10Code).where(Icd10Code.code == r["code"])
                         .values(**{f: r[f] for f in _FIELDS}))
    if new or changed:
        await db.commit()
        logger.info(f"CID-10: {len(new)} códigos inseridos, {len(changed)} atualizados")
    return len(new) + len(changed)
