# qython/backend/services/system_settings_service.py
"""
System Settings Service with in-memory cache
Manages payment gateway toggles, maintenance levels, and rate limiting configuration
"""

import time
from typing import Dict, Optional, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from fastapi import Request

from ..models import SystemSettings, SettingsAuditLog


class SystemSettingsService:
    """Service for managing system settings with cache"""

    # In-memory cache: {key: (value, timestamp)}
    _cache: Dict[str, Tuple[str, float]] = {}
    _cache_ttl = 300  # 5 minutes

    # Default values for all settings
    DEFAULTS = {
        "payment_gateway_stripe_enabled": "false",   # Stripe não serve no Uruguai (sem conta/chaves) — não habilitar
        "payment_gateway_binance_enabled": "false",  # sem chaves Binance configuradas — habilitar só após setar BINANCE_PAY_*
        "payment_gateway_dlocal_enabled": "false",   # off até ter chaves + validar no sandbox; admin liga no painel
        "server_maintenance_level": "0",
        "new_registrations_enabled": "true",
        "require_invite": "false",  # waitlist/convite: false = quem verifica entra direto (sem fricção)
        "auto_maintenance_cpu_threshold": "90",
        "auto_maintenance_memory_threshold": "85",
        "rate_limit_requests_per_minute": "60",
        "rate_limit_enabled": "true",
        "auto_maintenance_enabled": "true",
        "auto_maintenance_override_until": "",  # Empty means no override
    }

    @classmethod
    def _is_cache_valid(cls, key: str) -> bool:
        """Check if cached value is still valid"""
        if key not in cls._cache:
            return False
        _, timestamp = cls._cache[key]
        return (time.time() - timestamp) < cls._cache_ttl

    @classmethod
    def invalidate_cache(cls, key: Optional[str] = None):
        """Invalidate cache for a specific key or all keys"""
        if key:
            cls._cache.pop(key, None)
        else:
            cls._cache.clear()

    @classmethod
    async def get(cls, key: str, db: AsyncSession) -> str:
        """Get a setting value with cache"""
        # Check cache first
        if cls._is_cache_valid(key):
            return cls._cache[key][0]

        # Query database
        result = await db.execute(select(SystemSettings).filter(SystemSettings.key == key))
        setting = result.scalars().first()

        if setting:
            value = setting.value
        else:
            # Return default if not in database
            value = cls.DEFAULTS.get(key, "")

        # Update cache
        cls._cache[key] = (value, time.time())
        return value

    @classmethod
    async def get_bool(cls, key: str, db: AsyncSession) -> bool:
        """Get a setting as boolean"""
        value = await cls.get(key, db)
        return value.lower() in ('true', '1', 'yes', 'on')

    @classmethod
    async def get_int(cls, key: str, db: AsyncSession) -> int:
        """Get a setting as integer"""
        value = await cls.get(key, db)
        try:
            return int(value)
        except (ValueError, TypeError):
            default = cls.DEFAULTS.get(key, "0")
            try:
                return int(default)
            except (ValueError, TypeError):
                return 0

    @classmethod
    async def get_all(cls, db: AsyncSession) -> Dict[str, str]:
        """Get all settings"""
        result = await db.execute(select(SystemSettings))
        settings = result.scalars().all()

        # Start with defaults
        all_settings = cls.DEFAULTS.copy()

        # Override with database values
        for setting in settings:
            all_settings[setting.key] = setting.value

        return all_settings

    @classmethod
    async def get_public_settings(cls, db: AsyncSession) -> Dict[str, Any]:
        """Get settings that are safe to expose publicly (no auth required)"""
        return {
            "payment_gateway_stripe_enabled": await cls.get_bool("payment_gateway_stripe_enabled", db),
            "payment_gateway_binance_enabled": await cls.get_bool("payment_gateway_binance_enabled", db),
            "payment_gateway_dlocal_enabled": await cls.get_bool("payment_gateway_dlocal_enabled", db),
            "server_maintenance_level": await cls.get_int("server_maintenance_level", db),
            "new_registrations_enabled": await cls.get_bool("new_registrations_enabled", db),
            "require_invite": await cls.get_bool("require_invite", db),
        }

    @classmethod
    async def set(
        cls,
        key: str,
        value: str,
        db: AsyncSession,
        user_id: Optional[int] = None,
        request: Optional[Request] = None,
        reason: Optional[str] = None
    ) -> bool:
        """Set a setting value with audit logging"""
        # Get old value for audit log
        old_value = await cls.get(key, db)

        # Upsert the setting
        result = await db.execute(select(SystemSettings).filter(SystemSettings.key == key))
        setting = result.scalars().first()

        if setting:
            setting.value = value
            setting.updated_by = user_id
        else:
            setting = SystemSettings(
                key=key,
                value=value,
                updated_by=user_id
            )
            db.add(setting)

        # Create audit log entry
        ip_address = None
        user_agent = None
        if request:
            ip_address = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent", "")[:500]

        audit_entry = SettingsAuditLog(
            setting_key=key,
            old_value=old_value if old_value != value else None,
            new_value=value,
            changed_by=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            reason=reason
        )
        db.add(audit_entry)

        await db.commit()

        # Invalidate cache
        cls.invalidate_cache(key)

        return True

    # Convenience methods for common checks
    @classmethod
    async def is_stripe_enabled(cls, db: AsyncSession) -> bool:
        """Check if Stripe payments are enabled"""
        return await cls.get_bool("payment_gateway_stripe_enabled", db)

    @classmethod
    async def is_binance_enabled(cls, db: AsyncSession) -> bool:
        """Check if Binance Pay is enabled"""
        return await cls.get_bool("payment_gateway_binance_enabled", db)

    @classmethod
    async def is_dlocal_enabled(cls, db: AsyncSession) -> bool:
        """Check if dLocal Go payments are enabled"""
        return await cls.get_bool("payment_gateway_dlocal_enabled", db)

    @classmethod
    async def get_maintenance_level(cls, db: AsyncSession) -> int:
        """Get current maintenance level (0=normal, 1=high traffic, 2=maintenance)"""
        return await cls.get_int("server_maintenance_level", db)

    @classmethod
    async def is_registration_enabled(cls, db: AsyncSession) -> bool:
        """Check if new user registrations are allowed"""
        maintenance_level = await cls.get_maintenance_level(db)
        if maintenance_level >= 1:
            return False
        return await cls.get_bool("new_registrations_enabled", db)

    @classmethod
    async def is_invite_required(cls, db: AsyncSession) -> bool:
        """Se True, usuário verificado precisa de convite (waitlist) p/ acessar. Default
        False = sem fricção: quem verifica (Latreo) entra direto como 'active'. Religável
        no admin (/admin/settings → require_invite) sem deploy."""
        return await cls.get_bool("require_invite", db)

    @classmethod
    async def is_rate_limit_enabled(cls, db: AsyncSession) -> bool:
        """Check if rate limiting is enabled"""
        return await cls.get_bool("rate_limit_enabled", db)

    @classmethod
    async def get_rate_limit(cls, db: AsyncSession) -> int:
        """Get rate limit (requests per minute)"""
        return await cls.get_int("rate_limit_requests_per_minute", db)

    @classmethod
    async def is_auto_maintenance_enabled(cls, db: AsyncSession) -> bool:
        """Check if auto-maintenance is enabled"""
        # Check for manual override
        override_until = await cls.get("auto_maintenance_override_until", db)
        if override_until:
            try:
                override_timestamp = float(override_until)
                if time.time() < override_timestamp:
                    return False
            except (ValueError, TypeError):
                pass

        return await cls.get_bool("auto_maintenance_enabled", db)

    @classmethod
    async def set_auto_maintenance_override(cls, db: AsyncSession, hours: int, user_id: Optional[int] = None, request: Optional[Request] = None):
        """Override auto-maintenance for specified hours"""
        override_until = str(time.time() + (hours * 3600))
        await cls.set(
            "auto_maintenance_override_until",
            override_until,
            db,
            user_id=user_id,
            request=request,
            reason=f"Manual override for {hours} hour(s)"
        )


# Create a singleton-like instance for easy imports
settings_service = SystemSettingsService()
