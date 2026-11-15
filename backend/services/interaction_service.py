# qython/backend/services/interaction_service.py
"""
Verificação de interações medicamentosas (tabela DrugInteraction).
"""

import logging
from itertools import combinations
from typing import List, Dict

from sqlalchemy import select, and_, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import DrugInteraction

logger = logging.getLogger("qython_logger")

# Severity ordering for sorting results
SEVERITY_ORDER = {
    'contraindicated': 0,
    'severe': 1,
    'moderate': 2,
    'mild': 3,
}


async def check_interactions(
    active_principles: List[str],
    db: AsyncSession
) -> List[Dict]:
    """
    Check drug interactions for a list of active principles.
    Normalizes names, generates C(n,2) pairs, queries DrugInteraction table.
    Returns results sorted by severity (most dangerous first).
    """
    if len(active_principles) < 2:
        return []

    # Normalize: lowercase, strip whitespace
    normalized = [p.strip().lower() for p in active_principles if p.strip()]
    normalized = list(set(normalized))  # Remove duplicates

    if len(normalized) < 2:
        return []

    # Generate all pairs, sorted alphabetically (matching DB storage convention)
    pairs = []
    for a, b in combinations(sorted(normalized), 2):
        pairs.append((a, b))

    if not pairs:
        return []

    # Build OR conditions for all pairs
    conditions = []
    for a, b in pairs:
        conditions.append(
            and_(
                func.lower(DrugInteraction.active_principle_a) == a,
                func.lower(DrugInteraction.active_principle_b) == b
            )
        )

    result = await db.execute(
        select(DrugInteraction).where(or_(*conditions))
    )
    interactions = result.scalars().all()

    # Sort by severity
    sorted_interactions = sorted(
        interactions,
        key=lambda x: SEVERITY_ORDER.get(x.severity, 99)
    )

    return [
        {
            "id": i.id,
            "active_principle_a": i.active_principle_a,
            "active_principle_b": i.active_principle_b,
            "severity": i.severity,
            "description": i.description,
            "mechanism": i.mechanism,
            "clinical_management": i.clinical_management,
            "source": i.source,
            "evidence_level": i.evidence_level,
        }
        for i in sorted_interactions
    ]
