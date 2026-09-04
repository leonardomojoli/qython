# qython/backend/services/anonymization_service.py
"""
Anonymization service for training data pipeline.

Implements generalization + suppression + K-anonymity check, all in pure
Python with no external dependencies (so it works regardless of whether
Presidio/anonymeter are installed). Used by data_collector_service to route
records into the 'anon' track before they enter the training pool.

Approach:
    1. Strip direct identifiers (name, document IDs, emails, phones, exact
       dates, etc.) — usually done by pii_detector / Presidio upstream.
    2. Generalize quasi-identifiers: ages -> 5-year buckets, ZIPs -> region,
       dates -> month/year, rare specialty -> 'outras'.
    3. Check K-anonymity: every record must be indistinguishable from at
       least K-1 others on the quasi-identifier projection. Records that
       violate K-anonymity are SUPPRESSED (dropped).

Per LGPD Art. 12: a record that passes this pipeline is no longer "dado
pessoal" and is out of LGPD scope. Proof of anonymization is logged via
dataset_export_service.

Default K = 5 (industry standard for healthcare anonymization).
"""

from __future__ import annotations

import hashlib
import logging
import re
from collections import Counter
from datetime import datetime
from typing import Any, Iterable, Optional

logger = logging.getLogger(__name__)


DEFAULT_K = 5

# Direct identifier patterns we always strip from text payloads.
# This is a safety net — pii_detector should have caught these already.
DIRECT_IDENTIFIER_TEXT_PATTERNS = [
    (re.compile(r'\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b'), '[ID]'),  # CPF-like
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'), '[EMAIL]'),
    (re.compile(r'\+?\d{2,3}[\s\-.]?\(?\d{2,3}\)?[\s\-.]?\d{4,5}[\s\-.]?\d{4}'), '[PHONE]'),
]


# Quasi-identifier generalization helpers

def generalize_age(value: Any) -> Optional[str]:
    """Bucket ages into 5-year ranges. Returns label or None."""
    if value is None:
        return None
    try:
        age = int(value)
    except (TypeError, ValueError):
        return None
    if age < 0:
        return None
    if age >= 90:
        return "90+"
    low = (age // 5) * 5
    return f"{low}-{low + 4}"


def generalize_birth_date(value: Any) -> Optional[str]:
    """Birth date -> 5-year age bucket (derived from year)."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    if isinstance(value, datetime):
        age = datetime.now().year - value.year
        return generalize_age(age)
    return None


def generalize_zip_br(value: Any) -> Optional[str]:
    """CEP brasileiro: keep first 2 digits (região). 01310-100 -> '01-***'."""
    if value is None:
        return None
    digits = re.sub(r'\D', '', str(value))
    if len(digits) < 5:
        return None
    return f"{digits[:2]}-***"


def generalize_date_to_month(value: Any) -> Optional[str]:
    """Datetime -> 'YYYY-MM'."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m")
    return None


def generalize_specialty(value: Any, common_set: Optional[set[str]] = None) -> Optional[str]:
    """Rare specialty -> 'outras'. Common specialties pass through."""
    if value is None:
        return None
    if common_set is None:
        common_set = COMMON_SPECIALTIES
    val = str(value).strip().lower()
    if val in common_set:
        return val
    return "outras"


# A conservative list of "common enough" specialties to avoid singling out
# users via specialty alone.
COMMON_SPECIALTIES = {
    "clínica médica", "clinica medica", "cardiologia", "pediatria",
    "ginecologia", "ginecologia e obstetrícia", "ortopedia", "psiquiatria",
    "neurologia", "dermatologia", "oftalmologia", "urologia",
    "endocrinologia", "gastroenterologia", "medicina de família",
    "medicina de familia", "infectologia", "geriatria", "reumatologia",
    "oncologia", "anestesiologia", "radiologia", "cirurgia geral",
    "otorrinolaringologia", "pneumologia", "nefrologia",
}


def strip_direct_identifiers_in_text(text: str) -> str:
    """Sweep text for direct identifiers and replace with generic labels."""
    if not text:
        return text
    out = text
    for pat, replacement in DIRECT_IDENTIFIER_TEXT_PATTERNS:
        out = pat.sub(replacement, out)
    return out


# K-anonymity

def k_anonymity_groups(
    records: Iterable[dict],
    quasi_identifiers: list[str],
) -> Counter:
    """Count how many records share each unique quasi-identifier tuple."""
    counter: Counter = Counter()
    for rec in records:
        key = tuple(rec.get(qi) for qi in quasi_identifiers)
        counter[key] += 1
    return counter


