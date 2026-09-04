# qython/backend/services/stock_image_service.py

import os
import uuid
import logging
from typing import Optional
from io import BytesIO
from PIL import Image
import time

from ..config import Config
from .llm_services import client # Reuse the existing Gemini client from llm_services
from google.genai import errors as genai_errors

logger = logging.getLogger("qython_logger")

TEMP_IMAGE_FOLDER = os.path.join(Config.UPLOAD_FOLDER, 'temp_images')
os.makedirs(TEMP_IMAGE_FOLDER, exist_ok=True)

def generate_image_from_prompt(prompt: str) -> Optional[str]:
    """
    Generates an image using the Gemini API with an intelligent retry mechanism.
    If the first attempt fails, it modifies the prompt and tries again.
    """
    logger.info(f"Attempting to generate AI image with initial prompt: '{prompt}'")
    
    # Define different prompt strategies for retries
    prompt_strategies = [
        (
            "Primary prompt for medical imagery: "
            "Generate a high-quality, professional image for a medical school presentation. "
            "The style must be clear, informative, and anatomically correct. "
            "If the request is for a diagram or chart, it must be accurate and easy to understand. "
            "If it is a scene, it should be depicted professionally. "
            f"Content to generate: '{prompt}'"
        ),
        (
            "Secondary prompt (illustration focus): "
            "Create an educational illustration or schematic for a medical textbook. "
            "The style must be clean, professional, and suitable for teaching. "
            "Focus on clarity and avoid overly graphic or realistic details of procedures. "
            f"Illustrate the following concept: '{prompt}'"
        ),
        (
            "Tertiary prompt (abstract focus): "
            "Generate a symbolic or abstract image representing a medical concept for an educational slide. "
            "The image should be professional and conceptual, not a literal or graphic depiction. "
            f"Represent the following idea visually: '{prompt}'"
        )
    ]

    for i, enhanced_prompt in enumerate(prompt_strategies):
        attempt = i + 1
        logger.debug(f"Image generation attempt {attempt} of {len(prompt_strategies)}.")
        
        try:
            response = client.models.generate_content(
                model=Config.IMAGE_GEN_MODEL,
                contents=[enhanced_prompt],
            )

            # Check for valid image data in the response
            if (response.candidates and 
                response.candidates[0].content and 
                response.candidates[0].content.parts and
                response.candidates[0].content.parts[0].inline_data and
                response.candidates[0].content.parts[0].inline_data.data):

                image_data = response.candidates[0].content.parts[0].inline_data.data
                image = Image.open(BytesIO(image_data))
                temp_filename = f"{uuid.uuid4()}.png"
                temp_filepath = os.path.join(TEMP_IMAGE_FOLDER, temp_filename)
                image.save(temp_filepath)
                
                logger.info(f"AI image successfully generated on attempt {attempt} and saved to: {temp_filepath}")
                return temp_filepath # Success! Exit the function.

            # If we are here, the generation failed. Log the reason safely.
            finish_reason = 'UNKNOWN'
            if response: # Check if response object exists
                if hasattr(response, 'prompt_feedback') and response.prompt_feedback and response.prompt_feedback.block_reason:
                    finish_reason = response.prompt_feedback.block_reason.name
                elif response.candidates and hasattr(response.candidates[0], 'finish_reason') and response.candidates[0].finish_reason:
                    finish_reason = response.candidates[0].finish_reason.name
            else:
                finish_reason = 'NO_RESPONSE_FROM_API'

            logger.warning(f"Attempt {attempt} failed for prompt: '{prompt}'. Finish Reason: {finish_reason}")

        except genai_errors.APIError as e:
            logger.error(f"Google GenAI APIError on attempt {attempt} for prompt '{prompt}'. Message: {e.message}")
        except Exception as e:
            logger.error(f"An unexpected error occurred on attempt {attempt} while generating image. Error: {e}", exc_info=True)

        # If this wasn't the last attempt, wait a moment before retrying
        if attempt < len(prompt_strategies):
            logger.info("Waiting 1 second before retrying with a modified prompt...")
            time.sleep(1) # A short, fixed sleep is fine here as we are changing the prompt

    # If the loop finishes without returning, all attempts have failed.
    logger.error(f"All {len(prompt_strategies)} attempts to generate image for prompt '{prompt}' have failed.")
    return None
