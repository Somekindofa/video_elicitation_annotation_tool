"""
Whisper transcription service using Fireworks.ai API
"""
import os
import asyncio
from typing import Optional
from pathlib import Path
import logging

import aiohttp

from config import (
    FIREWORKS_API_KEY, 
    FIREWORKS_API_URL, 
    FIREWORKS_MODEL,
    FIREWORKS_TEMPERATURE,
    FIREWORKS_VAD_MODEL
)

logger = logging.getLogger(__name__)


async def transcribe_audio(audio_path: str) -> dict:
    """
    Transcribe audio file using Fireworks.ai Whisper API
    
    Args:
        audio_path: Path to audio file
        
    Returns:
        dict with transcription results including text, language, segments
    """
    try:
        # Ensure file exists (convert Path to string if needed)
        audio_path_str = str(audio_path)
        
        # Wait a moment for file to be fully written
        await asyncio.sleep(0.1)
        
        # More detailed logging
        logger.info(f"Checking file: {audio_path_str}")
        logger.info(f"Path exists: {os.path.exists(audio_path_str)}")
        
        if not os.path.exists(audio_path_str):
            logger.error(f"File not found: {audio_path_str}")
            raise FileNotFoundError(f"Audio file not found: {audio_path_str}")
        
        # Check API key
        if not FIREWORKS_API_KEY:
            raise ValueError("FIREWORKS_API_KEY is not set. Please set it in config.py or as an environment variable.")
        
        logger.info(f"Transcribing audio with Fireworks.ai: {audio_path_str}")
        
        # Prepare the request
        async with aiohttp.ClientSession() as session:
            with open(audio_path_str, 'rb') as audio_file:
                # Create form data
                form = aiohttp.FormData()
                form.add_field('file', audio_file, filename=os.path.basename(audio_path_str))
                form.add_field('model', FIREWORKS_MODEL)
                form.add_field('temperature', FIREWORKS_TEMPERATURE)
                form.add_field('vad_model', FIREWORKS_VAD_MODEL)
                
                # Make API request
                headers = {
                    "Authorization": f"Bearer {FIREWORKS_API_KEY}"
                }
                
                async with session.post(
                    FIREWORKS_API_URL,
                    headers=headers,
                    data=form
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Fireworks.ai API error: {response.status} - {error_text}")
                        raise Exception(f"Transcription API error: {response.status} - {error_text}")
                    
                    result = await response.json()
        
        # Extract transcription text from Fireworks.ai response
        transcription_text = result.get("text", "").strip()
        language = result.get("language", "unknown")
        
        logger.info(f"Transcription completed. Language: {language}, Length: {len(transcription_text)} chars")
        
        return {
            "text": transcription_text,
            "language": language,
            "segments": result.get("segments", []),
            "duration": result.get("duration", 0)
        }
        
    except Exception as e:
        logger.error(f"Transcription error: {str(e)}")
        raise


async def transcribe_audio_simple(audio_path: str) -> str:
    """
    Simple transcription that returns just the text
    
    Args:
        audio_path: Path to audio file
        
    Returns:
        Transcribed text
    """
    result = await transcribe_audio(audio_path)
    return result["text"]


def get_model_info() -> dict:
    """Get information about the Fireworks.ai Whisper API configuration"""
    return {
        "provider": "Fireworks.ai",
        "model": FIREWORKS_MODEL,
        "api_configured": bool(FIREWORKS_API_KEY),
        "temperature": FIREWORKS_TEMPERATURE,
        "vad_model": FIREWORKS_VAD_MODEL
    }


async def preload_model():
    """Check Fireworks.ai API configuration"""
    try:
        if not FIREWORKS_API_KEY:
            logger.warning("FIREWORKS_API_KEY is not set. Transcription will fail until configured.")
        else:
            logger.info("Fireworks.ai API key is configured")
    except Exception as e:
        logger.error(f"Failed to check API configuration: {str(e)}")
