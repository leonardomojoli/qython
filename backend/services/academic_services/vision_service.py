# qython/backend/services/academic_services/vision_service.py

"""
Vision Pipeline — Phase 2: Scheduled description of extracted document images.

Uses Gemini Flash Lite (free tier: 30 RPM / 1500 RPD) to generate clinical
descriptions of medical images. Auto-throttles and defers on rate limits.
"""

import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_
from sqlalchemy.future import select

from ...config import Config
from ...database import AsyncSessionLocal
from ...models import DocumentImage

logger = logging.getLogger("qython_logger")

MEDICAL_VISION_PROMPT = """You are a medical image analyst. This image was extracted from a medical/academic document (textbook, clinical guideline, research paper).

CLASSIFY AS MEDICAL (provide description) if the image contains ANY of:
- Clinical images: radiographs, CT, MRI, ultrasound, histology, dermatology photos, ECGs, fundoscopy
- Clinical diagrams: anatomical diagrams, pathophysiology flowcharts, clinical algorithms, treatment protocols, decision trees
- Clinical data: growth charts, epidemiological graphs, statistical charts, dose tables, classification tables
- Species/agents relevant to medicine: venomous animals, parasites, bacteria, fungi (used for identification/diagnosis)
- Patient photos (even censored), wound/lesion documentation, surgical views
- Any visual content that supports medical education or clinical decision-making

CLASSIFY AS NON-MEDICAL only if the image is:
- A logo, watermark, page number, decorative element, or journal header
- A generic stock photo with no clinical relevance
- Respond with exactly: NON-MEDICAL: [brief description]

For MEDICAL images:
- Provide a detailed clinical description in English (2-5 sentences)
- Include: image type/modality, key findings, clinical relevance
- Use proper medical terminology"""


async def describe_single_image(image_path: str) -> Optional[str]:
    """Send a single image to Gemini for clinical description."""
    from google import genai
    from google.genai import types

    if not Config.GEMINI_API_KEY:
        logger.error("[VISION] GEMINI_API_KEY not configured")
        return None

    client = genai.Client(api_key=Config.GEMINI_API_KEY)

    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        # Detect mime type from extension
        ext = os.path.splitext(image_path)[1].lower()
        mime_map = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'}
        mime_type = mime_map.get(ext, 'image/png')

        response = client.models.generate_content(
            model=Config.VISION_DESCRIPTION_MODEL,
            contents=[
                types.Content(parts=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    types.Part.from_text(text=MEDICAL_VISION_PROMPT),
                ])
            ],
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=512,
            )
        )

        if response and response.text:
            return response.text.strip()
        return None

    except Exception as e:
        error_str = str(e)
        # Propagate rate limit errors so caller can handle them
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str.upper():
            raise
        logger.error(f"[VISION] Error describing image {image_path}: {e}")
        raise


