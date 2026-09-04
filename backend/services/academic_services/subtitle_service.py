# backend/services/academic_services/subtitle_service.py
"""
Service for generating SRT subtitle files from video lesson scripts.
"""

import os
import logging
from typing import List

logger = logging.getLogger("qython_logger")


def format_srt_time(seconds: float) -> str:
    """
    Converts seconds to SRT timestamp format (HH:MM:SS,mmm).

    Args:
        seconds: Time in seconds

    Returns:
        Formatted timestamp string
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def generate_srt_from_script(
    script: str,
    slide_durations: List[float],
    output_path: str
) -> str:
    """
    Generates an SRT subtitle file from a narration script and slide durations.

    The function splits the script into segments (by paragraph) and maps them
    to the corresponding slide durations. Long segments are further split
    into smaller chunks for better readability.

    Args:
        script: The narration script text
        slide_durations: List of duration (in seconds) for each slide
        output_path: Full path where the SRT file will be saved

    Returns:
        The output_path if successful
    """
    logger.info(f"Generating SRT subtitles. Slides: {len(slide_durations)}, Script length: {len(script)} chars")

    # Split script into segments by paragraph (double newline)
    segments = [s.strip() for s in script.strip().split('\n\n') if s.strip()]

    # If we have more slides than segments, distribute evenly
    # If we have more segments than slides, combine segments
    if len(segments) != len(slide_durations):
        logger.warning(f"Segment count ({len(segments)}) differs from slide count ({len(slide_durations)}). Adjusting...")

        if len(segments) > len(slide_durations):
            # Combine segments to match slide count
            combined = []
            segments_per_slide = len(segments) / len(slide_durations)

            for i in range(len(slide_durations)):
                start_idx = int(i * segments_per_slide)
                end_idx = int((i + 1) * segments_per_slide)
                combined.append(' '.join(segments[start_idx:end_idx]))
            segments = combined
        else:
            # Pad with empty segments
            while len(segments) < len(slide_durations):
                segments.append('')

    srt_content = []
    subtitle_index = 1
    current_time = 0.0

    for i, (segment, duration) in enumerate(zip(segments, slide_durations)):
        if not segment:
            current_time += duration
            continue

        # Split long segments into smaller chunks (max ~15 words per subtitle)
        words = segment.split()
        chunk_size = 15
        chunks = [' '.join(words[j:j + chunk_size]) for j in range(0, len(words), chunk_size)]

        if not chunks:
            current_time += duration
            continue

        # Distribute slide duration evenly among chunks
        chunk_duration = duration / len(chunks) if chunks else duration

        for j, chunk in enumerate(chunks):
            chunk_start = current_time + (j * chunk_duration)
            chunk_end = current_time + ((j + 1) * chunk_duration)

            # Ensure minimum display time of 1 second
            if chunk_end - chunk_start < 1.0:
                chunk_end = chunk_start + 1.0

            start_time_str = format_srt_time(chunk_start)
            end_time_str = format_srt_time(chunk_end)

            srt_content.append(str(subtitle_index))
            srt_content.append(f"{start_time_str} --> {end_time_str}")
            srt_content.append(chunk.strip())
            srt_content.append("")  # Empty line between subtitles

            subtitle_index += 1

        current_time += duration

    # Write SRT file
    srt_text = '\n'.join(srt_content)

    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(srt_text)
        logger.info(f"SRT file generated successfully: {output_path} ({subtitle_index - 1} subtitles)")
        return output_path
    except Exception as e:
        logger.error(f"Failed to write SRT file: {e}", exc_info=True)
        raise
