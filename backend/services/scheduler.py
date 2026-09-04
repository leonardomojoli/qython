# qython/backend/services/scheduler.py
"""
Internal Task Scheduler using APScheduler
No external cron needed - runs within the FastAPI application.
"""

import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger("qython_logger")

# Global scheduler instance
scheduler = AsyncIOScheduler()


async def scheduled_ranking_update():
    """
    Scheduled task to update arena rankings (XP-based).
    Runs daily at 3:00 AM UTC as a consistency pass.
    Primary ranking updates happen in real-time on quiz submission.
    """
    from ..database import AsyncSessionLocal
    from .arena_service import update_season_rankings, activate_current_season

    logger.info("Starting scheduled ranking update...")

    async with AsyncSessionLocal() as db:
        try:
            # First, ensure correct season is active
            await activate_current_season(db)

            # Then update rankings (full recalculation for consistency)
            updated_count = await update_season_rankings(db)
            logger.info(f"Scheduled ranking update complete. Updated {updated_count} rankings.")
        except Exception as e:
            logger.error(f"Error in scheduled ranking update: {e}", exc_info=True)


async def scheduled_expire_challenges():
    """
    Scheduled task to expire old arena challenges.
    Runs every 6 hours.
    """
    from ..database import AsyncSessionLocal
    from .challenge_service import expire_old_challenges

    logger.info("[ARENA] Expiring old challenges...")

    async with AsyncSessionLocal() as db:
        try:
            count = await expire_old_challenges(db)
            logger.info(f"[ARENA] Expired {count} old challenges.")
        except Exception as e:
            logger.error(f"[ARENA] Error expiring challenges: {e}", exc_info=True)


async def scheduled_season_check():
    """
    Scheduled task to check and activate/deactivate seasons.
    Runs every 6 hours.
    """
    from ..database import AsyncSessionLocal
    from .arena_service import activate_current_season
    from sqlalchemy.future import select
    from ..models import ArenaSeason
    from sqlalchemy import and_
    from datetime import datetime, timezone as tz

    logger.info("Checking season status...")

    async with AsyncSessionLocal() as db:
        try:
            # Check if a NEW season will be activated (not already active)
            now = datetime.now(tz.utc)
            pending_result = await db.execute(
                select(ArenaSeason).filter(
                    and_(
                        ArenaSeason.start_date <= now,
                        ArenaSeason.end_date >= now,
                        ArenaSeason.is_active == False
                    )
                )
            )
            new_season_pending = pending_result.scalars().first()

            season = await activate_current_season(db)
            if season:
                logger.info(f"Current active season: {season.name}")

            # Send arena season started notification if a NEW season was just activated
            if new_season_pending and season and season.id == new_season_pending.id:
                try:
                    from .notification_service import send_notification_to_multiple, NotificationType
                    from ..models import User

                    eligible = await db.execute(
                        select(User.id).where(User.subscription_plan.in_(['resident', 'staff', 'specialist']))
                    )
                    user_ids = [row[0] for row in eligible.fetchall()]

                    if user_ids:
                        await send_notification_to_multiple(
                            db, user_ids, NotificationType.ARENA_SEASON_STARTED,
                            'Nova temporada da Arena!',
                            f'A temporada {season.name} começou. Participe agora!',
                            data={'route': '/academic'},
                        )
                        await db.commit()
                        logger.info(f"[NOTIFICATIONS] Sent arena season notification to {len(user_ids)} users")
                except Exception as ne:
                    logger.error(f"[NOTIFICATIONS] Failed to send arena season notification: {ne}")

        except Exception as e:
            logger.error(f"Error in season check: {e}", exc_info=True)


async def scheduled_chat_images_cleanup():
    """
    Scheduled task to delete chat images older than 30 days.
    Runs daily at 4:00 AM UTC.
    Note: Training dataset images are NOT affected - only visualization images.
    """
    import os
    import time
    from ..config import Config

    logger.info("[CLEANUP] Starting chat images cleanup...")

    try:
        chat_images_folder = Config.CHAT_IMAGES_FOLDER
        if not os.path.exists(chat_images_folder):
            logger.info("[CLEANUP] Chat images folder does not exist, skipping.")
            return

        # 30 days in seconds
        retention_seconds = 30 * 24 * 60 * 60
        current_time = time.time()
        deleted_count = 0
        total_size_freed = 0

        for filename in os.listdir(chat_images_folder):
            filepath = os.path.join(chat_images_folder, filename)
            if os.path.isfile(filepath):
                file_age = current_time - os.path.getmtime(filepath)
                if file_age > retention_seconds:
                    file_size = os.path.getsize(filepath)
                    os.remove(filepath)
                    deleted_count += 1
                    total_size_freed += file_size

        size_mb = total_size_freed / (1024 * 1024)
        logger.info(f"[CLEANUP] Deleted {deleted_count} chat images older than 30 days. Freed {size_mb:.2f} MB.")
    except Exception as e:
        logger.error(f"[CLEANUP] Error during chat images cleanup: {e}", exc_info=True)


async def scheduled_dracma_expiration():
    """
    Scheduled task to process expired dracmas.
    Runs daily at 2:00 AM UTC.

    - Marks expired dracma batches as 'expired'
    - Updates user balances accordingly
    """
    from ..database import AsyncSessionLocal
    from . import billing_service

    logger.info("[DRACMA] Starting dracma expiration processing...")

    async with AsyncSessionLocal() as db:
        try:
            batches_expired, total_expired = await billing_service.process_expired_dracmas(db)
            logger.info(
                f"[DRACMA] Expiration complete: {batches_expired} batches, "
                f"{total_expired:.0f} dracmas expired"
            )
        except Exception as e:
            logger.error(f"[DRACMA] Error processing expirations: {e}", exc_info=True)


