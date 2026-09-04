# qython/backend/services/pii_detector.py
"""
PII Detection Service for Training Data Pipeline.

Detects personally identifiable information (PII) in text before it enters
the training data pipeline. Does NOT block data collection — only flags
entries for review/redaction during export.

Multi-country support covering all Qython target markets:
- Brazil: CPF, RG, CRM, CEP
- Argentina: DNI, CUIL/CUIT, matrícula médica
- Chile: RUT/RUN
- Uruguay: CI (Cédula de Identidad)
- Paraguay: CI
- Colombia: CC (Cédula de Ciudadanía), NIT
- Mexico: CURP, RFC
- Peru: DNI
- Spain: DNI/NIE
- Portugal: NIF, CC (Cartão de Cidadão)
- US: SSN, NPI (National Provider Identifier)
- UK: NHS number
- International: email, phone (multi-format), medical license patterns
"""

import re
from typing import Dict


# =============================================================================
# PII REGEX PATTERNS — organized by region
# =============================================================================

PII_PATTERNS = {

    # --- UNIVERSAL ---
    "email": re.compile(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    ),
    # International phone: +XX or (XX) followed by 7-11 digits with optional separators
    "phone": re.compile(
        r'(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,5}[\s.-]?\d{3,4}\b'
    ),

    # --- BRAZIL ---
    # CPF: 000.000.000-00  (with or without punctuation)
    "cpf_br": re.compile(
        r'\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}\b'
    ),
    # CRM: CRM/SP 123456 or CRM-SP123456 etc.
    "crm_br": re.compile(
        r'\bCRM[\s/:-]?\d{4,6}[\s/:-]?[A-Z]{2}\b', re.IGNORECASE
    ),
    # CEP: 01310-100
    "cep_br": re.compile(
        r'\b\d{5}[-.\s]?\d{3}\b'
    ),
    # RG: RG 12.345.678-9
    "rg_br": re.compile(
        r'\bRG[\s:]*\d{1,2}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{1,2}\b', re.IGNORECASE
    ),

    # --- ARGENTINA ---
    # DNI: 8 digits (with or without dots) — "DNI 12.345.678" or "DNI: 12345678"
    "dni_ar": re.compile(
        r'\bDNI[\s:]*\d{1,2}\.?\d{3}\.?\d{3}\b', re.IGNORECASE
    ),
    # CUIL/CUIT: 20-12345678-9 or 27-12345678-9
    "cuil_ar": re.compile(
        r'\b(?:CUIL|CUIT)[\s:]*\d{2}[-.\s]?\d{7,8}[-.\s]?\d{1}\b', re.IGNORECASE
    ),
    # Matrícula médica AR: "M.N. 12345" or "M.P. 12345"
    "med_license_ar": re.compile(
        r'\bM\s*\.?\s*[NP]\s*\.?\s*\d{4,6}\b', re.IGNORECASE
    ),

    # --- CHILE ---
    # RUT/RUN: 12.345.678-K or 12345678-K
    "rut_cl": re.compile(
        r'\b\d{1,2}\.?\d{3}\.?\d{3}[-.\s]?[\dkK]\b'
    ),

    # --- URUGUAY ---
    # CI: 1.234.567-8 (7-8 digits)
    "ci_uy": re.compile(
        r'\b(?:CI|C\.I\.)[\s:]*\d{1,2}\.?\d{3}\.?\d{3}[-.\s]?\d{1}\b', re.IGNORECASE
    ),

    # --- PARAGUAY ---
    # CI: 1.234.567 (6-7 digits, context-dependent)
    "ci_py": re.compile(
        r'\b(?:CI|C\.I\.)[\s:]*\d{1,2}\.?\d{3}\.?\d{3}\b', re.IGNORECASE
    ),

    # --- COLOMBIA ---
    # CC: "CC 1.234.567.890" or "C.C. 1234567890" (6-10 digits)
    "cc_co": re.compile(
        r'\b(?:CC|C\.C\.)[\s:]*\d{1,2}\.?\d{3}\.?\d{3}\.?\d{0,3}\b', re.IGNORECASE
    ),
    # NIT: 900.123.456-7
    "nit_co": re.compile(
        r'\bNIT[\s:]*\d{3}\.?\d{3}\.?\d{3}[-.\s]?\d{1}\b', re.IGNORECASE
    ),

    # --- MEXICO ---
    # CURP: 18 alphanumeric characters (letter pattern)
    "curp_mx": re.compile(
        r'\bCURP[\s:]*[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]{2}\b', re.IGNORECASE
    ),
    # RFC: 12-13 alphanumeric characters
    "rfc_mx": re.compile(
        r'\bRFC[\s:]*[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}\b', re.IGNORECASE
    ),

    # --- PERU ---
    # DNI: 8 digits — "DNI 12345678"
    "dni_pe": re.compile(
        r'\bDNI[\s:]*\d{8}\b', re.IGNORECASE
    ),

    # --- SPAIN ---
    # DNI: 8 digits + letter — "12345678A"
    "dni_es": re.compile(
        r'\b\d{8}[A-Z]\b'
    ),
    # NIE: X/Y/Z + 7 digits + letter — "X1234567A"
    "nie_es": re.compile(
        r'\b[XYZ]\d{7}[A-Z]\b'
    ),

    # --- PORTUGAL ---
    # NIF: 9 digits — often prefixed "NIF"
    "nif_pt": re.compile(
        r'\bNIF[\s:]*\d{9}\b', re.IGNORECASE
    ),
    # Cartão de Cidadão: 8 digits + check digits — "12345678 1 ZZ2"
    "cc_pt": re.compile(
        r'\b\d{8}\s?\d\s?[A-Z]{2}\d\b'
    ),

    # --- UNITED STATES ---
    # SSN: 123-45-6789
    "ssn_us": re.compile(
        r'\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b'
    ),
    # NPI (National Provider Identifier): 10 digits — "NPI 1234567890"
    "npi_us": re.compile(
        r'\bNPI[\s:]*\d{10}\b', re.IGNORECASE
    ),

    # --- UNITED KINGDOM ---
    # NHS Number: 3-3-4 format — "123 456 7890"
    "nhs_uk": re.compile(
        r'\bNHS[\s:]*\d{3}\s?\d{3}\s?\d{4}\b', re.IGNORECASE
    ),

    # --- GENERIC MEDICAL LICENSE ---
    # Catches "Reg. Médico 12345", "Colegiado 12345", "Lic. Médica 12345", etc.
    "med_license_generic": re.compile(
        r'\b(?:Reg(?:istro)?\.?\s*(?:Méd(?:ico)?|Prof(?:issional)?)|'
        r'Colegiado|'
        r'Lic(?:encia)?\.?\s*Méd(?:ica)?|'
        r'Mat(?:rícula)?\.?\s*(?:Méd(?:ica)?|Prof(?:issional)?)'
        r')[\s.:]*\d{4,8}\b',
        re.IGNORECASE
    ),
}


