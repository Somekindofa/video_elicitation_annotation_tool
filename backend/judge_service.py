"""
Judge service for determining whether an elicitation needs AI Review.
Uses LLM to analyze transcription completeness and make intelligent decisions.
"""

import logging
from typing import Any, Dict, Optional

import aiohttp

from config import INFOMANIAK_API_KEY, INFOMANIAK_LLM_API_URL, INFOMANIAK_LLM_MODEL

logger = logging.getLogger(__name__)

_LANGUAGE_NAMES = {"fr": "français", "en": "English", "el": "Ελληνικά"}


def _language_instruction(language: Optional[str]) -> str:
    """Instruct the LLM to write its analysis in the session's spoken language
    (what the interviewee said), not the interviewer's UI language."""
    name = _LANGUAGE_NAMES.get((language or "").lower())
    if name:
        return f"\n\nRépondez dans la langue suivante : {name}."
    return "\n\nRépondez dans la même langue que la transcription."


def _parse_keyed_judge(text: str) -> Dict[str, Any]:
    lines = [ln.strip() for ln in text.splitlines() if ":" in ln]
    kv: Dict[str, str] = {}
    for ln in lines:
        key, val = ln.split(":", 1)
        kv[key.strip().upper()] = val.strip()

    def _split_list(key: str) -> list[str]:
        raw = kv.get(key, "")
        if not raw:
            return []
        return [v.strip() for v in raw.split("|") if v.strip()]

    def _to_bool(key: str) -> bool:
        return kv.get(key, "").lower() == "true"

    result = {
        "needs_review": _to_bool("NEEDS_REVIEW"),
        "reasoning": kv.get("REASONING", "Judge analysis complete"),
        "missing_elements": _split_list("MISSING_ELEMENTS"),
        "strengths": _split_list("STRENGTHS"),
    }

    return result


# System prompt for judging elicitation completeness
JUDGE_SYSTEM_PROMPT = """Vous êtes un Juge IA évaluant si une élicitation d'expert artisan nécessite une analyse AI approfondie.

Votre rôle: Déterminer rapidement si l'élicitation fournie est déjà SUFFISAMMENT COMPLÈTE pour l'apprentissage, ou si elle NÉCESSITE UNE ANALYSE APPROFONDIE pour identifier les lacunes.

## Critères de Complétude

Une élicitation est SUFFISAMMENT COMPLÈTE si elle:
1. Décrit clairement COMMENT exécuter la technique (noms d'outils, positionnement, étapes)
2. Explique COMMENT ÉVALUER le succès (indices visuels, sensations, résultats)
3. Couvre les ERREURS COURANTES et comment les éviter
4. Inclut des SENSATIONS spécifiques (ce qu'on voit/ressent/entend)
5. Utilise une TERMINOLOGIE SPÉCIFIQUE au domaine

Une élicitation NÉCESSITE UNE ANALYSE si elle:
- Est trop courte ou trop vague (< 30 mots pertinents)
- Manque des éléments clés d'au moins UNE dimension (HOW/EVAL/FEEDBACK)
- Utilise un langage générique sans détails techniques
- Omet les sensations critiques pour l'apprentissage
- Saute des étapes importantes

## Règles Critiques

1. Soyez PRAGMATIQUE: une élicitation imparfaite mais fonctionnelle n'a pas besoin d'analyse
2. Ne soyez pas EXCESSIF: l'expertise du formateur a de la valeur même sans perfection
3. Priorisez les SENSATIONS manquantes comme signal fort qu'une analyse est nécessaire
4. Si vous êtes INCERTAIN, acceptez que l'analyse soit utile
5. needs_review = true si au moins 2 éléments manquent OU si aucune sensation n'est mentionnée

## Format de réponse

Répondez UNIQUEMENT sous forme de lignes "CLE: valeur". NE PRODUISEZ PAS de JSON.
Listes séparées par " | ". Booléens: true/false.

CLES ATTENDUES (dans cet ordre) :
NEEDS_REVIEW
REASONING
MISSING_ELEMENTS
STRENGTHS

Analysez maintenant cette élicitation:"""


