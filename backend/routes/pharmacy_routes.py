# qython/backend/routes/pharmacy_routes.py
"""
Pharmacy management API endpoints.
CRUD for chains, pharmacies, inventory, waitlist, and geo search.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import select, and_, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import (
    User, Pharmacy, PharmacyChain, PharmacyMedication,
    PharmacyWaitlist, Medication
)
from ..security import get_current_active_user
from ..services.pharmacy_service import find_nearby_pharmacies, get_chain_metrics, get_pharmacy_metrics
from ..rate_limiter import limiter

logger = logging.getLogger("qython_logger")
router = APIRouter()


# --- Pydantic Models ---

class PharmacyChainCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    brand_names: Optional[List[str]] = None
    cnpj_matriz: Optional[str] = None
    logo_url: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    subscription_tier: str = "individual"


class PharmacyChainUpdate(BaseModel):
    name: Optional[str] = None
    brand_names: Optional[List[str]] = None
    cnpj_matriz: Optional[str] = None
    logo_url: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    subscription_tier: Optional[str] = None
    subscription_active: Optional[bool] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None


class PharmacyChainResponse(BaseModel):
    id: int
    name: str
    brand_names: Optional[List[str]] = None
    cnpj_matriz: Optional[str] = None
    logo_url: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    subscription_tier: str
    subscription_active: bool
    is_active: bool
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PharmacyCreate(BaseModel):
    chain_id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=255)
    brand_name: Optional[str] = None
    cnpj: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = Field(None, max_length=2)
    zip_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class PharmacyUpdate(BaseModel):
    chain_id: Optional[int] = None
    name: Optional[str] = None
    brand_name: Optional[str] = None
    cnpj: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None


class PharmacyResponse(BaseModel):
    id: int
    chain_id: Optional[int] = None
    name: str
    brand_name: Optional[str] = None
    cnpj: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_active: bool
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class InventoryItem(BaseModel):
    medication_id: int
    price: Optional[float] = None
    farmacia_popular_price: Optional[float] = None
    in_stock: bool = True


class WaitlistCreate(BaseModel):
    pharmacy_name: str = Field(..., min_length=1, max_length=255)
    cnpj: Optional[str] = None
    contact_name: str = Field(..., min_length=1, max_length=150)
    email: str = Field(..., max_length=120)
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = Field(None, max_length=2)
    is_chain: bool = False
    chain_size: Optional[int] = None


class WaitlistResponse(BaseModel):
    id: int
    pharmacy_name: str
    cnpj: Optional[str] = None
    contact_name: str
    email: str
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    is_chain: bool
    chain_size: Optional[int] = None
    status: str
    admin_notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Pharmacy Listing (Public) ---

@router.get("")
async def list_pharmacies(
    city: Optional[str] = None,
    state: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: float = Query(10, ge=1, le=100),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List active pharmacies. Supports geo search and city/state filter."""
    # Geo search mode
    if lat is not None and lng is not None:
        result = await find_nearby_pharmacies(lat, lng, radius_km, db, limit)
        return result

    # City/State filter mode
    query = select(Pharmacy).where(Pharmacy.is_active == True)

    if city:
        query = query.where(Pharmacy.city.ilike(f"%{city}%"))
    if state:
        query = query.where(Pharmacy.state == state.upper())

    query = query.order_by(Pharmacy.name).offset(offset).limit(limit)

    result = await db.execute(query)
    pharmacies = result.scalars().all()

    return [
        {
            "id": p.id,
            "chain_id": p.chain_id,
            "name": p.name,
            "brand_name": p.brand_name,
            "address": p.address,
            "city": p.city,
            "state": p.state,
            "phone": p.phone,
            "latitude": p.latitude,
            "longitude": p.longitude,
        }
        for p in pharmacies
    ]


