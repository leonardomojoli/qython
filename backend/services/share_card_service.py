# qython/backend/services/share_card_service.py
"""
Share Card Generation Service
Creates professional shareable images for quiz results using Pillow.
Cards can be shared on LinkedIn and other social platforms.
"""

import io
import os
import logging
from typing import Optional
from PIL import Image, ImageDraw, ImageFont

from ..config import Config  # noqa: F401  (kept for parity with other services)

logger = logging.getLogger("qython_logger")

# Paths
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(BACKEND_DIR, "static", "assets")
LOGO_PATH = os.path.join(ASSETS_DIR, "qython-imagotipo.png")

# Card dimensions (optimized for LinkedIn)
CARD_WIDTH = 1200
CARD_HEIGHT = 630

# Colors (Deep Tech theme)
BG_GRADIENT_START = (18, 18, 24)  # Dark purple-black
BG_GRADIENT_END = (30, 20, 50)    # Slight purple tint
ACCENT_COLOR = (187, 134, 252)    # Purple accent
TEXT_PRIMARY = (255, 255, 255)    # White
TEXT_SECONDARY = (180, 180, 200)  # Light gray


def _create_gradient_background(width: int, height: int) -> Image.Image:
    """Create a gradient background image"""
    img = Image.new('RGB', (width, height))
    
    for y in range(height):
        ratio = y / height
        r = int(BG_GRADIENT_START[0] + (BG_GRADIENT_END[0] - BG_GRADIENT_START[0]) * ratio)
        g = int(BG_GRADIENT_START[1] + (BG_GRADIENT_END[1] - BG_GRADIENT_START[1]) * ratio)
        b = int(BG_GRADIENT_START[2] + (BG_GRADIENT_END[2] - BG_GRADIENT_START[2]) * ratio)
        
        for x in range(width):
            img.putpixel((x, y), (r, g, b))
    
    return img