async def judge_elicitation(
    transcription: str, craft: Optional[str] = None, language: Optional[str] = None
) -> Dict[str, Any]:
    """
    Judge whether an elicitation needs AI Review based on completeness signals.

    Args:
        transcription: The elicitation transcript to judge
        craft: Optional craft/domain context (e.g., 'glassblowing', 'jewelry')
        language: Session language detected by Whisper (e.g. 'fr', 'en', 'el') —
            the judge's reasoning/missing_elements/strengths are written in it.

    Returns:
        Dictionary with judge decision:
        {
            "needs_review": True/False,
            "confidence": 0.0-1.0,
            "reasoning": "...",
            "missing_elements": [...],
            "strengths": [...]
        }

    Raises:
        Exception: If LLM API call fails or returns invalid response
    """
    if not INFOMANIAK_API_KEY:
        logger.error("INFOMANIAK_API_KEY not found in environment")
        raise Exception("Infomaniak API key not configured")

    # Very short transcriptions definitely need review
    if len(transcription.strip()) < 20:
        logger.info("Transcription too short, needs review")
        return {
            "needs_review": True,
            "reasoning": "Transcription too short to be sufficiently complete",
            "missing_elements": ["all dimensions"],
            "strengths": [],
        }

    user_content = f"Transcription: {transcription}"
    if craft:
        user_content += f"\nDomaine: {craft}"

    headers = {
        "Authorization": f"Bearer {INFOMANIAK_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": INFOMANIAK_LLM_MODEL,
        "messages": [
            {"role": "system", "content": JUDGE_SYSTEM_PROMPT + _language_instruction(language)},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": 200,
        "temperature": 0.0,
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                INFOMANIAK_LLM_API_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(
                        f"Infomaniak API error: {response.status} - {error_text}"
                    )
                    return {
                        "needs_review": True,
                        "reasoning": "Judge service error - defaulting to review",
                        "missing_elements": [],
                        "strengths": [],
                    }

                result = await response.json()
                logger.debug(f"Infomaniak API response: {result}")

                if "choices" not in result or len(result["choices"]) == 0:
                    logger.error("No choices in Infomaniak response")
                    return {
                        "needs_review": True,
                        "reasoning": "Judge service returned empty response",
                        "missing_elements": [],
                        "strengths": [],
                    }

                content = result["choices"][0]["message"]["content"].strip()
                logger.info(f"Judge response: {content[:200]}...")

                # Deterministic parsing (no JSON from LLM)
                try:
                    judge_result = _parse_keyed_judge(content)
                except Exception:
                    logger.error(f"Failed to parse judge keyed response: {content}")
                    return {
                        "needs_review": True,
                        "reasoning": "Could not parse judge decision",
                        "missing_elements": [],
                        "strengths": [],
                    }

                # Validate required fields
                if "needs_review" not in judge_result:
                    judge_result["needs_review"] = True  # Default to safety
                if "reasoning" not in judge_result:
                    judge_result["reasoning"] = "Judge analysis complete"
                if "missing_elements" not in judge_result:
                    judge_result["missing_elements"] = []
                if "strengths" not in judge_result:
                    judge_result["strengths"] = []

                logger.info(
                    f"Judge decision: needs_review={judge_result['needs_review']}"
                )

                return judge_result

    except aiohttp.ClientError as e:
        logger.error(f"Network error calling Infomaniak API: {e}")
        # Default to review on network errors
        return {
            "needs_review": True,
            "reasoning": f"Network error: {e}",
            "missing_elements": [],
            "strengths": [],
        }
    except Exception as e:
        logger.error(f"Unexpected error in judge: {e}")
        return {
            "needs_review": True,
            "reasoning": f"Judge error: {e}",
            "missing_elements": [],
            "strengths": [],
        }
