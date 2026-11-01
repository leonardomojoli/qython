# backend/routes/icd10_routes.py
"""
CID-10 / ICD-10 search endpoint for auto-complete functionality.
Searches the official Portuguese ICD-10 table (icd10_codes, seeded from DATASUS by
seeds/seed_icd10.py): codes and descriptions are the official ones.
"""
from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services import icd10_search

router = APIRouter(tags=["ICD-10"])


@router.get("/search")
async def search_icd10(
    q: str = Query(..., min_length=2, description="Search query (code or description)"),
    specialty: Optional[str] = Query(None, description="Boost the specialty's common codes"),
    limit: int = Query(10, ge=1, le=50, description="Maximum results to return"),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """
    Search ICD-10 codes by code ("I21", "e11.9") or description ("hipertensao").
    Returns matching codes sorted by relevance.
    """
    return await icd10_search.autocomplete(db, q, specialty, limit)


@router.get("/popular")
async def get_popular_codes(
    specialty: Optional[str] = Query(None, description="Filter by specialty"),
    limit: int = Query(10, ge=1, le=30),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """
    Get most commonly used ICD-10 codes, optionally filtered by specialty.
    """
    return await icd10_search.popular(db, specialty, limit)
