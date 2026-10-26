# tests/backend/test_icd10_candidates.py
"""Tests for ICD-10 from the official table (backend/services/icd10_search.py): the
candidate search behind consultation coding, and the autocomplete behind
/api/icd10/search and /api/icd10/popular.

Run directly (no pytest harness in this repo):
    python3 tests/backend/test_icd10_candidates.py

Without a database, runs the pure logic: normalization, synonyms, segments, codes
cited after "CID", the DATASUS file parsing, the enum schema and the swap of the
model's output for the official row.

With ICD10_TEST_DATABASE_URL set (Postgres, e.g. postgresql://qython@127.0.0.1/qython),
seeds the table into a throwaway schema (qython_test_icd10, dropped at the end; the
database's own tables are not touched) and checks that the candidate search brings
the right code for classic cases: inferior MI -> I21.1, HAS -> I10, DM2 -> E11.9.
It also checks the autocomplete ordering ("hipertensao" -> I10 first, "infarto
infer" -> I21.1 first) and that the common codes come with official descriptions.

With LLM_BASE_URL set too (a llama-server, see test_llm_provider_live.py), runs the
real selection and checks the model only returns table codes and gets the classic
cases right.
"""
import asyncio
import json
import os
import re
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, project_root)

from qython.backend.seeds.seed_icd10 import load_icd10_rows  # noqa: E402
from qython.backend.services import icd10_search as s  # noqa: E402
from qython.backend.services import llm_provider as lp  # noqa: E402

DATABASE_URL = os.environ.get("ICD10_TEST_DATABASE_URL")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL")
TEST_SCHEMA = "qython_test_icd10"

