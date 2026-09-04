"""
Smoke/unit tests for the 2026-05 data-flywheel safety + reference fixes.

Pure logic — no DB, no network. Covers:
  - PII gate: discard when Presidio unavailable; redact (not discard) when available (P0)
  - PATIENT_ORIGIN_PREFIXES classification (P0)
  - get_content_hash uses full content, not just first 1000 chars (P2)
  - remove_references_section strips the [REFS] block (underlies the leak fix, P0)
  - NCBI PubMed key plumbing present (P1)

Run standalone:  PYTHONPATH=<repo-root> python tests/backend/test_flywheel_safety.py
Or with pytest:  pytest tests/backend/test_flywheel_safety.py
"""
import backend.middleware.pii_redaction as pr
from backend.services.data_collector_service import (
    get_content_hash,
    PATIENT_ORIGIN_PREFIXES,
)
from backend.services import reference_service as rs


def _is_patient_origin(source_type: str) -> bool:
    return any(source_type.startswith(p) for p in PATIENT_ORIGIN_PREFIXES)


def test_pii_discard_when_presidio_unavailable():
    # Degraded env (Presidio not installed): names can't be scrubbed reliably,
    # so patient-PII candidates MUST be discarded rather than stored.
    pr._try_init_presidio()
    assert pr._presidio_available in (False, None), "test expects Presidio absent"
    r = pr.assess_for_training("Paciente João da Silva, CPF 123.456.789-00, HAS.")
    assert r["should_discard"] is True
    assert r["redaction_reliable"] is False


def test_clean_medical_text_not_discarded():
    r = pr.assess_for_training("Qual a dose de amoxicilina para otite média aguda em adultos?")
    assert r["should_discard"] is False


def test_pii_redacted_not_discarded_when_presidio_available():
    # When redaction IS reliable, patient PII is redacted+anon, not discarded.
    orig_avail, orig_redact = pr._presidio_available, pr.redact_for_llm
    try:
        pr._presidio_available = True
        pr.redact_for_llm = lambda text, **kw: ("[REDACTED]", {})
        r = pr.assess_for_training("Paciente João, CPF 123.456.789-00")
        assert r["should_discard"] is False
        assert r["redaction_reliable"] is True
    finally:
        pr._presidio_available, pr.redact_for_llm = orig_avail, orig_redact


def test_patient_origin_prefixes():
    patient = [
        "consultation_raw_only", "consultation_improvement", "prescription",
        "exam_order", "icd10_extraction", "medical_document_report",
        "image_diagnosis", "patient_orientation_ai_generated", "draft_generation",
    ]
    physician = [
        "chat_interaction", "chat_clinical_discussion", "library_rag_chat",
        "summary_generation", "podcast_script",
    ]
    for st in patient:
        assert _is_patient_origin(st), f"{st} should be patient-origin (always anon)"
    for st in physician:
        assert not _is_patient_origin(st), f"{st} should NOT be forced anon"


def test_content_hash_uses_full_content():
    shared = "x" * 1500  # identical first 1000 chars on both
    h1 = get_content_hash(shared + "AAA", "out")
    h2 = get_content_hash(shared + "BBB", "out")
    assert h1 != h2, "distinct inputs sharing a 1000-char prefix must not collide"


def test_remove_references_section_strips_refs_block():
    text = "Resposta clínica detalhada.\n\n[REFS]\n1. Smith J et al. PMID: 12345678\n"
    cleaned = rs.remove_references_section(text)
    assert "[REFS]" not in cleaned
    assert "PMID: 12345678" not in cleaned
    assert "Resposta clínica detalhada." in cleaned


def test_ncbi_key_plumbing_present():
    assert hasattr(rs, "NCBI_API_KEY")
    assert rs.PUBMED_BASE_DELAY in (0.6, 0.12)  # 0.6 without key, 0.12 with key


if __name__ == "__main__":
    import sys
    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"FAIL  {fn.__name__}: {e}")
        except Exception as e:
            print(f"ERROR {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{passed}/{len(fns)} passed")
    sys.exit(0 if passed == len(fns) else 1)