def _get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Get a font, falling back to default if custom fonts not available"""
    try:
        # Try to use a modern font if available
        font_name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
        return ImageFont.truetype(font_name, size)
    except:
        try:
            # Fallback to Arial on Windows
            font_name = "arialbd.ttf" if bold else "arial.ttf"
            return ImageFont.truetype(font_name, size)
        except:
            # Ultimate fallback
            return ImageFont.load_default()


def generate_quiz_result_card(
    user_name: str,
    exam_name: str,
    exam_flag: str,
    score: int,
    rank_position: Optional[int] = None,
    percentile: Optional[int] = None,
    season_name: Optional[str] = None
) -> bytes:
    """
    Generate a shareable card image for quiz results.
    
    Returns PNG image as bytes.
    """
    # Create gradient background
    img = _create_gradient_background(CARD_WIDTH, CARD_HEIGHT)
    draw = ImageDraw.Draw(img)
    
    # Add decorative accent line at top
    draw.rectangle([(0, 0), (CARD_WIDTH, 8)], fill=ACCENT_COLOR)
    
    # Load and paste logo
    try:
        logo = Image.open(LOGO_PATH)
        logo_height = 60
        logo_ratio = logo_height / logo.height
        logo_width = int(logo.width * logo_ratio)
        logo = logo.resize((logo_width, logo_height), Image.Resampling.LANCZOS)
        
        # Convert to RGBA if needed for transparency
        if logo.mode != 'RGBA':
            logo = logo.convert('RGBA')
        
        # Paste logo at top right
        logo_x = CARD_WIDTH - logo_width - 50
        logo_y = 40
        img.paste(logo, (logo_x, logo_y), logo)
    except Exception as e:
        logger.warning(f"Could not load logo: {e}")
    
    # Fonts
    font_title = _get_font(48, bold=True)
    font_large = _get_font(72, bold=True)
    font_medium = _get_font(32)
    font_small = _get_font(24)
    
    # Draw exam name with flag
    exam_text = f"{exam_flag} {exam_name}"
    draw.text((60, 50), exam_text, fill=TEXT_PRIMARY, font=font_title)
    
    # Season badge (if provided)
    if season_name:
        season_y = 120
        draw.text((60, season_y), f"📅 {season_name}", fill=TEXT_SECONDARY, font=font_small)
    
    # Main score section
    score_y = 200
    draw.text((60, score_y), "PONTUAÇÃO", fill=TEXT_SECONDARY, font=font_small)
    
    # Large score number with accent color
    score_text = str(score)
    draw.text((60, score_y + 30), score_text, fill=ACCENT_COLOR, font=font_large)
    draw.text((60 + len(score_text) * 45, score_y + 60), "pts", fill=TEXT_SECONDARY, font=font_medium)
    
    # Rank and percentile section
    if rank_position or percentile:
        stats_y = 350
        
        if rank_position:
            draw.text((60, stats_y), "POSIÇÃO NO RANKING", fill=TEXT_SECONDARY, font=font_small)
            rank_text = f"#{rank_position}"
            draw.text((60, stats_y + 30), rank_text, fill=TEXT_PRIMARY, font=font_title)
        
        if percentile:
            percentile_x = 350 if rank_position else 60
            draw.text((percentile_x, stats_y), "PERCENTIL", fill=TEXT_SECONDARY, font=font_small)
            
            # Highlight if top percentile
            percentile_color = ACCENT_COLOR if percentile <= 10 else TEXT_PRIMARY
            percentile_text = f"Top {percentile}%"
            draw.text((percentile_x, stats_y + 30), percentile_text, fill=percentile_color, font=font_title)
    
    # User attribution
    user_y = CARD_HEIGHT - 120
    draw.text((60, user_y), "Resultado de", fill=TEXT_SECONDARY, font=font_small)
    draw.text((60, user_y + 30), user_name, fill=TEXT_PRIMARY, font=font_medium)
    
    # Qython branding at bottom
    brand_text = "qython.ai"
    draw.text((CARD_WIDTH - 180, CARD_HEIGHT - 50), brand_text, fill=TEXT_SECONDARY, font=font_small)
    
    # Add subtle border
    draw.rectangle(
        [(0, 0), (CARD_WIDTH - 1, CARD_HEIGHT - 1)], 
        outline=(*ACCENT_COLOR, 100), 
        width=2
    )
    
    # Convert to bytes
    buffer = io.BytesIO()
    img.save(buffer, format='PNG', quality=95)
    buffer.seek(0)
    
    return buffer.getvalue()


def generate_achievement_card(
    user_name: str,
    achievement_title: str,
    achievement_description: str
) -> bytes:
    """
    Generate a shareable card for achievements/milestones.
    
    Returns PNG image as bytes.
    """
    # Create gradient background
    img = _create_gradient_background(CARD_WIDTH, CARD_HEIGHT)
    draw = ImageDraw.Draw(img)
    
    # Add decorative accent line at top
    draw.rectangle([(0, 0), (CARD_WIDTH, 8)], fill=ACCENT_COLOR)
    
    # Load and paste logo
    try:
        logo = Image.open(LOGO_PATH)
        logo_height = 60
        logo_ratio = logo_height / logo.height
        logo_width = int(logo.width * logo_ratio)
        logo = logo.resize((logo_width, logo_height), Image.Resampling.LANCZOS)
        
        if logo.mode != 'RGBA':
            logo = logo.convert('RGBA')
        
        logo_x = CARD_WIDTH - logo_width - 50
        logo_y = 40
        img.paste(logo, (logo_x, logo_y), logo)
    except Exception as e:
        logger.warning(f"Could not load logo: {e}")
    
    # Fonts
    font_title = _get_font(48, bold=True)
    font_medium = _get_font(28)
    font_small = _get_font(24)
    
    # Trophy icon and title
    draw.text((60, 180), "🏆", fill=TEXT_PRIMARY, font=font_title)
    draw.text((130, 180), achievement_title, fill=ACCENT_COLOR, font=font_title)
    
    # Description
    draw.text((60, 280), achievement_description, fill=TEXT_SECONDARY, font=font_medium)
    
    # User attribution
    user_y = CARD_HEIGHT - 120
    draw.text((60, user_y), "Conquistado por", fill=TEXT_SECONDARY, font=font_small)
    draw.text((60, user_y + 30), user_name, fill=TEXT_PRIMARY, font=font_medium)
    
    # Qython branding
    brand_text = "qython.ai"
    draw.text((CARD_WIDTH - 180, CARD_HEIGHT - 50), brand_text, fill=TEXT_SECONDARY, font=font_small)
    
    # Convert to bytes
    buffer = io.BytesIO()
    img.save(buffer, format='PNG', quality=95)
    buffer.seek(0)
    
    return buffer.getvalue()