async def scheduled_dracma_expiration_notifications():
    """
    Scheduled task to send expiration warning emails.
    Runs daily at 10:00 AM UTC (7:00 AM BRT - good time for emails).

    Sends notifications for:
    - 30 days before expiration
    - 7 days before expiration
    - 1 day before expiration
    """
    from ..database import AsyncSessionLocal
    from . import billing_service
    from .email_service import send_dracma_expiration_email
    from sqlalchemy.future import select
    from ..models import User

    logger.info("[DRACMA] Starting expiration notification job...")

    async with AsyncSessionLocal() as db:
        try:
            total_sent = 0

            # Process each notification threshold
            for days in [30, 7, 1]:
                users_to_notify = await billing_service.get_expiring_soon_notifications(db, days)

                for user_data in users_to_notify:
                    # Get user language preference
                    result = await db.execute(
                        select(User).where(User.id == user_data['user_id'])
                    )
                    user = result.scalar_one_or_none()

                    if user:
                        lang = getattr(user, 'language', 'pt') or 'pt'
                        user_name = user.name or user.email.split('@')[0]

                        # Send email
                        success = send_dracma_expiration_email(
                            email=user.email,
                            user_name=user_name,
                            amount=user_data['amount_expiring'],
                            days_until_expiration=days,
                            lang=lang
                        )

                        if success:
                            # Mark notification as sent
                            await billing_service.mark_notification_sent(
                                db,
                                user_data['user_id'],
                                days
                            )
                            total_sent += 1
                            logger.info(
                                f"[DRACMA] Sent {days}d expiration email to {user.email} "
                                f"({user_data['amount_expiring']:.0f} dracmas)"
                            )

                            # Also send in-app notification
                            try:
                                from .notification_service import send_notification, NotificationType

                                dracma_titles = {'pt': 'Dracmas expirando', 'en': 'Dracmas expiring', 'es': 'Dracmas expirando'}
                                dracma_bodies = {
                                    'pt': f'{user_data["amount_expiring"]:.0f} dracmas expiram em {days} dias.',
                                    'en': f'{user_data["amount_expiring"]:.0f} dracmas expire in {days} days.',
                                    'es': f'{user_data["amount_expiring"]:.0f} dracmas expiran en {days} días.',
                                }
                                lang_short = lang.split('-')[0] if '-' in lang else lang

                                await send_notification(
                                    db, user_data['user_id'], NotificationType.DRACMA_EXPIRING,
                                    dracma_titles.get(lang_short, dracma_titles['pt']),
                                    dracma_bodies.get(lang_short, dracma_bodies['pt']),
                                    data={'route': '/profile'},
                                    send_push=True,
                                )
                            except Exception as ne:
                                logger.error(f"[NOTIFICATIONS] Failed to send dracma notification: {ne}")

            await db.commit()
            logger.info(f"[DRACMA] Notification job complete: {total_sent} emails sent")

        except Exception as e:
            logger.error(f"[DRACMA] Error sending notifications: {e}", exc_info=True)


def _resolve_generated_media_path(path_val):
    """
    Resolve a media path as stored in the DB to a real filesystem path.
    Historical formats: real absolute path ('/opt/.../backend/static/uploads/x'),
    'static/uploads/x', URL-like '/static/uploads/x', and 'uploads/x'.
    """
    import os
    from ..config import Config
    if not path_val:
        return None
    p = str(path_val).strip()
    if os.path.isabs(p):
        if p.startswith(Config.BACKEND_DIR):
            return p
        p = p.lstrip('/')  # URL-like '/static/uploads/x'
    if p.startswith('static/'):
        return os.path.join(Config.BACKEND_DIR, p)
    return os.path.join(Config.BACKEND_DIR, 'static', p)


def _delete_generated_file(path_val, label=""):
    """
    Delete a generated media file. Returns (bytes_freed, files_deleted).
    A missing file is logged — the old code skipped it silently, flipped the row
    to 'expired' and nulled the path, orphaning the file forever.
    """
    import os
    full_path = _resolve_generated_media_path(path_val)
    if not full_path:
        return 0, 0
    try:
        if not os.path.exists(full_path):
            logger.warning(f"[CLEANUP] {label}: file not found ({path_val} -> {full_path})")
            return 0, 0
        size = os.path.getsize(full_path)
        os.remove(full_path)
        return size, 1
    except FileNotFoundError:
        return 0, 0  # both gunicorn workers run this job; the other one won the race
    except OSError as e:
        logger.error(f"[CLEANUP] Error deleting {full_path}: {e}")
        return 0, 0


def _sweep_orphan_files(folder, referenced_basenames, min_age_hours, label):
    """
    Delete files in `folder` older than min_age_hours whose basename is not in
    referenced_basenames. Returns (bytes_freed, files_deleted).
    """
    import os
    import time
    freed = 0
    deleted = 0
    if not os.path.isdir(folder):
        return 0, 0
    cutoff = time.time() - min_age_hours * 3600
    for filename in os.listdir(folder):
        filepath = os.path.join(folder, filename)
        if not os.path.isfile(filepath) or filename in referenced_basenames:
            continue
        try:
            if os.path.getmtime(filepath) > cutoff:
                continue
            size = os.path.getsize(filepath)
            os.remove(filepath)
            freed += size
            deleted += 1
        except FileNotFoundError:
            continue  # race between the two workers running this job
        except OSError as e:
            logger.error(f"[CLEANUP] Error removing orphan {filepath}: {e}")
    if deleted:
        logger.info(f"[CLEANUP] Orphans removed from {label}: {deleted} file(s), {freed / (1024 * 1024):.2f} MB")
    return freed, deleted


