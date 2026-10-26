# tests/backend/test_clinical_sources.py
"""Standalone tests for the sources the local AI answers from (backend/services/clinical_sources.py).

Run directly (no pytest harness in this repo):
    python3 tests/backend/test_clinical_sources.py

Covers the pure parts: which questions ask for a source, matching catalog drugs in the
question, the numbered block that goes into the prompt, the context budget, and turning
the model's [n] markers into the final reference list. No database, no network.
"""
import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, project_root)

from qython.backend.services import clinical_sources as cs  # noqa: E402

# As 5 perguntas da bateria de out/2026 (scripts/bateria_copiloto.py).
BATERIA = [
    "Dose de amoxicilina para otite média aguda em criança de 20 kg? Responda em até 3 linhas.",
    "Critérios de choque séptico pelo Sepsis-3? Responda em até 3 linhas.",
    "Qual o antídoto na intoxicação por paracetamol? Responda em 1 linha.",
    "Tratamento da sífilis primária no adulto? Responda em até 2 linhas.",
    "Primeira droga e dose na anafilaxia em adulto? Responda em até 2 linhas.",
]


def _med(id_, name, principle, posology, **extra):
    med = {"id": id_, "name": name, "active_principle": principle, "presentation": None,
           "therapeutic_class": extra.get("klass"), "atc_code": None, "administration_route": "oral",
           "usual_posology": posology, "max_daily_dose": extra.get("max"),
           "common_indications": extra.get("ind"), "pregnancy_category": None,
           "renal_adjustment": False, "hepatic_adjustment": False}
    med["aliases"] = cs._alias_sets(med, extra.get("translated", ()))
    return med


CATALOGO = [
    _med(1, "Amoxicilina 500mg", "amoxicilina", "500 mg VO 8/8h", max="3g/dia",
         ind="Otite média aguda; sinusite", translated=["amoxicillin"]),
    _med(2, "Amoxicilina 250mg/5mL suspensão oral", "amoxicilina", "Crianças: 25-50 mg/kg/dia", max="3g/dia",
         ind="Otite média aguda; faringoamigdalite"),
    _med(3, "Amoxicilina + Clavulanato 875/125mg", "amoxicilina + clavulanato", "875/125 mg 12/12h"),
    _med(4, "Epinefrina (adrenalina) 1mg/ml", "epinefrina", "Anafilaxia: 0.3-0.5mg IM coxa"),
    _med(5, "Norepinefrina 2mg/ml", "norepinefrina", "0.1-0.5mcg/kg/min IV"),
    _med(6, "AAS 100mg", "ácido acetilsalicílico", "100 mg VO 1x/dia"),
]


def test_battery_questions_ask_for_sources():
    for q in BATERIA:
        assert cs.is_clinical_question(q), q


def test_small_talk_does_not():
    for q in ("Bom dia!", "Obrigado, ajudou muito", "Me ajude a escrever um e-mail para a secretaria",
              "Monte um cronograma de estudos para a residência"):
        assert not cs.is_clinical_question(q), q


def test_match_by_principle_synonym_and_translation():
    found = cs.match_medications(CATALOGO, "Primeira droga e dose de ADRENALINA na anafilaxia?")
    assert list(found) == ["epinefrina"]  # "norepinefrina" não casa com "epinefrina"
    found = cs.match_medications(CATALOGO, "amoxicillin dose for otitis")
    assert list(found) == ["amoxicilina"]
    found = cs.match_medications(CATALOGO, "acido acetilsalicilico na prevenção secundária")
    assert list(found) == ["acido acetilsalicilico"]


def test_combination_needs_every_component():
    found = cs.match_medications(CATALOGO, "Dose de amoxicilina na OMA?")
    assert list(found) == ["amoxicilina"]
    assert len(found["amoxicilina"]) == 2
    found = cs.match_medications(CATALOGO, "amoxicilina com clavulanato ou amoxicilina pura?")
    assert set(found) == {"amoxicilina", "amoxicilina + clavulanato"}


