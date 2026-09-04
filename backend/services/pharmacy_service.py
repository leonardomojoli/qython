# qython/backend/services/pharmacy_service.py
"""
Pharmacy module services: drug interaction checking, geo search, metrics.
"""

import logging
import math
from itertools import combinations
from typing import List, Dict, Optional, Tuple

from sqlalchemy import select, and_, func, case, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import (
    DrugInteraction, Pharmacy, PharmacyChain, PharmacyMedication,
    PharmacyPrescription, PrescriptionShare, Medication
)

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

    from sqlalchemy import or_
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


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two points using Haversine formula."""
    R = 6371  # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


async def find_nearby_pharmacies(
    lat: float,
    lng: float,
    radius_km: float,
    db: AsyncSession,
    limit: int = 50
) -> List[Dict]:
    """
    Find pharmacies near given coordinates using Haversine formula in SQL.
    Groups results by chain_id for display.
    No PostGIS required — pure SQL math sufficient for <5000 pharmacies in V1.
    """
    # Haversine formula in SQL (PostgreSQL)
    # Using approximate bounding box first for efficiency, then exact distance
    lat_range = radius_km / 111.0  # ~111 km per degree latitude
    lng_range = radius_km / (111.0 * math.cos(math.radians(lat)))

    # Pre-filter with bounding box, then calculate exact distance
    haversine_sql = text("""
        6371 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(latitude - :lat) / 2), 2) +
            COS(RADIANS(:lat)) * COS(RADIANS(latitude)) *
            POWER(SIN(RADIANS(longitude - :lng) / 2), 2)
        ))
    """)

    result = await db.execute(
        select(Pharmacy)
        .where(
            and_(
                Pharmacy.is_active == True,
                Pharmacy.latitude.isnot(None),
                Pharmacy.longitude.isnot(None),
                Pharmacy.latitude.between(lat - lat_range, lat + lat_range),
                Pharmacy.longitude.between(lng - lng_range, lng + lng_range),
            )
        )
    )
    candidates = result.scalars().all()

    # Calculate exact distance and filter
    nearby = []
    for pharmacy in candidates:
        distance = haversine_distance(lat, lng, pharmacy.latitude, pharmacy.longitude)
        if distance <= radius_km:
            nearby.append((pharmacy, distance))

    # Sort by distance
    nearby.sort(key=lambda x: x[1])

    # Limit results
    nearby = nearby[:limit]

    # Group by chain
    chains_map = {}  # chain_id -> {chain_info, units: [...]}
    independents = []

    for pharmacy, distance in nearby:
        pharmacy_data = {
            "id": pharmacy.id,
            "name": pharmacy.name,
            "brand_name": pharmacy.brand_name,
            "address": pharmacy.address,
            "city": pharmacy.city,
            "state": pharmacy.state,
            "phone": pharmacy.phone,
            "latitude": pharmacy.latitude,
            "longitude": pharmacy.longitude,
            "distance_km": round(distance, 1),
        }

        if pharmacy.chain_id:
            if pharmacy.chain_id not in chains_map:
                chains_map[pharmacy.chain_id] = {
                    "chain_id": pharmacy.chain_id,
                    "units": [],
                }
            chains_map[pharmacy.chain_id]["units"].append(pharmacy_data)
        else:
            independents.append(pharmacy_data)

    # Enrich chain data
    if chains_map:
        chain_ids = list(chains_map.keys())
        chain_result = await db.execute(
            select(PharmacyChain).where(PharmacyChain.id.in_(chain_ids))
        )
        chains = chain_result.scalars().all()
        for chain in chains:
            if chain.id in chains_map:
                chains_map[chain.id]["chain_name"] = chain.name
                chains_map[chain.id]["brand_names"] = chain.brand_names
                chains_map[chain.id]["logo_url"] = chain.logo_url
                chains_map[chain.id]["subscription_tier"] = chain.subscription_tier
                chains_map[chain.id]["unit_count"] = len(chains_map[chain.id]["units"])

    # Sort chains by tier priority: enterprise > regional > individual
    tier_order = {'enterprise': 0, 'regional': 1, 'individual': 2}
    sorted_chains = sorted(
        chains_map.values(),
        key=lambda c: (tier_order.get(c.get("subscription_tier", "individual"), 2),
                       c["units"][0]["distance_km"] if c["units"] else 999)
    )

    return {
        "chains": sorted_chains,
        "independents": independents,
        "total_pharmacies": sum(len(c["units"]) for c in sorted_chains) + len(independents),
    }


async def get_chain_metrics(chain_id: int, db: AsyncSession) -> Dict:
    """Aggregate metrics for a pharmacy chain: sends, views, fulfillments."""
    # Get all pharmacy IDs for this chain
    result = await db.execute(
        select(Pharmacy.id).where(Pharmacy.chain_id == chain_id)
    )
    pharmacy_ids = [r for r in result.scalars().all()]

    if not pharmacy_ids:
        return {"total_units": 0, "total_sends": 0, "total_viewed": 0, "total_fulfilled": 0}

    # Aggregate prescription stats
    stats_result = await db.execute(
        select(
            func.count(PharmacyPrescription.id).label("total_sends"),
            func.count(case((PharmacyPrescription.status == 'viewed', 1))).label("total_viewed"),
            func.count(case((PharmacyPrescription.status == 'fulfilled', 1))).label("total_fulfilled"),
        ).where(PharmacyPrescription.pharmacy_id.in_(pharmacy_ids))
    )
    row = stats_result.one()

    return {
        "total_units": len(pharmacy_ids),
        "total_sends": row.total_sends,
        "total_viewed": row.total_viewed,
        "total_fulfilled": row.total_fulfilled,
    }


async def get_pharmacy_metrics(pharmacy_id: int, db: AsyncSession) -> Dict:
    """Metrics for a single pharmacy unit."""
    stats_result = await db.execute(
        select(
            func.count(PharmacyPrescription.id).label("total_sends"),
            func.count(case((PharmacyPrescription.status == 'viewed', 1))).label("total_viewed"),
            func.count(case((PharmacyPrescription.status == 'fulfilled', 1))).label("total_fulfilled"),
        ).where(PharmacyPrescription.pharmacy_id == pharmacy_id)
    )
    row = stats_result.one()

    return {
        "total_sends": row.total_sends,
        "total_viewed": row.total_viewed,
        "total_fulfilled": row.total_fulfilled,
    }