async def process_pending_vision_batch(batch_size: int = None, stop_on_rate_limit: bool = True) -> dict:
    """
    Process a batch of pending document images through vision API.

    Returns stats dict with processed/failed/rate_limited counts.
    """
    if batch_size is None:
        batch_size = Config.VISION_BATCH_SIZE

    stats = {"processed": 0, "failed": 0, "skipped_non_medical": 0, "rate_limited": False}
    rpm_count = 0
    minute_start = time.monotonic()

    async with AsyncSessionLocal() as db:
        # Fetch pending images with retry_count < max
        result = await db.execute(
            select(DocumentImage).where(
                and_(
                    DocumentImage.vision_status == 'pending',
                    DocumentImage.retry_count < Config.VISION_MAX_RETRIES,
                )
            ).order_by(DocumentImage.created_at).limit(batch_size)
        )
        images = result.scalars().all()

        if not images:
            logger.info("[VISION] No pending images to process.")
            return stats

        logger.info(f"[VISION] Processing batch of {len(images)} pending images...")

        for img in images:
            # RPM throttle
            elapsed = time.monotonic() - minute_start
            if elapsed >= 60:
                rpm_count = 0
                minute_start = time.monotonic()

            if rpm_count >= Config.VISION_RPM_LIMIT:
                wait_time = 60 - elapsed
                if wait_time > 0:
                    logger.info(f"[VISION] RPM limit reached, waiting {wait_time:.1f}s...")
                    import asyncio
                    await asyncio.sleep(wait_time)
                rpm_count = 0
                minute_start = time.monotonic()

            # Build image path
            image_dir = os.path.join(Config.DOCUMENT_IMAGES_FOLDER, str(img.document_id))
            image_path = os.path.join(image_dir, img.image_filename)

            if not os.path.exists(image_path):
                logger.warning(f"[VISION] Image file missing: {image_path}")
                img.vision_status = 'failed'
                img.vision_error = 'File not found on disk'
                stats["failed"] += 1
                await db.commit()
                continue

            img.vision_status = 'processing'
            await db.commit()

            try:
                description = await describe_single_image(image_path)
                rpm_count += 1

                if description:
                    img.vision_description = description
                    img.vision_model = Config.VISION_DESCRIPTION_MODEL
                    img.vision_completed_at = datetime.now(timezone.utc)

                    if description.startswith("NON-MEDICAL:"):
                        img.vision_status = 'completed'
                        stats["skipped_non_medical"] += 1
                    else:
                        img.vision_status = 'completed'
                        stats["processed"] += 1
                else:
                    img.vision_status = 'failed'
                    img.vision_error = 'Empty response from vision model'
                    img.retry_count += 1
                    stats["failed"] += 1

                await db.commit()

            except Exception as e:
                error_str = str(e)
                is_rate_limit = "429" in error_str or "RESOURCE_EXHAUSTED" in error_str.upper()

                if is_rate_limit and stop_on_rate_limit:
                    logger.warning("[VISION] Rate limited — stopping batch, will retry next cycle.")
                    img.vision_status = 'pending'  # Reset to pending for next cycle
                    await db.commit()
                    stats["rate_limited"] = True
                    break

                img.vision_status = 'pending' if img.retry_count + 1 < Config.VISION_MAX_RETRIES else 'failed'
                img.retry_count += 1
                img.vision_error = error_str[:500]
                stats["failed"] += 1
                await db.commit()

        # After processing, index medical descriptions into ChromaDB
        medical_images = [
            img for img in images
            if img.vision_status == 'completed'
            and img.vision_description
            and not img.vision_description.startswith("NON-MEDICAL:")
        ]

        if medical_images:
            by_library: dict[int, list] = {}
            for img in medical_images:
                by_library.setdefault(img.library_id, []).append(img)

            for library_id, lib_images in by_library.items():
                try:
                    from . import vector_db_service
                    import asyncio
                    await asyncio.to_thread(
                        vector_db_service.store_image_descriptions,
                        library_id=library_id,
                        images=lib_images,
                    )
                    logger.info(f"[VISION] Indexed {len(lib_images)} image descriptions for library {library_id}")
                except Exception as e:
                    logger.error(f"[VISION] Failed to index descriptions for library {library_id}: {e}")

        # Collect training data from described medical images
        if medical_images:
            try:
                from ..data_collector_service import collect_data
                from ...models import AcademicDocument, AcademicLibrary

                for img in medical_images:
                    # Get document info for context
                    doc_result = await db.execute(
                        select(AcademicDocument.original_filename, AcademicDocument.library_id)
                        .where(AcademicDocument.id == img.document_id)
                    )
                    doc_info = doc_result.first()

                    # Get library owner for user_id
                    lib_result = await db.execute(
                        select(AcademicLibrary.user_id)
                        .where(AcademicLibrary.id == img.library_id)
                    )
                    lib_info = lib_result.first()

                    if doc_info and lib_info:
                        image_path = os.path.join(
                            Config.DOCUMENT_IMAGES_FOLDER,
                            str(img.document_id),
                            img.image_filename
                        )

                        image_bytes = None
                        if os.path.exists(image_path):
                            with open(image_path, "rb") as f:
                                image_bytes = f.read()

                        await collect_data(
                            db=db,
                            user_id=lib_info.user_id,
                            source_type='image_diagnosis',
                            input_data=f"Describe this medical image from {doc_info.original_filename} (page {img.page_number})",
                            output_data=img.vision_description,
                            meta={
                                "document_id": img.document_id,
                                "library_id": img.library_id,
                                "page_number": img.page_number,
                                "image_filename": img.image_filename,
                                "vision_model": img.vision_model,
                                "width": img.width,
                                "height": img.height,
                            },
                            quality=1,
                            image_bytes=image_bytes,
                        )

                await db.commit()
                logger.info(f"[VISION] Saved {len(medical_images)} image+description pairs as training data")
            except Exception as e:
                logger.error(f"[VISION] Failed to save training data: {e}", exc_info=True)

    logger.info(f"[VISION] Batch complete: {stats}")
    return stats