async def scheduled_generated_content_cleanup():
    """
    Scheduled task to clean up expired generated content (podcasts, videos, slideshows).
    Also cleans temp_upload files older than 24h, orphan thumbnails, and sweeps
    orphan files (age-gated) from the generated-media folders, including
    temp_preview_images (slideshow preview images with no other janitor).
    Legacy completed rows with expires_at = NULL (pre-TTL feature) expire by age.
    Runs daily at 5:00 AM UTC.
    """
    import os
    import time
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import or_, and_, cast, Text
    from sqlalchemy.future import select
    from ..database import AsyncSessionLocal
    from ..models import PodcastGenerationJob, VideoLessonJob, AcademicMaterial, AcademicDocument
    from ..config import Config

    logger.info("[CLEANUP] Starting generated content cleanup...")

    total_files_deleted = 0
    total_size_freed = 0

    # --- 1. Expired generated content (DB-driven TTL) ---
    # Legacy completed rows predate the TTL feature and have expires_at = NULL,
    # so they would never match `expires_at < now`; they expire by created_at age.
    async with AsyncSessionLocal() as db:
        try:
            now = datetime.now(timezone.utc)
            legacy_cutoff = now - timedelta(hours=Config.GENERATED_CONTENT_TTL_HOURS)

            # Podcasts
            result = await db.execute(
                select(PodcastGenerationJob).filter(
                    PodcastGenerationJob.status == 'completed',
                    or_(
                        PodcastGenerationJob.expires_at < now,
                        and_(
                            PodcastGenerationJob.expires_at.is_(None),
                            PodcastGenerationJob.created_at < legacy_cutoff,
                        ),
                    )
                )
            )
            expired_podcasts = result.scalars().all()

            for job in expired_podcasts:
                for path_attr in ('result_path', 'script_path'):
                    freed, deleted = _delete_generated_file(getattr(job, path_attr, None), label='podcast')
                    total_size_freed += freed
                    total_files_deleted += deleted
                job.status = 'expired'
                job.result_path = None
                job.script_path = None

            # Video lessons
            result = await db.execute(
                select(VideoLessonJob).filter(
                    VideoLessonJob.status == 'completed',
                    or_(
                        VideoLessonJob.expires_at < now,
                        and_(
                            VideoLessonJob.expires_at.is_(None),
                            VideoLessonJob.created_at < legacy_cutoff,
                        ),
                    )
                )
            )
            expired_videos = result.scalars().all()

            for job in expired_videos:
                for path_attr in ('result_path', 'srt_path'):
                    freed, deleted = _delete_generated_file(getattr(job, path_attr, None), label='video_lesson')
                    total_size_freed += freed
                    total_files_deleted += deleted
                job.status = 'expired'
                job.result_path = None
                job.srt_path = None

            # Slideshow materials. Only slideshow_only materials carry files on
            # disk; JSON-only materials (flashcards, resumos, ...) never expire.
            result = await db.execute(
                select(AcademicMaterial).filter(
                    AcademicMaterial.status == 'completed',
                    or_(
                        AcademicMaterial.expires_at < now,
                        and_(
                            AcademicMaterial.expires_at.is_(None),
                            AcademicMaterial.material_type == 'slideshow_only',
                            AcademicMaterial.created_at < legacy_cutoff,
                        ),
                    )
                )
            )
            expired_materials = result.scalars().all()

            for material in expired_materials:
                # Copy before mutating: reassigning the same dict object is not
                # detected as a change by SQLAlchemy's JSON column.
                content = dict(material.content or {})
                slideshow_path = content.get('slideshow_file_path')
                if slideshow_path:
                    freed, deleted = _delete_generated_file(slideshow_path, label='slideshow')
                    total_size_freed += freed
                    total_files_deleted += deleted
                    # Remove path from content but keep the rest
                    content.pop('slideshow_file_path', None)
                    material.content = content
                material.status = 'expired'

            await db.commit()
            logger.info(
                f"[CLEANUP] Expired content: {len(expired_podcasts)} podcasts, "
                f"{len(expired_videos)} videos, {len(expired_materials)} materials"
            )

        except Exception as e:
            logger.error(f"[CLEANUP] Error processing expired content: {e}", exc_info=True)

    # --- 2. Temp upload cleanup (files older than 24h) ---
    try:
        temp_folder = Config.UPLOAD_FOLDER
        if os.path.exists(temp_folder):
            retention_seconds = 24 * 60 * 60
            current_time = time.time()
            for filename in os.listdir(temp_folder):
                filepath = os.path.join(temp_folder, filename)
                if os.path.isfile(filepath):
                    if current_time - os.path.getmtime(filepath) > retention_seconds:
                        try:
                            total_size_freed += os.path.getsize(filepath)
                            os.remove(filepath)
                            total_files_deleted += 1
                        except OSError as e:
                            logger.error(f"[CLEANUP] Error deleting temp file {filepath}: {e}")
    except Exception as e:
        logger.error(f"[CLEANUP] Error cleaning temp_upload: {e}", exc_info=True)

    # --- 3. Orphan thumbnail cleanup ---
    async with AsyncSessionLocal() as db:
        try:
            thumbnail_folder = Config.THUMBNAIL_FOLDER
            if os.path.exists(thumbnail_folder):
                # Get all document IDs that exist in DB
                result = await db.execute(select(AcademicDocument.id))
                existing_doc_ids = {row[0] for row in result.all()}

                for filename in os.listdir(thumbnail_folder):
                    filepath = os.path.join(thumbnail_folder, filename)
                    if not os.path.isfile(filepath):
                        continue
                    # Thumbnails are named like "doc_{id}_thumb.png" or similar
                    # Try to extract document ID from filename
                    try:
                        # Common pattern: "{doc_id}_..." or "thumb_{doc_id}..."
                        parts = filename.split('_')
                        doc_id = None
                        for part in parts:
                            if part.isdigit():
                                doc_id = int(part)
                                break
                        if doc_id is not None and doc_id not in existing_doc_ids:
                            total_size_freed += os.path.getsize(filepath)
                            os.remove(filepath)
                            total_files_deleted += 1
                    except (ValueError, OSError):
                        pass
        except Exception as e:
            logger.error(f"[CLEANUP] Error cleaning orphan thumbnails: {e}", exc_info=True)

    # --- 4. Orphan file sweep for generated-media folders ---
    # Catches files left behind by: pre-fix path-resolution failures (rows already
    # flipped to 'expired' with the file still on disk), errored jobs, and preview
    # images (temp_preview_images has no other janitor). Age-gated to TTL+24h so
    # nothing fresh is ever touched; files referenced by DB rows are kept.
    async with AsyncSessionLocal() as db:
        try:
            import json as _json
            import re as _re

            result = await db.execute(
                select(PodcastGenerationJob.result_path, PodcastGenerationJob.script_path)
            )
            podcast_refs = {os.path.basename(p) for row in result.all() for p in row if p}

            result = await db.execute(
                select(VideoLessonJob.result_path, VideoLessonJob.srt_path)
            )
            video_refs = {os.path.basename(p) for row in result.all() for p in row if p}

            result = await db.execute(
                select(AcademicMaterial.content).filter(
                    AcademicMaterial.material_type == 'slideshow_only'
                )
            )
            slideshow_refs = set()
            for (content,) in result.all():
                if isinstance(content, dict) and content.get('slideshow_file_path'):
                    slideshow_refs.add(os.path.basename(content['slideshow_file_path']))

            # Preview images referenced by any non-expired material stay alive
            # (they power the in-app slide preview); the rest is sweepable.
            preview_re = _re.compile(r'temp_preview_images/([^"\\/\s]+)')
            preview_refs = set()
            result = await db.execute(
                select(AcademicMaterial.content).filter(
                    AcademicMaterial.status != 'expired',
                    cast(AcademicMaterial.content, Text).like('%temp_preview_images%'),
                )
            )
            for (content,) in result.all():
                try:
                    preview_refs.update(preview_re.findall(_json.dumps(content)))
                except (TypeError, ValueError):
                    continue

            grace_hours = Config.GENERATED_CONTENT_TTL_HOURS + 24
            for folder, refs, label in (
                (os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'podcasts'), podcast_refs, 'podcasts'),
                (os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'video_lessons'), video_refs, 'video_lessons'),
                (Config.SLIDESHOW_FOLDER, slideshow_refs, 'slideshows'),
                (os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'temp_preview_images'), preview_refs, 'temp_preview_images'),
            ):
                freed, deleted = _sweep_orphan_files(folder, refs, grace_hours, label)
                total_size_freed += freed
                total_files_deleted += deleted

            # temp_pdfs are per-export scratch files — age-based only
            freed, deleted = _sweep_orphan_files(
                os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'temp_pdfs'), set(), 24, 'temp_pdfs'
            )
            total_size_freed += freed
            total_files_deleted += deleted

            # library_staging: temps de write-through da Biblioteca (upload → Drive do
            # usuário → descarte). Referenciados = storage_path de docs ainda não
            # descartados (pending/processing/error); órfãos de crash removidos após 48h.
            # O janitor de temp_upload acima ignora este subdir (só varre arquivos da raiz).
            result = await db.execute(
                select(AcademicDocument.storage_path).filter(AcademicDocument.storage_path.isnot(None))
            )
            staging_refs = {os.path.basename(p) for (p,) in result.all() if p and 'library_staging' in p}
            freed, deleted = _sweep_orphan_files(
                os.path.join(Config.UPLOAD_FOLDER, 'library_staging'), staging_refs, 48, 'library_staging'
            )
            total_size_freed += freed
            total_files_deleted += deleted

            # drive_cache: cópias efêmeras do viewer (Drive → pdf.js). Cache puro, age-based.
            freed, deleted = _sweep_orphan_files(
                os.path.join(Config.UPLOAD_FOLDER, 'drive_cache'), set(), 24, 'drive_cache'
            )
            total_size_freed += freed
            total_files_deleted += deleted
        except Exception as e:
            logger.error(f"[CLEANUP] Error sweeping orphan files: {e}", exc_info=True)

    size_mb = total_size_freed / (1024 * 1024)
    logger.info(f"[CLEANUP] Generated content cleanup complete. Deleted {total_files_deleted} files. Freed {size_mb:.2f} MB.")