# (notas, códigos que precisam estar entre os candidatos). Código de 3 caracteres
# vale por qualquer subcategoria dele.
CASES = {
    "iam_inferior": (
        "Paciente masculino, 62 anos, hipertenso e diabético tipo 2. Dor torácica opressiva há 2 horas, "
        "irradiando para braço esquerdo, com sudorese. ECG com supradesnivelamento do segmento ST em DII, "
        "DIII e aVF. Troponina elevada. Conduta: AAS, clopidogrel, heparina e encaminhado para hemodinâmica.",
        ["I21.1", "I10", "E11.9"]),
    "has": (
        "Paciente de 55 anos em acompanhamento por HAS, em uso de losartana 50 mg. PA hoje 150x95 mmHg. "
        "Nega dor torácica. Orientado dieta hipossódica e atividade física.",
        ["I10"]),
    "dm2": (
        "Mulher, 48 anos, DM2 há 5 anos em uso de metformina 850 mg 2x/dia. HbA1c 8,2%. Sem queixas. "
        "Sem complicações micro ou macrovasculares conhecidas. Ajustada dose.",
        ["E11.9"]),
    "sem_acento": (
        "paciente com diabetes tipo 2 e hipertensao arterial, refere poliuria e polidipsia. glicemia de jejum 230",
        ["E11", "I10"]),
    "iam_anterior": (
        "Homem de 58 anos com dor precordial intensa há 1 hora. ECG: supra de ST de V1 a V4. "
        "Diagnóstico: IAM com supra de parede anterior. Trombólise.",
        ["I21.0"]),
    "iam_sem_supra": (
        "Paciente com dor torácica em repouso, troponina positiva, ECG sem supra de ST, com "
        "infradesnivelamento em V5 e V6. IAMSSST. Iniciada anticoagulação.",
        ["I21.4"]),
    "pneumonia": (
        "Febre há 3 dias, tosse produtiva com expectoração amarelada, dispneia. Ausculta com crepitações em "
        "base direita. RX: consolidação em lobo inferior direito. Hipótese: pneumonia adquirida na "
        "comunidade. Amoxicilina + azitromicina.",
        ["J18"]),
    "cistite": (
        "Mulher de 30 anos com disúria, polaciúria e urgência miccional há 2 dias. Sem febre. EAS com "
        "leucocitúria e nitrito positivo. Cistite aguda. Prescrita nitrofurantoína.",
        ["N30.0"]),
    "asma": (
        "Criança de 8 anos com crises de sibilância e tosse noturna, melhora com salbutamol. Asma persistente "
        "leve. Iniciado corticoide inalatório.",
        ["J45"]),
    "depressao": (
        "Paciente relata tristeza persistente, anedonia, insônia e perda de apetite há 2 meses. Episódio "
        "depressivo moderado. Iniciada sertralina 50 mg.",
        ["F32.1"]),
    "icc_fa": (
        "Idoso de 78 anos com ICC descompensada, edema de membros inferiores e ortopneia. ECG com fibrilação "
        "atrial de alta resposta. Furosemida venosa e controle de frequência.",
        ["I50.0", "I48"]),
    "avc_isquemico": (
        "Paciente com hemiparesia direita súbita e afasia há 3 horas. TC de crânio sem sangramento. AVC "
        "isquêmico. Acionado protocolo de trombólise.",
        ["I63"]),
    "lombalgia": (
        "Dor lombar há 2 semanas após esforço, sem irradiação, sem déficit neurológico. Lombalgia mecânica. "
        "Analgésico e fisioterapia.",
        ["M54.5"]),
    "dpoc": (
        "Tabagista de longa data, 40 maços-ano, com DPOC em exacerbação: piora da dispneia e aumento da "
        "secreção purulenta. Prednisona e antibiótico.",
        ["J44.1"]),
    "hipotireoidismo": (
        "TSH 12, T4 livre baixo, cansaço e ganho de peso. Hipotireoidismo primário. Levotiroxina 50 mcg.",
        ["E03"]),
    "cid_citado": (
        "Retorno. Paciente estável, sem queixas novas. CID: J45.9 e I10. Mantida medicação.",
        ["J45.9", "I10"]),
    "dengue": (
        "Febre alta há 3 dias, mialgia intensa, dor retro-orbitária, exantema. Prova do laço positiva. "
        "Plaquetas 110 mil. Dengue sem sinais de alarme. Hidratação oral.",
        ["A90"]),
    "gastroenterite": (
        "Criança com diarreia aguda e vômitos há 1 dia, sem sangue nas fezes, levemente desidratada. GECA. "
        "Soro de reidratação oral.",
        ["A09"]),
    "enxaqueca": (
        "Cefaleia pulsátil unilateral com fotofobia e náuseas, episódios recorrentes. Migrânea sem aura. "
        "Triptano na crise.",
        ["G43.0"]),
    "drc_diabetica": (
        "Diabético tipo 2 com nefropatia diabética, creatinina 2,1, DRC estágio 3b. Ajuste de dose da "
        "metformina.",
        ["E11.2", "N18"]),
    "faringoamigdalite": (
        "Dor de garganta há 3 dias, febre 38,5, amígdalas hiperemiadas com exsudato, sem tosse. "
        "Faringoamigdalite bacteriana. Amoxicilina 10 dias.",
        ["J03"]),
    "otite": (
        "Criança de 3 anos com otalgia à direita e febre. Otoscopia: membrana timpânica abaulada e "
        "hiperemiada. Otite média aguda.",
        ["H66"]),
    "tep": (
        "Dispneia súbita e dor pleurítica após viagem longa. Angiotomografia com falha de enchimento em "
        "artéria pulmonar direita. TEP. Anticoagulação plena.",
        ["I26"]),
    "colelitiase": (
        "Dor em hipocôndrio direito após refeições gordurosas. USG: múltiplos cálculos na vesícula biliar, "
        "sem sinais de colecistite. Colelitíase sintomática, encaminhada à cirurgia.",
        ["K80"]),
    "ansiedade": (
        "Preocupação excessiva e constante há 1 ano, tensão muscular, irritabilidade e dificuldade para "
        "dormir. Transtorno de ansiedade generalizada. Escitalopram.",
        ["F41.1"]),
    "fratura_radio": (
        "Queda da própria altura com dor e deformidade em punho direito. RX: fratura da extremidade distal "
        "do rádio. Imobilização gessada.",
        ["S52"]),
}

# Casos em que o modelo precisa acertar o código exato na escolha ao vivo.
LIVE_EXPECTED = {
    "iam_inferior": "I21.1",
    "has": "I10",
    "dm2": "E11",
}


def _has(codes, expected):
    return any(c == expected or (len(expected) == 3 and c.startswith(expected)) for c in codes)


# --------------------------------------------------------------------------- #
# Sem banco
# --------------------------------------------------------------------------- #

def test_normalize_strips_accents_and_case():
    assert s.normalize("Hipertensão ESSENCIAL (primária)") == "hipertensao essencial (primaria)"


