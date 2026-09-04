# qython/backend/services/storage_service.py

"""
Storage management service: quotas, limits, and usage tracking.
"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from ..config import Config
from ..models import User, AcademicDocument, AcademicLibrary

logger = logging.getLogger("qython_logger")


def get_plan_base(plan_string: str) -> str:
    """Extract base plan name from subscription strings like 'resident_monthly' -> 'resident'."""
    if not plan_string:
        return 'free'
    for plan in ('specialist', 'staff', 'resident', 'free'):
        if plan in plan_string:
            return plan
    return 'free'


def get_storage_quota(user: User) -> int:
    """Return storage quota in bytes for the user's plan."""
    plan = get_plan_base(user.subscription_plan)
    return Config.STORAGE_QUOTAS.get(plan, Config.STORAGE_QUOTAS['free'])


def get_storage_limits(user: User) -> dict:
    """Return docs_per_library and max_libraries limits for the user's plan."""
    plan = get_plan_base(user.subscription_plan)
    return Config.STORAGE_LIMITS.get(plan, Config.STORAGE_LIMITS['free'])


async def check_storage_quota(db: AsyncSession, user: User, file_size_bytes: int) -> bool:
    """Check if user has enough storage quota for a file of given size. Admins bypass all limits."""
    if user.is_admin:
        return True
    quota = get_storage_quota(user)
    return (user.storage_used_bytes + file_size_bytes) <= quota


async def check_library_limits(db: AsyncSession, user: User) -> bool:
    """Check if user can create another library. Admins bypass all limits."""
    if user.is_admin:
        return True

    limits = get_storage_limits(user)
    max_libraries = limits.get('max_libraries')
    if max_libraries is None:
        return True

    result = await db.execute(
        select(func.count()).select_from(AcademicLibrary).filter(AcademicLibrary.user_id == user.id)
    )
    current_count = result.scalar() or 0
    return current_count < max_libraries


async def check_document_limits(db: AsyncSession, user: User, library_id: int) -> bool:
    """Check if user can add another document to the specified library. Admins bypass all limits."""
    if user.is_admin:
        return True

    limits = get_storage_limits(user)
    docs_per_library = limits.get('docs_per_library')
    if docs_per_library is None:
        return True

    result = await db.execute(
        select(func.count()).select_from(AcademicDocument).filter(AcademicDocument.library_id == library_id)
    )
    current_count = result.scalar() or 0
    return current_count < docs_per_library


async def update_storage_used(db: AsyncSession, user: User, delta_bytes: int):
    """Increment or decrement user's storage_used_bytes by delta_bytes."""
    user.storage_used_bytes = max(0, (user.storage_used_bytes or 0) + delta_bytes)
    await db.commit()


async def recalculate_storage(db: AsyncSession, user: User) -> int:
    """Recalculate total storage from all user documents. Returns new total."""
    result = await db.execute(
        select(func.coalesce(func.sum(AcademicDocument.file_size_bytes), 0))
        .select_from(AcademicDocument)
        .join(AcademicLibrary)
        .filter(AcademicLibrary.user_id == user.id)
    )
    total = result.scalar() or 0
    user.storage_used_bytes = total
    await db.commit()
    logger.info(f"Recalculated storage for user {user.id}: {total} bytes")
    return total