async def scheduled_avatar_cleanup():
    """
    Scheduled task to clean up orphan avatar files not referenced in the database.
    Also enforces profile_picture orphan cleanup.
    Runs daily at 3:30 AM UTC.

    - Orphan = file in profile_pictures/ matching *_avatar.png that is NOT referenced
      in users.profile_picture or avatar_history.filename, and older than 1 hour.
    - Never deletes default-profile.png.
    """
    import os
    import time
    from sqlalchemy.future import select
    from ..database import AsyncSessionLocal
    from ..models import User, AvatarHistory
    from ..config import Config

    logger.info("[CLEANUP] Starting avatar orphan cleanup...")

    total_deleted = 0
    total_size_freed = 0

    async with AsyncSessionLocal() as db:
        try:
            # Collect all referenced filenames from DB
            result_pp = await db.execute(select(User.profile_picture).where(User.profile_picture.isnot(None)))
            profile_pictures = {row[0] for row in result_pp.all()}

            result_ah = await db.execute(select(AvatarHistory.filename))
            history_filenames = {row[0] for row in result_ah.all()}

            referenced = profile_pictures | history_filenames

            # Scan profile_pictures directory
            upload_folder = Config.UPLOAD_FOLDER_PROFILE
            if not os.path.exists(upload_folder):
                logger.info("[CLEANUP] Profile pictures folder does not exist, skipping.")
                return

            current_time = time.time()
            retention_seconds = 60 * 60  # 1 hour

            for filename in os.listdir(upload_folder):
                # Skip default profile picture
                if filename == "default-profile.png":
                    continue

                filepath = os.path.join(upload_folder, filename)
                if not os.path.isfile(filepath):
                    continue

                # Only process avatar files (generated avatars end with _avatar.png/jpg/webp)
                is_avatar = filename.endswith(('_avatar.png', '_avatar.jpg', '_avatar.webp'))
                if not is_avatar:
                    continue

                # Skip if referenced in DB
                if filename in referenced:
                    continue

                # Skip if file is too recent (< 1 hour old)
                file_age = current_time - os.path.getmtime(filepath)
                if file_age < retention_seconds:
                    continue

                # Delete orphan file
                try:
                    file_size = os.path.getsize(filepath)
                    os.remove(filepath)
                    total_deleted += 1
                    total_size_freed += file_size
                except OSError as e:
                    logger.error(f"[CLEANUP] Error deleting orphan avatar {filepath}: {e}")

        except Exception as e:
            logger.error(f"[CLEANUP] Error during avatar orphan cleanup: {e}", exc_info=True)

    size_mb = total_size_freed / (1024 * 1024)
    logger.info(f"[CLEANUP] Avatar cleanup complete. Deleted {total_deleted} orphan files. Freed {size_mb:.2f} MB.")


async def scheduled_rlaif_batch():
    """
    Scheduled task to run RLAIF AI-as-Judge on unreviewed training data.
    Runs weekly on Sunday at 2:00 AM UTC.
    """
    from ..database import AsyncSessionLocal
    from .rlaif_service import batch_judge_training_data

    logger.info("[RLAIF] Starting weekly AI judge batch...")

    async with AsyncSessionLocal() as db:
        try:
            stats = await batch_judge_training_data(db, batch_size=500)
            logger.info(f"[RLAIF] Weekly batch complete: {stats}")
        except Exception as e:
            logger.error(f"[RLAIF] Error in batch judge: {e}", exc_info=True)


async def scheduled_self_play():
    """
    Scheduled task to generate synthetic preference pairs via self-play.
    Runs weekly on Sunday at 3:00 AM UTC.
    """
    from ..database import AsyncSessionLocal
    from .rlaif_service import self_play_generate_preferences

    logger.info("[RLAIF] Starting weekly self-play generation...")

    async with AsyncSessionLocal() as db:
        try:
            stats = await self_play_generate_preferences(db, batch_size=20)
            logger.info(f"[RLAIF] Self-play complete: {stats}")
        except Exception as e:
            logger.error(f"[RLAIF] Error in self-play: {e}", exc_info=True)


async def scheduled_quality_snapshot():
    """
    Scheduled task to compute and save a quality decay snapshot.
    Runs weekly on Monday at 1:00 AM UTC (after weekend RLAIF/self-play).
    Monitors for model collapse indicators before fine-tuning.
    """
    from ..database import AsyncSessionLocal
    from .quality_decay_service import save_quality_snapshot

    logger.info("[QUALITY] Starting weekly quality snapshot...")

    async with AsyncSessionLocal() as db:
        try:
            result = await save_quality_snapshot(db)
            logger.info(
                f"[QUALITY] Snapshot complete: health={result['health_status']}, "
                f"alerts={len(result['alerts'])}"
            )
        except Exception as e:
            logger.error(f"[QUALITY] Error in quality snapshot: {e}", exc_info=True)


