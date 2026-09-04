# qython/backend/services/citation_collector.py
"""
Citation-Grounded Training Data Collector.

Captures question-answer pairs where the AI response includes inline citations
(e.g., [1], [2]) along with the referenced sources. This creates training data
specifically for teaching models to cite evidence, reducing hallucinations.

Usage:
    Called from copilot_routes.py or consultation_routes.py after the AI generates
    a response with references via reference_service.
"""

import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("qython_logger")


async def collect_citation_grounded_data(
    db: AsyncSession,
    user_id: int,
    question: str,
    response_with_citations: str,
    references: list,
    specialty: str = None,
    lang: str = "pt-BR",
) -> Optional[int]:
    """
    Collect a citation-grounded training data entry.

    This captures the full pipeline: question → cited response + sources,
    which is ideal for training models that cite their sources.

    Args:
        db: Database session
        user_id: User ID
        question: The clinical question/prompt
        response_with_citations: AI response containing inline citations [1], [2], etc.
        references: List of reference dicts (title, url, snippet, source, etc.)
        specialty: Medical specialty context
        lang: Language code

    Returns:
        TrainingData ID or None
    """
    from .data_collector_service import collect_data

    if not question or not response_with_citations:
        return None

    # Only collect if there are actual citations in the response
    has_citations = any(f"[{i}]" in response_with_citations for i in range(1, 20))
    if not has_citations or not references:
        return None

    meta = {
        "specialty": specialty,
        "citation_count": len(references),
        "has_inline_citations": True,
    }

    # Sanitize references for storage (keep only relevant fields)
    clean_refs = []
    for ref in references[:20]:  # Cap at 20 refs
        clean_refs.append({
            "title": ref.get("title", ""),
            "url": ref.get("url", ""),
            "source": ref.get("source", ""),
            "snippet": (ref.get("snippet", "") or "")[:500],
        })

    return await collect_data(
        db=db,
        user_id=user_id,
        source_type="citation_grounded",
        input_data=question,
        output_data=response_with_citations,
        meta=meta,
        quality=1,  # Cited responses are higher quality by default
        lang=lang,
        references=clean_refs,
        creation_method="ai_generated",
        generation_number=1,
    )
