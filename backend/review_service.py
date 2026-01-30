"""
AI Elicitation Reviewer Service

Analyzes expert elicitations for gaps in procedural knowledge dimensions:
- HOW: Procedural execution details (tools, techniques, positioning)
- EVALUATION: Success criteria and quality indicators
- FEEDBACK: Error modes, common mistakes, and recovery strategies
"""

import logging
import aiohttp
import json
import re
from typing import Dict, Any, Optional, List

from config import (
    FIREWORKS_API_KEY,
    FIREWORKS_LLM_API_URL,
    FIREWORKS_LLM_MODEL,
)

logger = logging.getLogger(__name__)

# System prompt for elicitation reviewer
ELICITATION_REVIEWER_SYSTEM_PROMPT = """Vous êtes un Réviseur IA analysant les élicitations d'experts pour les connaissances procédurales d'artisanat. Votre rôle consiste à identifier les lacunes dans trois dimensions critiques et à générer des invites spécifiques et exploitables qui guident l'expert à compléter son élicitation SANS inventer vous-même des informations.

## Cadre d'analyse

Pour chaque transcription d'élicitation, évaluez :

### Dimension COMMENT (Exécution procédurale)
Vérifiez la présence de :
- Noms d'outils (spécifiques, pas génériques comme "l'outil")
- Terminologie des techniques (verbes spécifiques au domaine)
- Positionnement des parties du corps (quelle main, quels doigts, angles)
- Mesures spatiales (distances, orientations)
- Séquence temporelle (ordre des opérations, timing)

Si manquant, générez des invites comme :
- "Quel outil spécifique tenez-vous dans votre main [gauche/droite] à [horodatage] ?"
- "Comment cette technique est-elle appelée dans la terminologie de la joaillerie/du soufflage de verre ?"
- "Pouvez-vous décrire le positionnement de vos mains par rapport à [outil/matériau] ?"
- "À quelle distance approximative tenez-vous [l'outil] de [point de référence] ?"
- "Combien de temps cette étape prend-elle généralement ?"

### Dimension ÉVALUATION (Critères de réussite)
Vérifiez la présence de :
- Indicateurs sensoriels (ce qu'il faut voir/sentir/entendre)
- Contrôles de qualité (comment vérifier l'exactitude)
- Résultats mesurables (dimensions, apparence)

Si manquant, générez des invites comme :
- "Comment sauriez-vous que cette étape a été effectuée correctement ?"
- "Quels indices visuels indiquent le succès ?"
- "Qu'est-ce que cela fait lorsque vous avez obtenu le bon résultat ?"
- "Y a-t-il un son ou une sensation particulière qui indique que c'est réussi ?"

### Dimension FEEDBACK (Modes d'erreur et récupération)
Vérifiez la présence de :
- Erreurs courantes (ce qui se passe mal)
- Symptômes d'erreur (comment reconnaître l'échec)
- Actions correctives (comment corriger ou éviter les erreurs)
- Conseils de pratique (à quoi faire attention pendant l'apprentissage)

Si manquant, générez des invites comme :
- "Qu'est-ce qui se passe généralement mal lorsque les apprentis essaient cela pour la première fois ?"
- "Comment pouvez-vous dire si vous avez fait une erreur ?"
- "Que feriez-vous pour récupérer si [erreur spécifique] se produit ?"
- "Que devraient surveiller les apprenants pendant la pratique ?"
- "Quels sont les signes avant-coureurs que quelque chose ne va pas ?"

## Format de sortie

Retournez un objet JSON :

```json
{
  "completeness_score": 0-100,
  "dimensions": {
    "HOW": {
      "covered": true/false,
      "missing_elements": ["noms d'outils", "positionnement spatial"],
      "prompts": ["Quel outil spécifique...", "Pouvez-vous décrire la position de la main..."]
    },
    "EVALUATION": {
      "covered": true/false,
      "missing_elements": ["indices visuels", "feedback tactile"],
      "prompts": ["Comment sauriez-vous...", "Qu'est-ce que cela fait..."]
    },
    "FEEDBACK": {
      "covered": true/false,
      "missing_elements": ["erreurs courantes", "stratégies de récupération"],
      "prompts": ["Qu'est-ce qui se passe généralement mal...", "Comment récupérer si..."]
    }
  },
  "priority_prompts": ["Lacune la plus critique à combler en premier", "..."],
  "ready_to_proceed": true/false
}
```

## Règles critiques

1. NE JAMAIS générer d'affirmations factuelles sur le domaine de l'artisanat
2. NE JAMAIS suggérer des noms d'outils, des techniques ou des mesures spécifiques
3. Identifiez SEULEMENT quel TYPE d'information manque
4. Formulez les invites comme des questions ouvertes qui guident sans diriger
5. Priorisez COMMENT > ÉVALUATION > FEEDBACK lorsque plusieurs lacunes existent
6. Définissez ready_to_proceed=true SEULEMENT lorsque la dimension COMMENT est complète et au moins une autre dimension (ÉVALUATION ou FEEDBACK) est couverte
7. Si la transcription est très courte (< 20 mots), considérez toutes les dimensions comme incomplètes
8. Soyez strict : une mention superficielle ne suffit pas, il faut des détails substantiels

Analysez maintenant la transcription suivante et identifiez les lacunes :"""