async def scheduled_weekly_digest():
    """
    Scheduled task to send weekly digest emails to recently active users.
    Runs every Monday at 8:00 AM UTC (5:00 AM BRT).
    """
    from ..database import AsyncSessionLocal
    from ..models import User, Consultation, QuizAttempt, Transaction
    from sqlalchemy.future import select
    from sqlalchemy import func, and_
    from datetime import datetime, timezone as tz, timedelta
    from .email_service import send_weekly_digest_email
    from ..security import create_unsubscribe_token
    from ..config import Config

    logger.info("[EMAIL] Starting weekly digest job...")

    async with AsyncSessionLocal() as db:
        try:
            now = datetime.now(tz.utc)
            thirty_days_ago = now - timedelta(days=30)
            one_week_ago = now - timedelta(days=7)

            # Get active users who logged in within the last 30 days
            result = await db.execute(
                select(User).where(
                    and_(
                        User.status == 'active',
                        User.last_login_at.isnot(None),
                        User.last_login_at > thirty_days_ago,
                    )
                )
            )
            users = result.scalars().all()

            total_sent = 0
            for user in users:
                # Check email preference
                prefs = user.notification_preferences or {}
                if not prefs.get('email_enabled', True):
                    continue

                # Check email_tracking to avoid duplicate this week
                tracking = user.email_tracking or {}
                last_digest = tracking.get('weekly_digest')
                if last_digest:
                    try:
                        last_sent = datetime.fromisoformat(last_digest)
                        if last_sent > one_week_ago:
                            continue
                    except (ValueError, TypeError):
                        pass

                # Gather stats for this week
                consult_result = await db.execute(
                    select(func.count()).select_from(Consultation).where(
                        and_(Consultation.user_id == user.id, Consultation.created_at > one_week_ago)
                    )
                )
                consultations = consult_result.scalar() or 0

                # Dracmas used this week (sum of negative transaction amounts)
                dracma_result = await db.execute(
                    select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                        and_(
                            Transaction.user_id == user.id,
                            Transaction.timestamp > one_week_ago,
                            Transaction.amount < 0
                        )
                    )
                )
                dracmas_used = abs(dracma_result.scalar() or 0)

                # Arena score this week
                arena_result = await db.execute(
                    select(func.coalesce(func.sum(QuizAttempt.score), 0)).where(
                        and_(QuizAttempt.user_id == user.id, QuizAttempt.completed_at > one_week_ago)
                    )
                )
                arena_score = arena_result.scalar() or 0

                # Streak days (consecutive days with last_login_at)
                streak_days = 0
                if user.last_login_at:
                    streak_days = min((now - user.last_login_at).days, 7)
                    streak_days = max(0, 7 - streak_days)

                stats = {
                    'consultations': consultations,
                    'dracmas_used': dracmas_used,
                    'arena_score': arena_score,
                    'streak_days': streak_days,
                }

                # Only send if there's some activity
                if consultations == 0 and dracmas_used == 0 and arena_score == 0:
                    continue

                lang = (user.language_preference or 'pt-BR').split('-')[0]
                user_name = user.full_name or user.email.split('@')[0]
                unsub_url = (
                    f"{Config.API_BASE_URL}/public/email/unsubscribe"
                    f"?token={create_unsubscribe_token(user.id)}"
                )

                success = send_weekly_digest_email(user.email, user_name, stats, lang, unsubscribe_url=unsub_url)
                if success:
                    tracking['weekly_digest'] = now.isoformat()
                    user.email_tracking = tracking
                    total_sent += 1

            await db.commit()
            logger.info(f"[EMAIL] Weekly digest complete: {total_sent} emails sent")

        except Exception as e:
            logger.error(f"[EMAIL] Error in weekly digest: {e}", exc_info=True)


async def scheduled_inactivity_check():
    """
    Scheduled task to send the 14-day inactivity reminder (sent once per user).
    Runs daily at 9:00 AM UTC (6:00 AM BRT).
    The 60-day deactivation warning was removed (empty threat — nothing actually
    deactivates accounts by inactivity).
    """
    from ..database import AsyncSessionLocal
    from ..models import User
    from sqlalchemy.future import select
    from sqlalchemy import and_
    from datetime import datetime, timezone as tz, timedelta
    from .email_service import send_inactivity_email
    from ..security import create_unsubscribe_token
    from ..config import Config

    logger.info("[EMAIL] Starting inactivity check job...")

    async with AsyncSessionLocal() as db:
        try:
            now = datetime.now(tz.utc)
            fourteen_days_ago = now - timedelta(days=14)

            # --- 14-day inactivity emails ---
            result = await db.execute(
                select(User).where(
                    and_(
                        User.status == 'active',
                        User.last_login_at.isnot(None),
                        User.last_login_at < fourteen_days_ago,
                    )
                )
            )
            inactive_14d_users = result.scalars().all()

            total_inactivity = 0

            for user in inactive_14d_users:
                prefs = user.notification_preferences or {}
                if not prefs.get('email_enabled', True):
                    continue

                tracking = user.email_tracking or {}
                days_inactive = (now - user.last_login_at).days

                # 14-day inactivity reminder — sent once (deduped via email_tracking).
                # The 60-day "deactivation" warning was removed (empty threat: nothing
                # actually deactivates accounts).
                if not tracking.get('inactivity_14d'):
                    lang = (user.language_preference or 'pt-BR').split('-')[0]
                    user_name = user.full_name or user.email.split('@')[0]
                    unsub_url = (
                        f"{Config.API_BASE_URL}/public/email/unsubscribe"
                        f"?token={create_unsubscribe_token(user.id)}"
                    )

                    success = send_inactivity_email(
                        user.email, user_name, days_inactive, lang, unsubscribe_url=unsub_url
                    )
                    if success:
                        tracking['inactivity_14d'] = now.isoformat()
                        user.email_tracking = tracking
                        total_inactivity += 1

            await db.commit()
            logger.info(
                f"[EMAIL] Inactivity check complete: {total_inactivity} inactivity emails sent"
            )

        except Exception as e:
            logger.error(f"[EMAIL] Error in inactivity check: {e}", exc_info=True)


async def scheduled_welcome_day3():
    """
    Scheduled task to send welcome day 3 emails to new users.
    Runs daily at 10:30 AM UTC (7:30 AM BRT).
    Targets users created 3-4 days ago.
    """
    from ..database import AsyncSessionLocal
    from ..models import User
    from sqlalchemy.future import select
    from sqlalchemy import and_
    from datetime import datetime, timezone as tz, timedelta
    from .email_service import send_welcome_day3_email
    from ..security import create_unsubscribe_token
    from ..config import Config

    logger.info("[EMAIL] Starting welcome day 3 job...")

    async with AsyncSessionLocal() as db:
        try:
            now = datetime.now(tz.utc)
            three_days_ago = now - timedelta(days=3)
            four_days_ago = now - timedelta(days=4)

            # Users created 3-4 days ago who are active
            result = await db.execute(
                select(User).where(
                    and_(
                        User.status == 'active',
                        User.created_at >= four_days_ago,
                        User.created_at < three_days_ago,
                    )
                )
            )
            new_users = result.scalars().all()

            total_sent = 0
            for user in new_users:
                prefs = user.notification_preferences or {}
                if not prefs.get('email_enabled', True):
                    continue

                tracking = user.email_tracking or {}
                if tracking.get('welcome_day3'):
                    continue

                lang = (user.language_preference or 'pt-BR').split('-')[0]
                user_name = user.full_name or user.email.split('@')[0]
                unsub_url = (
                    f"{Config.API_BASE_URL}/public/email/unsubscribe"
                    f"?token={create_unsubscribe_token(user.id)}"
                )

                success = send_welcome_day3_email(user.email, user_name, lang, unsubscribe_url=unsub_url)
                if success:
                    tracking['welcome_day3'] = now.isoformat()
                    user.email_tracking = tracking
                    total_sent += 1

            await db.commit()
            logger.info(f"[EMAIL] Welcome day 3 complete: {total_sent} emails sent")

        except Exception as e:
            logger.error(f"[EMAIL] Error in welcome day 3: {e}", exc_info=True)


