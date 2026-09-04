# qython/backend/scripts/cleanup_orphans.py

import os
import sys
import logging
import argparse
from sqlalchemy.orm import Session

# CORRECTED: Add the project's top-level directory (qython/) to the path
# This goes up two levels from the current script's location (scripts/ -> backend/ -> qython/)
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)

# CORRECTED: Use absolute imports from the 'backend' package
from backend.database import SessionLocal
from backend.models import (
    User, AvatarHistory, AcademicDocument, PodcastGenerationJob, 
    VideoLessonJob, AcademicMaterial
)
from backend.config import Config

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Helper Functions to Get Referenced Files from DB ---

def get_profile_picture_db_files(db: Session) -> set:
    """Gets all unique profile picture and avatar history filenames from the DB."""
    user_pics = {os.path.basename(user.profile_picture) for user in db.query(User.profile_picture).filter(User.profile_picture.isnot(None)).all() if user.profile_picture}
    avatar_history = {os.path.basename(avatar.filename) for avatar in db.query(AvatarHistory.filename).all() if avatar.filename}
    return user_pics.union(avatar_history)

def get_academic_document_db_files(db: Session) -> set:
    """Gets all unique academic document storage paths from the DB."""
    return {os.path.basename(doc.storage_path) for doc in db.query(AcademicDocument.storage_path).all() if doc.storage_path}

def get_thumbnail_db_files(db: Session) -> set:
    """Gets all unique thumbnail filenames from the DB."""
    # The DB stores a URL, so we extract the basename.
    return {os.path.basename(doc.thumbnail_url) for doc in db.query(AcademicDocument.thumbnail_url).filter(AcademicDocument.thumbnail_url.isnot(None)).all() if doc.thumbnail_url}

def get_podcast_db_files(db: Session) -> set:
    """Gets all unique podcast result paths from the DB."""
    return {os.path.basename(job.result_path) for job in db.query(PodcastGenerationJob.result_path).filter(PodcastGenerationJob.result_path.isnot(None)).all() if job.result_path}

def get_video_lesson_db_files(db: Session) -> set:
    """Gets all unique video lesson result paths from the DB."""
    return {os.path.basename(job.result_path) for job in db.query(VideoLessonJob.result_path).filter(VideoLessonJob.result_path.isnot(None)).all() if job.result_path}

def get_slideshow_db_files(db: Session) -> set:
    """Gets all unique slideshow file paths from the AcademicMaterial content blob."""
    slideshows = db.query(AcademicMaterial.content).filter(AcademicMaterial.material_type == 'slideshow_only').all()
    referenced_files = set()
    for item in slideshows:
        content = item.content
        if isinstance(content, dict) and 'slideshow_file_path' in content:
            filepath = content['slideshow_file_path']
            if filepath and isinstance(filepath, str):
                referenced_files.add(os.path.basename(filepath))
    return referenced_files

# --- Main Processing Logic ---

def process_directory(db: Session, dir_name: str, dir_path: str, db_fetcher_func, dry_run: bool, ignored_files: set = None) -> int:
    """Generic function to process a directory for orphan files."""
    if ignored_files is None:
        ignored_files = set()
        
    logger.info(f"--- Processing Directory: {dir_name} ---")
    
    if not os.path.isdir(dir_path):
        logger.warning(f"Directory not found at '{dir_path}'. Skipping.")
        return 0

    disk_files = {f for f in os.listdir(dir_path) if os.path.isfile(os.path.join(dir_path, f))}
    logger.info(f"Found {len(disk_files)} file(s) on disk.")

    db_files = db_fetcher_func(db)
    logger.info(f"Found {len(db_files)} file(s) referenced in the database.")

    orphan_files = disk_files - db_files - ignored_files
    
    if not orphan_files:
        logger.info("No orphaned files found in this directory.")
        return 0

    logger.warning(f"Found {len(orphan_files)} orphaned file(s) to be deleted.")
    
    deleted_count = 0
    for filename in orphan_files:
        file_path = os.path.join(dir_path, filename)
        try:
            if dry_run:
                logger.info(f"[DRY RUN] Would delete: {file_path}")
            else:
                os.remove(file_path)
                logger.info(f"Successfully deleted: {file_path}")
            deleted_count += 1
        except OSError as e:
            logger.error(f"Error deleting file {file_path}: {e}")
            
    return deleted_count

def cleanup_all_orphan_files(dry_run: bool = True):
    """
    Scans all media directories for orphaned files and deletes them.
    """
    logger.info("Starting comprehensive orphan file cleanup...")
    db = SessionLocal()
    total_deleted = 0
    
    # Define all the checkers
    checkers = [
        {
            "name": "Profile Pictures & Avatars",
            "path": Config.UPLOAD_FOLDER_PROFILE,
            "fetcher": get_profile_picture_db_files,
            "ignore": {"default-profile.png"} # Never delete the default avatar
        },
        {
            "name": "Academic Documents",
            "path": Config.PERMANENT_UPLOAD_FOLDER,
            "fetcher": get_academic_document_db_files,
        },
        {
            "name": "Document Thumbnails",
            "path": Config.THUMBNAIL_FOLDER,
            "fetcher": get_thumbnail_db_files,
        },
        {
            "name": "Podcasts",
            "path": os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'podcasts'),
            "fetcher": get_podcast_db_files,
        },
        {
            "name": "Video Lessons",
            "path": os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'video_lessons'),
            "fetcher": get_video_lesson_db_files,
        },
        {
            "name": "Slideshows",
            "path": Config.SLIDESHOW_FOLDER,
            "fetcher": get_slideshow_db_files,
        },
    ]

    try:
        for checker in checkers:
            deleted_count = process_directory(
                db=db,
                dir_name=checker["name"],
                dir_path=checker["path"],
                db_fetcher_func=checker["fetcher"],
                dry_run=dry_run,
                ignored_files=checker.get("ignore")
            )
            total_deleted += deleted_count
            print("-" * 40) # Separator for readability

    except Exception as e:
        logger.error(f"An unexpected error occurred during cleanup: {e}", exc_info=True)
    finally:
        db.close()

    if dry_run:
        logger.info(f"\n[DRY RUN] Grand total: {total_deleted} file(s) identified for deletion.")
    else:
        logger.info(f"\nCleanup complete. Grand total: {total_deleted} orphaned file(s) deleted.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean up all types of orphaned media files from the server.")
    parser.add_argument(
        '--execute',
        action='store_true',
        help="Actually delete the files. If not provided, will run in 'dry run' mode."
    )
    args = parser.parse_args()

    is_dry_run = not args.execute

    if is_dry_run:
        print("\n--- RUNNING IN DRY RUN MODE ---")
        print("No files will be deleted. To delete files, run with the --execute flag.")
        print("---------------------------------\n")
    else:
        print("\n--- WARNING: RUNNING IN EXECUTE MODE ---")
        print("Orphaned files will be permanently deleted from the filesystem.")
        confirm = input("Are you sure you want to continue? (yes/no): ")
        print("----------------------------------------\n")
        if confirm.lower() != 'yes':
            print("Execution cancelled by user.")
            sys.exit(0)

    cleanup_all_orphan_files(dry_run=is_dry_run)