@router.get("/{pharmacy_id}")
async def get_pharmacy(
    pharmacy_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get pharmacy details."""
    result = await db.execute(
        select(Pharmacy).where(Pharmacy.id == pharmacy_id)
    )
    pharmacy = result.scalar_one_or_none()
    if not pharmacy:
        raise HTTPException(status_code=404, detail="Pharmacy not found")

    return {
        "id": pharmacy.id,
        "chain_id": pharmacy.chain_id,
        "name": pharmacy.name,
        "brand_name": pharmacy.brand_name,
        "cnpj": pharmacy.cnpj,
        "phone": pharmacy.phone,
        "email": pharmacy.email,
        "address": pharmacy.address,
        "city": pharmacy.city,
        "state": pharmacy.state,
        "zip_code": pharmacy.zip_code,
        "latitude": pharmacy.latitude,
        "longitude": pharmacy.longitude,
        "is_active": pharmacy.is_active,
        "is_verified": pharmacy.is_verified,
    }


# --- Chain Management (Admin) ---

@router.get("/chains", response_model=List[PharmacyChainResponse])
async def list_chains(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List pharmacy chains (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(PharmacyChain).order_by(PharmacyChain.name)
    )
    return result.scalars().all()


@router.post("/chains", response_model=PharmacyChainResponse, status_code=status.HTTP_201_CREATED)
async def create_chain(
    payload: PharmacyChainCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a pharmacy chain (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    chain = PharmacyChain(**payload.model_dump())
    db.add(chain)
    await db.commit()
    await db.refresh(chain)

    logger.info(f"Pharmacy chain created: {chain.name} by {current_user.email}")
    return chain


@router.put("/chains/{chain_id}", response_model=PharmacyChainResponse)
async def update_chain(
    chain_id: int,
    payload: PharmacyChainUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a pharmacy chain (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(PharmacyChain).where(PharmacyChain.id == chain_id)
    )
    chain = result.scalar_one_or_none()
    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(chain, key, value)

    await db.commit()
    await db.refresh(chain)

    logger.info(f"Pharmacy chain updated: {chain.name} by {current_user.email}")
    return chain


# --- Pharmacy CRUD (Admin) ---

@router.post("", response_model=PharmacyResponse, status_code=status.HTTP_201_CREATED)
async def create_pharmacy(
    payload: PharmacyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a pharmacy (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Validate chain exists if chain_id provided
    if payload.chain_id:
        chain_result = await db.execute(
            select(PharmacyChain).where(PharmacyChain.id == payload.chain_id)
        )
        if not chain_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Chain not found")

    pharmacy = Pharmacy(**payload.model_dump())
    db.add(pharmacy)
    await db.commit()
    await db.refresh(pharmacy)

    logger.info(f"Pharmacy created: {pharmacy.name} by {current_user.email}")
    return pharmacy


@router.put("/{pharmacy_id}", response_model=PharmacyResponse)
async def update_pharmacy(
    pharmacy_id: int,
    payload: PharmacyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a pharmacy (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(Pharmacy).where(Pharmacy.id == pharmacy_id)
    )
    pharmacy = result.scalar_one_or_none()
    if not pharmacy:
        raise HTTPException(status_code=404, detail="Pharmacy not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(pharmacy, key, value)

    await db.commit()
    await db.refresh(pharmacy)

    logger.info(f"Pharmacy updated: {pharmacy.name} by {current_user.email}")
    return pharmacy


@router.delete("/{pharmacy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pharmacy(
    pharmacy_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Soft delete a pharmacy (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(Pharmacy).where(Pharmacy.id == pharmacy_id)
    )
    pharmacy = result.scalar_one_or_none()
    if not pharmacy:
        raise HTTPException(status_code=404, detail="Pharmacy not found")

    pharmacy.is_active = False
    await db.commit()

    logger.info(f"Pharmacy soft deleted: {pharmacy.name} by {current_user.email}")


# --- Inventory Management ---

@router.get("/{pharmacy_id}/medications")
async def get_pharmacy_medications(
    pharmacy_id: int,
    search: Optional[str] = None,
    farmacia_popular: Optional[bool] = None,
    in_stock: Optional[bool] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get pharmacy's medication catalog."""
    # Verify pharmacy exists
    result = await db.execute(
        select(Pharmacy).where(Pharmacy.id == pharmacy_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Pharmacy not found")

    query = (
        select(PharmacyMedication, Medication)
        .join(Medication, PharmacyMedication.medication_id == Medication.id)
        .where(PharmacyMedication.pharmacy_id == pharmacy_id)
    )

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Medication.name.ilike(search_term),
                Medication.active_principle.ilike(search_term),
            )
        )

    if farmacia_popular is not None:
        query = query.where(Medication.farmacia_popular == farmacia_popular)

    if in_stock is not None:
        query = query.where(PharmacyMedication.in_stock == in_stock)

    query = query.order_by(Medication.name).offset(offset).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "id": pm.id,
            "medication_id": med.id,
            "name": med.name,
            "active_principle": med.active_principle,
            "presentation": med.presentation,
            "therapeutic_class": med.therapeutic_class,
            "farmacia_popular": med.farmacia_popular,
            "price": pm.price,
            "farmacia_popular_price": pm.farmacia_popular_price,
            "in_stock": pm.in_stock,
        }
        for pm, med in rows
    ]