async def scheduled_vision_processing():
    """
    Scheduled task to process pending document image descriptions via Gemini Vision.
    Runs daily at 1:00 AM UTC (large batch) and every 4h (catch-up).
    Stops gracefully on rate limit — defers to next cycle.
    """
    from .academic_services.vision_service import process_pending_vision_batch

    logger.info("[VISION] Starting scheduled vision processing...")

    try:
        stats = await process_pending_vision_batch()
        logger.info(f"[VISION] Batch complete: {stats}")
    except Exception as e:
        logger.error(f"[VISION] Error in vision processing: {e}", exc_info=True)


async def scheduled_vision_processing_large():
    """
    Daily large batch at 1:00 AM UTC — processes up to 100 images when quota is fresh.
    """
    from .academic_services.vision_service import process_pending_vision_batch

    logger.info("[VISION] Starting daily large vision batch (1:00 AM UTC)...")

    try:
        stats = await process_pending_vision_batch(batch_size=100)
        logger.info(f"[VISION] Daily large batch complete: {stats}")
    except Exception as e:
        logger.error(f"[VISION] Error in daily vision batch: {e}", exc_info=True)


async def scheduled_stuck_document_recovery():
    """
    Recovery job for documents stuck in 'processing' state.
    If a document has been in 'processing' for more than 90 minutes,
    it was likely killed mid-process (server restart, OOM, worker timeout).
    Resets them to 'error' so users can retry via the UI.
    Note: Large PDFs (50MB+) with OCR can legitimately take 30-60 min.
    """
    from datetime import datetime, timedelta, timezone
    from ..database import AsyncSessionLocal
    from sqlalchemy import text

    try:
        async with AsyncSessionLocal() as db:
            threshold = datetime.now(timezone.utc) - timedelta(minutes=90)
            result = await db.execute(
                text("UPDATE academic_documents SET status = 'error' WHERE status = 'processing' AND updated_at < :threshold RETURNING id, original_filename"),
                {"threshold": threshold}
            )
            recovered = result.fetchall()
            if recovered:
                await db.commit()
                for doc_id, filename in recovered:
                    logger.warning(f"[RECOVERY] Document ID {doc_id} ({filename}) stuck in processing > 30min, reset to error")
                logger.info(f"[RECOVERY] Reset {len(recovered)} stuck documents to error status")
    except Exception as e:
        logger.error(f"[RECOVERY] Error in stuck document recovery: {e}", exc_info=True)


async def scheduled_document_retry():
    """
    Retry job for library documents parked in 'pending' — either transcription
    rate-limit deferrals (e.g. Groq Whisper free-tier quota) or tasks that died
    before reaching 'processing'.
    Runs every 20 minutes. Claims one stale-pending doc at a time with
    FOR UPDATE SKIP LOCKED: the APScheduler instance runs inside EVERY gunicorn
    worker, so the atomic claim is what prevents two workers from reprocessing —
    and double-writing ChromaDB for — the same document. Stops gracefully the moment
    the transcription quota is hit again, deferring the rest to the next cycle
    (vision-pipeline pattern). The original lives in PERMANENT_UPLOAD_FOLDER (legacy)
    or the user's Drive (re-downloaded on demand by _process_document_task), so
    retries are always safe even after the local temp is gone.
    """
    from sqlalchemy import text
    from ..database import AsyncSessionLocal
    from .academic_services.library_service import _process_document_task

    BATCH = 25
    # Atomically claim the oldest stale-pending doc (flip pending→processing).
    # SKIP LOCKED lets concurrent workers each grab a different row instead of
    # blocking or racing on the same one.
    CLAIM_SQL = text(
        "UPDATE academic_documents SET status='processing' "
        "WHERE id = ("
        "  SELECT id FROM academic_documents "
        "  WHERE status='pending' AND updated_at < NOW() - INTERVAL '15 minutes' "
        "  ORDER BY updated_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED"
        ") RETURNING id, storage_path"
    )

    logger.info("[DOC-RETRY] Scanning for stale 'pending' documents...")
    processed = deferred = errored = 0
    for _ in range(BATCH):
        async with AsyncSessionLocal() as db:
            row = (await db.execute(CLAIM_SQL)).fetchone()
            await db.commit()
        if not row:
            break  # nothing left to claim this cycle

        doc_id, storage_path = row
        try:
            outcome = await _process_document_task(doc_id, storage_path)
        except Exception as e:
            logger.error(f"[DOC-RETRY] Unexpected error reprocessing doc {doc_id}: {e}", exc_info=True)
            errored += 1
            continue

        if outcome == 'deferred':
            deferred += 1
            logger.info(f"[DOC-RETRY] Doc {doc_id} deferred again (quota). Stopping cycle; next run resumes.")
            break  # quota exhausted — don't hammer; the next cycle continues
        elif outcome == 'processed':
            processed += 1
        elif outcome == 'error':
            errored += 1

    if processed or deferred or errored:
        logger.info(
            f"[DOC-RETRY] Cycle complete: {processed} processed, {deferred} deferred, {errored} errored."
        )
    else:
        logger.info("[DOC-RETRY] No stale-pending documents found.")


