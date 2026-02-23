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
from config import (
    FIREWORKS_API_KEY,
    FIREWORKS_LLM_MODEL,
    FIREWORKS_LLM_MAX_TOKENS,
    FIREWORKS_LLM_TEMPERATURE,
)

TASK_DETECTION_SYSTEM_PROMPT = """Tu es un expert en analyse de descriptions de tâches artisanales.

Ton rôle est d'identifier UNIQUEMENT le nom concis de la tâche PRINCIPALE si et seulement si:
1. La description EST performative (décrit une action/technique concrète qui est réalisée)
2. La tâche est claire et explicite (pas d'ambiguïté)
3. Ce n'est pas une description générale, historique ou conceptuelle
4. La tâche est identifiable par un NOM COURT (2-4 mots maximum)

Si la description est:
- Trop vague ou ambiguë
- Descriptive mais non-performative (explication générale, histoire, contexte)
- Une combinaison de plusieurs tâches
- Purement conceptuelle ou théorique

RÉPONDS: DETECTED_TASK: null
CONFIDENCE: 0.0
REASONING: [courte explication]

Si tu identifies une tâche claire et performative:

RÉPONDS UNIQUEMENT:
DETECTED_TASK: [nom_de_la_tâche_court]
CONFIDENCE: [0.0-1.0]
REASONING: [brève justification]

EXEMPLES:
"L'expert explique comment on polit les arêtes avec du papier émeri après la soudure" → soudure / polissage
"Je vous montre la technique du pointillé qui demande une grande concentration" → pointillé
"Historiquement, la joaillerie vient de l'Égypte ancienne où..." → null (trop conceptuel)
"Voilà, on doit bien chercher l'équilibre du feu pour avoir une belle teinte" → chauffage / fusion (si explicite)
"C'est un peu compliqué de différencier les types de pierres précieuses" → null (trop vague)

Format obligatoire de réponse - pas de texte avant ou après:
DETECTED_TASK: [résultat]
CONFIDENCE: [nombre]
REASONING: [explication]
"""


async def detect_task(transcription: str, craft: str = "jewelry") -> dict:
    """
    Detect the main task from an elicitation transcript.

    Args:
        transcription: The transcribed text from the elicitation
        craft: The craft domain (jewelry, glassblowing, etc.)

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
        "Authorization": f"Bearer {FIREWORKS_API_KEY}",
        "Content-Type": "application/json",
    }

    user_prompt = f"""Analyse cette description d'une tâche artisanale ({craft}):

"{transcription}"

Détermine si c'est une description performative d'une tâche concrète. Si oui, donne le nom court de la tâche."""

    payload = {
        "model": FIREWORKS_LLM_MODEL,
        "prompt": f"{TASK_DETECTION_SYSTEM_PROMPT}\n\nUser: {user_prompt}\n\nAssistant:",
        "max_tokens": 256,
        "temperature": 1,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.fireworks.ai/inference/v1/completions",
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(
                        f"Fireworks API error {response.status}: {error_text}"
                    )

                result = await response.json()
                response_text = result.get("choices", [{}])[0].get("text", "").strip()

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
