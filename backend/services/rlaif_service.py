# qython/backend/services/rlaif_service.py
"""
RLAIF (Reinforcement Learning from AI Feedback) Service.

Implements batch processing of training data using AI-as-Judge to:
1. Score unreviewed TrainingData entries (quality_score=0)
2. Generate synthetic preference pairs via self-play
3. Manage held-out evaluation sets

Pipeline runs weekly via scheduler. ~10-20% of data has human feedback,
80-90% gets AI-judged feedback at scale.

References:
- Constitutional AI (Anthropic, 2022)
- RLAIF: Scaling RLHF with AI Feedback (Google, 2023)
- NVIDIA Data Flywheel Blueprint (2025)
"""

import logging
import os
import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, and_

from ..models import TrainingData, PreferenceData
from ..config import Config

logger = logging.getLogger("qython_logger")

# Model for judging — cheap + fast
# Juiz do RLAIF / self-play — desacoplado do SIMPLE_TASK_LLM_MODEL. A curadoria do
# dataset (moat do Qython-1) e a geração de self-play merecem um modelo melhor que
# as tarefas triviais (título, CID, normalização). Cai para SIMPLE_TASK_LLM_MODEL e
# depois 2.5-flash-lite se RLAIF_JUDGE_MODEL não estiver setado.
RLAIF_JUDGE_MODEL = os.getenv("RLAIF_JUDGE_MODEL") or os.getenv("SIMPLE_TASK_LLM_MODEL", "gemini-2.5-flash-lite")

# Thresholds
RLAIF_READY_THRESHOLD = 3.5  # Average score >= 3.5 out of 5 → ready_for_training
RLAIF_LOW_QUALITY_THRESHOLD = 2.0  # Average < 2.0 → flagged for review
SELF_PLAY_MIN_QUALITY = 2  # Only use quality >= 2 entries for self-play


JUDGE_PROMPT_TEMPLATE = """Você é um avaliador especializado em conteúdo médico-científico.
Avalie a RESPOSTA abaixo em 4 critérios, cada um de 0 a 5.

## CONTEXTO/PERGUNTA:
{input_data}

## RESPOSTA A AVALIAR:
{output_data}

## CRITÉRIOS:
1. **accuracy** (0-5): Precisão factual baseada em evidências médicas atuais. Contraindicações corretas? Doses corretas?
2. **completeness** (0-5): Cobre todos os pontos clinicamente relevantes? Faltou algo importante?
3. **safety** (0-5): Não sugere nada perigoso? Alerta para riscos quando necessário?
4. **style** (0-5): Linguagem profissional, concisa e bem organizada?

## INSTRUÇÃO:
Responda APENAS com JSON válido:
{{"accuracy": X, "completeness": X, "safety": X, "style": X, "reason": "breve justificativa"}}

IMPORTANTE: Responda SOMENTE o JSON, sem texto adicional."""


SELF_PLAY_PROMPT_TEMPLATE = """Você é um médico especialista respondendo a uma questão clínica.

## PERGUNTA/CONTEXTO:
{input_data}

## INSTRUÇÃO:
Forneça uma resposta médica completa, precisa e baseada em evidências.
Seja conciso mas abrangente. Cite guidelines quando relevante."""


async def _call_judge(input_data: str, output_data: str) -> Optional[dict]:
    """Call LLM-as-Judge to score a training data entry."""
    try:
        from google import genai
        from google.genai import types

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            logger.error("[RLAIF] GEMINI_API_KEY not set")
            return None

        client = genai.Client(api_key=api_key)

        prompt = JUDGE_PROMPT_TEMPLATE.format(
            input_data=input_data[:2000],
            output_data=output_data[:3000],
        )

        from . import llm_services
        response = client.models.generate_content(
            model=RLAIF_JUDGE_MODEL,
            contents=llm_services._redact_llm_contents(prompt),
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=256,
            ),
        )

        result_text = response.text.strip()
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]

        scores = json.loads(result_text)
        return scores

    except Exception as e:
        logger.error(f"[RLAIF] Judge call failed: {e}")
        return None


async def _generate_alternative(input_data: str, temperature: float = 0.7) -> Optional[str]:
    """Generate an alternative response for self-play."""
    try:
        from google import genai
        from google.genai import types

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return None

        client = genai.Client(api_key=api_key)

        prompt = SELF_PLAY_PROMPT_TEMPLATE.format(input_data=input_data[:2000])

        from . import llm_services
        response = client.models.generate_content(
            model=RLAIF_JUDGE_MODEL,
            contents=llm_services._redact_llm_contents(prompt),
            config=types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=2048,
            ),
        )

        return response.text.strip() if response.text else None

    except Exception as e:
        logger.error(f"[RLAIF] Generation failed: {e}")
        return None


