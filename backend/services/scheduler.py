# qython/backend/services/scheduler.py
"""
Internal Task Scheduler using APScheduler
No external cron needed - runs within the FastAPI application.
"""

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from ..config import Config

logger = logging.getLogger("qython_logger")

# Global scheduler instance
scheduler = AsyncIOScheduler()






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
        if p.startswith(str(Config.DATA_BACKEND_DIR)) or p.startswith(str(Config.BACKEND_DIR)):
            return p
        p = p.lstrip('/')  # URL-like '/static/uploads/x'
    if p.startswith('static/'):
        return os.path.join(Config.DATA_BACKEND_DIR, p)
    return os.path.join(Config.DATA_BACKEND_DIR, 'static', p)


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
    # Sem TTL (edição local) nada gerado expira; as varreduras de temporários e de
    # órfãos abaixo continuam valendo.
    if Config.GENERATED_CONTENT_TTL_HOURS:
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

            grace_hours = (Config.GENERATED_CONTENT_TTL_HOURS or 72) + 24
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














async def scheduled_vision_processing():
    """
    Scheduled task to process pending document image descriptions via the local vision model.
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
    transcription deferrals (the local whisper service down or starting) or tasks that died
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






def _daily(hour: int, minute: int = 0):
    """Gatilho diário. O computador costuma estar desligado de madrugada e um horário fixo nunca
    dispararia: roda a cada 24 h, começando pouco depois de abrir."""
    return IntervalTrigger(hours=24, start_date=datetime.now(timezone.utc) + timedelta(minutes=10))


def start_scheduler():
    """Start the background scheduler with all jobs.

    Só jobs de manutenção: limpeza de arquivos e notificações, recuperação de documentos
    travados e a fila de visão. O Qython não tem mais ranking nacional, cobrança, e-mails de
    campanha nem coleta de dados de treinamento.
    """
    # Season check every 6 hours
    scheduler.add_job(
        scheduled_season_check,
        CronTrigger(hour="*/6"),
        id="season_check",
        name="Season Status Check",
        replace_existing=True
    )

    # Generated content cleanup (TTL expiration + temp files) daily at 5:00 AM UTC
    scheduler.add_job(
        scheduled_generated_content_cleanup,
        _daily(5, 0),
        id="generated_content_cleanup",
        name="Generated Content Cleanup (TTL expiration, temp files, orphan thumbnails)",
        replace_existing=True
    )

    # Avatar orphan cleanup daily at 3:30 AM UTC
    scheduler.add_job(
        scheduled_avatar_cleanup,
        _daily(3, 30),
        id="avatar_cleanup",
        name="Avatar Orphan Cleanup (unreferenced files > 1h)",
        replace_existing=True
    )


    # Notification cleanup — daily at 6:00 AM UTC
    from .notification_service import cleanup_old_notifications

    scheduler.add_job(
        cleanup_old_notifications,
        _daily(6, 0),
        id="notification_cleanup",
        name="Cleanup old read notifications (90+ days)",
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

    if Config.LATREO_API_KEY:
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
        _daily(1, 0),
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

    scheduler.start()
    logger.info(
        "Internal scheduler started with jobs: "
        + ", ".join(job.id for job in scheduler.get_jobs())
    )


def stop_scheduler():
    """Stop the background scheduler"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Internal scheduler stopped")
