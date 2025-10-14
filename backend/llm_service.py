"""
LLM service for generating extended transcripts using Fireworks.ai
"""
import logging
import aiohttp
from typing import Optional

from config import (
    FIREWORKS_API_KEY,
    FIREWORKS_LLM_API_URL,
    FIREWORKS_LLM_MODEL,
    FIREWORKS_LLM_MAX_TOKENS,
    FIREWORKS_LLM_TEMPERATURE
)

logger = logging.getLogger(__name__)

# System prompt for glassblowing context
GLASSBLOWING_SYSTEM_PROMPT = """You are an expert in glassblowing technique analysis. Your task is to extend transcripts of glassblowing demonstrations with relevant contextual information.

Based on the provided transcript, add:
1. Relevant gesture information (hand positions, body movements)
2. Common mistakes while performing the described action
3. Expert tips for proper technique

Guidelines:
- Keep the extended version conversational and seamless
- Stay closely aligned with the transcript's context
- Do not add excessive or irrelevant information
- Be specific about tools, movements, and technique
- Mention body position, force application, and precision when relevant
- Keep the total output concise and focused

The task domain is: Glassblowing"""


async def generate_extended_transcript(transcription: str) -> Optional[str]:
    """
    Generate extended transcript using Fireworks.ai LLM API
    
    Args:
        transcription: The original Whisper transcription
        
    Returns:
        Extended transcript with gesture info, common mistakes, and expert tips
        or None if generation fails
    """
    if not FIREWORKS_API_KEY:
        logger.error("FIREWORKS_API_KEY not set in environment")
        return None
    
    if not transcription or not transcription.strip():
        logger.warning("Empty transcription provided")
        return None
    
    try:
        # Construct the prompt
        prompt = f"""{GLASSBLOWING_SYSTEM_PROMPT}

Original Transcript:
"{transcription}"

Extended Transcript (add gesture details, common mistakes, and expert tips):"""
        
        # Prepare API request
        headers = {
            "Authorization": f"Bearer {FIREWORKS_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": FIREWORKS_LLM_MODEL,
            "prompt": prompt,
            "max_tokens": FIREWORKS_LLM_MAX_TOKENS,
            "temperature": FIREWORKS_LLM_TEMPERATURE,
            "top_p": 0.9,
            "frequency_penalty": 0.5,
            "presence_penalty": 0.3,
            "stop": ["\n\nOriginal Transcript:", "\n\n---"]
        }
        
        logger.info(f"Calling Fireworks.ai LLM API for extended transcript generation...")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                FIREWORKS_LLM_API_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(f"LLM API error (status {response.status}): {error_text}")
                    return None
                
                result = await response.json()
                
                # Extract the generated text
                if "choices" in result and len(result["choices"]) > 0:
                    extended_text = result["choices"][0].get("text", "").strip()
                    
                    if extended_text:
                        logger.info("Extended transcript generated successfully")
                        return extended_text
                    else:
                        logger.warning("LLM returned empty text")
                        return None
                else:
                    logger.error(f"Unexpected LLM API response format: {result}")
                    return None
                    
    except aiohttp.ClientError as e:
        logger.error(f"Network error calling LLM API: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error generating extended transcript: {e}")
        return None


async def test_llm_connection() -> bool:
    """
    Test the LLM API connection
    
    Returns:
        True if connection successful, False otherwise
    """
    test_transcript = "The glassblower rotates the pipe while heating the glass."
    result = await generate_extended_transcript(test_transcript)
    return result is not None
