# qython/backend/services/avatar_service.py
"""
Avatar Generation Service using Google Gemini/Imagen
Migrated from HuggingFace Stable Diffusion to Google GenAI
"""

import logging
import os
import base64
from PIL import Image
from io import BytesIO
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("qython_logger")

from ..config import Config

# Directory for profile pictures
UPLOAD_FOLDER_PROFILE = Config.UPLOAD_FOLDER_PROFILE
if not os.path.exists(UPLOAD_FOLDER_PROFILE):
    os.makedirs(UPLOAD_FOLDER_PROFILE)

# --- Prompt Enhancement Templates ---
AVATAR_PROMPT_TEMPLATES = {
    "professional": {
        "base": "Professional doctor portrait, corporate headshot style, white medical coat, stethoscope, clean dark background, high quality, photorealistic, centered composition",
        "suffix": "Square format 1:1, suitable for circular crop, professional lighting"
    },
    "mythological": {
        "base": "Mythological Greek healer character, fantasy art style, toga or ancient robes, caduceus staff, ethereal lighting, magical atmosphere",
        "suffix": "Digital art, centered composition, dark background with subtle glow"
    },
    "historical": {
        "base": "Historical medical figure portrait, classical painting style, dignified pose, period-accurate clothing",
        "suffix": "Oil painting aesthetic, dramatic lighting, museum quality"
    },
    "fun": {
        "base": "Whimsical cartoon character in medical setting, friendly expression, Pixar-style 3D render, colorful, approachable",
        "suffix": "Clean background, centered, suitable for profile picture"
    },
    "default": {
        "base": "Professional medical avatar, clean and modern style",
        "suffix": "Square format, centered, suitable for circular crop"
    }
}

# Blocked terms for safety
BLOCKED_TERMS = [
    "nsfw", "nude", "naked", "explicit", "gore", "blood", "violent", 
    "sexual", "erotic", "pornographic", "death", "kill", "weapon"
]


def validate_prompt(prompt: str) -> tuple[bool, str]:
    """Validates prompt for safety and length."""
    if not prompt or len(prompt.strip()) < 3:
        return False, "Prompt muito curto"
    
    if len(prompt) > 500:
        return False, "Prompt muito longo (máximo 500 caracteres)"
    
    prompt_lower = prompt.lower()
    for term in BLOCKED_TERMS:
        if term in prompt_lower:
            return False, "Prompt contém termos não permitidos"
    
    return True, "OK"


def enhance_prompt(user_prompt: str, category: str = "default") -> str:
    """Enhances user prompt with professional template."""
    template = AVATAR_PROMPT_TEMPLATES.get(category, AVATAR_PROMPT_TEMPLATES["default"])
    
    enhanced = f"{template['base']}. User customization: {user_prompt}. {template['suffix']}"
    
    logger.debug(f"Enhanced prompt: {enhanced[:100]}...")
    return enhanced


def generate_avatar_from_prompt(prompt: str, user, category: str = "default") -> str:
    """
    Generates an avatar from a text prompt using Google GenAI.
    
    Args:
        prompt: User's description of desired avatar
        user: User object (for ID)
        category: Avatar category (professional, mythological, historical, fun)
    
    Returns:
        Filename of the saved avatar image
    """
    try:
        # Validate prompt
        is_valid, error_msg = validate_prompt(prompt)
        if not is_valid:
            raise ValueError(error_msg)
        
        # Enhance prompt with template
        enhanced_prompt = enhance_prompt(prompt, category)
        
        # Import Config and Google GenAI SDK
        from ..config import Config
        from google import genai
        from google.genai import types
        
        # Validate API key
        if not Config.GEMINI_API_KEY:
            raise Exception("GEMINI_API_KEY não configurada")
        
        # Initialize client (uses same pattern as llm_services.py)
        client = genai.Client(api_key=Config.GEMINI_API_KEY)
        
        # Use IMAGE_GEN_MODEL from config (required in .env)
        if not Config.IMAGE_GEN_MODEL:
            raise Exception("IMAGE_GEN_MODEL não configurada no .env")
        
        model = Config.IMAGE_GEN_MODEL
        
        logger.info(f"Gerando avatar com {model}. Prompt: {prompt[:50]}...")
        
        # Retry logic for intermittent failures
        max_retries = 3
        last_error = None
        
        for attempt in range(max_retries):
            try:
                # Generate image
                response = client.models.generate_content(
                    model=model,
                    contents=enhanced_prompt,
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE", "TEXT"],
                    )
                )
                
                # Log response structure for debugging
                if response.candidates:
                    parts_info = []
                    for i, part in enumerate(response.candidates[0].content.parts):
                        if hasattr(part, 'text') and part.text:
                            parts_info.append(f"part[{i}]=text({len(part.text)} chars)")
                        elif hasattr(part, 'inline_data') and part.inline_data:
                            parts_info.append(f"part[{i}]=image({part.inline_data.mime_type})")
                        else:
                            parts_info.append(f"part[{i}]=unknown")
                    logger.debug(f"Response parts: {', '.join(parts_info)}")
                
                # Extract image from response
                image_data = None
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data:
                        image_data = part.inline_data.data
                        break
                
                if image_data:
                    logger.info(f"Imagem gerada com sucesso na tentativa {attempt + 1}")
                    break
                else:
                    # Check if there's text explaining why no image
                    text_parts = [p.text for p in response.candidates[0].content.parts if hasattr(p, 'text') and p.text]
                    if text_parts:
                        logger.warning(f"Tentativa {attempt + 1}: API retornou texto ao invés de imagem: {text_parts[0][:100]}...")
                    else:
                        logger.warning(f"Tentativa {attempt + 1}: Resposta sem imagem ou texto")
                    last_error = Exception("Modelo não gerou imagem")
                    
            except Exception as retry_error:
                logger.warning(f"Tentativa {attempt + 1} falhou: {str(retry_error)}")
                last_error = retry_error
            
            # Wait before retry (exponential backoff)
            if attempt < max_retries - 1:
                import time
                time.sleep(1 * (attempt + 1))
        
        if not image_data:
            raise Exception(f"Falha após {max_retries} tentativas: {str(last_error)}")
        
        # Decode and save image
        image_bytes = base64.b64decode(image_data) if isinstance(image_data, str) else image_data
        image = Image.open(BytesIO(image_bytes))
        
        # Resize to standard avatar size (512x512)
        image = image.resize((512, 512), Image.Resampling.LANCZOS)
        
        # Ensure directory is writable
        if not os.access(UPLOAD_FOLDER_PROFILE, os.W_OK):
            raise Exception(f"Sem permissão de escrita em {UPLOAD_FOLDER_PROFILE}")
        
        # Generate unique filename
        user_id = user.id if hasattr(user, 'id') else 'temp'
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        filename = f"{user_id}_{timestamp}_avatar.png"
        filepath = os.path.join(UPLOAD_FOLDER_PROFILE, filename)
        
        # Save image
        image.save(filepath, "PNG")
        logger.info(f"Avatar salvo: {filename}")
        
        return filename
        
    except Exception as e:
        logger.error(f"Erro ao gerar avatar: {str(e)}")
        raise


logger.info("Avatar Service (Google GenAI) inicializado")