@router.post("/{pharmacy_id}/medications")
async def update_pharmacy_inventory(
    pharmacy_id: int,
    items: List[InventoryItem],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Add/update inventory for a pharmacy (admin only, bulk)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Verify pharmacy exists
    result = await db.execute(
        select(Pharmacy).where(Pharmacy.id == pharmacy_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Pharmacy not found")

    created = 0
    updated = 0

    for item in items:
        # Check if entry exists
        result = await db.execute(
            select(PharmacyMedication).where(
                and_(
                    PharmacyMedication.pharmacy_id == pharmacy_id,
                    PharmacyMedication.medication_id == item.medication_id,
                )
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.price = item.price
            existing.farmacia_popular_price = item.farmacia_popular_price
            existing.in_stock = item.in_stock
            existing.last_stock_update = datetime.now(timezone.utc)
            updated += 1
        else:
            pm = PharmacyMedication(
                pharmacy_id=pharmacy_id,
                medication_id=item.medication_id,
                price=item.price,
                farmacia_popular_price=item.farmacia_popular_price,
                in_stock=item.in_stock,
            )
            db.add(pm)
            created += 1

    await db.commit()
    logger.info(f"Inventory update for pharmacy {pharmacy_id}: {created} created, {updated} updated by {current_user.email}")

    return {"created": created, "updated": updated}


# --- Waitlist ---

@router.post("/waitlist", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
async def join_waitlist(
    request: Request,
    payload: WaitlistCreate,
    db: AsyncSession = Depends(get_db),
):
    """Join the pharmacy waitlist (public, rate limited)."""
    # Check if email already in waitlist
    result = await db.execute(
        select(PharmacyWaitlist).where(PharmacyWaitlist.email == payload.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already in waitlist")

    entry = PharmacyWaitlist(**payload.model_dump())
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    logger.info(f"Pharmacy waitlist entry: {payload.pharmacy_name} ({payload.email})")
    return {"message": "Successfully joined the waitlist", "id": entry.id}


@router.get("/waitlist", response_model=List[WaitlistResponse])
async def list_waitlist(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List waitlist entries (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    query = select(PharmacyWaitlist)

    if status_filter:
        query = query.where(PharmacyWaitlist.status == status_filter)

    query = query.order_by(PharmacyWaitlist.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


# --- Waitlist Management (Admin) ---

class WaitlistUpdate(BaseModel):
    status: Optional[str] = None  # pending/contacted/onboarded/rejected
    admin_notes: Optional[str] = None


@router.put("/waitlist/{entry_id}", response_model=WaitlistResponse)
async def update_waitlist_entry(
    entry_id: int,
    payload: WaitlistUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a waitlist entry status/notes (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(PharmacyWaitlist).where(PharmacyWaitlist.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")

    valid_statuses = ['pending', 'contacted', 'onboarded', 'rejected']
    if payload.status and payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(entry, key, value)

    await db.commit()
    await db.refresh(entry)

    logger.info(f"Waitlist entry {entry_id} updated to status={entry.status} by {current_user.email}")
    return entry


# --- Chain Metrics (Admin) ---

@router.get("/chains/{chain_id}/metrics")
async def get_chain_metrics_endpoint(
    chain_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get aggregated metrics for a pharmacy chain (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Verify chain exists
    result = await db.execute(
        select(PharmacyChain).where(PharmacyChain.id == chain_id)
    )
    chain = result.scalar_one_or_none()
    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")

    metrics = await get_chain_metrics(chain_id, db)
    metrics["chain_name"] = chain.name
    return metrics
