import os
import shutil
import subprocess
import tempfile
import uuid
import logging
from typing import List, Tuple, Optional, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...models import VideoLessonJob

from ...config import Config
from . import slide_renderer_service
from . import subtitle_service

logger = logging.getLogger("qython_logger")

# O vídeo é montado chamando o ffmpeg direto. Antes passava pelo moviepy, que só
# fazia isto — juntar slides gerados pelo próprio Qython com a narração — e cuja
# série 2.x exige Pillow < 12. O Pillow decodifica toda imagem que o usuário envia,
# então mantê-lo atualizado vale mais que a conveniência do moviepy.
FFMPEG_TIMEOUT_SECONDS = 30 * 60


def _ffmpeg_bin(name: str) -> str:
    """Caminho do ffmpeg/ffprobe: FFMPEG_BINARY/FFPROBE_BINARY ou o do PATH."""
    path = os.environ.get(f"{name.upper()}_BINARY") or shutil.which(name)
    if not path:
        raise RuntimeError(f"{name} não encontrado: instale o ffmpeg ou defina {name.upper()}_BINARY.")
    return path


def _run(cmd: List[str]) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT_SECONDS)
    if result.returncode != 0:
        # O ffmpeg escreve o diagnóstico no fim do stderr.
        raise RuntimeError(f"{os.path.basename(cmd[0])} falhou: {result.stderr.strip()[-800:]}")
    return result.stdout


def _audio_duration_seconds(path: str) -> float:
    out = _run([_ffmpeg_bin("ffprobe"), "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", path])
    return float(out.strip())


def _write_concat_list(image_paths: List[str], durations: List[float], list_path: str) -> None:
    """Lista do concat demuxer: cada imagem com sua duração. O ffmpeg ignora a
    duração do último item, então ele é repetido no fim — sem isso o último slide
    duraria um único quadro."""
    def quote(p: str) -> str:
        return "'" + os.path.abspath(p).replace("'", "'\\''") + "'"
    with open(list_path, "w", encoding="utf-8") as f:
        for path, duration in zip(image_paths, durations):
            f.write(f"file {quote(path)}\nduration {duration:.3f}\n")
        f.write(f"file {quote(image_paths[-1])}\n")

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

        audio_duration = _audio_duration_seconds(full_audio_path)

        if audio_duration == 0:
            raise ValueError("Audio clip has zero duration.")
        logger.info(f"Audio loaded successfully. Duration: {audio_duration}s.")

        # 3. Calculate variable slide durations based on content weight
        slide_durations = calculate_slide_durations(slides, audio_duration)

        # 4. Prepare output directory
        output_dir = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'video_lessons')
        os.makedirs(output_dir, exist_ok=True)

        unique_id = f"{user_id}_{uuid.uuid4()}"
        filename = f"video_lesson_{unique_id}.mp4"
        filepath = os.path.join(output_dir, filename)

        # 5. Slides com durações variáveis + narração, numa única passada do ffmpeg
        durations = [
            slide_durations[i] if i < len(slide_durations) else audio_duration / len(rendered_slide_paths)
            for i in range(len(rendered_slide_paths))
        ]
        fd, concat_list = tempfile.mkstemp(suffix=".txt", prefix="slides_")
        os.close(fd)
        temp_files_to_clean.append(concat_list)
        _write_concat_list(rendered_slide_paths, durations, concat_list)

        logger.info(f"Writing final video to {filepath}...")
        _run([
            _ffmpeg_bin("ffmpeg"), "-y", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", concat_list,
            "-i", full_audio_path,
            # yuv420p: o padrão que todo player (inclusive navegador e celular) toca
            "-vf", f"scale={target_width}:{target_height},fps=24,format=yuv420p",
            "-c:v", "libx264", "-preset", "medium", "-b:v", target_bitrate,
            "-c:a", "aac",
            "-threads", "4",
            "-shortest",
            filepath,
        ])

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
        logger.info(f"Cleaning up {len(temp_files_to_clean)} temporary files.")
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