def test_synonyms_bring_table_vocabulary():
    vocab = s.table_vocabulary(s.normalize("ECG com supra de ST em DII, DIII e aVF"))
    assert "infarto agudo transmural" in vocab and "parede inferior" in vocab, vocab
    assert "hipertensao essencial" in s.table_vocabulary("paciente com has")
    # Diabetes tipo 2 é "não-insulino-dependente" na tabela de 2008; o hífen mantém a
    # palavra composta que separa o E11 do E10.
    assert "nao-insulino-dependente" in s.table_vocabulary(s.normalize("DM tipo 2"))
    # Siglas ambíguas no prontuário ficam sem sinônimo.
    assert s.table_vocabulary("hda: dor ha 2 dias, ar ambiente, dii") == ""


def test_segments_keep_decimals_and_add_clauses():
    segs = [seg.words for seg in s.segments("Losartana 2.5 mg. HAS, DM2\nRetorno")]
    assert segs[:3] == ["losartana 2.5 mg", "has, dm2", "retorno"], segs
    assert "has" in segs and "dm2" in segs, segs


def test_explicit_codes_only_after_cid():
    assert s.explicit_codes("Diagnósticos — CID-10: J45.9, I10 e E119.") == ["J45.9", "I10", "E11.9"]
    # T12 aqui é a vértebra, não o código.
    assert s.explicit_codes("Fratura de T12 após queda.") == []


def test_note_noise_is_dropped_but_synonym_vocabulary_is_kept():
    lexemes = s.query_lexemes(["conduta", "pacient", "exam", "pneumon"], ["exam", "medic", "geral"])
    assert "pacient" not in lexemes and "pneumon" in lexemes, lexemes
    assert {"exam", "medic", "geral"} <= set(lexemes), lexemes


def test_datasus_file_parsing():
    rows = load_icd10_rows()
    by_code = {r["code"]: r for r in rows}
    assert len(rows) == len(by_code) == 12451, len(rows)
    assert by_code["I21.1"]["description"] == "Infarto agudo transmural da parede inferior do miocárdio"
    assert by_code["I21.0"]["description"] == "Infarto agudo transmural da parede anterior do miocárdio"
    assert by_code["I10"]["description"] == "Hipertensão essencial (primária)"
    assert by_code["E11.9"]["description"] == "Diabetes mellitus não-insulino-dependente - sem complicações"
    assert by_code["I21.1"]["category_description"] == "Infarto agudo do miocárdio"
    assert by_code["I48"]["category_description"] == '"Flutter" e fibrilação atrial'
    assert by_code["A06.5"]["classification"] == "+" and by_code["O80.0"]["sex_restriction"] == "F"
    assert by_code["I21.1"]["search_description"] == "infarto agudo transmural da parede inferior do miocardio"


SPECIALTIES_JS = os.path.join(os.path.dirname(__file__), '..', '..', 'packages', 'shared', 'src',
                              'ambulatory', 'specialties.js')


def test_popular_codes_exist_with_official_rows():
    by_code = {r["code"]: r for r in load_icd10_rows()}
    for code in [c for codes in s.POPULAR_CODES.values() for c in codes] + s.GENERAL_POPULAR_CODES:
        assert code in by_code, code
        assert by_code[code]["classification"] != "*", code
    # A lista antiga chamava o M79.3 (paniculite) de fibromialgia.
    assert "M79.7" in s.POPULAR_CODES["Reumatologia"] and by_code["M79.7"]["description"] == "Fibromialgia"
    assert "M79.3" not in s.POPULAR_CODES["Reumatologia"]


def test_popular_specialties_use_the_shared_names():
    names = set(re.findall(r"^\s*'([^']+)',", open(SPECIALTIES_JS, encoding="utf-8").read(), re.M))
    assert "Cardiologia" in names and "Ginecologia e Obstetrícia" in names, names
    assert set(s.POPULAR_CODES) <= names, set(s.POPULAR_CODES) - names
    assert s.popular_codes_for("endocrinologia") == s.POPULAR_CODES["Endocrinologia e Metabologia"]
    assert s.popular_codes_for("GINECOLOGIA E OBSTETRICIA") == s.POPULAR_CODES["Ginecologia e Obstetrícia"]
    assert s.popular_codes_for("Anestesiologia") == [] and s.popular_codes_for(None) == []


CANDIDATES = [
    {"code": "I21.0", "description": "Infarto agudo transmural da parede anterior do miocárdio",
     "category": "I21", "category_description": "Infarto agudo do miocárdio"},
    {"code": "I21.1", "description": "Infarto agudo transmural da parede inferior do miocárdio",
     "category": "I21", "category_description": "Infarto agudo do miocárdio"},
    {"code": "I10", "description": "Hipertensão essencial (primária)",
     "category": "I10", "category_description": "Hipertensão essencial (primária)"},
]


