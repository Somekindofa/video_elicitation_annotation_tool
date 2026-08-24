"""
Task Detection Service

Automatically detects the main task being described in an elicitation transcript.
Uses LLM to analyze if the transcript describes a clear, performative task.
Conservative by design - only assigns task names for explicit, actionable descriptions.

Returns: detected_task (string or null), confidence (0-1)
"""

import asyncio
import json
from typing import Optional
import aiohttp
from config import INFOMANIAK_API_KEY, INFOMANIAK_LLM_API_URL, INFOMANIAK_LLM_MODEL

TASK_DETECTION_SYSTEM_PROMPT = """Tu es un extracteur de tâches artisanales ULTRA-CONSERVATEUR.

RÈGLE ABSOLUE : Tu dois retourner DETECTED_TASK: null dans la GRANDE MAJORITÉ des cas.
Ne retourne un nom de tâche QUE si toutes ces conditions sont réunies simultanément :
1. La description est entièrement et uniquement focalisée sur UNE SEULE technique nommée
2. La technique est explicitement nommée ou très clairement identifiable avec un terme du métier
3. Il n'y a AUCUNE ambiguïté sur le nom de la tâche
4. Ce n'est PAS : préparation, sécurité, positionnement, description générale, histoire, explication contextuelle, réglage d'outil, observation

Si la description mélange plusieurs actions, parle de réglage/setup, ou si tu as le moindre doute → DETECTED_TASK: null

EXEMPLES → null (ne pas détecter de tâche) :
- Allumer/régler un outil (chalumeau, flamme, four) → null
- Mettre des équipements de protection → null
- Se positionner, vérifier la sécurité → null
- Décrire l'histoire ou le contexte du métier → null
- Décrire plusieurs étapes différentes d'un processus → null
- Régler l'intensité, la température, la couleur d'une flamme → null
- "J'allume la flamme et je règle son intensité pour qu'elle devienne bleue" → null
- "Je chauffe, je martèle, puis je trempe" (multi-étapes) → null

EXEMPLES → tâche (retourner le nom UNIQUEMENT si c'est évident) :
- "Je souffle dans la canne pour former la bulle de verre" → soufflage
- "Je polis les arêtes avec du papier émeri" → polissage
- "Je montre la technique du pointillé" → pointillé

Format de réponse OBLIGATOIRE (pas d'autre texte) :
DETECTED_TASK: [nom_court ou null]
CONFIDENCE: [0.0-1.0]
REASONING: [une phrase]"""

_LANGUAGE_NAMES = {"fr": "français", "en": "English", "el": "Ελληνικά"}


def _language_instruction(language: Optional[str]) -> str:
    """Instruct the LLM to write REASONING in the session's spoken language
    (what the interviewee said), not the interviewer's UI language."""
    name = _LANGUAGE_NAMES.get((language or "").lower())
    if name:
        return f"\n\nRépondez dans la langue suivante : {name}."
    return "\n\nRépondez dans la même langue que la transcription."


async def detect_task(transcription: str, craft: str = "jewelry", language: Optional[str] = None) -> dict:
    """
    Detect the main task from an elicitation transcript.

    Args:
        transcription: The transcribed text from the elicitation
        craft: The craft domain (jewelry, glassblowing, etc.)
        language: Session language detected by Whisper (e.g. 'fr', 'en', 'el') —
            REASONING is written in it.

    Returns:
        {
            "detected_task": str or None,
            "confidence": float (0-1),
            "reasoning": str
        }
    """
    if not transcription or not transcription.strip():
        return {
            "detected_task": None,
            "confidence": 0.0,
            "reasoning": "Transcription vide",
        }

    headers = {
        "Authorization": f"Bearer {INFOMANIAK_API_KEY}",
        "Content-Type": "application/json",
    }

    user_prompt = f'Transcript ({craft}): "{transcription}"\n\nWhat is the task? (null in most cases)'

    payload = {
        "model": INFOMANIAK_LLM_MODEL,
        "messages": [
            {"role": "system", "content": TASK_DETECTION_SYSTEM_PROMPT + _language_instruction(language)},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 128,
        "temperature": 0,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                INFOMANIAK_LLM_API_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(
                        f"Infomaniak API error {response.status}: {error_text}"
                    )

                result = await response.json()
                response_text = result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

                # Parse key-value output format
                parsed = _parse_task_output(response_text)
                return parsed

    except asyncio.TimeoutError:
        return {
            "detected_task": None,
            "confidence": 0.0,
            "reasoning": "Timeout lors de la détection",
        }
    except Exception as e:
        return {
            "detected_task": None,
            "confidence": 0.0,
            "reasoning": f"Erreur: {str(e)}",
        }


def _parse_task_output(response_text: str) -> dict:
    """
    Parse the key-value output format from the LLM.

    Expected format:
    DETECTED_TASK: [task_name or null]
    CONFIDENCE: [0.0-1.0]
    REASONING: [explanation]
    """
    result = {"detected_task": None, "confidence": 0.0, "reasoning": ""}

    lines = response_text.split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue

        if line.startswith("DETECTED_TASK:"):
            value = line.replace("DETECTED_TASK:", "").strip()
            if value.lower() != "null":
                result["detected_task"] = value
            continue

        if line.startswith("CONFIDENCE:"):
            value = line.replace("CONFIDENCE:", "").strip()
            try:
                result["confidence"] = float(value)
            except ValueError:
                result["confidence"] = 0.0
            continue

        if line.startswith("REASONING:"):
            value = line.replace("REASONING:", "").strip()
            result["reasoning"] = value
            continue

    return result
