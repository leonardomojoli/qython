import os
import uuid
import logging
from typing import List, Tuple, Optional, Dict
from moviepy.editor import ImageClip, AudioFileClip, concatenate_videoclips
from moviepy.video.fx.all import resize
from PIL import Image
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...models import VideoLessonJob

from ...config import Config
from . import slide_renderer_service
from . import subtitle_service

logger = logging.getLogger("qython_logger")

# Quality presets for video output
QUALITY_PRESETS = {
    '720p': {'width': 1280, 'height': 720, 'bitrate': '3000k'},
    '1080p': {'width': 1920, 'height': 1080, 'bitrate': '5000k'},
}


def _get_content_block_weight(block: Dict) -> int:
    """
    Calculates the character 'weight' of a content block.
    Used to determine relative slide duration based on content density.
    """
    block_type = block.get("type")
    weight = 0

    if block_type in ["text", "key_takeaway"] and block.get("points"):
        weight = sum(len(p) for p in block.get("points", []))
    elif block_type == "table":
        # Count characters in table
        weight += sum(len(col) for col in block.get("columns", []))
        for row in block.get("rows", []):
            weight += sum(len(str(cell)) for cell in row)
    elif block_type == "clinical_vignette":
        weight += len(block.get("scenario", ""))
        weight += len(block.get("question", ""))
        weight += len(block.get("answer", ""))
    elif block_type == "image_suggestion":
        # Images need time to view but less than text
        weight += 200

    return weight


def calculate_slide_durations(slides: List[Dict], total_audio_duration: float) -> List[float]:
    """
    Calculates proportional duration for each slide based on content density.

    Args:
        slides: List of slide dictionaries with content
        total_audio_duration: Total audio length in seconds

    Returns:
        List of durations in seconds for each slide
    """
    logger.info(f"Calculating variable slide durations for {len(slides)} slides")

    # Calculate weight for each slide
    weights = []
    for slide in slides:
        slide_weight = sum(
            _get_content_block_weight(block)
            for block in slide.get('content', [])
        )
        # Add weight for the title
        slide_weight += len(slide.get('title', '')) * 2

        # Minimum weight of 200 for simple slides
        weights.append(max(slide_weight, 200))

    total_weight = sum(weights)

    if total_weight == 0:
        # Fallback to equal distribution
        equal_duration = total_audio_duration / len(slides)
        return [equal_duration] * len(slides)

    # Calculate raw durations based on weight
    raw_durations = []
    for weight in weights:
        duration = (weight / total_weight) * total_audio_duration
        # Enforce minimum 3 seconds, maximum 30 seconds per slide
        raw_durations.append(max(3.0, min(30.0, duration)))

    # Normalize to sum exactly to total_audio_duration
    raw_total = sum(raw_durations)
    scale = total_audio_duration / raw_total
    durations = [d * scale for d in raw_durations]

    logger.info(f"Slide durations calculated: min={min(durations):.1f}s, max={max(durations):.1f}s, total={sum(durations):.1f}s")
    return durations