def test_schema_enum_reaches_both_providers():
    schema = s.selection_schema([c["code"] for c in CANDIDATES])
    # Gemini: o próprio types.Schema. IA local: o JSON Schema do response_format.
    json_schema = lp._json_schema(schema)
    item = json_schema["properties"]["diagnosticos"]["items"]
    assert item["properties"]["code"]["enum"] == ["I21.0", "I21.1", "I10"], item
    assert item["properties"]["confidence"]["enum"] == ["alta", "média", "baixa"], item


def test_instruction_lists_every_candidate_under_its_category():
    text = s.selection_instruction(CANDIDATES)
    assert "I21 Infarto agudo do miocárdio\n  I21.0 — " in text, text
    assert all(c["code"] in text for c in CANDIDATES)


def test_official_selection_uses_table_rows():
    data = {"diagnosticos": [
        {"code": "i21.1", "description": "IAM sem supra", "confidence": "Alta"},
        {"code": "I20.0", "confidence": "alta"},  # fora dos candidatos
        {"code": "I21.1", "confidence": "baixa"},  # repetido
        {"code": "I10", "confidence": "certeza"},
    ]}
    assert s.official_selection(data, CANDIDATES) == [
        {"code": "I21.1", "description": "Infarto agudo transmural da parede inferior do miocárdio",
         "confidence": "alta"},
        {"code": "I10", "description": "Hipertensão essencial (primária)", "confidence": "média"},
    ]


def test_official_selection_caps_and_tolerates_bare_list():
    many = [{"code": c["code"], "confidence": "alta"} for c in CANDIDATES] * 2
    assert len(s.official_selection({"diagnosticos": many}, CANDIDATES + [
        {"code": "E11.9", "description": "x", "category": "E11", "category_description": "y"}])) == 3
    assert [r["code"] for r in s.official_selection([{"code": "I10"}], CANDIDATES)] == ["I10"]
    assert s.official_selection({"diagnosticos": "I10"}, CANDIDATES) == []


# --------------------------------------------------------------------------- #
# Com banco (ICD10_TEST_DATABASE_URL)
# --------------------------------------------------------------------------- #

def _async_url(url):
    for prefix in ("postgresql+asyncpg://", "postgresql+psycopg://", "postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+asyncpg://" + url[len(prefix):]
    return url


async def _with_seeded_db(check):
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from qython.backend.models import Icd10Code
    from qython.backend.seeds.seed_icd10 import seed_icd10

    admin = create_async_engine(_async_url(DATABASE_URL))
    async with admin.begin() as conn:
        await conn.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))
        await conn.execute(text(f"CREATE SCHEMA {TEST_SCHEMA}"))
    engine = create_async_engine(_async_url(DATABASE_URL),
                                 connect_args={"server_settings": {"search_path": TEST_SCHEMA}})
    try:
        async with engine.begin() as conn:
            await conn.run_sync(lambda sync: Icd10Code.__table__.create(sync))
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            assert await seed_icd10(db) == 12451
            assert await seed_icd10(db) == 0, "o seed precisa ser idempotente"
            s._total_codes = None
            await check(db)
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))
        await admin.dispose()


async def _check_candidates(db):
    from sqlalchemy import text
    asterisk = {r[0] for r in (await db.execute(text(
        "SELECT code FROM icd10_codes WHERE classification = '*'"))).all()}
    failures = []
    for name, (notes, expected) in CASES.items():
        candidates = await s.search_candidates(db, notes)
        codes = [c["code"] for c in candidates]
        assert len(codes) <= s.DEFAULT_LIMIT, (name, len(codes))
        assert not asterisk & set(codes), (name, asterisk & set(codes))
        missing = [e for e in expected if not _has(codes, e)]
        print(f"      {'ok ' if not missing else 'FALTOU'} {name}: {len(codes)} candidatos"
              + (f", faltou {missing}" if missing else ""))
        if missing:
            failures.append((name, missing))
    assert not failures, failures


