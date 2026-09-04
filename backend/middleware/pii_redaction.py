# qython/backend/middleware/pii_redaction.py
"""
PII redaction middleware for outbound LLM calls.

Wraps the most common pattern in the codebase — sending text prompts to
Gemini / OpenAI / Anthropic / OpenRouter — with a redaction step that strips
identifying information BEFORE the request leaves our server.

Architecture:
    - Primary engine: Microsoft Presidio (multi-country, ML-augmented)
        * Loaded lazily on first call; import errors fall back gracefully.
    - Fallback engine: pii_detector.py (regex-based, 14 countries, already
      proven in this codebase).

Both engines produce consistent placeholders (`[PATIENT_NAME]`, `[CPF_xxxx]`,
etc.) so downstream consumers don't care which one ran.

Reversibility (optional): when `preserve_tokens=True` is requested, an
in-memory token map is kept with a 1-hour TTL. This is useful for UX where
we want to substitute tokens back in the LLM response — but the server
restart wipes the map (intentional: tokens are not persisted on disk).

Usage:
    from backend.middleware.pii_redaction import redact_for_llm

    safe_text, token_map = redact_for_llm(
        text=user_message,
        country="BR",  # or "auto"
        preserve_tokens=True,
    )
    response = await gemini.generate_content(safe_text)
    final = restore_tokens(response.text, token_map) if token_map else response.text
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from threading import Lock
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)


# ---- Token map cache (in-memory, TTL-bound, restart-wiping) ----

_TOKEN_TTL_SECONDS = 3600
_token_lock = Lock()
_token_maps: Dict[str, "TokenMap"] = {}


@dataclass
class TokenMap:
    """Bidirectional map between placeholders and their original values.
    Lives only in memory; cleared after TTL or restart."""

    id: str
    created_at: float
    forward: Dict[str, str] = field(default_factory=dict)  # placeholder -> original
    reverse: Dict[str, str] = field(default_factory=dict)  # original -> placeholder
    counter: int = 0

    def get_placeholder(self, category: str, value: str) -> str:
        """Return stable placeholder for (category, value). Same value within
        the same map always yields the same placeholder."""
        if value in self.reverse:
            return self.reverse[value]
        self.counter += 1
        placeholder = f"[{category.upper()}_{self.counter:03d}]"
        self.forward[placeholder] = value
        self.reverse[value] = placeholder
        return placeholder


def _purge_expired_maps() -> None:
    now = time.time()
    with _token_lock:
        expired = [k for k, m in _token_maps.items()
                   if now - m.created_at > _TOKEN_TTL_SECONDS]
        for k in expired:
            _token_maps.pop(k, None)


def _new_token_map() -> TokenMap:
    _purge_expired_maps()
    tm = TokenMap(id=str(uuid.uuid4()), created_at=time.time())
    with _token_lock:
        _token_maps[tm.id] = tm
    return tm


def get_token_map(token_map_id: str) -> Optional[TokenMap]:
    _purge_expired_maps()
    with _token_lock:
        return _token_maps.get(token_map_id)


# ---- Presidio engine (lazy import) ----

_presidio_analyzer = None
_presidio_anonymizer = None
_presidio_available: Optional[bool] = None
_presidio_languages: tuple = ()


def _build_br_recognizers(languages: list):
    """Build PatternRecognizers for Brazilian structured PII. These augment
    the spaCy NER, which doesn't recognize CPF/CNS/CEP/CRM/phone formats.

    Registered for every supported language (the patterns are language-neutral;
    a CPF is a CPF regardless of the surrounding prose language).
    """
    from presidio_analyzer import Pattern, PatternRecognizer

    # (entity, [(name, regex, score)], context_words)
    specs = [
        ("BR_CPF", [
            ("cpf", r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b", 0.6),
        ], ["cpf", "documento", "doc"]),
        ("BR_CNS", [
            # Cartão Nacional de Saúde — 15 digits, often space-grouped
            ("cns", r"\b\d{3}\s?\d{4}\s?\d{4}\s?\d{4}\b", 0.5),
        ], ["cns", "cartão sus", "cartao sus", "sus"]),
        ("BR_CEP", [
            ("cep", r"\b\d{5}-?\d{3}\b", 0.3),
        ], ["cep", "endereço", "endereco", "rua", "av", "avenida"]),
        ("BR_CRM", [
            ("crm", r"\bCRM[\s/:-]?\d{4,6}[\s/:-]?[A-Z]{2}\b", 0.85),
        ], ["crm", "médico", "medico", "conselho"]),
        ("BR_RG", [
            ("rg", r"\bRG[\s:]*\d{1,2}\.?\d{3}\.?\d{3}-?[\dxX]\b", 0.7),
        ], ["rg", "identidade", "registro geral"]),
        ("BR_PHONE", [
            ("phone_br", r"(?:\+55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b", 0.5),
        ], ["telefone", "tel", "celular", "contato", "fone", "whatsapp"]),
        # Person-name fallback: the spaCy NER has imperfect recall on PT names
        # (e.g. misses "João da Silva" in some contexts). This catches 2-4
        # consecutive capitalized words. Base score 0.4 stays BELOW the 0.6
        # redaction threshold on its own; it only fires when a clinical context
        # word ("paciente", "acompanhante", ...) is nearby and bumps the score
        # past threshold. Keeps false positives (e.g. capitalized disease names
        # with no nearby person-keyword) from being over-redacted.
        ("BR_PERSON_CTX", [
            ("nome_proprio",
             r"\b[A-ZÀ-Ý][a-zà-ýâ-û]{1,}(?:\s+(?:d[aeiou]s?\s+)?[A-ZÀ-Ý][a-zà-ýâ-û]{1,}){1,3}\b",
             0.4),
        ], ["paciente", "acompanhante", "genitora", "genitor", "mãe", "mae",
            "pai", "nome", "sr", "sra", "senhor", "senhora", "nasc", "filho",
            "filha", "responsável", "responsavel"]),
    ]

    recognizers = []
    for entity, raw_patterns, context in specs:
        patterns = [Pattern(name=n, regex=r, score=s) for n, r, s in raw_patterns]
        for lang in languages:
            recognizers.append(PatternRecognizer(
                supported_entity=entity,
                patterns=patterns,
                context=context,
                supported_language=lang,
            ))
    return recognizers


def _try_init_presidio() -> bool:
    """Attempt to initialize Presidio with a multi-language NLP engine
    (PT-BR + EN by default). Cached after first attempt."""
    global _presidio_analyzer, _presidio_anonymizer, _presidio_available, _presidio_languages

    if _presidio_available is not None:
        return _presidio_available

    try:
        from presidio_analyzer import AnalyzerEngine
        from presidio_analyzer.nlp_engine import NlpEngineProvider
        from presidio_anonymizer import AnonymizerEngine

        # Probe which spaCy models are available; load only those.
        models = []
        for lang, model_name in (("pt", "pt_core_news_lg"),
                                 ("en", "en_core_web_lg")):
            try:
                import spacy
                spacy.load(model_name)
                models.append({"lang_code": lang, "model_name": model_name})
            except Exception:
                logger.info("PII redaction: spaCy model %s not installed", model_name)

        if not models:
            _presidio_available = False
            logger.warning(
                "PII redaction: no spaCy models available. "
                "Install with: python -m spacy download pt_core_news_lg"
            )
            return False

        provider = NlpEngineProvider(nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": models,
        })
        nlp_engine = provider.create_engine()
        supported_languages = [m["lang_code"] for m in models]

        _presidio_analyzer = AnalyzerEngine(
            nlp_engine=nlp_engine,
            supported_languages=supported_languages,
        )

        # Register Brazilian structured-PII recognizers. The generic spaCy
        # NER catches names/locations but misses CPF/CNS/CEP/CRM/phone — those
        # have deterministic formats best matched with regex.
        for recognizer in _build_br_recognizers(supported_languages):
            _presidio_analyzer.registry.add_recognizer(recognizer)

        _presidio_anonymizer = AnonymizerEngine()
        _presidio_languages = tuple(supported_languages)
        _presidio_available = True
        logger.info(
            "PII redaction: Presidio engine initialized (languages=%s, +BR recognizers)",
            supported_languages,
        )
    except ImportError as exc:
        _presidio_available = False
        logger.info(
            "PII redaction: Presidio not available (%s). "
            "Falling back to regex-based pii_detector.",
            exc.name if hasattr(exc, 'name') else str(exc),
        )
    except Exception as exc:
        _presidio_available = False
        logger.warning(
            "PII redaction: Presidio initialization failed: %s. "
            "Falling back to regex-based pii_detector.",
            exc,
        )

    return _presidio_available


# ---- Public API ----

def redact_for_llm(
    text: str,
    *,
    country: str = "BR",
    preserve_tokens: bool = False,
    confidence_threshold: float = 0.6,
) -> Tuple[str, Optional[TokenMap]]:
    """Redact PII from text before sending to an external LLM.

    Args:
        text: source text (the LLM prompt or context).
        country: 'BR', 'AR', 'CL', ... or 'auto'. Hints which patterns to
                 prioritize. (Regex fallback ignores this — always checks all.)
        preserve_tokens: if True, returns a TokenMap that can be used to
                         restore original values in the LLM's response.
        confidence_threshold: minimum Presidio confidence to redact (0..1).
                              Ignored by regex fallback.

    Returns:
        (redacted_text, token_map_or_None)
    """
    if not text:
        return text or "", None

    token_map = _new_token_map() if preserve_tokens else None

    if _try_init_presidio():
        result = _redact_with_presidio(
            text, country=country,
            confidence_threshold=confidence_threshold,
            token_map=token_map,
        )
        return result, token_map

    result = _redact_with_legacy(text, token_map=token_map)
    return result, token_map


def restore_tokens(text: str, token_map: TokenMap) -> str:
    """Replace placeholders back with their original values.
    Used when we want the LLM's response to reference the actual patient
    name/etc rather than the placeholder."""
    if not text or not token_map:
        return text
    out = text
    for placeholder, original in token_map.forward.items():
        out = out.replace(placeholder, original)
    return out


# ---- Engine implementations ----

# Map Presidio entity types -> placeholder categories
_PRESIDIO_CATEGORY_MAP = {
    "PERSON": "PATIENT_NAME",
    "EMAIL_ADDRESS": "EMAIL",
    "PHONE_NUMBER": "PHONE",
    "LOCATION": "LOCATION",
    "DATE_TIME": "DATE",
    "CREDIT_CARD": "CARD",
    "IBAN_CODE": "BANK",
    "US_SSN": "ID",
    "MEDICAL_LICENSE": "MED_LICENSE",
    "ORGANIZATION": "ORG",
    "ORG": "ORG",
    "MISC": "REDACTED",
    # Brazilian structured-PII recognizers
    "BR_CPF": "CPF",
    "BR_CNS": "HEALTH_ID",
    "BR_CEP": "POSTAL",
    "BR_CRM": "MED_LICENSE",
    "BR_RG": "ID",
    "BR_PHONE": "PHONE",
    "BR_PERSON_CTX": "PATIENT_NAME",
}

# Entidades que SÃO dado pessoal (LGPD = pessoa natural) → redigir antes do LLM. Ficam DE FORA
# de propósito: ORGANIZATION/ORG (nome de instituição: INCA, ANVISA, Ministério da Saúde, hospital
# — NÃO é dado pessoal), LOCATION (Brasil/SP) e DATE_TIME (data clínica: "15 de outubro"). Sem
# isso, o Presidio redigia "INCA"→"[ORG]" no input e o modelo devolvia "[ORG]" no lugar do órgão,
# degradando a resposta médica. Identificadores pessoais (nome/CPF/CNS/telefone/email) seguem redigidos.
_PII_ENTITIES = [
    "PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD", "IBAN_CODE",
    "US_SSN", "MEDICAL_LICENSE",
    "BR_CPF", "BR_CNS", "BR_CEP", "BR_CRM", "BR_RG", "BR_PHONE", "BR_PERSON_CTX",
]


# Conectores de nome ("João DA Silva") — minúsculos, não contam como sobrenome próprio.
_NAME_CONNECTORS = {'da', 'de', 'do', 'das', 'dos', 'e', 'del', 'la', 'von', 'van'}
# Token "nome próprio": Inicial MAIÚSCULA + resto MINÚSCULO (≥2 chars). Exclui sigla (TFG: 2º
# char maiúsculo falha), minúscula (paciente), e tokens com dígito/pontuação.
_TITLECASE_TOKEN_RE = re.compile(r"^[A-ZÀ-Ý][a-zà-ÿ][a-zà-ÿ'\-]*$")


def _looks_like_person_name(text: str) -> bool:
    """True só se o trecho PARECE um nome de pessoa (Title-case + conectores). Barra o
    falso-positivo da NER PT, que marca trecho clínico como PERSON ("paciente com TFG", "DRC
    estágio", "como monitorar") → redigido como [PATIENT_NAME], corrompendo a pergunta clínica.
    'João da Silva'/'Maria'/'Paciente João' passam; 'paciente com TFG'/'DRC estagio' não."""
    toks = (text or '').split()
    if not toks:
        return False
    proper = 0
    for tok in toks:
        if tok.lower() in _NAME_CONNECTORS:
            continue
        if _TITLECASE_TOKEN_RE.match(tok):
            proper += 1
        else:
            return False  # sigla (all-caps), minúscula (função/clínica), dígito → não é nome
    return proper >= 1


def _redact_with_presidio(
    text: str,
    *,
    country: str,
    confidence_threshold: float,
    token_map: Optional[TokenMap],
) -> str:
    """Apply Presidio redaction. Sorts findings by reverse offset so
    overlapping substitutions don't corrupt positions."""
    assert _presidio_analyzer is not None

    # Language detection: prefer pt for BR/PT, en otherwise. Falls back to
    # whatever language IS available if the preferred one is missing.
    desired = "pt" if country in ("BR", "PT", "auto") else "en"
    if desired not in _presidio_languages:
        if _presidio_languages:
            language = _presidio_languages[0]
        else:
            return _redact_with_legacy(text, token_map=token_map)
    else:
        language = desired

    try:
        results = _presidio_analyzer.analyze(
            text=text,
            language=language,
            score_threshold=confidence_threshold,
            entities=_PII_ENTITIES,  # só dado pessoal — não redige instituição/local/data
        )
    except Exception as exc:
        logger.warning(
            "Presidio analyze failed (lang=%s): %s. Falling back to legacy.",
            language, exc,
        )
        return _redact_with_legacy(text, token_map=token_map)

    # Falso-positivo de NOME: a NER PT marca trecho clínico como PERSON ("paciente com TFG", "DRC
    # estágio", "como monitorar") → [PATIENT_NAME], corrompendo a pergunta. Mantém o span só se
    # PARECE nome próprio (Title-case + conectores). Identificadores estruturados (CPF/CNS/…) passam.
    results = [
        r for r in results
        if not (_PRESIDIO_CATEGORY_MAP.get(r.entity_type) == 'PATIENT_NAME'
                and not _looks_like_person_name(text[r.start:r.end]))
    ]

    if not results:
        return text

    # De-overlap: when two recognizers match overlapping spans (e.g. NER tags
    # "12.345.678-9" as PERSON while BR_RG also matches it), keep one span per
    # region. Preference: longer span first, then higher score. Substituting
    # overlapping spans naively corrupts the text ("[PATIENT_NAME]D]").
    ordered = sorted(results, key=lambda r: (r.start, -(r.end - r.start), -r.score))
    accepted = []
    last_end = -1
    for r in ordered:
        if r.start >= last_end:
            accepted.append(r)
            last_end = r.end

    # Substitute from the end backwards so earlier offsets stay valid.
    out = text
    for r in sorted(accepted, key=lambda r: r.start, reverse=True):
        original = text[r.start:r.end]
        category = _PRESIDIO_CATEGORY_MAP.get(r.entity_type, r.entity_type)
        if token_map is not None:
            placeholder = token_map.get_placeholder(category, original)
        else:
            placeholder = f"[{category}]"
        out = out[:r.start] + placeholder + out[r.end:]

    return out


def _redact_with_legacy(
    text: str,
    *,
    token_map: Optional[TokenMap],
) -> str:
    """Fallback to the existing pii_detector. Token map support is best-effort
    (regex doesn't preserve per-occurrence info, so each unique match gets a
    stable placeholder via the token map's reverse lookup)."""
    from ..services.pii_detector import PII_PATTERNS, REDACT_MAP

    out = text
    for pii_type, pattern in PII_PATTERNS.items():
        category = REDACT_MAP[pii_type].strip("[]").replace("REDACTED_", "")

        def _replacer(match, _cat=category):
            value = match.group(0)
            if token_map is not None:
                return token_map.get_placeholder(_cat, value)
            return f"[{_cat}]"

        out = pattern.sub(_replacer, out)
    return out


# ---- Confidence-gated decision for training data pipeline ----

def assess_for_training(text: str) -> dict:
    """Decision helper for data_collector_service.

    Runs PII detection on a candidate training entry and returns:
        {
            "has_pii": bool,
            "patient_pii_likely": bool,  # name/age/etc that aren't the user's own
            "redacted_text": str,
            "confidence": float (0..1, aggregate),
            "should_discard": bool,  # True if confidence too low to redact reliably
        }

    Policy: per QYTHON_LGPD_PLAN.md decision #6, if patient-PII is detected
    with confidence < 0.8, the entry is discarded (returned with
    should_discard=True). Above 0.8 it is routed to the anonymization track.
    """
    if not text:
        return {
            "has_pii": False, "patient_pii_likely": False,
            "redacted_text": text or "", "confidence": 1.0,
            "should_discard": False,
        }

    redacted, _ = redact_for_llm(text, preserve_tokens=False)

    # Heuristic confidence: ratio of (regex matches) to (heuristic patient hints)
    # If the text contains "paciente", "pte", "Sr.", "Sra.", proper nouns near
    # numbers (ages), that's a stronger signal we have patient data.
    patient_hint_pattern = re.compile(
        r'\b(?:paciente|pte|pct|p[áa]ciente|sr\.?|sra\.?|m[ãa]e|pai|filh[oa])\b',
        re.IGNORECASE,
    )
    has_patient_hint = bool(patient_hint_pattern.search(text))
    has_pii = redacted != text
    patient_pii_likely = has_patient_hint and has_pii

    # Reliable redaction requires the Presidio NLP engine. In regex-only
    # fallback mode we cannot catch proper names, so patient data cannot be
    # scrubbed with confidence — in that case we DISCARD rather than risk
    # storing identifiable patient data (LGPD Art. 12). When Presidio is
    # available we redact inline and route to the anon track instead.
    redaction_reliable = bool(_presidio_available)
    confidence = 0.9 if redaction_reliable else 0.5
    should_discard = (has_patient_hint or has_pii) and not redaction_reliable

    return {
        "has_pii": has_pii,
        "patient_pii_likely": patient_pii_likely,
        "redacted_text": redacted,
        "confidence": confidence,
        "redaction_reliable": redaction_reliable,
        "should_discard": should_discard,
    }
