# qython/backend/services/server_monitor.py
"""
Server Monitor Service
Collects server metrics and triggers auto-maintenance when thresholds are exceeded.

Improvements over v1:
- Hysteresis: escalation threshold != de-escalation threshold (prevents yo-yo)
- Email cooldown: minimum 1 hour between alerts of the same type
- Normalization email: notifies when system returns to normal
- Longer evaluation window: 15 minutes instead of 5 for smoother averages
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

import psutil
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, delete

from ..config import Config
from ..models import ServerMetrics, User
from ..database import AsyncSessionLocal
from .system_settings_service import SystemSettingsService

logger = logging.getLogger("qython_logger")


class ServerMonitor:
    """Service for monitoring server health and triggering auto-maintenance"""

    _task: Optional[asyncio.Task] = None
    _running: bool = False

    # Metric collection interval (seconds)
    COLLECT_INTERVAL = 60  # 1 minute

    # Auto-maintenance check interval (seconds)
    CHECK_INTERVAL = 300  # 5 minutes

    # Time window for evaluating metrics (minutes) — longer = smoother
    EVALUATION_WINDOW = 15

    # Hysteresis gap: de-escalation requires metrics to drop this many % below the escalation threshold
    # e.g. if escalation is at 90%, de-escalation only happens below 90% - 15% = 75%
    HYSTERESIS_GAP = 15

    # Email cooldown: minimum seconds between alert emails of the same level
    EMAIL_COOLDOWN = 3600  # 1 hour

    # Track last email sent per level to enforce cooldown
    _last_email_sent: Dict[int, datetime] = {}

    # Track last known level for normalization email
    _last_notified_level: int = 0

    @classmethod
    async def collect_metrics(cls):
        """Collect current server metrics and store in database"""
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')

            # Count active connections (approximation via open files)
            try:
                active_connections = len(psutil.net_connections(kind='inet'))
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                active_connections = 0

            async with AsyncSessionLocal() as db:
                metric = ServerMetrics(
                    cpu_percent=cpu_percent,
                    memory_percent=memory.percent,
                    disk_percent=disk.percent,
                    active_connections=active_connections,
                    requests_per_minute=0  # Will be calculated separately if needed
                )
                db.add(metric)
                await db.commit()

                logger.debug(f"Metrics collected: CPU={cpu_percent}%, RAM={memory.percent}%, Disk={disk.percent}%")

        except Exception as e:
            logger.error(f"Error collecting server metrics: {e}")

    @classmethod
    async def get_recent_metrics(cls, db: AsyncSession, minutes: int = 5) -> List[ServerMetrics]:
        """Get metrics from the last N minutes"""
        since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        result = await db.execute(
            select(ServerMetrics)
            .filter(ServerMetrics.timestamp >= since)
            .order_by(ServerMetrics.timestamp.desc())
        )
        return result.scalars().all()

    @classmethod
    async def get_latest_metrics(cls, db: AsyncSession) -> Optional[ServerMetrics]:
        """Get the most recent metric entry"""
        result = await db.execute(
            select(ServerMetrics)
            .order_by(ServerMetrics.timestamp.desc())
            .limit(1)
        )
        return result.scalars().first()

    @classmethod
    async def get_metrics_history(cls, db: AsyncSession, hours: int = 24) -> List[Dict[str, Any]]:
        """Get metrics history for the last N hours"""
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        result = await db.execute(
            select(ServerMetrics)
            .filter(ServerMetrics.timestamp >= since)
            .order_by(ServerMetrics.timestamp.asc())
        )
        metrics = result.scalars().all()

        return [
            {
                "timestamp": m.timestamp.isoformat() if m.timestamp else None,
                "cpu_percent": m.cpu_percent,
                "memory_percent": m.memory_percent,
                "disk_percent": m.disk_percent,
                "active_connections": m.active_connections,
                "requests_per_minute": m.requests_per_minute
            }
            for m in metrics
        ]

    @classmethod
    def _can_send_email(cls, level: int) -> bool:
        """Check if enough time has passed since last email for this level"""
        last_sent = cls._last_email_sent.get(level)
        if last_sent is None:
            return True
        elapsed = (datetime.now(timezone.utc) - last_sent).total_seconds()
        return elapsed >= cls.EMAIL_COOLDOWN

    @classmethod
    def _record_email_sent(cls, level: int):
        """Record that an email was sent for this level"""
        cls._last_email_sent[level] = datetime.now(timezone.utc)

    @classmethod
    async def check_auto_maintenance(cls):
        """
        Check if auto-maintenance should be triggered based on recent metrics.

        Uses hysteresis to prevent yo-yo effect:
        - Escalation: triggers when avg exceeds threshold (e.g. CPU >= 90%)
        - De-escalation: only triggers when avg drops below threshold - HYSTERESIS_GAP (e.g. CPU < 75%)
        """
        try:
            async with AsyncSessionLocal() as db:
                # Check if auto-maintenance is enabled
                if not await SystemSettingsService.is_auto_maintenance_enabled(db):
                    logger.debug("Auto-maintenance is disabled or overridden")
                    return

                # Get current maintenance level
                current_level = await SystemSettingsService.get_maintenance_level(db)

                # Get thresholds
                cpu_threshold = await SystemSettingsService.get_int("auto_maintenance_cpu_threshold", db)
                memory_threshold = await SystemSettingsService.get_int("auto_maintenance_memory_threshold", db)

                # Get recent metrics (15 min window for smoother average)
                metrics = await cls.get_recent_metrics(db, cls.EVALUATION_WINDOW)

                if not metrics:
                    logger.debug("No recent metrics available for auto-maintenance check")
                    return

                # Calculate averages
                avg_cpu = sum(m.cpu_percent or 0 for m in metrics) / len(metrics)
                avg_memory = sum(m.memory_percent or 0 for m in metrics) / len(metrics)

                logger.debug(
                    f"Auto-maintenance check: CPU={avg_cpu:.1f}% (threshold={cpu_threshold}%), "
                    f"RAM={avg_memory:.1f}% (threshold={memory_threshold}%), "
                    f"current_level={current_level}, samples={len(metrics)}"
                )

                # --- Determine target level for ESCALATION ---
                escalation_level = 0
                trigger = None
                trigger_value = 0.0

                # Auto-maintenance caps at Level 1 (high traffic mode).
                # Level 2 (full maintenance) is reserved for manual admin action only.
                if avg_cpu >= cpu_threshold or avg_memory >= memory_threshold:
                    escalation_level = 1
                    trigger = "CPU" if avg_cpu >= cpu_threshold else "Memory"
                    trigger_value = avg_cpu if avg_cpu >= cpu_threshold else avg_memory

                # --- ESCALATION: only if target is higher than current ---
                if escalation_level > current_level:
                    await SystemSettingsService.set(
                        "server_maintenance_level",
                        str(escalation_level),
                        db,
                        user_id=None,
                        reason=f"Auto-maintenance: {trigger} at {trigger_value:.1f}% (threshold: {cpu_threshold if trigger == 'CPU' else memory_threshold}%)"
                    )
                    logger.warning(f"Auto-maintenance escalated: Level {current_level} -> {escalation_level} ({trigger}={trigger_value:.1f}%)")

                    # Send email with cooldown
                    if cls._can_send_email(escalation_level):
                        await cls._send_auto_maintenance_alert(db, trigger, trigger_value, escalation_level)
                        cls._record_email_sent(escalation_level)
                    else:
                        logger.info(f"Auto-maintenance alert email suppressed (cooldown active for level {escalation_level})")

                    cls._last_notified_level = escalation_level

                # --- DE-ESCALATION with hysteresis ---
                # Auto-maintenance only de-escalates levels it set (level 1 → 0).
                # Level 2 is manual-only, so auto will not touch it.
                elif current_level == 1:
                    cpu_deescalate = cpu_threshold - cls.HYSTERESIS_GAP
                    memory_deescalate = memory_threshold - cls.HYSTERESIS_GAP

                    should_deescalate = (avg_cpu < cpu_deescalate and avg_memory < memory_deescalate)

                    if should_deescalate:
                        new_level = current_level - 1
                        await SystemSettingsService.set(
                            "server_maintenance_level",
                            str(new_level),
                            db,
                            user_id=None,
                            reason=f"Auto-maintenance de-escalated: metrics normalized (CPU={avg_cpu:.1f}%, RAM={avg_memory:.1f}%)"
                        )
                        logger.info(f"Auto-maintenance de-escalated: Level {current_level} -> {new_level}")

                        # Send normalization email when returning to level 0
                        if new_level == 0 and cls._last_notified_level > 0:
                            if cls._can_send_email(0):
                                await cls._send_normalization_alert(db, avg_cpu, avg_memory)
                                cls._record_email_sent(0)
                            cls._last_notified_level = 0

        except Exception as e:
            logger.error(f"Error in auto-maintenance check: {e}")

    @classmethod
    async def _send_auto_maintenance_alert(cls, db: AsyncSession, trigger: str, value: float, level: int):
        """Send email alert to admins when auto-maintenance is triggered"""
        try:
            from .email_service import resend, MAIL_FROM

            if not resend.api_key:
                logger.warning("Cannot send auto-maintenance alert: Resend not configured")
                return

            # Get admin emails
            result = await db.execute(select(User).filter(User.is_admin == True))
            admins = result.scalars().all()

            if not admins:
                logger.warning("No admins found to send auto-maintenance alert")
                return

            level_names = {0: "Normal", 1: "Alto Tráfego", 2: "Manutenção"}
            level_name = level_names.get(level, f"Nível {level}")

            level_effects = {
                1: "Novos cadastros estão temporariamente bloqueados.",
                2: "Todas as operações de escrita estão bloqueadas (consultas, receitas, etc.)."
            }
            effect = level_effects.get(level, "")

            for admin in admins:
                html_content = f"""
                <!DOCTYPE html>
                <html>
                <body style="font-family: 'Segoe UI', sans-serif; background-color: #1a1a2e; padding: 40px; color: #fff;">
                    <div style="max-width: 600px; margin: 0 auto; background: #16213e; padding: 40px; border-radius: 12px; border-top: 4px solid #ff6b6b;">
                        <h1 style="color: #ff6b6b; margin-top: 0;">Auto-Manutenção Ativada</h1>

                        <p style="font-size: 16px; color: #e0e0e0;">
                            O sistema detectou alta utilização de recursos e ativou automaticamente o modo de manutenção.
                        </p>

                        <div style="background: rgba(255, 107, 107, 0.1); padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(255, 107, 107, 0.3);">
                            <p style="margin: 0 0 10px 0; color: #ff6b6b; font-weight: bold;">Detalhes:</p>
                            <p style="margin: 5px 0; color: #e0e0e0;"><strong>Métrica:</strong> {trigger}</p>
                            <p style="margin: 5px 0; color: #e0e0e0;"><strong>Valor médio (15 min):</strong> {value:.1f}%</p>
                            <p style="margin: 5px 0; color: #e0e0e0;"><strong>Novo Nível:</strong> {level_name}</p>
                            <p style="margin: 5px 0; color: #e0e0e0;"><strong>Horário:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
                        </div>

                        {f'<p style="font-size: 14px; color: #ff6b6b; background: rgba(255,107,107,0.05); padding: 12px; border-radius: 6px;"><strong>Impacto:</strong> {effect}</p>' if effect else ''}

                        <p style="font-size: 13px; color: #666;">
                            O sistema vai normalizar automaticamente quando os recursos caírem abaixo do limiar de desativação.
                            Alertas do mesmo nível são enviados no máximo 1x por hora.
                        </p>

                        <div style="text-align: center; margin-top: 30px;">
                            <a href="{Config.WEB_BASE_URL}/admin" style="display: inline-block; background: #6627cd; color: white; padding: 14px 30px; text-decoration: none; border-radius: 50px; font-weight: bold;">
                                Acessar Admin
                            </a>
                        </div>
                    </div>
                </body>
                </html>
                """

                resend.Emails.send({
                    "from": f"Qython System <{MAIL_FROM}>",
                    "to": [admin.email],
                    "subject": f"[Qython] Auto-Manutenção Ativada - {level_name}",
                    "html": html_content
                })

            logger.info(f"Auto-maintenance alert sent to {len(admins)} admin(s)")

        except Exception as e:
            logger.error(f"Failed to send auto-maintenance alert: {e}")

    @classmethod
    async def _send_normalization_alert(cls, db: AsyncSession, avg_cpu: float, avg_memory: float):
        """Send email alert to admins when system returns to normal"""
        try:
            from .email_service import resend, MAIL_FROM

            if not resend.api_key:
                return

            result = await db.execute(select(User).filter(User.is_admin == True))
            admins = result.scalars().all()

            if not admins:
                return

            for admin in admins:
                html_content = f"""
                <!DOCTYPE html>
                <html>
                <body style="font-family: 'Segoe UI', sans-serif; background-color: #1a1a2e; padding: 40px; color: #fff;">
                    <div style="max-width: 600px; margin: 0 auto; background: #16213e; padding: 40px; border-radius: 12px; border-top: 4px solid #03dac6;">
                        <h1 style="color: #03dac6; margin-top: 0;">Sistema Normalizado</h1>

                        <p style="font-size: 16px; color: #e0e0e0;">
                            Os recursos do servidor voltaram ao normal. Todas as funcionalidades estão operando normalmente.
                        </p>

                        <div style="background: rgba(3, 218, 198, 0.1); padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(3, 218, 198, 0.3);">
                            <p style="margin: 0 0 10px 0; color: #03dac6; font-weight: bold;">Métricas Atuais:</p>
                            <p style="margin: 5px 0; color: #e0e0e0;"><strong>CPU:</strong> {avg_cpu:.1f}%</p>
                            <p style="margin: 5px 0; color: #e0e0e0;"><strong>RAM:</strong> {avg_memory:.1f}%</p>
                            <p style="margin: 5px 0; color: #e0e0e0;"><strong>Horário:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
                        </div>
                    </div>
                </body>
                </html>
                """

                resend.Emails.send({
                    "from": f"Qython System <{MAIL_FROM}>",
                    "to": [admin.email],
                    "subject": "[Qython] Sistema Normalizado - Auto-Manutenção Desativada",
                    "html": html_content
                })

            logger.info(f"Normalization alert sent to {len(admins)} admin(s)")

        except Exception as e:
            logger.error(f"Failed to send normalization alert: {e}")

    @classmethod
    async def cleanup_old_data(cls, db: AsyncSession):
        """Clean up old metrics and rate limit data"""
        try:
            # Delete metrics older than 7 days
            seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
            await db.execute(
                delete(ServerMetrics).where(ServerMetrics.timestamp < seven_days_ago)
            )

            # Delete rate limit entries older than 24 hours
            from ..models import RateLimitEntry
            one_day_ago = datetime.now(timezone.utc) - timedelta(days=1)
            await db.execute(
                delete(RateLimitEntry).where(RateLimitEntry.timestamp < one_day_ago)
            )

            await db.commit()
            logger.info("Cleaned up old metrics and rate limit data")

        except Exception as e:
            logger.error(f"Error cleaning up old data: {e}")

    @classmethod
    async def _monitor_loop(cls):
        """Main monitoring loop"""
        collect_counter = 0

        while cls._running:
            try:
                # Collect metrics every minute
                await cls.collect_metrics()
                collect_counter += 1

                # Check auto-maintenance every 5 minutes (5 collections)
                if collect_counter >= 5:
                    await cls.check_auto_maintenance()
                    collect_counter = 0

                    # Also cleanup old data every check
                    async with AsyncSessionLocal() as db:
                        await cls.cleanup_old_data(db)

            except Exception as e:
                logger.error(f"Error in monitor loop: {e}")

            await asyncio.sleep(cls.COLLECT_INTERVAL)

    @classmethod
    def start(cls):
        """Start the server monitor background task"""
        if cls._task and not cls._task.done():
            logger.warning("Server monitor is already running")
            return

        cls._running = True
        cls._task = asyncio.create_task(cls._monitor_loop())
        logger.info("Server monitor started")

    @classmethod
    def stop(cls):
        """Stop the server monitor background task"""
        cls._running = False
        if cls._task:
            cls._task.cancel()
            cls._task = None
        logger.info("Server monitor stopped")

    @classmethod
    def is_running(cls) -> bool:
        """Check if the monitor is running"""
        return cls._running and cls._task and not cls._task.done()


# Convenience function for starting the monitor
def start_server_monitor():
    """Start the server monitor (call from app startup)"""
    ServerMonitor.start()


def stop_server_monitor():
    """Stop the server monitor (call from app shutdown)"""
    ServerMonitor.stop()
