# qython/backend/services/academic_services/slide_renderer_service.py

import os
import uuid
import logging
from PIL import Image, ImageDraw, ImageFont
from typing import Dict, Optional

from ...config import Config

logger = logging.getLogger("qython_logger")

# --- CONFIGURABLE DESIGN PARAMETERS ---
BG_COLOR = (22, 22, 29)  # Dark background
TEXT_COLOR = (230, 230, 230) # Light grey text
TITLE_COLOR = (200, 200, 255) # Light purple for titles
FONT_PATH = os.path.join(Config.PROJECT_ROOT, 'tests', 'frontend', 'Inter_24pt-Bold.ttf') 
FONT_SIZE_TITLE = 60
FONT_SIZE_BODY = 36
IMG_WIDTH = 1920
IMG_HEIGHT = 1080
PADDING = 60

# --- FONT CACHING ---
_font_cache = {}

def _get_font(size: int) -> ImageFont.FreeTypeFont:
    """Loads and returns a font object from a cache."""
    if size not in _font_cache:
        try:
            _font_cache[size] = ImageFont.truetype(FONT_PATH, size)
        except IOError:
            logger.warning(f"Font not found at {FONT_PATH}. Using default font.")
            _font_cache[size] = ImageFont.load_default()
    return _font_cache[size]

def _wrap_text(draw: ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> str:
    """Wraps text to fit within a specified width."""
    if not text or draw.textlength(text, font) <= max_width:
        return text
    
    lines = []
    words = text.split(' ')
    current_line = ""
    
    for word in words:
        if draw.textlength(f"{current_line} {word}", font) <= max_width:
            current_line += f" {word}"
        else:
            lines.append(current_line.strip())
            current_line = word
            
    lines.append(current_line.strip())
    return "\n".join(lines).strip()

def render_slide_to_image(slide_data: Dict) -> Optional[str]:
    """
    Renders a single slide's JSON data to a temporary image file with optimizations.
    """
    image = None
    try:
        # 1. Setup canvas and fonts
        image = Image.new('RGB', (IMG_WIDTH, IMG_HEIGHT), color=BG_COLOR)
        draw = ImageDraw.Draw(image)
        title_font = _get_font(FONT_SIZE_TITLE)
        body_font = _get_font(FONT_SIZE_BODY)
        
        # 2. Draw Title
        slide_title = slide_data.get("title", "Slide sem Título")
        wrapped_title = _wrap_text(draw, slide_title, title_font, IMG_WIDTH - 2 * PADDING)
        draw.text((PADDING, PADDING), wrapped_title, font=title_font, fill=TITLE_COLOR)
        
        # 3. Draw Content Blocks
        current_y = PADDING + draw.textbbox((0,0), wrapped_title, font=title_font)[3] + 40
        
        for content_block in slide_data.get("content", []):
            block_type = content_block.get("type")
            
            if block_type == "text" and content_block.get("points"):
                for point in content_block["points"]:
                    line = f"• {point}"
                    wrapped_point = _wrap_text(draw, line, body_font, IMG_WIDTH - 2 * PADDING - 20)
                    draw.text((PADDING + 20, current_y), wrapped_point, font=body_font, fill=TEXT_COLOR)
                    current_y += draw.textbbox((0,0), wrapped_point, font=body_font)[3] + 20

            elif block_type == "image_suggestion" and content_block.get("temp_image_path"):
                img_path = content_block["temp_image_path"]
                if os.path.exists(img_path):
                    try:
                        with Image.open(img_path) as slide_img:
                            slide_img.thumbnail((IMG_WIDTH // 2, IMG_HEIGHT - int(current_y) - PADDING))
                            paste_x = (IMG_WIDTH - slide_img.width) // 2
                            image.paste(slide_img, (paste_x, int(current_y)))
                            current_y += slide_img.height + 20
                    except Exception as e:
                        logger.error(f"Could not process image {img_path} for slide: {e}")

            current_y += 30 # Spacing between blocks

        # 4. Save the final image
        output_dir = os.path.join(Config.UPLOAD_FOLDER, 'temp_slide_renders')
        os.makedirs(output_dir, exist_ok=True)
        filename = f"slide_{uuid.uuid4()}.png"
        filepath = os.path.join(output_dir, filename)
        image.save(filepath, "PNG", optimize=True)
        
        logger.info(f"Rendered slide to {filepath}")
        return filepath

    except Exception as e:
        logger.error(f"Failed to render slide to image: {e}", exc_info=True)
        return None
    finally:
        if image:
            image.close()