# (o que se digita, especialidade, o primeiro resultado (None: qualquer um), códigos
# que precisam aparecer)
AUTOCOMPLETE = [
    ("I21", None, "I21.0", ["I21.1", "I21.9"]),
    ("i21.1", None, "I21.1", []),
    ("e119", None, "E11.9", []),
    ("hipertensão", None, "I10", ["I15.0"]),
    ("hipert", None, "I10", []),
    ("infarto infer", None, "I21.1", ["I22.1"]),
    ("infarto", "Cardiologia", "I21.9", ["I21.4", "I21.0"]),
    ("HAS", None, "I10", []),
    ("dm2", None, "E11.9", ["E11.0"]),
    ("diabetes tipo 2", None, "E11.9", []),
    ("fibromialgia", None, "M79.7", []),
    ("pneumonia", None, "J18.9", ["J18.0"]),
    ("doenca de chagas", None, None, ["B57.2"]),
]


async def _check_autocomplete(db):
    from sqlalchemy import text
    asterisk = {r[0] for r in (await db.execute(text(
        "SELECT code FROM icd10_codes WHERE classification = '*'"))).all()}
    failures = []
    for query, specialty, first, expected in AUTOCOMPLETE:
        rows = await s.autocomplete(db, query, specialty, 10)
        codes = [r["code"] for r in rows]
        assert len(codes) <= 10 and not asterisk & set(codes), (query, codes)
        assert all(set(r) == {"code", "description"} for r in rows), rows
        ok = (first is None or (codes and codes[0] == first)) and all(c in codes for c in expected)
        print(f"      {'ok ' if ok else 'ERRO'} {query!r}: {codes[:5]}")
        if not ok:
            failures.append((query, first, expected, codes))
    assert not failures, failures
    assert await s.autocomplete(db, "zz") == [] and await s.autocomplete(db, "de") == []

    general = await s.popular(db)
    assert [r["code"] for r in general] == s.GENERAL_POPULAR_CODES, general
    rheuma = await s.popular(db, "Reumatologia")
    assert {"code": "M79.7", "description": "Fibromialgia", "specialty": "Reumatologia"} in rheuma, rheuma
    assert [r["code"] for r in await s.popular(db, "cardiologia", 3)] == ["I10", "I11.9", "I20.9"]
    assert await s.popular(db, "Anestesiologia") == []


async def _check_live_selection(db):
    from google.genai import types

    client = lp.OpenAICompatibleClient(base_url=LLM_BASE_URL, model=os.environ.get("LLM_MODEL", "local"),
                                       timeout=600)
    failures = []
    for name, expected in LIVE_EXPECTED.items():
        notes = CASES[name][0]
        candidates = await s.search_candidates(db, notes)
        config = types.GenerateContentConfig(
            system_instruction=s.selection_instruction(candidates), temperature=0.1, max_output_tokens=256,
            response_mime_type="application/json",
            response_schema=s.selection_schema([c["code"] for c in candidates]))
        response = await asyncio.to_thread(client.models.generate_content, model="models/local",
                                           contents=s.selection_prompt(notes), config=config)
        raw = json.loads(response.text)
        selected = s.official_selection(raw, candidates)
        codes = [r["code"] for r in selected]
        # Tudo o que o modelo escreveu precisa ser código da tabela, já sem filtro.
        written = [str(item.get("code")) for item in raw.get("diagnosticos", [])]
        assert all(code in {c["code"] for c in candidates} for code in written), (name, written)
        print(f"      {name}: {codes}")
        if not _has(codes, expected):
            failures.append((name, expected, codes))
    assert not failures, failures


def test_db_candidates_contain_expected_codes():
    asyncio.run(_with_seeded_db(_check_candidates))


def test_db_autocomplete_and_popular():
    asyncio.run(_with_seeded_db(_check_autocomplete))


def test_live_selection_returns_table_codes():
    asyncio.run(_with_seeded_db(_check_live_selection))


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = skipped = 0
    for fn in tests:
        if fn.__name__.startswith("test_db_") and not DATABASE_URL:
            print(f"SKIP  {fn.__name__} (defina ICD10_TEST_DATABASE_URL)")
            skipped += 1
            continue
        if fn.__name__.startswith("test_live_") and not (DATABASE_URL and LLM_BASE_URL):
            print(f"SKIP  {fn.__name__} (defina ICD10_TEST_DATABASE_URL e LLM_BASE_URL)")
            skipped += 1
            continue
        try:
            fn()
            print(f"PASS  {fn.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"FAIL  {fn.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            print(f"ERROR {fn.__name__}: {type(e).__name__}: {e}")
    ran = len(tests) - skipped
    print(f"\n{passed}/{ran} passed" + (f", {skipped} skipped" if skipped else ""))
    sys.exit(0 if passed == ran else 1)
