"""
Whisper transcription service using Infomaniak async batch API.

Flow: POST audio → receive batch_id → poll /results/{batch_id} until done.
"""
import asyncio
import os
from pathlib import Path
from typing import Optional
import logging

import aiohttp

from config import (
    INFOMANIAK_API_KEY,
    INFOMANIAK_STT_API_URL,
    INFOMANIAK_RESULTS_BASE_URL,
    INFOMANIAK_STT_MODEL,
    INFOMANIAK_STT_LANGUAGE,
)

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 2.0   # seconds between status checks
_POLL_TIMEOUT  = 300.0 # seconds before giving up


async def transcribe_audio(audio_path: str) -> dict:
    """
    Transcribe audio using Infomaniak Whisper batch API.

    Returns dict with keys: text, language, segments, duration.
    """
    audio_path_str = str(audio_path)

    await asyncio.sleep(0.1)  # let file flush to disk

    if not os.path.exists(audio_path_str):
        raise FileNotFoundError(f"Audio file not found: {audio_path_str}")

    if not INFOMANIAK_API_KEY:
        raise ValueError("INFOMANIAK_API_KEY is not set.")

    logger.info(f"Transcribing audio with Infomaniak Whisper: {audio_path_str}")

    # Authorization only — Content-Type is set automatically by aiohttp for multipart
    headers = {"Authorization": f"Bearer {INFOMANIAK_API_KEY}"}

    _mime_map = {".wav": "audio/wav", ".webm": "audio/webm", ".ogg": "audio/ogg",
                 ".mp3": "audio/mpeg", ".mp4": "audio/mp4", ".m4a": "audio/mp4"}
    audio_content_type = _mime_map.get(Path(audio_path_str).suffix.lower(), "audio/webm")

    form = aiohttp.FormData()
    form.add_field(
        "file",
        open(audio_path_str, "rb"),
        filename=Path(audio_path_str).name,
        content_type=audio_content_type,
    )
    form.add_field("model", INFOMANIAK_STT_MODEL)
    form.add_field("language", INFOMANIAK_STT_LANGUAGE)
    form.add_field("response_format", "verbose_json")

    async with aiohttp.ClientSession() as session:
        # Step 1: submit the job via multipart/form-data
        async with session.post(
            INFOMANIAK_STT_API_URL, headers=headers, data=form
        ) as response:
            if response.status != 200:
                error_text = await response.text()
                logger.error(f"Infomaniak STT submit error: {response.status} - {error_text}")
                raise Exception(f"Transcription submit error: {response.status} - {error_text}")
            submit_result = await response.json()

        batch_id = submit_result.get("batch_id")
        if not batch_id:
            raise Exception(f"No batch_id in Infomaniak STT response: {submit_result}")

        logger.info(f"Transcription job submitted, batch_id={batch_id}")

        # Step 2: poll until done
        # Status values: pending | processing | success | failed | cancelled
        results_url = f"{INFOMANIAK_RESULTS_BASE_URL}/{batch_id}"
        elapsed = 0.0
        while elapsed < _POLL_TIMEOUT:
            await asyncio.sleep(_POLL_INTERVAL)
            elapsed += _POLL_INTERVAL

            async with session.get(results_url, headers=headers) as poll_response:
                if poll_response.status != 200:
                    error_text = await poll_response.text()
                    logger.warning(f"Infomaniak STT poll error: {poll_response.status} - {error_text}")
                    continue
                poll_result = await poll_response.json()

            status = poll_result.get("status", "")
            logger.info(f"Transcription batch_id={batch_id} status={status} ({elapsed:.0f}s)")

            if status == "success":
                # data is a JSON string when response_format=verbose_json
                import json as _json
                raw = poll_result.get("data", "")
                result_data = _json.loads(raw) if isinstance(raw, str) else raw
                return {
                    "text": result_data.get("text", "").strip(),
                    "language": result_data.get("language", "unknown"),
                    "segments": result_data.get("segments", []),
                    "duration": result_data.get("duration", 0),
                }

            if status in ("failed", "cancelled"):
                raise Exception(f"Transcription job {status}: {poll_result}")

        raise TimeoutError(f"Transcription job {batch_id} did not complete within {_POLL_TIMEOUT}s")


async def transcribe_audio_simple(audio_path: str) -> str:
    """Simple wrapper that returns just the transcribed text."""
    result = await transcribe_audio(audio_path)
    return result["text"]


def get_model_info() -> dict:
    return {
        "provider": "Infomaniak",
        "model": INFOMANIAK_STT_MODEL,
        "api_configured": bool(INFOMANIAK_API_KEY),
        "language": INFOMANIAK_STT_LANGUAGE,
    }


async def preload_model():
    if not INFOMANIAK_API_KEY:
        logger.warning("INFOMANIAK_API_KEY is not set. Transcription will fail until configured.")
    else:
        logger.info("Infomaniak STT API key is configured")