def test_condition_named_in_posology_brings_the_drug():
    meds = CATALOGO + [_med(7, "Penicilina Benzatina 1.200.000 UI", "penicilina benzatina",
                            "1.200.000 UI IM dose única (faringite). Sífilis primária: 2.400.000 UI IM dose única."),
                       _med(8, "Prednisolona 3mg/mL", "prednisolona", "Crianças: 1-2 mg/kg/dia")]
    assert list(cs.match_by_dosed_condition(meds, "Primeira droga e dose na anafilaxia em adulto?")) == ["epinefrina"]
    assert list(cs.match_by_dosed_condition(meds, "Tratamento da sífilis primária no adulto?")) == ["penicilina benzatina"]
    assert cs.match_by_dosed_condition(meds, "Sífilis secundária?") == {}  # rótulo de 2 palavras exige as 2
    assert cs.match_by_dosed_condition(meds, "Dose em crianças com asma?") == {}  # população não é doença
    generic = meds + [_med(9, "Adenosina 3mg/mL", "adenosina", "6mg IV rápido; se sem resposta: 12mg IV"),
                      _med(10, "Oseltamivir 75mg", "oseltamivir", "Tratamento: 75mg VO 12/12h; profilaxia: 75mg 1x/dia")]
    assert list(cs.match_by_dosed_condition(generic, "Tratamento da sífilis primária? Responda em 2 linhas.")) \
        == ["penicilina benzatina"]


def test_catalog_source_groups_presentations():
    src = cs.catalog_source(cs.match_medications(CATALOGO, "amoxicilina")["amoxicilina"])
    assert src.kind == "catalog" and src.ref["source_type"] == cs.CATALOG_SOURCE_TYPE
    assert src.ref["uri"] is None
    assert "Crianças: 25-50 mg/kg/dia" in src.text and "Dose máxima: 3g/dia" in src.text
    assert src.text.count("Otite média aguda") == 1  # indicação repetida entre apresentações
    assert "amoxicillin" in src.names


def test_catalog_warns_when_dose_is_not_for_the_asked_indication():
    rows = cs.match_medications(CATALOGO, "amoxicilina")["amoxicilina"]
    src = cs.catalog_source(rows, "Dose de amoxicilina para otite média aguda em criança?")
    assert "não traz dose específica para Otite média aguda" in src.text
    assert "não traz dose específica" not in cs.catalog_source(rows, "Dose de amoxicilina?").text
    epi = [dict(r, common_indications="Anafilaxia; parada cardiorrespiratória")
           for r in cs.match_medications(CATALOGO, "adrenalina")["epinefrina"]]
    assert "não traz dose específica" not in cs.catalog_source(epi, "adrenalina na anafilaxia").text


def test_rank_prefers_matching_population_and_numbers():
    pediatric = {"pmid": "1", "title": "International Consensus Criteria for Pediatric Sepsis and Septic Shock",
                 "abstract": "Septic shock in children: sepsis with cardiovascular dysfunction."}
    nasal = {"pmid": "2", "title": "Epinephrine nasal spray for anaphylaxis",
             "abstract": "A needle-free option for anaphylaxis."}
    adult = {"pmid": "3", "title": "The Third International Consensus Definitions for Sepsis and Septic Shock",
             "abstract": "Septic shock: vasopressor to keep MAP of 65 mm Hg and lactate greater than 2 mmol/L."}
    ranked = cs.rank_abstracts([pediatric, nasal, adult], "Sepsis-3 septic shock criteria", "Critérios do Sepsis-3?")
    assert [d["pmid"] for d in ranked] == ["3", "2"]  # o pediátrico sai
    ranked = cs.rank_abstracts([adult, pediatric], "septic shock criteria children", "Choque séptico em criança?")
    assert ranked[0]["pmid"] == "1"
    maternal = {"pmid": "4", "title": "Maternal Sepsis: A Review of National and International Guidelines",
                "abstract": "Sepsis definitions vary."}
    assert [d["pmid"] for d in cs.rank_abstracts([maternal, adult], "Sepsis-3 septic shock", "Sepsis-3?")] == ["3"]
    assert cs.rank_abstracts([maternal], "sepsis pregnancy", "Sepse na gestante?")[0]["pmid"] == "4"


