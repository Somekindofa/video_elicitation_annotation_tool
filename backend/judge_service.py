"""
Judge service for determining whether an elicitation needs AI Review.
Uses LLM to analyze transcription completeness and make intelligent decisions.
"""

import json
import logging
from typing import Any, Dict, Optional

import aiohttp

from config import FIREWORKS_API_KEY, FIREWORKS_LLM_API_URL, FIREWORKS_LLM_MODEL

logger = logging.getLogger(__name__)

# Deterministic, key-value output instructions (no JSON from LLM)
JUDGE_KEYED_OUTPUT_INSTRUCTIONS = """
Répondez UNIQUEMENT sous forme de lignes "CLE: valeur". NE PRODUSEZ PAS de JSON.
Listes séparées par " | ". Booléens: true/false. Aucune ligne vide.

CLES ATTENDUES:
NEEDS_REVIEW
REASONING
MISSING_ELEMENTS
STRENGTHS
"""


def _extract_first_json_object(text: str) -> Optional[Dict[str, Any]]:
    """Extract the first valid JSON object from a string using brace matching."""
    if not text:
        return None

    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False
    for idx in range(start, len(text)):
        ch = text[idx]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                candidate = text[start : idx + 1]
                try:
                    parsed = json.loads(candidate)
                    return parsed if isinstance(parsed, dict) else None
                except json.JSONDecodeError:
                    return None

    return None


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

## Format de Sortie

Retournez un objet JSON:

```json
{
  "needs_review": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Explication courte du jugement",
  "missing_elements": ["élément 1", "élément 2"],
  "strengths": ["point fort 1", "point fort 2"]
}
```

## Règles Critiques

1. Soyez PRAGMATIQUE: une élicitation imparfaite mais fonctionnelle n'a pas besoin d'analyse
2. Ne soyez pas EXCESSIF: l'expertise du formateur a de la valeur même sans perfection
3. Priorisez les SENSATIONS manquantes comme signal fort qu'une analyse est nécessaire
4. Si vous êtes INCERTAIN (confidence < 0.6), acceptez que l'analyse soit utile
5. Calculez needs_review = True si:
   - (au moins 2 éléments manquent) OU (aucune sensation mentionnée)

Analysez maintenant cette élicitation:"""


async def judge_elicitation(
    transcription: str, craft: Optional[str] = None
) -> Dict[str, Any]:
    """
    Judge whether an elicitation needs AI Review based on completeness signals.

    Args:
        transcription: The elicitation transcript to judge
        craft: Optional craft/domain context (e.g., 'glassblowing', 'jewelry')

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
    if not FIREWORKS_API_KEY:
        logger.error("FIREWORKS_API_KEY not found in environment")
        raise Exception("Fireworks API key not configured")

    # Very short transcriptions definitely need review
    if len(transcription.strip()) < 20:
        logger.info("Transcription too short, needs review")
        return {
            "needs_review": True,
            "reasoning": "Transcription too short to be sufficiently complete",
            "missing_elements": ["all dimensions"],
            "strengths": [],
        }

    # Build prompt
    prompt = f"""{JUDGE_SYSTEM_PROMPT}

{JUDGE_KEYED_OUTPUT_INSTRUCTIONS}

Transcription: {transcription}
{f'Domaine: {craft}' if craft else ''}
"""

    # Call Fireworks LLM API
    headers = {
        "Authorization": f"Bearer {FIREWORKS_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": FIREWORKS_LLM_MODEL,
        "prompt": prompt,
        "max_tokens": 350,
        "temperature": 0.2,  # Lower temperature for consistent judging
        "top_p": 0.9,
        "frequency_penalty": 0.1,
        "presence_penalty": 0.1,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                FIREWORKS_LLM_API_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(
                        f"Fireworks API error: {response.status} - {error_text}"
                    )
                    # If judge fails, default to requiring review (safer)
                    return {
                        "needs_review": True,
                        "reasoning": "Judge service error - defaulting to review",
                        "missing_elements": [],
                        "strengths": [],
                    }

                result = await response.json()
                logger.debug(f"Fireworks API response: {result}")

                if "choices" not in result or len(result["choices"]) == 0:
                    logger.error("No choices in Fireworks response")
                    return {
                        "needs_review": True,
                        "reasoning": "Judge service returned empty response",
                        "missing_elements": [],
                        "strengths": [],
                    }

                content = result["choices"][0]["text"].strip()
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
        logger.error(f"Network error calling Fireworks API: {e}")
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