def check_k_anonymity(
    records: list[dict],
    quasi_identifiers: list[str],
    k: int = DEFAULT_K,
) -> dict:
    """Check whether a set of records satisfies K-anonymity. Returns a report:
        {
            "satisfies_k_anon": bool,
            "k": k,
            "weakest_group_size": int,
            "violating_groups": [(tuple, count), ...],
        }
    """
    groups = k_anonymity_groups(records, quasi_identifiers)
    if not groups:
        return {
            "satisfies_k_anon": True, "k": k,
            "weakest_group_size": 0, "violating_groups": [],
        }
    weakest = min(groups.values())
    violating = [(grp, n) for grp, n in groups.items() if n < k]
    return {
        "satisfies_k_anon": weakest >= k,
        "k": k,
        "weakest_group_size": weakest,
        "violating_groups": violating[:20],  # cap for log readability
    }


def anonymize_record(
    record: dict,
    *,
    direct_identifiers: list[str] | None = None,
    quasi_identifiers: dict[str, str] | None = None,
) -> dict:
    """Return a new dict with the record anonymized.

    Args:
        record: source dict (e.g., result of model.__dict__ or training entry).
        direct_identifiers: keys to drop entirely (name, cpf, phone, etc.).
        quasi_identifiers: map of {field_name: generalizer_name}. Supported
            generalizers: 'age', 'birth_date', 'zip_br', 'date_month', 'specialty'.

    Direct identifier text within string fields is also swept (CPF-like,
    emails, phones).
    """
    direct_identifiers = direct_identifiers or [
        'name', 'full_name', 'patient_name', 'doctor_name',
        'cpf', 'rg', 'document_id', 'personal_id_number',
        'email', 'phone', 'phone_number', 'address',
    ]
    quasi_identifiers = quasi_identifiers or {}

    out = {}
    for key, value in record.items():
        if key in direct_identifiers:
            continue
        if key in quasi_identifiers:
            gen = quasi_identifiers[key]
            out[key] = _apply_generalizer(value, gen)
            continue
        if isinstance(value, str):
            out[key] = strip_direct_identifiers_in_text(value)
        else:
            out[key] = value
    return out


def _apply_generalizer(value: Any, generalizer: str) -> Any:
    if generalizer == 'age':
        return generalize_age(value)
    if generalizer == 'birth_date':
        return generalize_birth_date(value)
    if generalizer == 'zip_br':
        return generalize_zip_br(value)
    if generalizer == 'date_month':
        return generalize_date_to_month(value)
    if generalizer == 'specialty':
        return generalize_specialty(value)
    logger.warning("Unknown generalizer: %s — leaving value as-is", generalizer)
    return value


def anonymize_dataset(
    records: list[dict],
    *,
    direct_identifiers: list[str] | None = None,
    quasi_identifiers: dict[str, str] | None = None,
    k: int = DEFAULT_K,
) -> dict:
    """Anonymize a list of records and enforce K-anonymity (suppress violators).

    Returns:
        {
            "records": [...anonymized survivors...],
            "dropped": int,
            "report": <check_k_anonymity result>,
            "algorithm": "generalize+suppress",
            "k": k,
        }
    """
    anon = [anonymize_record(
        r, direct_identifiers=direct_identifiers, quasi_identifiers=quasi_identifiers
    ) for r in records]

    qi_keys = list((quasi_identifiers or {}).keys())
    if not qi_keys:
        # Without QIs we can't check K-anon. Return as-is with a warning.
        logger.warning("anonymize_dataset called without quasi_identifiers — "
                       "skipping K-anonymity enforcement.")
        return {
            "records": anon, "dropped": 0,
            "report": {"satisfies_k_anon": None, "reason": "no quasi_identifiers"},
            "algorithm": "generalize_only", "k": k,
        }

    groups = k_anonymity_groups(anon, qi_keys)
    survivors = [
        r for r in anon
        if groups[tuple(r.get(qi) for qi in qi_keys)] >= k
    ]
    report = check_k_anonymity(survivors, qi_keys, k=k)
    return {
        "records": survivors,
        "dropped": len(anon) - len(survivors),
        "report": report,
        "algorithm": "generalize+suppress",
        "k": k,
    }


def compute_dataset_hash(records: list[dict]) -> str:
    """Stable SHA-256 of a sorted JSON representation of the dataset.
    Used by DatasetExportLog to prove the exact dataset that was exported."""
    import json
    canonical = json.dumps(
        sorted(records, key=lambda r: json.dumps(r, sort_keys=True, default=str)),
        sort_keys=True, default=str, ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