def test_library_sources_keep_document_and_page():
    chunks = [
        ("Harrison — p.12\nA anafilaxia é tratada com adrenalina IM.", {"document_id": 7, "page": 12, "doc_title": "Harrison"}),
        ("texto sem metadado", {"document_id": 8}),
        ("descrição de imagem", {"document_id": 7, "content_type": "image_description"}),
    ]
    srcs = cs.library_sources(chunks, {8: "apostila.pdf"}, "Emergência")
    assert [s.ref["title"] for s in srcs] == ["Harrison, p. 12", "apostila.pdf"]
    assert srcs[0].text == "A anafilaxia é tratada com adrenalina IM."
    assert srcs[0].ref["source_type"] == cs.LIBRARY_SOURCE_TYPE


def test_fit_to_budget_cuts_long_and_drops_tail():
    big = cs.Source("pubmed", "PubMed: A", "palavra " * 2000, {"title": "A"})
    small = cs.Source("catalog", "Catálogo: B", "dose 1 mg", {"title": "B"})
    kept = cs.fit_to_budget([big, small], 1300)
    assert [s.header for s in kept] == ["PubMed: A", "Catálogo: B"]
    assert kept[0].text.endswith("[...]") and cs.llm_provider.approx_tokens(kept[0].text) <= 1002
    assert cs.fit_to_budget([big, small], 100) == []


def test_sources_block_is_numbered():
    block = cs.sources_block([cs.Source("catalog", "Catálogo: X", "a", {}), cs.Source("pubmed", "PubMed: Y", "b", {})])
    assert block.startswith("<FONTES>\n[1] Catálogo: X\na\n\n[2] PubMed: Y\nb\n</FONTES>")


def _three():
    return [cs.Source("catalog", "C", "0,3-0,5 mg IM", {"title": "catálogo"}, names=("epinefrina",)),
            cs.Source("library", "L", "trecho", {"title": "biblioteca"}),
            cs.Source("pubmed", "P", "lactate > 2 mmol/L and MAP 65 mmHg", {"title": "Sepsis-3"})]


def test_citations_renumbered_by_first_use():
    text, refs = cs.cite_used_sources("Lactato > 2 [3]. Adrenalina IM [1, 3].", _three())
    assert text == "Lactato > 2 [1]. Adrenalina IM [2][1]."
    assert [r["title"] for r in refs] == ["Sepsis-3", "catálogo"]


def test_invalid_numbers_are_removed():
    text, refs = cs.cite_used_sources("Dose X [7]. Critério Y [Fonte 2]. Faixa [1-2].", _three())
    assert text == "Dose X. Critério Y [1]. Faixa [2][1]."
    assert [r["title"] for r in refs] == ["biblioteca", "catálogo"]


def test_glued_markers_and_parenthesis_form():
    text, refs = cs.cite_used_sources("[3] Lactato > 2 [3][1]. Choque (Fonte 2). Item (2) da lista.", _three())
    assert text == "[1] Lactato > 2 [1][2]. Choque [3]. Item (2) da lista."
    assert [r["title"] for r in refs] == ["Sepsis-3", "catálogo", "biblioteca"]


def test_no_marker_falls_back_to_visible_use():
    text, refs = cs.cite_used_sources("Choque: lactato acima de 2 mmol/L com vasopressor.", _three())
    assert text == "Choque: lactato acima de 2 mmol/L com vasopressor."
    assert [r["title"] for r in refs] == ["Sepsis-3"]
    _, refs = cs.cite_used_sources("Use epinefrina intramuscular.", _three())
    assert [r["title"] for r in refs] == ["catálogo"]
    _, refs = cs.cite_used_sources("Sem relação nenhuma.", _three())
    assert refs == []


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} testes passaram")