async def scheduled_latreo_pending_recheck():
    """
    Self-heal for users stuck in 'pending' whose Latreo verification actually
    succeeded. The synchronous confirm at register_step1 is best-effort: if the
    Latreo session wasn't 'completed' at that exact moment (manual-review tier, a
    timing race, or a flaky/timed-out Latreo call), the user stays 'pending'
    SILENTLY. This re-checks their stored latreo_session_id and flips to 'verified'
    once Latreo reports it done — the safety net behind the verification webhook.

    Runs every 10 minutes. APScheduler runs inside EVERY gunicorn worker, so we
    claim a batch atomically (FOR UPDATE SKIP LOCKED + stamp last_verification_check_at)
    to keep two workers from re-checking — and double-notifying — the same user.
    Only touches users who DID Latreo (latreo_session_id set), are recent (< 7d),
    and weren't checked in the last 15 min. Users who skipped Latreo have no
    session_id and are never touched here (they re-verify from the profile).
    """
    from sqlalchemy import text
    from sqlalchemy.future import select
    from ..database import AsyncSessionLocal
    from ..models import User
    from . import latreo_client
    from .notification_service import send_notification, NotificationType

    if not latreo_client.is_enabled():
        return

    # Atomically claim a batch of stale-pending Latreo users; stamping the check
    # time makes the sibling worker skip them and rate-limits the re-check to 15 min.
    CLAIM_SQL = text(
        "UPDATE users SET last_verification_check_at = NOW() "
        "WHERE id IN ("
        "  SELECT id FROM users "
        "  WHERE verification_status = 'pending' "
        "    AND latreo_session_id IS NOT NULL "
        "    AND created_at > NOW() - INTERVAL '7 days' "
        "    AND (last_verification_check_at IS NULL "
        "         OR last_verification_check_at < NOW() - INTERVAL '15 minutes') "
        "  ORDER BY created_at DESC LIMIT 20 FOR UPDATE SKIP LOCKED"
        ") RETURNING id, latreo_session_id"
    )
    async with AsyncSessionLocal() as db:
        claimed = (await db.execute(CLAIM_SQL)).fetchall()
        await db.commit()

    if not claimed:
        return

    logger.info(f"[LATREO-RECHECK] Re-checking {len(claimed)} pending Latreo user(s)...")
    healed = 0
    for user_id, session_id in claimed:
        try:
            sess = await latreo_client.get_verification_session(session_id)
        except latreo_client.LatreoError as e:
            logger.warning(f"[LATREO-RECHECK] user {user_id} session {session_id} check failed: {e}")
            continue

        if sess.get("status") != "completed":
            continue  # still processing / failed / expired — re-checked next cycle

        # final_tier is null for students (tier lives in /client/students) — resolve it.
        tier = await latreo_client.resolve_verification_tier(sess)
        latreo_uid = sess.get("doctor_user_id") or sess.get("student_user_id")

        async with AsyncSessionLocal() as db:
            # Conditional flip — only the worker that still sees 'pending' wins, so
            # the notification fires exactly once even with the per-worker scheduler.
            won = (await db.execute(text(
                "UPDATE users SET verification_status='verified', verification_tier=:tier, "
                "verification_provider='latreo', verified_at=COALESCE(verified_at, NOW()), "
                "latreo_doctor_id=COALESCE(latreo_doctor_id, :uid) "
                "WHERE id=:id AND verification_status='pending' RETURNING id"
            ), {"tier": tier, "uid": latreo_uid, "id": user_id})).fetchone() is not None
            await db.commit()
            if not won:
                continue
            healed += 1
            logger.info(f"[LATREO-RECHECK] user {user_id} -> verified (tier={tier}).")
            try:
                user = (await db.execute(select(User).where(User.id == user_id))).scalars().first()
                lang = (getattr(user, "language_preference", "pt-BR") or "pt-BR").split("-")[0]
                titles = {"pt": "Verificação confirmada", "en": "Verification confirmed", "es": "Verificación confirmada"}
                bodies = {
                    "pt": "Sua identidade médica foi verificada. Acesso completo liberado.",
                    "en": "Your medical identity was verified. Full access unlocked.",
                    "es": "Su identidad médica fue verificada. Acceso completo desbloqueado.",
                }
                await send_notification(
                    db, user_id, NotificationType.KYC_VERIFIED,
                    titles.get(lang, titles["pt"]), bodies.get(lang, bodies["pt"]),
                    data={"route": "/profile"},
                )
                await db.commit()
            except Exception as ne:
                logger.error(f"[LATREO-RECHECK] notify failed for user {user_id}: {ne}")

    if healed:
        logger.info(f"[LATREO-RECHECK] Cycle complete: {healed}/{len(claimed)} healed to verified.")


# Domínios cujo certificado TLS é vigiado.
_TLS_WATCHED_HOSTS = ("qython.ai", "www.qython.ai", "qython.app", "qython.com")

# A renovação do Let's Encrypt dispara aos 30 dias do vencimento. Abaixo deste
# limiar não é "vai renovar em breve" — é renovação QUEBRADA.
_TLS_ALERT_DAYS = 21


def _peek_tls_expiry(host: str, port: int = 443, timeout: float = 10.0):
    """
    Abre um handshake TLS e devolve o `notAfter` (UTC) do certificado SERVIDO.

    Lemos o que está no ar, não o arquivo em /etc/letsencrypt/live — que é
    ilegível para o usuário do backend e, pior, pode estar renovado enquanto o
    nginx segue servindo o antigo na memória (era o caso até ago/2026, quando
    não havia deploy hook de reload).
    """
    import socket
    import ssl
    from datetime import timezone as tz

    from cryptography import x509

    ctx = ssl.create_default_context()
    # Verificação DESLIGADA de propósito: precisamos conseguir ler um certificado
    # já vencido para poder alertar sobre ele. Com a verificação normal, o
    # handshake abortaria exatamente no caso que mais importa.
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    with socket.create_connection((host, port), timeout=timeout) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as tls:
            der = tls.getpeercert(binary_form=True)

    cert = x509.load_der_x509_certificate(der)
    # cryptography >= 42 expõe o campo já ciente de fuso; abaixo disso é naive UTC.
    expires = getattr(cert, "not_valid_after_utc", None)
    if expires is None:
        expires = cert.not_valid_after.replace(tzinfo=tz.utc)
    return expires


async def scheduled_tls_expiry_check():
    """
    Vigia o vencimento dos certificados TLS e alerta os admins por e-mail.

    Existe por causa do incidente de 13/ago/2026: a migração p/ a Hetzner tirou o
    location do ACME dos vhosts, a validação HTTP-01 passou a cair no SPA, o
    certbot falhou a cada 12h por um mês sem ninguém ver, e o certificado venceu
    com o site no ar. O `certbot.service` ficava em estado de falha, mas estado de
    unidade systemd não chega a ninguém — e-mail chega.
    """
    import asyncio
    from datetime import datetime, timezone as tz

    from ..database import AsyncSessionLocal
    from .admin_notifications import AdminNotificationService

    logger.info("[TLS] Verificando validade dos certificados...")

    now = datetime.now(tz.utc)
    findings = []

    for host in _TLS_WATCHED_HOSTS:
        try:
            expires = await asyncio.to_thread(_peek_tls_expiry, host)
            days = (expires - now).days
            logger.info(f"[TLS] {host}: {days} dia(s) restantes (expira {expires:%Y-%m-%d})")

            if days <= _TLS_ALERT_DAYS:
                findings.append({
                    "host": host,
                    "days": days,
                    "expires": expires.strftime("%Y-%m-%d %H:%M UTC"),
                })
        except Exception as e:
            # Falha de rede não é vencimento — logamos e seguimos, sem alarme falso.
            logger.error(f"[TLS] Falha ao checar {host}: {e}")

    if not findings:
        logger.info("[TLS] Todos os certificados dentro do prazo.")
        return

    async with AsyncSessionLocal() as db:
        try:
            await AdminNotificationService.send_tls_expiry_alert(db, findings)
        except Exception as e:
            logger.error(f"[TLS] Falha ao enviar alerta: {e}", exc_info=True)


