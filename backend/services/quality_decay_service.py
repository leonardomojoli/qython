# qython/backend/services/quality_decay_service.py
"""
Quality Decay Detection Service.

Monitors training data quality over time to detect model collapse —
a phenomenon where models trained on synthetic data progressively lose quality.

Tracks weekly snapshots of key metrics and raises alerts when thresholds
are breached. Must be implemented BEFORE any fine-tuning of Qython-1.

Thresholds (from ML_ROADMAP.md):
- Self-critique score average < 0.80 → Pause training alert
- % human data in batch < 25% → Increase collection alert
- Data generation > 1 exceeds 20% → Filter alert

References:
- Shumailov et al. (2023) - "The Curse of Recursion: Training on Generated Data Makes Models Forget"
- NVIDIA Data Flywheel Blueprint (2025)
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, and_, case, JSON, cast, Float

from ..models import TrainingData, QualitySnapshot
from ..config import Config

logger = logging.getLogger("qython_logger")

# === ALERT THRESHOLDS ===
SCORE_ALERT_THRESHOLD = 0.80       # Average self-critique score below this → pause training
HUMAN_DATA_MIN_PERCENT = 25.0      # % of human data below this → increase human collection
SYNTHETIC_GEN_MAX_PERCENT = 20.0   # % of generation > 1 data above this → filter synthetic data
SCORE_CRITICAL_THRESHOLD = 0.70    # Below this → critical alert
WEEK_OVER_WEEK_DROP = 0.05         # Score drop > 5% week-over-week → trend alert


async def compute_quality_snapshot(db: AsyncSession) -> dict:
    """
    Compute a point-in-time quality snapshot of the training data pool.

    Captures:
    - Average self-critique score (from metadata_info.self_critique_score)
    - Distribution by creation_method (human/ai_generated/hybrid)
    - Distribution by generation_number
    - Total entries ready for training
    - PII detection rate

    Returns:
        dict with all snapshot metrics
    """
    # Total training data entries
    total = await db.scalar(
        select(func.count(TrainingData.id))
    ) or 0

    ready_count = await db.scalar(
        select(func.count(TrainingData.id)).where(
            TrainingData.ready_for_training == True
        )
    ) or 0

    holdout_count = await db.scalar(
        select(func.count(TrainingData.id)).where(
            TrainingData.is_evaluation_holdout == True
        )
    ) or 0

    # By creation_method
    cm_result = await db.execute(
        select(
            TrainingData.creation_method,
            func.count(TrainingData.id)
        )
        .where(TrainingData.ready_for_training == True)
        .group_by(TrainingData.creation_method)
    )
    by_creation_method = {row[0] or "unknown": row[1] for row in cm_result.fetchall()}

    human_count = by_creation_method.get("human", 0)
    ai_count = by_creation_method.get("ai_generated", 0)
    hybrid_count = by_creation_method.get("hybrid", 0)
    ready_total = human_count + ai_count + hybrid_count

    human_percent = (human_count / ready_total * 100) if ready_total > 0 else 0
    ai_percent = (ai_count / ready_total * 100) if ready_total > 0 else 0
    hybrid_percent = (hybrid_count / ready_total * 100) if ready_total > 0 else 0

    # By generation_number
    gen_result = await db.execute(
        select(
            TrainingData.generation_number,
            func.count(TrainingData.id)
        )
        .where(TrainingData.ready_for_training == True)
        .group_by(TrainingData.generation_number)
    )
    by_generation = {row[0] or 0: row[1] for row in gen_result.fetchall()}

    # Count entries with generation > 1 (synthetic derived from synthetic)
    high_gen_count = sum(
        count for gen, count in by_generation.items() if gen > 1
    )
    high_gen_percent = (high_gen_count / ready_total * 100) if ready_total > 0 else 0

    # PII rate
    pii_count = await db.scalar(
        select(func.count(TrainingData.id)).where(
            TrainingData.pii_detected == True
        )
    ) or 0
    pii_rate = (pii_count / total * 100) if total > 0 else 0

    # Average quality score for ready entries
    avg_quality = await db.scalar(
        select(func.avg(TrainingData.quality_score)).where(
            and_(
                TrainingData.ready_for_training == True,
                TrainingData.quality_score > 0,
            )
        )
    ) or 0.0

    # Recent entries (last 7 days) for trend analysis
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent_count = await db.scalar(
        select(func.count(TrainingData.id)).where(
            TrainingData.created_at >= week_ago
        )
    ) or 0

    recent_ready = await db.scalar(
        select(func.count(TrainingData.id)).where(
            and_(
                TrainingData.created_at >= week_ago,
                TrainingData.ready_for_training == True,
            )
        )
    ) or 0

    snapshot = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_entries": total,
        "ready_for_training": ready_count,
        "holdout_count": holdout_count,
        "creation_method": {
            "human": human_count,
            "ai_generated": ai_count,
            "hybrid": hybrid_count,
            "human_percent": round(human_percent, 1),
            "ai_percent": round(ai_percent, 1),
            "hybrid_percent": round(hybrid_percent, 1),
        },
        "generation_distribution": {
            str(k): v for k, v in sorted(by_generation.items())
        },
        "high_generation_percent": round(high_gen_percent, 1),
        "avg_quality_score": round(float(avg_quality), 2),
        "pii_rate": round(pii_rate, 1),
        "recent_7d": {
            "new_entries": recent_count,
            "ready_entries": recent_ready,
        },
    }

    return snapshot


async def check_alerts(snapshot: dict, previous_snapshot: Optional[dict] = None) -> list:
    """
    Evaluate snapshot against thresholds and generate alerts.

    Args:
        snapshot: Current quality snapshot
        previous_snapshot: Previous week's snapshot (for trend analysis)

    Returns:
        List of alert dicts with severity, metric, message, and recommended action
    """
    alerts = []

    # 1. Self-critique average score (from avg_quality_score as proxy)
    avg_quality = snapshot.get("avg_quality_score", 0)
    if avg_quality > 0 and avg_quality < SCORE_CRITICAL_THRESHOLD:
        alerts.append({
            "severity": "critical",
            "metric": "avg_quality_score",
            "value": avg_quality,
            "threshold": SCORE_CRITICAL_THRESHOLD,
            "message": f"Average quality score ({avg_quality}) is critically low",
            "action": "PAUSE training immediately. Review recent data collection.",
        })
    elif avg_quality > 0 and avg_quality < SCORE_ALERT_THRESHOLD:
        alerts.append({
            "severity": "warning",
            "metric": "avg_quality_score",
            "value": avg_quality,
            "threshold": SCORE_ALERT_THRESHOLD,
            "message": f"Average quality score ({avg_quality}) is below threshold",
            "action": "Review data quality. Consider pausing training.",
        })

    # 2. Human data percentage
    human_pct = snapshot.get("creation_method", {}).get("human_percent", 0)
    if snapshot.get("ready_for_training", 0) > 0 and human_pct < HUMAN_DATA_MIN_PERCENT:
        alerts.append({
            "severity": "warning",
            "metric": "human_data_percent",
            "value": human_pct,
            "threshold": HUMAN_DATA_MIN_PERCENT,
            "message": f"Human data is only {human_pct}% of training pool (min: {HUMAN_DATA_MIN_PERCENT}%)",
            "action": "Increase human data collection. Add more physician-authored content.",
        })

    # 3. High-generation synthetic data
    high_gen_pct = snapshot.get("high_generation_percent", 0)
    if high_gen_pct > SYNTHETIC_GEN_MAX_PERCENT:
        alerts.append({
            "severity": "warning",
            "metric": "high_generation_percent",
            "value": high_gen_pct,
            "threshold": SYNTHETIC_GEN_MAX_PERCENT,
            "message": f"Synthetic data (gen > 1) is {high_gen_pct}% of pool (max: {SYNTHETIC_GEN_MAX_PERCENT}%)",
            "action": "Filter out generation > 1 data from training batches.",
        })

    # 4. Week-over-week trend analysis
    if previous_snapshot:
        prev_quality = previous_snapshot.get("avg_quality_score", 0)
        if prev_quality > 0 and avg_quality > 0:
            drop = prev_quality - avg_quality
            if drop > WEEK_OVER_WEEK_DROP:
                alerts.append({
                    "severity": "warning",
                    "metric": "quality_trend",
                    "value": round(drop, 3),
                    "threshold": WEEK_OVER_WEEK_DROP,
                    "message": f"Quality score dropped {drop:.3f} vs last week ({prev_quality:.2f} → {avg_quality:.2f})",
                    "action": "Investigate recent data sources. Check for model collapse pattern.",
                })

    # 5. PII contamination rate
    pii_rate = snapshot.get("pii_rate", 0)
    if pii_rate > 10.0:
        alerts.append({
            "severity": "warning",
            "metric": "pii_rate",
            "value": pii_rate,
            "threshold": 10.0,
            "message": f"PII detection rate is {pii_rate}% — high contamination risk",
            "action": "Ensure PII redaction before export. Review collection points.",
        })

    return alerts


async def save_quality_snapshot(db: AsyncSession) -> dict:
    """
    Compute and persist a quality snapshot to the database.

    Returns:
        dict with snapshot data, alerts, and overall health status
    """
    # Compute current snapshot
    snapshot = await compute_quality_snapshot(db)

    # Get previous snapshot for trend analysis
    prev_result = await db.execute(
        select(QualitySnapshot)
        .order_by(QualitySnapshot.created_at.desc())
        .limit(1)
    )
    prev_record = prev_result.scalar_one_or_none()
    previous_snapshot = prev_record.snapshot_data if prev_record else None

    # Check alerts
    alerts = await check_alerts(snapshot, previous_snapshot)

    # Determine health status
    critical_count = sum(1 for a in alerts if a["severity"] == "critical")
    warning_count = sum(1 for a in alerts if a["severity"] == "warning")

    if critical_count > 0:
        health = "critical"
    elif warning_count > 0:
        health = "warning"
    else:
        health = "healthy"

    # Save to DB
    record = QualitySnapshot(
        snapshot_data=snapshot,
        alerts=alerts,
        health_status=health,
    )
    db.add(record)
    await db.commit()

    logger.info(
        f"[QUALITY] Snapshot saved: {health} | "
        f"total={snapshot['total_entries']}, ready={snapshot['ready_for_training']}, "
        f"alerts={len(alerts)}"
    )

    return {
        "snapshot": snapshot,
        "alerts": alerts,
        "health_status": health,
        "snapshot_id": record.id,
    }


async def get_quality_history(
    db: AsyncSession,
    limit: int = 12,
) -> list:
    """
    Get historical quality snapshots for trend visualization.

    Args:
        limit: Number of recent snapshots to return (default 12 = ~3 months weekly)

    Returns:
        List of snapshot records ordered by date (newest first)
    """
    result = await db.execute(
        select(QualitySnapshot)
        .order_by(QualitySnapshot.created_at.desc())
        .limit(limit)
    )
    records = result.scalars().all()

    return [
        {
            "id": r.id,
            "timestamp": r.created_at.isoformat() if r.created_at else None,
            "health_status": r.health_status,
            "snapshot": r.snapshot_data,
            "alerts": r.alerts,
        }
        for r in records
    ]


async def get_training_readiness(db: AsyncSession) -> dict:
    """
    Assess whether the dataset is ready for fine-tuning.

    Checks:
    - Minimum total entries (target: 5000+)
    - Minimum human data (target: 25%+)
    - Holdout set exists (target: 500+)
    - No critical alerts
    - Low PII contamination (< 5% after filtering)

    Returns:
        dict with readiness bool and per-check details
    """
    snapshot = await compute_quality_snapshot(db)
    alerts = await check_alerts(snapshot)

    checks = {
        "minimum_entries": {
            "passed": snapshot["ready_for_training"] >= 5000,
            "current": snapshot["ready_for_training"],
            "target": 5000,
            "description": "At least 5000 ready-for-training entries",
        },
        "human_data_ratio": {
            "passed": snapshot["creation_method"]["human_percent"] >= HUMAN_DATA_MIN_PERCENT,
            "current": snapshot["creation_method"]["human_percent"],
            "target": HUMAN_DATA_MIN_PERCENT,
            "description": f"At least {HUMAN_DATA_MIN_PERCENT}% human-authored data",
        },
        "holdout_set": {
            "passed": snapshot["holdout_count"] >= 500,
            "current": snapshot["holdout_count"],
            "target": 500,
            "description": "At least 500 entries in holdout evaluation set",
        },
        "no_critical_alerts": {
            "passed": not any(a["severity"] == "critical" for a in alerts),
            "current": sum(1 for a in alerts if a["severity"] == "critical"),
            "target": 0,
            "description": "No critical quality alerts",
        },
        "low_pii_rate": {
            "passed": snapshot["pii_rate"] < 5.0,
            "current": snapshot["pii_rate"],
            "target": 5.0,
            "description": "PII detection rate below 5%",
        },
        "synthetic_ratio": {
            "passed": snapshot["high_generation_percent"] <= SYNTHETIC_GEN_MAX_PERCENT,
            "current": snapshot["high_generation_percent"],
            "target": SYNTHETIC_GEN_MAX_PERCENT,
            "description": f"Synthetic gen>1 data at most {SYNTHETIC_GEN_MAX_PERCENT}%",
        },
    }

    all_passed = all(c["passed"] for c in checks.values())

    return {
        "ready": all_passed,
        "checks": checks,
        "summary": f"{'READY' if all_passed else 'NOT READY'} — "
                   f"{sum(1 for c in checks.values() if c['passed'])}/{len(checks)} checks passed",
    }
