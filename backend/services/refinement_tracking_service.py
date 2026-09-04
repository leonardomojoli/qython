# qython/backend/services/refinement_tracking_service.py
"""
Iterative Refinement Tracking Service.

Tracks chains of refinements so the model can learn to improve its own outputs:
  original AI response → self-critique refined → user-edited final

Each link in the chain is stored in RefinementChain, connecting two TrainingData
entries (original and refined) with metadata about what changed and why.

Use cases:
1. Self-critique refinements (auto): AI response → critique → refined response
2. User edits (implicit): AI draft → physician edits → final version
3. Regeneration (implicit): AI response rejected → regenerated response accepted
4. RLAIF re-generation: AI judge flags low quality → new response generated

Training value:
- SFT: Train model to produce the refined version directly
- DPO: Use (original, refined) as (rejected, chosen) pairs
- Curriculum: Start training with simple refinements, progress to complex chains

References:
- Constitutional AI (Anthropic, 2022) - iterative refinement via principles
- Self-Refine (Madaan et al., 2023) - iterative self-improvement
"""

import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, and_

from ..models import TrainingData, RefinementChain

logger = logging.getLogger("qython_logger")


async def record_refinement(
    db: AsyncSession,
    original_id: int,
    refined_id: int,
    refinement_type: str,
    metadata: Optional[dict] = None,
) -> Optional[int]:
    """
    Record a refinement link between two training data entries.

    Args:
        db: Database session
        original_id: ID of the original TrainingData entry
        refined_id: ID of the refined TrainingData entry
        refinement_type: One of 'self_critique', 'user_edit', 'regeneration', 'rlaif_judge'
        metadata: Additional refinement context (scores, diff, etc.)

    Returns:
        RefinementChain.id if created, None if failed
    """
    try:
        # Determine step number (how many refinements deep this is)
        # Check if the original itself was a refinement of something else
        prev_step = await db.scalar(
            select(func.max(RefinementChain.step)).where(
                RefinementChain.refined_id == original_id
            )
        )
        step = (prev_step or 0) + 1

        chain = RefinementChain(
            original_id=original_id,
            refined_id=refined_id,
            step=step,
            refinement_type=refinement_type,
            refinement_metadata=metadata,
        )
        db.add(chain)
        await db.flush()

        logger.info(
            f"[REFINEMENT] Recorded: {original_id} → {refined_id} "
            f"(type={refinement_type}, step={step})"
        )
        return chain.id

    except Exception as e:
        logger.error(f"[REFINEMENT] Failed to record {original_id} → {refined_id}: {e}")
        return None


async def get_refinement_chain(
    db: AsyncSession,
    training_data_id: int,
) -> list:
    """
    Get the full refinement chain for a training data entry.
    Walks both directions (predecessors and successors).

    Returns:
        List of chain entries ordered by step, each with original/refined IDs
    """
    # Find all entries where this ID appears as original or refined
    # Walk backward to find the root
    root_id = training_data_id
    visited = {root_id}

    while True:
        prev = await db.scalar(
            select(RefinementChain.original_id).where(
                RefinementChain.refined_id == root_id
            )
        )
        if prev is None or prev in visited:
            break
        root_id = prev
        visited.add(root_id)

    # Walk forward from root to collect the full chain
    chain = []
    current_id = root_id

    while True:
        result = await db.execute(
            select(RefinementChain).where(
                RefinementChain.original_id == current_id
            ).order_by(RefinementChain.step)
        )
        links = result.scalars().all()

        if not links:
            break

        for link in links:
            chain.append({
                "id": link.id,
                "original_id": link.original_id,
                "refined_id": link.refined_id,
                "step": link.step,
                "refinement_type": link.refinement_type,
                "metadata": link.refinement_metadata,
                "created_at": link.created_at.isoformat() if link.created_at else None,
            })
            current_id = link.refined_id

        # Prevent infinite loops
        if current_id in visited:
            break
        visited.add(current_id)

    return chain


async def get_refinement_stats(db: AsyncSession) -> dict:
    """
    Get statistics about refinement chains for ML pipeline monitoring.

    Returns:
        dict with counts by type, chain length distribution, etc.
    """
    total = await db.scalar(
        select(func.count(RefinementChain.id))
    ) or 0

    # By refinement_type
    type_result = await db.execute(
        select(
            RefinementChain.refinement_type,
            func.count(RefinementChain.id)
        ).group_by(RefinementChain.refinement_type)
    )
    by_type = {row[0]: row[1] for row in type_result.fetchall()}

    # Chain length distribution (max step per root)
    step_result = await db.execute(
        select(
            RefinementChain.step,
            func.count(RefinementChain.id)
        ).group_by(RefinementChain.step)
    )
    by_step = {row[0]: row[1] for row in step_result.fetchall()}

    # Unique chains (distinct original_ids that have no predecessor)
    roots = await db.scalar(
        select(func.count(func.distinct(RefinementChain.original_id))).where(
            ~RefinementChain.original_id.in_(
                select(RefinementChain.refined_id)
            )
        )
    ) or 0

    return {
        "total_refinements": total,
        "unique_chains": roots,
        "by_type": by_type,
        "by_step": by_step,
    }


async def export_refinement_pairs(
    db: AsyncSession,
    refinement_type: Optional[str] = None,
    max_step: Optional[int] = None,
    limit: int = 1000,
) -> list:
    """
    Export refinement pairs in a format suitable for DPO training.

    Each pair becomes: prompt=input, chosen=refined_output, rejected=original_output

    Args:
        refinement_type: Filter by type (self_critique, user_edit, etc.)
        max_step: Only include refinements up to this step
        limit: Max pairs to export

    Returns:
        List of dicts with prompt, chosen, rejected, metadata
    """
    query = (
        select(RefinementChain)
        .order_by(RefinementChain.created_at.desc())
        .limit(limit)
    )

    if refinement_type:
        query = query.where(RefinementChain.refinement_type == refinement_type)
    if max_step:
        query = query.where(RefinementChain.step <= max_step)

    result = await db.execute(query)
    chains = result.scalars().all()

    pairs = []
    for chain in chains:
        # Load the actual training data entries
        original = await db.get(TrainingData, chain.original_id)
        refined = await db.get(TrainingData, chain.refined_id)

        if not original or not refined:
            continue

        pairs.append({
            "prompt": original.input_data,
            "chosen": refined.output_data,
            "rejected": original.output_data,
            "source_type": original.source_type,
            "refinement_type": chain.refinement_type,
            "step": chain.step,
            "metadata": chain.refinement_metadata,
        })

    return pairs