def start_scheduler():
    """Start the background scheduler with all jobs"""

    # Daily ranking update at 3:00 AM UTC
    scheduler.add_job(
        scheduled_ranking_update,
        CronTrigger(hour=3, minute=0),
        id="daily_ranking_update",
        name="Daily Arena Ranking Update",
        replace_existing=True
    )

    # Season check every 6 hours
    scheduler.add_job(
        scheduled_season_check,
        CronTrigger(hour="*/6"),
        id="season_check",
        name="Season Status Check",
        replace_existing=True
    )

    # Expire old arena challenges every 6 hours
    scheduler.add_job(
        scheduled_expire_challenges,
        CronTrigger(hour="*/6", minute=30),
        id="expire_old_challenges",
        name="Expire Old Arena Challenges (24h)",
        replace_existing=True
    )

    # Chat images cleanup daily at 4:00 AM UTC
    scheduler.add_job(
        scheduled_chat_images_cleanup,
        CronTrigger(hour=4, minute=0),
        id="chat_images_cleanup",
        name="Chat Images Cleanup (30 days retention)",
        replace_existing=True
    )

    # Dracma expiration processing daily at 2:00 AM UTC
    scheduler.add_job(
        scheduled_dracma_expiration,
        CronTrigger(hour=2, minute=0),
        id="dracma_expiration",
        name="Dracma Expiration Processing",
        replace_existing=True
    )

    # Dracma expiration notifications daily at 10:00 AM UTC (7:00 AM BRT)
    scheduler.add_job(
        scheduled_dracma_expiration_notifications,
        CronTrigger(hour=10, minute=0),
        id="dracma_expiration_notifications",
        name="Dracma Expiration Notifications (30d, 7d, 1d)",
        replace_existing=True
    )

    # Generated content cleanup (TTL expiration + temp files) daily at 5:00 AM UTC
    scheduler.add_job(
        scheduled_generated_content_cleanup,
        CronTrigger(hour=5, minute=0),
        id="generated_content_cleanup",
        name="Generated Content Cleanup (TTL expiration, temp files, orphan thumbnails)",
        replace_existing=True
    )

    # Avatar orphan cleanup daily at 3:30 AM UTC
    scheduler.add_job(
        scheduled_avatar_cleanup,
        CronTrigger(hour=3, minute=30),
        id="avatar_cleanup",
        name="Avatar Orphan Cleanup (unreferenced files > 1h)",
        replace_existing=True
    )

    # RLAIF AI-as-Judge batch — weekly on Sunday at 2:00 AM UTC
    scheduler.add_job(
        scheduled_rlaif_batch,
        CronTrigger(day_of_week='sun', hour=2, minute=0),
        id="rlaif_batch",
        name="RLAIF AI Judge Batch (weekly)",
        replace_existing=True
    )

    # Self-play preference generation — weekly on Sunday at 3:00 AM UTC
    scheduler.add_job(
        scheduled_self_play,
        CronTrigger(day_of_week='sun', hour=3, minute=0),
        id="self_play",
        name="Self-Play Preference Generation (weekly)",
        replace_existing=True
    )

    # Quality decay snapshot — weekly on Monday at 1:00 AM UTC
    scheduler.add_job(
        scheduled_quality_snapshot,
        CronTrigger(day_of_week='mon', hour=1, minute=0),
        id="quality_snapshot",
        name="Quality Decay Snapshot (weekly)",
        replace_existing=True
    )

    # Notification cleanup — daily at 6:00 AM UTC
    from .notification_service import cleanup_old_notifications

    scheduler.add_job(
        cleanup_old_notifications,
        CronTrigger(hour=6, minute=0),
        id="notification_cleanup",
        name="Cleanup old read notifications (90+ days)",
        replace_existing=True
    )

    # Weekly digest email — Monday at 8:00 AM UTC (5:00 AM BRT)
    scheduler.add_job(
        scheduled_weekly_digest,
        CronTrigger(day_of_week='mon', hour=8, minute=0),
        id="weekly_digest",
        name="Weekly Digest Email (Monday)",
        replace_existing=True
    )

    # Inactivity reminder — daily at 9:00 AM UTC (6:00 AM BRT)
    scheduler.add_job(
        scheduled_inactivity_check,
        CronTrigger(hour=9, minute=0),
        id="inactivity_check",
        name="Inactivity Reminder Email (14d)",
        replace_existing=True
    )

    # Welcome day 3 email — daily at 10:30 AM UTC (7:30 AM BRT)
    scheduler.add_job(
        scheduled_welcome_day3,
        CronTrigger(hour=10, minute=30),
        id="welcome_day3",
        name="Welcome Day 3 Email (new users)",
        replace_existing=True
    )

    # Stuck document recovery — every 30 minutes
    scheduler.add_job(
        scheduled_stuck_document_recovery,
        IntervalTrigger(minutes=30),
        id="stuck_document_recovery",
        name="Stuck Document Recovery (processing > 30min → error)",
        replace_existing=True
    )

    # Library document retry — every 20 minutes (rate-limit deferrals + crashed tasks)
    scheduler.add_job(
        scheduled_document_retry,
        IntervalTrigger(minutes=20),
        id="document_retry",
        name="Library Document Retry (stale 'pending' → reprocess, defer on quota)",
        replace_existing=True
    )

    # Latreo verification self-heal — every 10 minutes. The sync confirm at signup
    # is best-effort; this flips users whose Latreo finished afterwards (or whose
    # confirm hit a flaky/timed-out Latreo) from 'pending' → 'verified'. Net behind
    # the webhook so a stuck-pending user never silently keeps premium gated.
    scheduler.add_job(
        scheduled_latreo_pending_recheck,
        IntervalTrigger(minutes=10),
        id="latreo_pending_recheck",
        name="Latreo Verification Self-Heal (pending → verified)",
        replace_existing=True
    )

    # Vision pipeline — daily large batch at 1:00 AM UTC (fresh quota)
    scheduler.add_job(
        scheduled_vision_processing_large,
        CronTrigger(hour=1, minute=0),
        id="vision_processing_daily",
        name="Vision Pipeline Daily (100 images, 1:00 AM UTC)",
        replace_existing=True
    )

    # Vision pipeline — catch-up every 4 hours
    scheduler.add_job(
        scheduled_vision_processing,
        IntervalTrigger(hours=4),
        id="vision_processing_catchup",
        name="Vision Pipeline Catch-up (25 images, every 4h)",
        replace_existing=True
    )

    # Validade dos certificados TLS — diário às 6:17 UTC. Fora da hora cheia de
    # propósito, para não disputar CPU com os outros jobs diários.
    scheduler.add_job(
        scheduled_tls_expiry_check,
        CronTrigger(hour=6, minute=17),
        id="tls_expiry_check",
        name="TLS Expiry Check (alerta admin abaixo de 21 dias)",
        replace_existing=True
    )

    scheduler.start()
    logger.info(
        "Internal scheduler started with jobs: daily_ranking_update, season_check, "
        "expire_old_challenges, chat_images_cleanup, dracma_expiration, dracma_expiration_notifications, "
        "generated_content_cleanup, avatar_cleanup, rlaif_batch, self_play, "
        "quality_snapshot, notification_cleanup, weekly_digest, inactivity_check, welcome_day3, "
        "stuck_document_recovery, document_retry, latreo_pending_recheck, "
        "vision_processing_daily, vision_processing_catchup, tls_expiry_check"
    )


def stop_scheduler():
    """Stop the background scheduler"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Internal scheduler stopped")