async def review_elicitation(
    transcription: str, video_context: Optional[str] = None
) -> Dict[str, Any]:
    """
    Review an elicitation transcription and identify gaps in HOW/EVALUATION/FEEDBACK dimensions.

    Args:
        transcription: The elicitation transcript to review
        video_context: Optional context about the video (title, craft domain, etc.)

    Returns:
        Dictionary with review results including completeness score, dimensions analysis, and prompts

    Raises:
        Exception: If API call fails or response is invalid
    """
    if not FIREWORKS_API_KEY:
        raise Exception("FIREWORKS_API_KEY not configured")

    if not transcription or len(transcription.strip()) < 5:
        # Return default incomplete review for empty/very short transcriptions
        return {
            "completeness_score": 0,
            "dimensions": {
                "HOW": {
                    "covered": False,
                    "missing_elements": ["tous les éléments"],
                    "prompts": [
                        "La transcription est trop courte. Veuillez fournir plus de détails sur l'exécution de cette action."
                    ],
                },
                "EVALUATION": {
                    "covered": False,
                    "missing_elements": ["tous les éléments"],
                    "prompts": [
                        "Comment savez-vous que cette action a été effectuée correctement ?"
                    ],
                },
                "FEEDBACK": {
                    "covered": False,
                    "missing_elements": ["tous les éléments"],
                    "prompts": [
                        "Quelles erreurs sont courantes lors de cette action ?"
                    ],
                },
            },
            "priority_prompts": [
                "La transcription est trop courte. Veuillez fournir plus de détails sur l'exécution de cette action."
            ],
            "ready_to_proceed": False,
        }

    try:
        # Build user message with transcription and optional context
        user_message = f'Transcription à analyser : "{transcription}"'
        if video_context:
            user_message = f"Contexte : {video_context}\n\n{user_message}"

        # Prepare API request (Fireworks completions expects a prompt, not chat messages)
        headers = {
            "Authorization": f"Bearer {FIREWORKS_API_KEY}",
            "Content-Type": "application/json",
        }

        prompt = f"""{ELICITATION_REVIEWER_SYSTEM_PROMPT}

{user_message}

Réponse JSON :
"""

        payload = {
            "model": FIREWORKS_LLM_MODEL,
            "prompt": prompt,
            "max_tokens": 800,  # Increased for detailed JSON response
            "temperature": 0.3,  # Lower temperature for more consistent analysis
            "top_p": 0.9,
            "frequency_penalty": 0.2,
            "presence_penalty": 0.1,
        }

        logger.info(f"Sending elicitation review request to Fireworks API")

        async with aiohttp.ClientSession() as session:
            async with session.post(
                FIREWORKS_LLM_API_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as response:
                response.raise_for_status()
                result = await response.json()

        # Extract review from response
        if "choices" not in result or len(result["choices"]) == 0:
            raise Exception("No choices in LLM response")

        content = result["choices"][0].get("text", "").strip()
        if not content:
            raise Exception("LLM returned empty response")

        # Parse JSON response
        try:
            review_result = json.loads(content)
        except json.JSONDecodeError:
            # Try to extract the first JSON object from the response
            match = re.search(r"\{[\s\S]*\}", content)
            if match:
                try:
                    review_result = json.loads(match.group(0))
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse JSON from LLM response: {content}")
                    raise Exception(f"Invalid JSON response from LLM: {e}")
            else:
                logger.error(f"No JSON object found in LLM response: {content}")
                raise Exception("Invalid JSON response from LLM: no JSON object found")

        # Validate response structure
        required_keys = [
            "completeness_score",
            "dimensions",
            "priority_prompts",
            "ready_to_proceed",
        ]
        missing_keys = [k for k in required_keys if k not in review_result]
        if missing_keys:
            logger.error(f"Missing required keys in review result: {missing_keys}")
            raise Exception(f"Invalid review structure: missing {missing_keys}")

        # Ensure dimensions have required structure
        for dim in ["HOW", "EVALUATION", "FEEDBACK"]:
            if dim not in review_result["dimensions"]:
                logger.warning(f"Missing dimension {dim}, adding default")
                review_result["dimensions"][dim] = {
                    "covered": False,
                    "missing_elements": ["non analysé"],
                    "prompts": [],
                }

        logger.info(
            f"Review completed: score={review_result['completeness_score']}, ready={review_result['ready_to_proceed']}"
        )

        return review_result

    except aiohttp.ClientError as e:
        logger.error(f"HTTP error during elicitation review: {e}")
        raise Exception(f"Failed to connect to LLM API: {e}")
    except Exception as e:
        logger.error(f"Error during elicitation review: {e}")
        raise


async def get_dimension_summary(review_result: Dict[str, Any]) -> str:
    """
    Generate a human-readable summary of the review dimensions.

    Args:
        review_result: The review result dictionary from review_elicitation()

    Returns:
        Formatted summary string
    """
    dimensions = review_result.get("dimensions", {})
    covered_count = sum(1 for dim in dimensions.values() if dim.get("covered", False))

    summary = f"Complétude : {review_result.get('completeness_score', 0)}/100\n"
    summary += f"Dimensions couvertes : {covered_count}/3\n\n"

    for dim_name, dim_data in dimensions.items():
        status = "✓ Complet" if dim_data.get("covered", False) else "✗ Incomplet"
        summary += f"{dim_name}: {status}\n"
        if not dim_data.get("covered", False):
            missing = dim_data.get("missing_elements", [])
            if missing:
                summary += f"  Manque: {', '.join(missing)}\n"

    return summary