async def batch_judge_training_data(
    db: AsyncSession,
    batch_size: int = 50,
    source_types: list = None,
) -> dict:
    """
    Batch-process unreviewed TrainingData entries with AI-as-Judge.

    Finds entries with quality_score=0 and ready_for_training=False,
    scores them, and updates accordingly.

    Returns:
        {"processed": int, "ready": int, "flagged": int, "errors": int}
    """
    # Build query for unreviewed entries
    query = (
        select(TrainingData)
        .where(
            and_(
                TrainingData.quality_score == 0,
                TrainingData.ready_for_training == False,
                TrainingData.is_evaluation_holdout == False,
                # Judge each entry at most once. Entries scoring < 3.5 keep
                # quality_score=0/ready_for_training=False, so without this
                # filter they'd be re-judged on every weekly run forever —
                # wasted Gemini calls that grow unbounded with the backlog.
                # The judge writes "ai_judge" into metadata for every entry it
                # processes; failures don't, so those are still retried.
                TrainingData.metadata_info.op('->>')('ai_judge').is_(None),
            )
        )
        .order_by(TrainingData.created_at.asc())
        .limit(batch_size)
    )

    if source_types:
        query = query.where(TrainingData.source_type.in_(source_types))

    result = await db.execute(query)
    entries = result.scalars().all()

    if not entries:
        logger.info("[RLAIF] No pending entries to judge")
        return {"processed": 0, "ready": 0, "flagged": 0, "errors": 0}

    stats = {"processed": 0, "ready": 0, "flagged": 0, "errors": 0}

    for entry in entries:
        scores = await _call_judge(entry.input_data, entry.output_data)

        if not scores:
            stats["errors"] += 1
            continue

        stats["processed"] += 1

        # Calculate average
        numeric_scores = [
            scores.get("accuracy", 0),
            scores.get("completeness", 0),
            scores.get("safety", 0),
            scores.get("style", 0),
        ]
        avg_score = sum(numeric_scores) / len(numeric_scores)

        # Update metadata
        meta = entry.metadata_info or {}
        meta["ai_judge"] = {
            "scores": scores,
            "avg_score": round(avg_score, 2),
            "model": RLAIF_JUDGE_MODEL,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        entry.metadata_info = meta

        # Decision based on score
        if avg_score >= RLAIF_READY_THRESHOLD:
            entry.ready_for_training = True
            stats["ready"] += 1
        elif avg_score < RLAIF_LOW_QUALITY_THRESHOLD:
            meta["ai_flagged_low_quality"] = True
            entry.metadata_info = meta
            stats["flagged"] += 1

    await db.commit()

    logger.info(
        f"[RLAIF] Batch complete: {stats['processed']} processed, "
        f"{stats['ready']} ready, {stats['flagged']} flagged, "
        f"{stats['errors']} errors"
    )
    return stats


async def self_play_generate_preferences(
    db: AsyncSession,
    batch_size: int = 20,
) -> dict:
    """
    Self-play: generate synthetic preference pairs from high-quality prompts.

    Takes existing high-quality inputs, generates two alternative responses
    at different temperatures, uses AI judge to pick the winner.

    Returns:
        {"generated": int, "errors": int}
    """
    from .preference_service import collect_preference_pair

    # Get high-quality entries to use as prompts
    query = (
        select(TrainingData)
        .where(
            and_(
                TrainingData.quality_score >= SELF_PLAY_MIN_QUALITY,
                TrainingData.is_evaluation_holdout == False,
                # Self-play each high-quality entry only once. Without this,
                # the random sampling below re-picks the same small pool every
                # week, re-paying ~3 Gemini calls/entry and flooding
                # PreferenceData with near-duplicate synthetic pairs.
                TrainingData.metadata_info.op('->>')('self_play_done').is_(None),
                TrainingData.source_type.in_([
                    'chat_interaction', 'chat_clinical_discussion',
                    'consultation_improvement',
                    'library_rag_chat', 'summary_generation',
                ]),
            )
        )
        .order_by(func.random())
        .limit(batch_size)
    )

    result = await db.execute(query)
    entries = result.scalars().all()

    if not entries:
        logger.info("[RLAIF] No entries available for self-play")
        return {"generated": 0, "errors": 0}

    stats = {"generated": 0, "errors": 0}

    for entry in entries:
        try:
            # Generate two responses at different temperatures
            conservative = await _generate_alternative(entry.input_data, temperature=0.3)
            creative = await _generate_alternative(entry.input_data, temperature=0.9)

            if not conservative or not creative:
                stats["errors"] += 1
                continue

            # Mark as self-played so future runs skip it. We've already paid for
            # both generations here; set before the skip-paths below so skipped
            # (identical / low-confidence) entries also drop out. Hard generation
            # failures above keep it unset → retried next run.
            entry.metadata_info = {**(entry.metadata_info or {}), "self_play_done": True}

            if conservative.strip() == creative.strip():
                continue

            # AI judge picks the winner
            from .preference_service import llm_judge_preference
            chosen, rejected, confidence = await llm_judge_preference(
                conservative, creative, entry.input_data, criteria="medical_accuracy"
            )

            if confidence < 0.6:
                continue

            # Save as preference pair
            pair_id = await collect_preference_pair(
                db=db,
                user_id=None,
                prompt=entry.input_data,
                chosen=chosen,
                rejected=rejected,
                source_type=entry.source_type,
                preference_source='self_play',
                confidence_score=confidence,
                metadata={
                    "self_play": True,
                    "original_training_id": entry.id,
                    "generation_number": 1,
                    "temperatures": {"conservative": 0.3, "creative": 0.9},
                },
                language=entry.metadata_info.get("lang", "pt-BR") if entry.metadata_info else "pt-BR",
            )

            if pair_id:
                stats["generated"] += 1

        except Exception as e:
            logger.error(f"[RLAIF] Self-play error for entry {entry.id}: {e}")
            stats["errors"] += 1

    # Persist the self_play_done markers. collect_preference_pair may commit per
    # saved pair, but skipped/low-confidence entries won't otherwise be flushed.
    await db.commit()

    logger.info(
        f"[RLAIF] Self-play complete: {stats['generated']} pairs generated, "
        f"{stats['errors']} errors"
    )
    return stats


async def build_evaluation_holdout(
    db: AsyncSession,
    target_count: int = 500,
) -> dict:
    """
    Build/expand the held-out evaluation set from highest-quality entries.

    Selects TrainingData entries with quality_score >= 2 (gold/platinum)
    that are NOT already holdout, and marks them as holdout.

    These entries are NEVER used for training — only for model evaluation.

    Returns:
        {"existing": int, "added": int, "total": int}
    """
    # Count existing holdout
    existing_count = await db.scalar(
        select(func.count(TrainingData.id)).where(
            TrainingData.is_evaluation_holdout == True
        )
    ) or 0

    needed = max(0, target_count - existing_count)

    if needed == 0:
        return {"existing": existing_count, "added": 0, "total": existing_count}

    # Select best non-holdout entries
    query = (
        select(TrainingData)
        .where(
            and_(
                TrainingData.quality_score >= 2,
                TrainingData.is_evaluation_holdout == False,
                TrainingData.ready_for_training == True,
                TrainingData.pii_detected == False,
            )
        )
        .order_by(TrainingData.quality_score.desc(), TrainingData.created_at.desc())
        .limit(needed)
    )

    result = await db.execute(query)
    entries = result.scalars().all()

    for entry in entries:
        entry.is_evaluation_holdout = True
        entry.ready_for_training = False  # Remove from training pool

    await db.commit()

    total = existing_count + len(entries)
    logger.info(
        f"[RLAIF] Holdout set: {existing_count} existing + {len(entries)} added = {total} total"
    )

    return {"existing": existing_count, "added": len(entries), "total": total}


async def get_rlaif_stats(db: AsyncSession) -> dict:
    """Get comprehensive statistics about the RLAIF pipeline."""
    total = await db.scalar(select(func.count(TrainingData.id))) or 0
    ready = await db.scalar(
        select(func.count(TrainingData.id)).where(TrainingData.ready_for_training == True)
    ) or 0
    holdout = await db.scalar(
        select(func.count(TrainingData.id)).where(TrainingData.is_evaluation_holdout == True)
    ) or 0
    pii_flagged = await db.scalar(
        select(func.count(TrainingData.id)).where(TrainingData.pii_detected == True)
    ) or 0

    # By creation_method
    cm_result = await db.execute(
        select(TrainingData.creation_method, func.count(TrainingData.id))
        .group_by(TrainingData.creation_method)
    )
    by_creation_method = {row[0] or "unknown": row[1] for row in cm_result.fetchall()}

    # By bloom_level
    bl_result = await db.execute(
        select(TrainingData.bloom_level, func.count(TrainingData.id))
        .group_by(TrainingData.bloom_level)
    )
    by_bloom_level = {row[0] or "unknown": row[1] for row in bl_result.fetchall()}

    # By generation_number
    gn_result = await db.execute(
        select(TrainingData.generation_number, func.count(TrainingData.id))
        .group_by(TrainingData.generation_number)
    )
    by_generation = {str(row[0] or 0): row[1] for row in gn_result.fetchall()}

    # AI-judged count (has ai_judge in metadata)
    # We approximate by checking entries that are ready but quality=0
    ai_judged = await db.scalar(
        select(func.count(TrainingData.id)).where(
            and_(
                TrainingData.quality_score == 0,
                TrainingData.ready_for_training == True,
            )
        )
    ) or 0

    # Preference pairs
    total_prefs = await db.scalar(select(func.count(PreferenceData.id))) or 0
    self_play_prefs = await db.scalar(
        select(func.count(PreferenceData.id)).where(
            PreferenceData.preference_source == 'self_play'
        )
    ) or 0

    return {
        "training_data": {
            "total": total,
            "ready_for_training": ready,
            "evaluation_holdout": holdout,
            "pii_flagged": pii_flagged,
            "ai_judged_ready": ai_judged,
        },
        "by_creation_method": by_creation_method,
        "by_bloom_level": by_bloom_level,
        "by_generation": by_generation,
        "preference_data": {
            "total_pairs": total_prefs,
            "self_play_pairs": self_play_prefs,
        },
    }
