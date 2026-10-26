# qython/backend/services/clinical_sources.py
"""
Fontes para a IA local responder a partir delas, e não de memória.

Com o Gemini, o copiloto pesquisa no Google enquanto responde (grounding). A IA local não
pesquisa, e fato clínico de memória é o ponto fraco dos modelos locais: numa bateria de
out/2026, o Gemma 4 E2B/E4B deu a dose de amoxicilina na OMA pela metade, errou o volume
de adrenalina na anafilaxia e deixou incompleto o critério de choque séptico do Sepsis-3.
Os mesmos modelos leem bem um texto que recebem.

Então, sem busca na web, o copiloto junta as fontes ANTES de gerar, para perguntas
clínicas:
  - catálogo de medicamentos e interações (tabelas semeadas por seeds/seed_medications.py);
  - trechos da biblioteca escolhida no chat;
  - resumos do PubMed. Só os termos da busca saem para a NCBI.
As fontes entram numeradas no prompt, o modelo cita [n], e a lista de referências passa
a ser as fontes citadas, renumeradas na ordem em que aparecem no texto.

As funções puras (detecção, orçamento, bloco do prompt, citações) não dependem do banco
nem da rede; as que buscam importam o que precisam na hora.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Tuple

from . import llm_provider

logger = logging.getLogger("qython_logger")


def deaccent(text: str) -> str:
    """Minúsculas sem acento: 'Critério' e 'criterio' viram a mesma coisa."""
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii").lower()


# --------------------------------------------------------------------------- #
# Pergunta clínica
# --------------------------------------------------------------------------- #

DOSE_RE = re.compile(
    r'\b\d+([.,]\d+)?\s*(mg|mcg|µg|ug|g|ml|l|ui|u|mg/kg|mcg/kg|mg/dl|g/dl|meq|mmol|mmhg|bpm|j|joules?|%)\b',
    re.IGNORECASE,
)
CLINICAL_TERM_HINTS = ('diagn', 'trata', 'conduta', 'dose', 'sintom', 'síndrome', 'sindrome', 'terap',
                       'fármac', 'farmac', 'protocol', 'critério', 'criterio', 'manejo', 'diretriz',
                       'fisiopat', 'etiolog', 'profilax', 'prescri', 'indicaç', 'contraindic', 'patolog')

# A pergunta é curta: um termo basta. Entram também palavras que a pergunta usa e a
# resposta nem sempre ("antídoto", "intoxicação") e as de inglês e espanhol.
_QUESTION_HINTS = tuple(deaccent(h) for h in CLINICAL_TERM_HINTS) + (
    'antidot', 'intoxica', 'envenena', 'overdose', 'poison', 'posolog', 'medicament', 'medicac',
    'remedio', 'droga', 'farmaco', 'interac', 'adverso', 'ajuste', 'gestant', 'gravidez',
    'lactac', 'vacina', 'escore', 'estadiamento', 'classificac', 'exame', 'rastreamento',
    'treat', 'manag', 'criteria', 'guideline', 'drug', 'dosing', 'tratamiento',
)


def is_clinical_question(text: str) -> bool:
    """A pergunta pede fato clínico (dose, critério, conduta)? Conversa, saudação e
    planejamento de estudo não pedem fonte."""
    if not text or len(text.strip()) < 8:
        return False
    if DOSE_RE.search(text):
        return True
    low = deaccent(text)
    return any(h in low for h in _QUESTION_HINTS)


# --------------------------------------------------------------------------- #
# Fonte
# --------------------------------------------------------------------------- #

@dataclass
class Source:
    kind: str                  # 'catalog' | 'interactions' | 'library' | 'pubmed'
    header: str                # como a fonte aparece para o modelo
    text: str                  # o conteúdo que entra no prompt
    ref: Dict                  # referência no formato que o front lê (title, uri, source_type...)
    names: Tuple[str, ...] = field(default_factory=tuple)  # termos que denunciam o uso (fármaco)


# Tipos de referência das fontes locais. As outras (pubmed) seguem a classificação de
# reference_service._classify_reference.
CATALOG_SOURCE_TYPE = 'catalog'
LIBRARY_SOURCE_TYPE = 'library'


# --------------------------------------------------------------------------- #
# Catálogo de medicamentos e interações
# --------------------------------------------------------------------------- #

_CATALOG_TTL = 600.0  # o catálogo muda só com novo seed; 10 min de cache evitam ler 1k linhas por mensagem
_catalog_cache: Dict = {"at": 0.0, "meds": None}
_INTERACTION_HINTS = ('interac', 'associa', 'junto', 'combina', 'concomitant')
_MAX_PRINCIPLES = 3


def _components(principle: str) -> List[str]:
    """'amoxicilina + clavulanato' -> ['amoxicilina', 'clavulanato']."""
    return [p.strip() for p in re.split(r'\s*\+\s*', deaccent(principle)) if p.strip()]


def _alias_sets(med: Dict, translated: Iterable[str]) -> List[List[str]]:
    """Formas de reconhecer o medicamento no texto. Cada item é uma lista de componentes
    que precisam aparecer TODOS (associação só casa se a pergunta citar os dois)."""
    sets = [_components(med["active_principle"])]
    for t in translated:
        comps = _components(t)
        if comps and comps not in sets:
            sets.append(comps)
    if len(sets[0]) == 1:
        # "Epinefrina (adrenalina) 1mg/ml": o nome entre parênteses é sinônimo.
        for syn in re.findall(r'\(([^)]+)\)', med.get("name") or ""):
            syn = deaccent(syn).strip()
            if re.fullmatch(r'[a-z][a-z \-]{3,}', syn) and [syn] not in sets:
                sets.append([syn])
    return sets


def _word_in(term: str, low_text: str) -> Optional[int]:
    if len(term) < 4:
        return None
    m = re.search(r'(?<![a-z])' + re.escape(term) + r'(?![a-z])', low_text)
    return m.start() if m else None


async def _catalog(db) -> List[Dict]:
    now = time.monotonic()
    if _catalog_cache["meds"] is not None and now - _catalog_cache["at"] < _CATALOG_TTL:
        return _catalog_cache["meds"]
    from sqlalchemy import select
    from ..models import Medication, MedicationTranslation

    cols = (Medication.id, Medication.name, Medication.active_principle, Medication.presentation,
            Medication.therapeutic_class, Medication.atc_code, Medication.administration_route,
            Medication.usual_posology, Medication.max_daily_dose, Medication.common_indications,
            Medication.pregnancy_category, Medication.renal_adjustment, Medication.hepatic_adjustment)
    result = await db.execute(
        select(*cols).where(Medication.is_active.isnot(False), Medication.item_type != 'supply')
    )
    meds = [dict(r._mapping) for r in result]
    translated = defaultdict(set)
    result = await db.execute(
        select(MedicationTranslation.medication_id, MedicationTranslation.active_principle)
        .where(MedicationTranslation.active_principle.isnot(None))
    )
    for med_id, principle in result:
        translated[med_id].add(principle)
    for med in meds:
        med["aliases"] = _alias_sets(med, translated.get(med["id"], ()))
    _catalog_cache.update(at=now, meds=meds)
    return meds


def match_medications(meds: List[Dict], text: str) -> Dict[str, List[Dict]]:
    """Medicamentos do catálogo citados no texto, agrupados pelo princípio ativo, na ordem
    em que aparecem. Fica com os _MAX_PRINCIPLES primeiros."""
    low = deaccent(text)
    found: Dict[str, Tuple[int, List[Dict]]] = {}
    for med in meds:
        best = None
        for comps in med["aliases"]:
            positions = [_word_in(c, low) for c in comps]
            if positions and all(p is not None for p in positions):
                pos = min(positions)
                best = pos if best is None else min(best, pos)
        if best is None:
            continue
        key = deaccent(med["active_principle"]).strip()
        pos, rows = found.get(key, (best, []))
        rows.append(med)
        found[key] = (min(pos, best), rows)
    ordered = sorted(found.items(), key=lambda kv: kv[1][0])[:_MAX_PRINCIPLES]
    return {key: rows for key, (_, rows) in ordered}


# Rótulo de indicação dentro da posologia: "Anafilaxia: 0.3-0.5mg IM coxa; PCR: 1mg IV",
# "Sífilis primária: 2.400.000 UI IM dose única". População e via não são indicação.
_DOSED_LABEL_RE = re.compile(r'(?:^|[.;]\s*)([^\W\d][^:.;()]{2,40}):')
_NOT_CONDITION = {'criancas', 'crianca', 'adultos', 'adulto', 'lactentes', 'neonatos', 'idosos',
                  'gestantes', 'maximo', 'manutencao', 'ataque', 'inicial', 'infusao', 'graves',
                  'tratamento', 'profilaxia', 'resposta', 'dose', 'doses', 'casos', 'uso'}


def match_by_dosed_condition(meds: List[Dict], text: str) -> Dict[str, List[Dict]]:
    """Pergunta que cita a doença e não o fármaco ("primeira droga na anafilaxia?"): entram os
    medicamentos cuja posologia traz dose rotulada com essa doença. Rótulo com várias
    palavras só casa se a pergunta tiver todas, inteiras: por prefixo, o "se sem resposta:"
    da adenosina casava com o "Responda em 3 linhas" da pergunta."""
    asked = set(re.findall(r'[a-z]{4,}', deaccent(text)))
    found: Dict[str, List[Dict]] = {}
    for med in meds:
        for label in _DOSED_LABEL_RE.findall(med.get("usual_posology") or ""):
            words = re.findall(r'[a-z]{4,}', deaccent(label))
            if words and not set(words) & _NOT_CONDITION and all(w in asked for w in words):
                found.setdefault(deaccent(med["active_principle"]).strip(), []).append(med)
                break
    return dict(list(found.items())[:2])


def _yes_no(value) -> str:
    return "sim" if value else "não"


def _significant(text: str) -> List[str]:
    return re.findall(r'[a-z]{5,}', deaccent(text))


def _uncovered_indications(indications: List[str], posologies: List[str], question: str) -> List[str]:
    """Indicações do catálogo que a pergunta cita e a posologia não menciona. Ex.: OMA está
    entre as indicações da amoxicilina, mas a posologia pediátrica registrada (25–50 mg/kg/dia)
    é a geral, metade da dose alta usada na otite. O aviso vai no texto da fonte porque o
    modelo pequeno segue a fonte mais do que a instrução de sistema."""
    asked = set(_significant(question))
    dosing = " ".join(deaccent(p) for p in posologies)
    out = []
    for ind in indications:
        words = _significant(ind)[:2]
        if words and all(w in asked for w in words) and words[0] not in dosing and ind not in out:
            out.append(ind)
    return out


def catalog_source(principle_rows: List[Dict], question: str = "") -> Source:
    """Um princípio ativo do catálogo como fonte: apresentações com a posologia usual,
    agrupadas quando a posologia se repete."""
    first = principle_rows[0]
    principle = first["active_principle"]
    by_dose: Dict[Tuple, List[str]] = {}
    indications: List[str] = []
    for med in principle_rows:
        key = ((med.get("usual_posology") or "").strip(), (med.get("max_daily_dose") or "").strip(),
               (med.get("administration_route") or "").strip())
        label = med["name"]
        if med.get("presentation") and med["presentation"] not in label:
            label += f" ({med['presentation']})"
        names = by_dose.setdefault(key, [])
        if label not in names:
            names.append(label)
        for ind in re.split(r'\s*;\s*', med.get("common_indications") or ""):
            if ind and ind not in indications:
                indications.append(ind)

    lines = []
    klass = " · ".join(x for x in (first.get("therapeutic_class"), first.get("atc_code") and f"ATC {first['atc_code']}") if x)
    lines.append(f"Princípio ativo: {principle}" + (f" ({klass})" if klass else ""))
    lines.append("Posologia usual registrada no catálogo, por apresentação:")
    for (posology, max_dose, route), names in by_dose.items():
        detail = posology or "posologia não registrada"
        if max_dose:
            detail += f" Dose máxima: {max_dose}."
        via = f" [via {route}]" if route else ""
        lines.append(f"- {', '.join(names)}{via}: {detail}")
    if indications:
        lines.append("Indicações comuns: " + "; ".join(indications[:12]) + ".")
    uncovered = _uncovered_indications(indications, [k[0] for k in by_dose], question)
    if uncovered:
        lines.append(
            f"Atenção: a posologia acima é a geral do medicamento; o catálogo não traz dose específica "
            f"para {', '.join(uncovered)}. Para a dose nessa indicação, use outra fonte."
        )
    lines.append(
        f"Ajuste renal: {_yes_no(first.get('renal_adjustment'))}. "
        f"Ajuste hepático: {_yes_no(first.get('hepatic_adjustment'))}."
        + (f" Categoria na gestação: {first['pregnancy_category']}." if first.get("pregnancy_category") else "")
    )
    title = f"Catálogo de medicamentos do Qython: {principle}"
    names = tuple({c for med in principle_rows for comps in med["aliases"] for c in comps})
    return Source(
        kind="catalog",
        header=title,
        text="\n".join(lines),
        ref={"title": title, "uri": None, "source_type": CATALOG_SOURCE_TYPE, "source": "catalog"},
        names=names,
    )


def interactions_source(rows: List[Dict]) -> Optional[Source]:
    if not rows:
        return None
    lines = []
    for r in rows:
        line = f"- {r['active_principle_a']} + {r['active_principle_b']} (gravidade: {r['severity']}): {r['description']}"
        if r.get("mechanism"):
            line += f" Mecanismo: {r['mechanism']}"
        if r.get("clinical_management"):
            line += f" Conduta: {r['clinical_management']}"
        if r.get("source"):
            line += f" (fonte declarada no catálogo: {r['source']})"
        lines.append(line)
    title = "Catálogo de interações medicamentosas do Qython"
    names = tuple({deaccent(r[k]) for r in rows for k in ("active_principle_a", "active_principle_b")})
    return Source(
        kind="interactions",
        header=title,
        text="\n".join(lines),
        ref={"title": title, "uri": None, "source_type": CATALOG_SOURCE_TYPE, "source": "catalog"},
        names=names,
    )


async def catalog_sources(db, text: str) -> List[Source]:
    """Fármacos do catálogo citados no texto e as interações entre eles. Com um fármaco
    só, as interações entram quando a pergunta fala em interação."""
    meds = await _catalog(db)
    matched = match_medications(meds, text) or match_by_dosed_condition(meds, text)
    if not matched:
        return []
    sources = [catalog_source(rows, text) for rows in matched.values()]

    # O banco guarda o princípio com acento ("ácido acetilsalicílico"): a consulta usa o nome
    # original, não a forma sem acento usada para casar o texto.
    components = sorted({c.strip().lower() for rows in matched.values()
                         for c in re.split(r'\s*\+\s*', rows[0]["active_principle"]) if c.strip()})
    asks_interaction = any(h in deaccent(text) for h in _INTERACTION_HINTS)
    if len(components) >= 2 or asks_interaction:
        from sqlalchemy import func, or_, select
        from ..models import DrugInteraction

        a = func.lower(DrugInteraction.active_principle_a)
        b = func.lower(DrugInteraction.active_principle_b)
        cond = (a.in_(components) & b.in_(components)) if len(components) >= 2 and not asks_interaction \
            else or_(a.in_(components), b.in_(components))
        result = await db.execute(select(DrugInteraction).where(cond).limit(8))
        rows = [{
            "active_principle_a": r.active_principle_a, "active_principle_b": r.active_principle_b,
            "severity": r.severity, "description": r.description, "mechanism": r.mechanism,
            "clinical_management": r.clinical_management, "source": r.source,
        } for r in result.scalars().all()]
        extra = interactions_source(rows)
        if extra:
            sources.append(extra)
    return sources


# --------------------------------------------------------------------------- #
# Biblioteca do usuário
# --------------------------------------------------------------------------- #

def library_sources(chunks: List[Tuple[str, Dict]], doc_names: Dict[int, str], library_name: str) -> List[Source]:
    """Trechos da biblioteca (texto, metadados do Chroma) como fontes, com documento e
    página. O cabeçalho que a indexação v2 põe no começo do trecho sai do texto."""
    sources = []
    for text, meta in chunks:
        meta = meta or {}
        if not text or not text.strip() or meta.get("content_type") == "image_description":
            continue
        doc = meta.get("doc_title") or doc_names.get(meta.get("document_id")) or library_name
        page = meta.get("page") or meta.get("page_number")
        header = f"{doc}, p. {page}" if page else doc
        body = text
        first, _, rest = text.partition("\n")
        if rest and ((meta.get("doc_title") and first.startswith(meta["doc_title"]))
                     or re.fullmatch(r'p\.\d+', first.strip())):
            body = rest
        sources.append(Source(
            kind="library",
            header=f"Biblioteca '{library_name}': {header}",
            text=body.strip(),
            ref={"title": header, "uri": None, "source_type": LIBRARY_SOURCE_TYPE, "source": "library",
                 "document_id": meta.get("document_id"), "page": page},
        ))
    return sources


# --------------------------------------------------------------------------- #
# PubMed
# --------------------------------------------------------------------------- #

# Diretriz e revisão primeiro: respondem "qual a dose / qual o critério" melhor que um
# ensaio isolado. A busca sem filtro de tipo completa a lista de candidatos.
_PUBMED_SYNTHESIS = ('(guideline[pt] OR practice guideline[pt] OR systematic review[pt] '
                     'OR meta-analysis[pt] OR review[pt])')
_PUBMED_YEARS = 15
_PUBMED_MAX = 3
_PUBMED_CANDIDATES = 5  # da busca de diretrizes e revisões; os 3 melhores viram fonte

# Palavras da busca que não distinguem um artigo de outro.
_QUERY_STOP = {'with', 'from', 'that', 'this', 'dose', 'doses', 'dosing', 'dosage', 'treatment',
               'therapy', 'management', 'guideline', 'guidelines', 'criteria', 'definition',
               'diagnosis', 'first', 'line', 'drug', 'drugs', 'adult', 'adults', 'patients',
               'recommended', 'recommendation', 'clinical'}
_CHILD_TERMS = ('crianc', 'pediatr', 'paediatr', 'infantil', 'lactente', 'neonat', 'recem-nasc',
                'child', 'infant', 'newborn', 'adolescen')
_PREGNANCY_TERMS = ('gestant', 'gravid', 'gestac', 'puerper', 'obstetr', 'pregnan', 'maternal')
_NUMERIC_RE = re.compile(r'\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|ml|mm\s?hg|mmol|ui|iu|units?|g)\b', re.IGNORECASE)


def rank_abstracts(candidates: List[Dict], query: str, question: str = "") -> List[Dict]:
    """Ordena os resumos candidatos pelo quanto respondem à pergunta. A relevância do PubMed
    sozinha trouxe, na bateria, o consenso PEDIÁTRICO de sepse para uma pergunta de adulto e
    revisões de adrenalina NASAL sem a dose IM. Pontua: termos da busca no título (peso maior)
    e no resumo; resumo com valor numérico (dose, pressão, lactato); população que não bate com
    a da pergunta (criança, gestante × adulto) sai da lista: é armadilha, não fonte fraca. Empate
    mantém a ordem do PubMed."""
    terms = {w[:6] for w in re.findall(r'[a-z0-9-]{4,}', deaccent(query)) if w not in _QUERY_STOP}
    asked = deaccent(f"{question} {query}")
    asks_child = any(t in asked for t in _CHILD_TERMS)
    asks_pregnancy = any(t in asked for t in _PREGNANCY_TERMS)

    def wrong_population(d: Dict) -> bool:
        title = deaccent(d.get("title") or "")
        about_child = any(t in title for t in _CHILD_TERMS)
        if any(t in title for t in _PREGNANCY_TERMS) and not asks_pregnancy:
            return True
        return (about_child and not asks_child) or (asks_child and not about_child and 'adult' in title)

    def score(d: Dict) -> float:
        title = deaccent(d.get("title") or "")
        abstract = deaccent(d.get("abstract") or "")
        value = 0.0
        if terms:
            value += sum(1 for t in terms if t in title) / len(terms)
            value += 0.5 * sum(1 for t in terms if t in abstract) / len(terms)
        if _NUMERIC_RE.search(d.get("abstract") or ""):
            value += 0.3
        if asks_child and any(t in title for t in _CHILD_TERMS):
            value += 0.3
        return value

    return sorted((d for d in candidates if not wrong_population(d)), key=score, reverse=True)


def _pubmed_header(d: Dict) -> str:
    who = f"{d['author']} et al." if d.get("author") else None
    meta = ", ".join(x for x in (who, d.get("journal"), d.get("year")) if x)
    return f"PubMed: {d.get('title') or 'sem título'}" + (f" ({meta})" if meta else "") + f". PMID {d['pmid']}"


async def pubmed_sources(query: str, question: str = "", limit: int = _PUBMED_MAX) -> List[Source]:
    """Resumos do PubMed para a busca (em inglês). Só a busca sai da máquina; a pergunta
    serve para escolher entre os candidatos (rank_abstracts)."""
    import aiohttp
    from .reference_service import (PUBMED_BASE_DELAY, _classify_reference, fetch_pubmed_details,
                                    search_pubmed)

    query = " ".join((query or "").split())[:200]
    if not query:
        return []
    since = datetime.now(timezone.utc).year - _PUBMED_YEARS
    base = f"({query}) AND hasabstract AND {since}:3000[dp]"
    headers = {'User-Agent': 'QythonMedicalCopilot/1.0 (open source clinical copilot)'}
    async with aiohttp.ClientSession(headers=headers) as session:
        pmids = await search_pubmed(f"{base} AND {_PUBMED_SYNTHESIS}", session, max_results=_PUBMED_CANDIDATES)
        if len(pmids) < limit:
            # Sem filtro de tipo, a busca casa qualquer resumo que cite os termos de passagem
            # (um ensaio de imunobiológico que relata "anaphylaxis" como evento adverso): só
            # completa a lista.
            await asyncio.sleep(PUBMED_BASE_DELAY)
            for pmid in await search_pubmed(base, session, max_results=limit):
                if pmid not in pmids:
                    pmids.append(pmid)
        if not pmids:
            logger.info(f"[FONTES] PubMed sem resultado para '{query}'")
            return []
        await asyncio.sleep(PUBMED_BASE_DELAY)
        details = await fetch_pubmed_details(pmids, session, with_abstract=True)

    order = {p: i for i, p in enumerate(pmids)}
    candidates, titles = [], set()
    for d in sorted(details, key=lambda d: order.get(d.get("pmid"), 99)):
        title = deaccent(d.get("title") or "").strip(" .[]")
        if not (d.get("abstract") or "").strip() or title in titles:  # o mesmo texto republicado
            continue
        titles.add(title)
        candidates.append(d)

    sources = []
    for d in rank_abstracts(candidates, query, question)[:limit]:
        abstract = d.pop("abstract").strip()
        header = _pubmed_header(d)
        d.pop("journal", None)
        ref = _classify_reference(dict(d))
        sources.append(Source(kind="pubmed", header=header, text=abstract, ref=ref))
    logger.info(f"[FONTES] PubMed '{query}': {len(candidates)} candidato(s), escolhidos "
                f"{', '.join(s.ref.get('pmid') or '?' for s in sources)}")
    return sources


# --------------------------------------------------------------------------- #
# Prompt
# --------------------------------------------------------------------------- #

# Um resumo do PubMed tem uns 300–800 tokens, e a conclusão (onde costuma estar o critério
# ou a dose) vem no fim: o teto não pode cortar um resumo comum.
_MAX_SOURCE_TOKENS = 1000


def fit_to_budget(sources: List[Source], budget_tokens: int) -> List[Source]:
    """Fontes que cabem no orçamento, na ordem dada. Uma fonte longa é cortada; a que não
    cabe nem com 150 tokens fica de fora, com as que vêm depois dela."""
    kept, used = [], 0
    for src in sources:
        cap = min(_MAX_SOURCE_TOKENS, budget_tokens - used - llm_provider.approx_tokens(src.header) - 8)
        if cap < 150:
            break
        text = src.text
        if llm_provider.approx_tokens(text) > cap:
            text = text[: cap * 4].rsplit(" ", 1)[0] + " [...]"
        kept.append(Source(kind=src.kind, header=src.header, text=text, ref=src.ref, names=src.names))
        used += llm_provider.approx_tokens(src.header) + llm_provider.approx_tokens(text) + 8
    return kept


def sources_block(sources: List[Source]) -> str:
    items = [f"[{i}] {s.header}\n{s.text}" for i, s in enumerate(sources, start=1)]
    return "<FONTES>\n" + "\n\n".join(items) + "\n</FONTES>\n\n"


# --------------------------------------------------------------------------- #
# Citações
# --------------------------------------------------------------------------- #

# [2] · [1, 3] · [1-3] · [Fonte 2] · [fontes 1 e 2] · (Fonte 2). Número solto entre
# parênteses fica de fora: "(2)" costuma ser outra coisa.
_NUMS = r'\d{1,2}(?:\s*(?:,|;|-|–|e|and|y)\s*\d{1,2})*'
_CITE_RE = re.compile(
    rf'[ \t]*(?:\[(?:fontes?\s*)?(?P<colchete>{_NUMS})\]|\(fontes?\s*(?P<parentese>{_NUMS})\))',
    re.IGNORECASE,
)


def _cited_numbers(inner: str) -> List[int]:
    nums: List[int] = []
    for part in re.split(r'\s*(?:,|;|\be\b|\band\b|\by\b)\s*', inner):
        bounds = re.split(r'\s*[-–]\s*', part.strip())
        if len(bounds) == 2 and all(b.isdigit() for b in bounds):
            lo, hi = int(bounds[0]), int(bounds[1])
            if 0 < hi - lo < 10:
                nums.extend(range(lo, hi + 1))
                continue
        nums.extend(int(b) for b in bounds if b.isdigit())
    return nums


_VALUE_RE = re.compile(r'(\d+(?:[.,]\d+)?)\s*(mg/kg|mcg/kg|mg|mcg|µg|ml|mmhg|mmol|ui|g)\b', re.IGNORECASE)


def _values(text: str) -> set:
    return {(n.replace(",", "."), u.lower().replace("µg", "mcg")) for n, u in _VALUE_RE.findall(text or "")}


def _looks_used(src: Source, answer: str) -> bool:
    """Sem marcador, a fonte conta como usada se a resposta repete um valor dela (dose,
    pressão, lactato) ou cita o fármaco do catálogo."""
    if _values(answer) & _values(src.text):
        return True
    low = deaccent(answer)
    return any(_word_in(n, low) is not None for n in src.names)


def cite_used_sources(text: str, sources: List[Source]) -> Tuple[str, List[Dict]]:
    """Troca os números das fontes no prompt pelos da lista final: só ficam as citadas,
    numeradas na ordem em que aparecem. Número que não existe na lista sai do texto (o
    modelo não inventa referência). Sem nenhum marcador válido, a lista fica com as
    fontes que a resposta visivelmente usou, sem marcar o texto."""
    if not sources:
        return text, []
    renumber: Dict[int, int] = {}

    def replace(m: re.Match) -> str:
        new = []
        for n in _cited_numbers(m.group("colchete") or m.group("parentese")):
            if 1 <= n <= len(sources):
                if n not in renumber:
                    renumber[n] = len(renumber) + 1
                if renumber[n] not in new:
                    new.append(renumber[n])
        if not new:
            return ""
        # colado no marcador anterior ("[1][2]") ou no começo da linha: sem espaço
        glued = m.start() == 0 or m.string[m.start() - 1] in "]\n"
        return ("" if glued else " ") + "".join(f"[{x}]" for x in new)

    out = _CITE_RE.sub(replace, text or "")
    if renumber:
        refs = [None] * len(renumber)
        for old, new in renumber.items():
            refs[new - 1] = dict(sources[old - 1].ref)
        return out, refs
    used = [dict(s.ref) for s in sources if _looks_used(s, out)]
    return out, used