# =============================================================================
# REDACTION LABELS
# =============================================================================

# Map each pattern to a generic category for redaction
REDACT_MAP = {
    "email":                "[REDACTED_EMAIL]",
    "phone":                "[REDACTED_PHONE]",
    "cpf_br":               "[REDACTED_ID]",
    "crm_br":               "[REDACTED_MED_LICENSE]",
    "cep_br":               "[REDACTED_POSTAL]",
    "rg_br":                "[REDACTED_ID]",
    "dni_ar":               "[REDACTED_ID]",
    "cuil_ar":              "[REDACTED_TAX_ID]",
    "med_license_ar":       "[REDACTED_MED_LICENSE]",
    "rut_cl":               "[REDACTED_ID]",
    "ci_uy":                "[REDACTED_ID]",
    "ci_py":                "[REDACTED_ID]",
    "cc_co":                "[REDACTED_ID]",
    "nit_co":               "[REDACTED_TAX_ID]",
    "curp_mx":              "[REDACTED_ID]",
    "rfc_mx":               "[REDACTED_TAX_ID]",
    "dni_pe":               "[REDACTED_ID]",
    "dni_es":               "[REDACTED_ID]",
    "nie_es":               "[REDACTED_ID]",
    "nif_pt":               "[REDACTED_TAX_ID]",
    "cc_pt":                "[REDACTED_ID]",
    "ssn_us":               "[REDACTED_ID]",
    "npi_us":               "[REDACTED_MED_LICENSE]",
    "nhs_uk":               "[REDACTED_ID]",
    "med_license_generic":  "[REDACTED_MED_LICENSE]",
}


# =============================================================================
# PUBLIC API
# =============================================================================

def detect_pii(text: str) -> Dict:
    """
    Scan text for PII patterns across all supported countries.

    Returns:
        {
            "has_pii": bool,
            "types_found": ["cpf_br", "email", ...],
            "count": int  (total matches across all types)
        }
    """
    if not text:
        return {"has_pii": False, "types_found": [], "count": 0}

    types_found = []
    total_count = 0

    for pii_type, pattern in PII_PATTERNS.items():
        matches = pattern.findall(text)
        if matches:
            types_found.append(pii_type)
            total_count += len(matches)

    return {
        "has_pii": len(types_found) > 0,
        "types_found": types_found,
        "count": total_count,
    }


def redact_pii(text: str) -> str:
    """
    Replace detected PII with redaction labels.
    Used during export to produce safe training data.

    Returns:
        Text with PII replaced by [REDACTED_TYPE] labels.
    """
    if not text:
        return text

    result = text
    for pii_type, pattern in PII_PATTERNS.items():
        label = REDACT_MAP[pii_type]
        result = pattern.sub(label, result)

    return result


def detect_and_summarize(input_text: str, output_text: str) -> Dict:
    """
    Convenience function for the training data pipeline.
    Scans both input and output, returns combined result.

    Returns:
        {
            "pii_detected": bool,
            "pii_types": ["cpf_br", ...],
            "pii_count": int,
        }
    """
    input_result = detect_pii(input_text or "")
    output_result = detect_pii(output_text or "")

    all_types = list(set(input_result["types_found"] + output_result["types_found"]))
    total = input_result["count"] + output_result["count"]

    return {
        "pii_detected": total > 0,
        "pii_types": all_types,
        "pii_count": total,
    }