def create_video_from_slideshow(
    slideshow_data: dict,
    audio_path: str,
    user_id: int,
    script: Optional[str] = None,
    quality: str = '1080p'
) -> Tuple[str, Optional[str]]:
    """
    Generates a video by rendering each slide to an image and combining them with narration.

    Args:
        slideshow_data: Dictionary containing slides data
        audio_path: Path to the audio file
        user_id: User ID for file naming
        script: Optional narration script for SRT generation
        quality: Video quality preset ('720p' or '1080p')

    Returns:
        Tuple of (video_path, srt_path) where srt_path may be None if script not provided
    """
    logger.info(f"Starting video generation for user {user_id}. Quality: {quality}")

    # Get quality preset
    preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS['1080p'])
    target_width = preset['width']
    target_height = preset['height']
    target_bitrate = preset['bitrate']

    rendered_slide_paths = []
    temp_files_to_clean = []
    audio_clip = None
    final_video = None
    video_clips = []
    srt_path = None

    try:
        # 1. Render each slide in the JSON to a temporary image
        slides = slideshow_data.get("slides", [])
        if not slides:
            raise ValueError("Slideshow data contains no slides.")

        logger.info(f"Found {len(slides)} slides to render.")
        for i, slide in enumerate(slides):
            logger.debug(f"Rendering slide {i+1}...")
            rendered_path = slide_renderer_service.render_slide_to_image(slide)
            if rendered_path:
                rendered_slide_paths.append(rendered_path)
                temp_files_to_clean.append(rendered_path)

        if not rendered_slide_paths:
            raise ValueError("Failed to render any slides into images.")
        logger.info(f"Successfully rendered {len(rendered_slide_paths)} slides.")

        # 2. Load the audio
        logger.info("Loading audio track...")
        full_audio_path = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, audio_path.split('static/uploads/')[-1])
        if not os.path.exists(full_audio_path):
            raise FileNotFoundError(f"Audio file not found at {full_audio_path}")

        audio_clip = AudioFileClip(full_audio_path)
        audio_duration = audio_clip.duration

        if audio_duration == 0:
            raise ValueError("Audio clip has zero duration.")
        logger.info(f"Audio loaded successfully. Duration: {audio_duration}s.")

        # 3. Calculate variable slide durations based on content weight
        slide_durations = calculate_slide_durations(slides, audio_duration)

        # 4. Create video clips from rendered slides with variable durations
        logger.info("Creating video clips with variable durations...")
        for i, image_path in enumerate(rendered_slide_paths):
            duration = slide_durations[i] if i < len(slide_durations) else audio_duration / len(rendered_slide_paths)
            clip = ImageClip(image_path).set_duration(duration)

            # Resize to target quality
            if clip.size != [target_width, target_height]:
                clip = resize(clip, newsize=(target_width, target_height))
            video_clips.append(clip)

        logger.info(f"Created {len(video_clips)} video clips with variable durations.")

        # 5. Concatenate clips and add audio
        logger.info("Concatenating video clips and adding audio...")
        final_video = concatenate_videoclips(video_clips, method="compose")
        final_video = final_video.set_audio(audio_clip)

        # 6. Prepare output directory
        output_dir = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'video_lessons')
        os.makedirs(output_dir, exist_ok=True)

        unique_id = f"{user_id}_{uuid.uuid4()}"

        # 7. Write the final video file
        filename = f"video_lesson_{unique_id}.mp4"
        filepath = os.path.join(output_dir, filename)

        logger.info(f"Writing final video to {filepath}...")
        final_video.write_videofile(
            filepath,
            codec="libx264",
            audio_codec="aac",
            fps=24,
            threads=4,
            preset="medium",
            bitrate=target_bitrate
        )

        logger.info(f"Video lesson saved successfully at: {filepath}")

        # 8. Generate SRT subtitles if script provided
        if script:
            try:
                srt_filename = f"video_lesson_{unique_id}.srt"
                srt_filepath = os.path.join(output_dir, srt_filename)

                subtitle_service.generate_srt_from_script(
                    script=script,
                    slide_durations=slide_durations,
                    output_path=srt_filepath
                )

                srt_path = os.path.join(
                    Config.STATIC_URL_PATH_PREFIX.strip('/'),
                    'uploads', 'video_lessons', srt_filename
                ).replace("\\", "/")

                logger.info(f"SRT subtitles generated: {srt_path}")
            except Exception as e:
                logger.warning(f"Failed to generate SRT subtitles: {e}")
                srt_path = None

        relative_path = os.path.join(
            Config.STATIC_URL_PATH_PREFIX.strip('/'),
            'uploads', 'video_lessons', filename
        ).replace("\\", "/")

        return relative_path, srt_path

    except Exception as e:
        logger.error(f"Error during video generation: {e}", exc_info=True)
        raise
    finally:
        # 9. Clean up resources
        logger.info("Cleaning up video generation resources.")
        if audio_clip:
            audio_clip.close()
        if final_video:
            final_video.close()
        for clip in video_clips:
            clip.close()

        logger.info(f"Cleaning up {len(temp_files_to_clean)} temporary slide images.")
        for f in temp_files_to_clean:
            try:
                if os.path.exists(f):
                    os.remove(f)
            except Exception as e:
                logger.warning(f"Could not delete temporary file {f}: {e}")


async def clear_specific_video_lesson_job(db: AsyncSession, user_id: int, job_id: int) -> bool:
    """
    Deletes a specific video lesson job and its associated video/srt files from storage.
    """
    logger.info(f"Attempting to delete video lesson job {job_id} for user {user_id}.")
    result = await db.execute(select(VideoLessonJob).filter_by(id=job_id, user_id=user_id))
    job = result.scalars().first()

    if not job:
        logger.warning(f"Video lesson job {job_id} not found for user {user_id} or permission denied.")
        return False

    # Delete the physical video file if it exists
    if job.result_path and 'static/uploads/video_lessons/' in job.result_path:
        filename = os.path.basename(job.result_path)
        file_path = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'video_lessons', filename)

        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"Video file {file_path} deleted successfully.")
            except OSError as e:
                logger.error(f"Error deleting video file {file_path}: {e}", exc_info=True)
        else:
            logger.warning(f"Video file {file_path} not found on disk for job {job_id}.")

    # Delete SRT file if exists
    if job.srt_path and 'static/uploads/video_lessons/' in job.srt_path:
        srt_filename = os.path.basename(job.srt_path)
        srt_file_path = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'video_lessons', srt_filename)

        if os.path.exists(srt_file_path):
            try:
                os.remove(srt_file_path)
                logger.info(f"SRT file {srt_file_path} deleted successfully.")
            except OSError as e:
                logger.error(f"Error deleting SRT file {srt_file_path}: {e}", exc_info=True)

    # Delete the job record from the database
    try:
        await db.delete(job)
        await db.commit()
        logger.info(f"Video lesson job record {job_id} deleted from the database.")
        return True
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting job record {job_id} from the database: {e}", exc_info=True)
        return False
