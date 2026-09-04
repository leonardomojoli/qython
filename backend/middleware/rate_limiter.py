# qython/backend/middleware/rate_limiter.py
"""
Custom Rate Limiter Middleware
Tracks API requests in database for analytics and abuse detection
Works alongside slowapi for actual rate limiting
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import func, select

from ..database import AsyncSessionLocal
from ..models import RateLimitEntry
from ..services.system_settings_service import SystemSettingsService
from ..services.admin_notifications import AdminNotificationService

logger = logging.getLogger("qython_logger")


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Middleware that tracks API requests for rate limiting analytics.
    Works alongside slowapi which handles the actual rate limiting.
    This middleware:
    - Logs requests to database for analytics
    - Detects abuse patterns
    - Sends alerts for repeated violations
    """

    # Endpoints to exclude from tracking (high-frequency, low-risk)
    EXCLUDED_ENDPOINTS = {
        "/api/health",
        "/api/admin/metrics",  # Don't track internal metrics checks
        "/static",
    }

    # Track violations in memory (IP -> count) to avoid DB queries on every request
    _violation_counts: dict[str, int] = {}
    _last_violation_reset: datetime = datetime.now(timezone.utc)

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip tracking for excluded endpoints
        path = request.url.path
        if any(path.startswith(excluded) for excluded in self.EXCLUDED_ENDPOINTS):
            return await call_next(request)

        # Get client IP
        ip_address = self._get_client_ip(request)
        endpoint = path

        # Get user ID from request state (set by auth middleware if authenticated)
        user_id = getattr(request.state, 'user_id', None) if hasattr(request, 'state') else None

        try:
            async with AsyncSessionLocal() as db:
                # Check if rate limiting is enabled
                if await SystemSettingsService.is_rate_limit_enabled(db):
                    # Log the request
                    entry = RateLimitEntry(
                        user_id=user_id,
                        ip_address=ip_address,
                        endpoint=endpoint
                    )
                    db.add(entry)
                    await db.commit()

        except Exception as e:
            # Don't block requests on tracking errors
            logger.error(f"Rate limit tracking error: {e}")

        # Continue with the request
        response = await call_next(request)

        # Track 429 responses (rate limit exceeded)
        if response.status_code == 429:
            await self._track_violation(ip_address, endpoint)

        return response

    def _get_client_ip(self, request: Request) -> str:
        """Extract the real client IP, handling proxies"""
        # Check X-Forwarded-For header first (for reverse proxies)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            # Take the first IP in the chain (original client)
            return forwarded_for.split(",")[0].strip()

        # Check X-Real-IP header (nginx)
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

        # Fall back to direct connection
        return request.client.host if request.client else "unknown"

    async def _track_violation(self, ip_address: str, endpoint: str):
        """Track rate limit violations and send alerts if needed"""
        # Reset violation counts every hour
        if datetime.now(timezone.utc) - self._last_violation_reset > timedelta(hours=1):
            self._violation_counts.clear()
            self._last_violation_reset = datetime.now(timezone.utc)

        # Increment violation count
        self._violation_counts[ip_address] = self._violation_counts.get(ip_address, 0) + 1
        count = self._violation_counts[ip_address]

        logger.warning(f"Rate limit violation #{count} for IP {ip_address} on {endpoint}")

        # Send alert on significant violations (10, 50, 100, etc.)
        if count in [10, 50, 100] or (count > 100 and count % 100 == 0):
            try:
                async with AsyncSessionLocal() as db:
                    await AdminNotificationService.send_rate_limit_abuse_alert(
                        db,
                        ip_address,
                        count,
                        endpoint
                    )
            except Exception as e:
                logger.error(f"Failed to send rate limit alert: {e}")


class MaintenanceModeMiddleware(BaseHTTPMiddleware):
    """
    Middleware that checks maintenance mode and blocks write operations
    """

    # Read-only methods that are always allowed
    SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

    # Endpoints always allowed (even in maintenance)
    ALWAYS_ALLOWED = {
        "/api/admin/settings",  # Admin can change settings
        "/api/admin/metrics",
        "/api/billing/webhook",  # Webhooks must be processed
        "/api/health",
    }

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        method = request.method

        # Skip for always-allowed endpoints
        if any(path.startswith(allowed) for allowed in self.ALWAYS_ALLOWED):
            return await call_next(request)

        # Skip for safe methods
        if method in self.SAFE_METHODS:
            return await call_next(request)

        try:
            async with AsyncSessionLocal() as db:
                maintenance_level = await SystemSettingsService.get_maintenance_level(db)

                if maintenance_level >= 2:
                    # Full maintenance - block all write operations
                    return Response(
                        content='{"detail": "Sistema em manutenção. Por favor, tente novamente mais tarde."}',
                        status_code=503,
                        media_type="application/json"
                    )

        except Exception as e:
            logger.error(f"Maintenance check error: {e}")

        return await call_next(request)


async def get_rate_limit_violations(db, hours: int = 24) -> list[dict]:
    """Get rate limit violations grouped by IP for the last N hours"""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    # This is called from admin routes, so we query the database directly
    result = await db.execute(
        select(
            RateLimitEntry.ip_address,
            func.count(RateLimitEntry.id).label('count'),
            func.max(RateLimitEntry.timestamp).label('last_seen'),
            func.array_agg(func.distinct(RateLimitEntry.endpoint)).label('endpoints')
        )
        .filter(RateLimitEntry.timestamp >= since)
        .group_by(RateLimitEntry.ip_address)
        .having(func.count(RateLimitEntry.id) > 60)  # Only IPs with more than 60 requests/hour
        .order_by(func.count(RateLimitEntry.id).desc())
        .limit(50)
    )

    violations = []
    for row in result:
        violations.append({
            "ip_address": row.ip_address,
            "request_count": row.count,
            "last_seen": row.last_seen.isoformat() if row.last_seen else None,
            "endpoints": list(set(row.endpoints)) if row.endpoints else []
        })

    return violations
