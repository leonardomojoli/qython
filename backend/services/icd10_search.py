# qython/backend/services/icd10_search.py
"""
Busca de códigos candidatos na tabela oficial da CID-10 (`icd10_codes`).

A extração de CID-10 das consultas não deixa o modelo escrever código: ele só escolhe
entre candidatos que esta busca tira da tabela, e código e descrição devolvidos vêm
da tabela. Medido com o Gemma 4 E4B, o modelo de memória chamava um infarto inferior
de I20.0 (angina instável) e descrevia o I21.0 como "IAM sem supra".

Como a busca funciona:
  1. As notas passam a minúsculas e sem acento (`normalize`), como as colunas
     indexadas, e são cortadas em frases.
  2. Abreviações e termos do dia a dia trazem o vocabulário da tabela (`SYNONYMS`):
     "HAS" traz "hipertensao essencial primaria", "supra de ST" traz "infarto agudo
     transmural", "DII, DIII e aVF" traz "parede inferior".
  3. Cada frase vira uma consulta OU com os radicais do português
     (`to_tsvector('portuguese')`), com prefixo para radical longo. Cada código
     pontua pela raridade dos termos que casa (IDF): "transmural" pesa muito,
     "agudo" pouco. Termo na descrição do código vale 1, e mais 0,5 se também
     estiver no nome da categoria: "pneumonia" nomeia a J18, "comunidade" só
     aparece em "comunicação interatrial".
  4. As melhores categorias de cada frase entram inteiras, com todas as
     subcategorias: achar o I21 basta para o modelo ver I21.0 a I21.9 e escolher a
     parede certa.

Os embeddings da biblioteca não entram: as descrições da CID são curtas, de
vocabulário fechado, e a busca textual com sinônimos traz o código certo nos casos
de tests/backend/test_icd10_candidates.py.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from typing import Dict, List, NamedTuple, Optional, Sequence, Tuple

from google.genai import types
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("qython_logger")

# Tamanho da lista que o modelo recebe. Com 40 códigos o prompt fica em ~1.000
# tokens e cabe folgado no contexto da IA local; uma nota com 3 ou 4 problemas usa
# perto de 30.
DEFAULT_LIMIT = 40
# Subcategorias por categoria (a CID-10 tem no máximo 10: .0 a .9).
MAX_CODES_PER_CATEGORY = 10
# Categorias que cada frase pode trazer. Uma frase como "diabético tipo 2 com
# nefropatia e DRC" tem mais de um diagnóstico.
CATEGORIES_PER_SEGMENT = 4
# Fração da melhor pontuação abaixo da qual uma categoria não entra.
RELATIVE_CUTOFF = 0.35


def normalize(value: str) -> str:
    """Minúsculas e sem acento. É o formato de `search_description` e
    `search_category` e o das notas antes da busca."""
    value = unicodedata.normalize("NFKD", (value or "").lower())
    return "".join(c for c in value if not unicodedata.combining(c))


# --------------------------------------------------------------------------- #
# Sinônimos: o que o médico escreve -> o vocabulário da tabela (já normalizado)
# --------------------------------------------------------------------------- #
# A tabela do DATASUS é a versão 2008 em português: diabetes tipo 2 aparece como
# "não-insulino-dependente", lúpus como "disseminado", DRC como "insuficiência renal
# crônica". Cada entrada é (regex sobre a frase normalizada, termos da tabela que a
# frase passa a buscar também). Os termos com hífen ficam com hífen: o Postgres
# indexa "nao-insulino-dependente" como uma palavra só, e é ela que separa o E11
# do E10.
#
# Ficam de fora siglas que no prontuário querem dizer outra coisa: HDA (história da
# doença atual), DII (derivação do ECG), AR (ar ambiente), IC (interconsulta).
_SYNONYM_TABLE = [
    # Cardiovascular
    (r"\bhas\b|hipertens[ao]o? arterial|\bhipertens[oa]s?\b|pressao alta", "hipertensao essencial primaria"),
    (r"\biam\b|\binfarto\b(?! cerebral)|\binfartad[oa]\b|\bsca\b|sindrome coronariana aguda",
     "infarto agudo do miocardio"),
    (r"\biamcsst\b|\bcom supra\b|supra(desnivelamento|desnivel)?( do segmento| de)? st\b|\bstemi\b",
     "infarto agudo transmural"),
    (r"\biamssst\b|\bsem supra\b|\bnstemi\b", "infarto agudo subendocardico"),
    (r"\bd\s?(ii|iii|2|3)\b.*\bavf\b|\bparede inferior\b|\binferior(es)?\b.*\b(iam|infarto|supra)\b",
     "parede inferior"),
    (r"\bv[1-4]\b.*\bv[2-6]\b|\banterior(es)?\b.*\b(iam|infarto|supra)\b|\banterosseptal\b",
     "parede anterior"),
    (r"\bdac\b|\bcoronariopat|doenca arterial coronari", "doenca isquemica cronica do coracao"),
    (r"\bicc\b|\bicfer\b|\bicfep\b|insuficiencia cardiaca", "insuficiencia cardiaca congestiva"),
    (r"\beap\b|edema agudo de pulmao", "edema pulmonar insuficiencia ventricular esquerda"),
    (r"\bfa\b|\bfibrilacao atrial\b|\bflutter\b", "fibrilacao e flutter atrial"),
    (r"\btsv\b", "taquicardia supraventricular"),
    (r"\bbav\b", "bloqueio atrioventricular"),
    (r"\btvp\b|trombose venosa profunda",
     "flebite e tromboflebite de vasos profundos dos membros inferiores trombose venosa"),
    (r"\btep\b|tromboembolismo pulmonar|embolia pulmonar", "embolia pulmonar"),
    (r"\bdaop\b", "aterosclerose das arterias das extremidades"),
    (r"\bivc\b|insuficiencia venosa", "insuficiencia venosa cronica periferica varizes"),
    # Cerebrovascular e neurologia
    (r"\bav[ce]\b|derrame cerebral", "acidente vascular cerebral"),
    (r"\bav[ce] ?i\b|\bav[ce] isquemico\b", "infarto cerebral"),
    (r"\bav[ce] ?h\b|\bav[ce] hemorragico\b", "hemorragia intracerebral"),
    (r"\bait\b|ataque isquemico transitorio", "isquemia cerebral transitoria"),
    (r"\bmigranea\b", "enxaqueca"),
    (r"\bconvuls", "convulsoes epilepsia"),
    (r"\btce\b|traumatismo cranio", "traumatismo intracraniano"),
    # Endócrino e metabolismo
    (r"\bdm ?(2|ii)\b|\bdm tipo (2|ii)\b|diabetes( mellitus)? tipo (2|ii)\b|diabetic[oa] tipo (2|ii)\b",
     "diabetes mellitus nao-insulino-dependente"),
    (r"\bdm ?(1|i)\b|\bdm tipo (1|i)\b|diabetes( mellitus)? tipo (1|i)\b|diabetic[oa] tipo (1|i)\b",
     "diabetes mellitus insulino-dependente"),
    (r"\bdm\b|\bdiabetic[oa]s?\b", "diabetes mellitus"),
    (r"nefropatia diabetica", "diabetes complicacoes renais"),
    (r"retinopatia diabetica", "diabetes complicacoes oftalmicas"),
    (r"neuropatia diabetica", "diabetes complicacoes neurologicas"),
    (r"\bpe diabetico\b", "diabetes complicacoes circulatorias perifericas"),
    (r"\bdislipidemi|\bhiperlipidemi", "hiperlipidemia lipidemias"),
    (r"\bhipertireoidismo\b", "tireotoxicose"),
    (r"\bsop\b|ovarios? policistic", "sindrome do ovario policistico"),
    (r"\bsobrepeso\b", "obesidade"),
    (r"anemia ferropriva", "anemia por deficiencia de ferro"),
    # Respiratório
    (r"\bdpoc\b", "doenca pulmonar obstrutiva cronica"),
    (r"\bpac\b|\bpnm\b|\bbcp\b|\bpneumonia\b", "pneumonia por microorganismo nao especificada broncopneumonia"),
    (r"\bivas\b|\bresfriado\b|\bgripe\b", "nasofaringite aguda resfriado comum infeccao aguda das vias aereas superiores"),
    (r"\birpa\b", "insuficiencia respiratoria aguda"),
    (r"\btb\b", "tuberculose"),
    # Digestivo
    (r"\bdrge\b|\brge\b|\brefluxo\b", "doenca de refluxo gastroesofagico"),
    (r"\bgeca\b|\bgastroenterite\b|diarreia aguda", "diarreia e gastroenterite de origem infecciosa presumivel"),
    (r"\bsii\b|intestino irritavel", "sindrome do colon irritavel"),
    # Renal e urológico
    (r"\bitu\b|infeccao urinaria", "infeccao do trato urinario"),
    (r"\bpielonefrite\b", "nefrite tubulo intersticial aguda"),
    (r"\bdrc\b|\birc\b|doenca renal cronica", "insuficiencia renal cronica"),
    (r"\bira\b|\blra\b|lesao renal aguda", "insuficiencia renal aguda"),
    (r"\bhpb\b|hiperplasia prostatica", "hiperplasia da prostata"),
    (r"nefrolitiase|litiase renal|calculo renal", "calculo do rim"),
    # Infecção, reumatologia, saúde mental, outros
    (r"\bhiv\b|\baids\b|\bsida\b", "doenca pelo virus da imunodeficiencia humana"),
    (r"\bsepse\b|\bseptic[oa]\b", "septicemia"),
    (r"\bles\b|\blupus\b", "lupus eritematoso disseminado sistemico"),
    (r"\blombalgia\b", "dor lombar baixa"),
    (r"\btag\b|ansiedade generalizada", "ansiedade generalizada"),
    (r"\bdepress", "episodio depressivo"),
    (r"\btdah\b", "disturbios da atividade e da atencao transtornos hipercineticos"),
    (r"\btabagis", "uso do tabaco transtornos devidos ao uso de fumo"),
    (r"\betilis|\balcoolis", "transtornos devidos ao uso de alcool"),
    (r"pre-? ?natal", "supervisao de gravidez normal"),
    (r"\bpuericultura\b", "exame de rotina de saude da crianca"),
    (r"\bcheck-? ?up\b|exame de rotina", "exame medico geral"),
]
SYNONYMS = [(re.compile(pattern), vocabulary) for pattern, vocabulary in _SYNONYM_TABLE]


class Segment(NamedTuple):
    words: str  # a frase das notas, normalizada
    vocabulary: str  # termos da tabela que os sinônimos acharam nela ("" se nenhum)


def table_vocabulary(normalized: str) -> str:
    """Termos da tabela que os sinônimos acham numa frase já normalizada."""
    found: List[str] = []
    for pattern, vocabulary in SYNONYMS:
        if vocabulary not in found and pattern.search(normalized):
            found.append(vocabulary)
    return " ".join(found)


# Ponto final, ponto e vírgula, ? ! e quebra de linha. Ponto entre dígitos ("I21.1",
# "2.5 mg") não corta a frase. Vírgula fora de número separa orações.
_SENTENCE_SPLIT = re.compile(r"(?<!\d)[.;!?](?!\d)|\n")
_CLAUSE_SPLIT = re.compile(r"(?<!\d),|,(?!\d)")


def segments(notes: str) -> List[Segment]:
    """Trechos das notas que viram consulta, com o vocabulário da tabela de cada um.

    Cada frase entra inteira, para manter o contexto ("supra de ST em DII, DIII e
    aVF"), e cada oração de uma frase com vírgulas entra também sozinha: em
    "diabético tipo 2 com nefropatia, DRC estágio 3b" os quatro tipos de diabetes
    ocupariam as vagas da frase e a DRC ficaria de fora.
    """
    sentences = [p.strip() for p in _SENTENCE_SPLIT.split(normalize(notes))]
    parts = [p for p in sentences if len(p) >= 3]
    for sentence in parts[:]:
        clauses = [c.strip() for c in _CLAUSE_SPLIT.split(sentence)]
        if len(clauses) > 1:
            parts.extend(c for c in clauses if len(c) >= 3)
    return [Segment(p, table_vocabulary(p)) for p in parts]


# Códigos digitados pelo médico depois de "CID": "CID-10: I10, E11.9".
_CID_MENTION = re.compile(r"\bcid(?:\s*-?\s*10)?\s*[:=]?\s*((?:[a-z]\d{2}(?:\.?\d)?(?:[\s,;/]|\be\b)*)+)")
_CODE = re.compile(r"\b([a-z]\d{2})(?:\.?(\d))?\b")


def explicit_codes(notes: str) -> List[str]:
    """Códigos citados depois de "CID" nas notas, no formato da tabela."""
    found: List[str] = []
    for mention in _CID_MENTION.finditer(normalize(notes)):
        for cat, sub in _CODE.findall(mention.group(1)):
            code = f"{cat.upper()}.{sub}" if sub else cat.upper()
            if code not in found:
                found.append(code)
    return found


# Radicais que nunca ajudam: sem acento, escapam da lista de stopwords do português
# do Postgres ("nao", "apos").
_STOP_LEXEMES = {"nao", "apos", "ate", "tambem", "ja", "sim"}
# Radicais de prontuário que casam com a tabela por acaso: "conduta" casa com
# "condutor" (acidentes de transporte), "medicação" com os envenenamentos por
# medicamento, "dieta" com as deficiências nutricionais. Valem só nas frases do
# médico; o vocabulário trazido pelos sinônimos ("exame medico geral") passa.
_NOTE_NOISE_LEXEMES = {
    "pacient", "refer", "relat", "queix", "neg", "nega", "hoj", "ontem", "dia", "dias", "hor",
    "mes", "mese", "seman", "ano", "anos", "uso", "dos", "vez", "comprim", "medic", "medicaca",
    "medicament", "prescrit", "condut", "orient", "orientaco", "diet", "ativ", "fisic",
    "retorn", "acompanh", "encaminh", "solicit", "realiz", "result", "exam", "laboratori",
    "hipotes", "diagnost", "quadr", "compativel", "sugest", "evolu", "evoluca", "inic", "inici",
    "mant", "ajust", "apresent", "histor", "atual", "prev", "previ", "conhec", "estavel",
    "cid", "revisa",
}
# Radical deste tamanho ou maior casa por prefixo ('hipertens' acha 'hipertensa').
# Radical curto casa exato: 'dor:*' acharia 'dorsal'.
_PREFIX_MIN_LEN = 5


def query_lexemes(word_lexemes, vocabulary_lexemes) -> List[str]:
    """Radicais que entram na consulta de uma frase."""
    def usable(lexeme):
        return len(lexeme) >= 3 and not lexeme.isdigit() and lexeme not in _STOP_LEXEMES
    lexemes = {lex for lex in (word_lexemes or []) if usable(lex) and lex not in _NOTE_NOISE_LEXEMES}
    lexemes |= {lex for lex in (vocabulary_lexemes or []) if usable(lex)}
    return sorted(lexemes)


_LEXEMES_SQL = text("""
    SELECT ord,
           tsvector_to_array(to_tsvector('portuguese', w)) AS words,
           tsvector_to_array(to_tsvector('portuguese', v)) AS vocabulary
    FROM unnest(CAST(:words AS text[]), CAST(:vocabulary AS text[])) WITH ORDINALITY AS t(w, v, ord)
""")

# Pontua cada código pelos termos da frase que ele casa: IDF do termo (log de N /
# códigos que o casam) vezes 1 se o termo está na descrição do código, mais 0,5 se
# está no nome da categoria. Códigos asterisco (manifestação, cruz/asterisco) não
# são diagnóstico principal e ficam de fora.
_SCORE_SQL = text("""
    WITH q AS (
        SELECT lex, CASE WHEN length(lex) >= :prefix_len THEN ':*' ELSE ':' END AS op
        FROM unnest(CAST(:lexemes AS text[])) AS lex
    ), m AS (
        SELECT c.code, c.category, q.lex,
               c.search_vector @@ CAST(quote_literal(q.lex) || q.op || 'A' AS tsquery) AS in_desc,
               c.search_vector @@ CAST(quote_literal(q.lex) || q.op || 'B' AS tsquery) AS in_cat
        FROM icd10_codes c
        JOIN q ON c.search_vector @@ CAST(quote_literal(q.lex) || rtrim(q.op, ':') AS tsquery)
        WHERE c.classification IS DISTINCT FROM '*'
    ), df AS (
        SELECT lex, count(*) AS n FROM m GROUP BY lex
    )
    SELECT m.code, m.category,
           sum(ln(CAST(:total AS float) / df.n)
               * ((CASE WHEN m.in_desc THEN 1.0 ELSE 0 END) + (CASE WHEN m.in_cat THEN 0.5 ELSE 0 END))) AS score
    FROM m JOIN df USING (lex)
    GROUP BY m.code, m.category
    ORDER BY score DESC, m.code
    LIMIT :hits
""")

_CODES_OF_CATEGORIES_SQL = text("""
    SELECT code, description, category, category_description
    FROM icd10_codes
    WHERE category = ANY(CAST(:categories AS text[]))
      AND classification IS DISTINCT FROM '*'
    ORDER BY code
""")

_total_codes: Optional[int] = None


async def _count_codes(db: AsyncSession) -> int:
    global _total_codes
    if not _total_codes:
        _total_codes = (await db.execute(text("SELECT count(*) FROM icd10_codes"))).scalar() or 0
    return _total_codes


async def rank_categories(db: AsyncSession, notes: str) -> List[Tuple[str, float, List[str]]]:
    """Categorias que as notas sugerem, na ordem em que entram na lista do modelo.

    Cada item é (categoria, pontuação, códigos que pontuaram). A ordem intercala as
    frases: primeiro as categorias citadas depois de "CID", depois a melhor de cada
    frase, depois a segunda de cada frase, e assim por diante. Uma nota com IAM, HAS
    e DM2 traz as três antes de qualquer segunda opção. Categoria abaixo de
    RELATIVE_CUTOFF da melhor pontuação fica de fora: é o que sobra de frase sem
    diagnóstico.
    """
    total = await _count_codes(db)
    if not total:
        logger.warning("Tabela icd10_codes vazia: rode o seed da CID-10 (seeds/seed_icd10.py).")
        return []

    per_segment: List[List[Tuple[str, float]]] = []
    scored: Dict[str, List[str]] = {}
    segs = segments(notes)
    if segs:
        rows = (await db.execute(_LEXEMES_SQL, {
            "words": [s.words for s in segs], "vocabulary": [s.vocabulary for s in segs],
        })).all()
        for _, words, vocabulary in sorted(rows):
            lexemes = query_lexemes(words, vocabulary)
            if not lexemes:
                continue
            hits = (await db.execute(_SCORE_SQL, {
                "lexemes": lexemes, "total": total, "prefix_len": _PREFIX_MIN_LEN,
                "hits": CATEGORIES_PER_SEGMENT * MAX_CODES_PER_CATEGORY,
            })).all()
            ranked: List[Tuple[str, float]] = []
            for code, category, score in hits:
                if category not in (c for c, _ in ranked):
                    if len(ranked) == CATEGORIES_PER_SEGMENT:
                        continue
                    ranked.append((category, float(score)))
                scored.setdefault(category, []).append(code)
            if ranked:
                per_segment.append(ranked)

    best = max((r[0][1] for r in per_segment), default=0.0)
    ordered: List[Tuple[str, float, List[str]]] = []
    seen = set()
    for code in explicit_codes(notes):
        if code[:3] not in seen:
            seen.add(code[:3])
            ordered.append((code[:3], best, [code]))
    depth = 0
    while any(depth < len(r) for r in per_segment):
        level = [r[depth] for r in per_segment if depth < len(r)]
        for category, score in sorted(level, key=lambda item: -item[1]):
            if category not in seen and score >= RELATIVE_CUTOFF * best:
                seen.add(category)
                ordered.append((category, score, scored.get(category, [])))
        depth += 1
    return ordered


async def search_candidates(db: AsyncSession, notes: str, limit: int = DEFAULT_LIMIT) -> List[Dict]:
    """Códigos da tabela que as notas podem justificar, para o modelo escolher.

    Devolve dicts {code, description, category, category_description}, agrupados
    por categoria na ordem de `rank_categories`. Cada categoria entra com todas as
    subcategorias; a que não couber inteira no limite entra só com os códigos que
    pontuaram. Lista vazia se a tabela não foi semeada ou se nada casou.
    """
    ranked = await rank_categories(db, notes)
    if not ranked:
        return []

    rows = (await db.execute(_CODES_OF_CATEGORIES_SQL,
                             {"categories": [c for c, _, _ in ranked]})).mappings().all()
    by_category: Dict[str, List[Dict]] = {}
    for row in rows:
        by_category.setdefault(row["category"], []).append(dict(row))

    candidates: List[Dict] = []
    for category, _, scored_codes in ranked:
        codes = by_category.get(category, [])[:MAX_CODES_PER_CATEGORY]
        if len(candidates) + len(codes) > limit:
            codes = [c for c in codes if c["code"] in scored_codes]
        candidates.extend(codes[:limit - len(candidates)])
        if len(candidates) >= limit:
            break
    return candidates


# --------------------------------------------------------------------------- #
# Escolha pelo modelo (usada por llm_services.extract_icd10_from_notes)
# --------------------------------------------------------------------------- #
MAX_SELECTED = 3
CONFIDENCE_LEVELS = ("alta", "média", "baixa")


def candidate_list(candidates: Sequence[Dict]) -> str:
    """Candidatos agrupados por categoria, no formato que vai para o modelo."""
    lines, category = [], None
    for c in candidates:
        if c["category"] != category:
            category = c["category"]
            lines.append(f"{category} {c['category_description']}")
        lines.append(f"  {c['code']} — {c['description']}")
    return "\n".join(lines)


def selection_instruction(candidates: Sequence[Dict]) -> str:
    """Instrução de sistema: as regras e a lista de códigos possíveis."""
    return f"""Você codifica atendimentos médicos na CID-10.

Escolha até {MAX_SELECTED} códigos da lista abaixo para os diagnósticos ou hipóteses das notas clínicas que o usuário enviar, do mais relevante ao menos relevante. Só valem códigos desta lista, tirada da tabela oficial da CID-10 (DATASUS).

REGRAS:
1. Prefira o código mais específico que as notas sustentam: a parede do infarto, o tipo de diabetes, a presença ou ausência de complicação.
2. Diagnóstico do atendimento e comorbidade em acompanhamento contam. O que as notas negam ("nega dor torácica", "sem febre") não conta.
3. confidence: "alta" quando as notas afirmam o diagnóstico; "média" quando é hipótese ou falta detalhe para o código exato; "baixa" quando as notas só são compatíveis.
4. Se nenhum código da lista corresponder às notas, devolva "diagnosticos": [].

CÓDIGOS POSSÍVEIS:
{candidate_list(candidates)}"""


def selection_prompt(notes: str, specialty: str = "") -> str:
    return f"""NOTAS CLÍNICAS:
{notes}

ESPECIALIDADE: {specialty if specialty else "Clínica Geral"}"""


def selection_schema(codes: Sequence[str]) -> types.Schema:
    """Schema da resposta, com enum dos candidatos: o modelo não consegue escrever
    código que não esteja na lista, no Gemini nem na IA local (json_schema)."""
    return types.Schema(
        type=types.Type.OBJECT,
        required=["diagnosticos"],
        properties={
            "diagnosticos": types.Schema(
                type=types.Type.ARRAY,
                items=types.Schema(
                    type=types.Type.OBJECT,
                    required=["code", "confidence"],
                    property_ordering=["code", "confidence"],
                    properties={
                        "code": types.Schema(type=types.Type.STRING, enum=list(codes)),
                        "confidence": types.Schema(type=types.Type.STRING, enum=list(CONFIDENCE_LEVELS)),
                    },
                ),
            ),
        },
    )


def official_selection(data, candidates: Sequence[Dict]) -> List[Dict]:
    """JSON do modelo -> [{code, description, confidence}] com código e descrição da
    tabela, no formato da rota /consultations/extract-icd10.

    Código fora dos candidatos é descartado: o schema já impede, mas um servidor que
    ignore o schema não pode fazer passar um código inventado. A descrição é sempre a
    oficial, e o que o modelo escrever além do código é ignorado.
    """
    items = data.get("diagnosticos") if isinstance(data, dict) else data
    official = {c["code"]: c for c in candidates}
    selected: List[Dict] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code") or "").strip().upper()
        row = official.get(code)
        if row is None:
            if code:
                logger.warning(f"[CID-10] Modelo devolveu código fora dos candidatos: {code!r}")
            continue
        if any(s["code"] == code for s in selected):
            continue
        confidence = str(item.get("confidence") or "").strip().lower()
        selected.append({
            "code": row["code"],
            "description": row["description"],
            "confidence": confidence if confidence in CONFIDENCE_LEVELS else "média",
        })
        if len(selected) == MAX_SELECTED:
            break
    return selected
