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
from typing import Dict, Any, Optional, List

from config import (
    FIREWORKS_API_KEY,
    FIREWORKS_LLM_API_URL,
    FIREWORKS_LLM_MODEL,
)

logger = logging.getLogger(__name__)

# Deterministic, key-value output instructions (no JSON from LLM)
REVIEW_KEYED_OUTPUT_INSTRUCTIONS = """
Répondez UNIQUEMENT sous forme de lignes "CLE: valeur". NE PRODUSEZ PAS de JSON.
Listes séparées par " | ". Booléens: true/false. Aucune ligne vide.

CLES ATTENDUES:
TIER
SCORE
READY
PRIORITY_PROMPTS
SENS_VISUAL
SENS_TACTILE
SENS_AUDITORY
SENS_PROPRIO
SENS_EXAMPLES
HOW_COVERED
HOW_MISSING
HOW_GOOD
HOW_PROMPTS
EVAL_COVERED
EVAL_MISSING
EVAL_GOOD
EVAL_PROMPTS
FB_COVERED
FB_MISSING
FB_GOOD
FB_PROMPTS
"""

SALIENCE_KEYED_OUTPUT_INSTRUCTIONS = """
Répondez UNIQUEMENT sous forme de lignes "CLE: valeur". NE PRODUSEZ PAS de JSON.
Booléens: true/false. Aucune ligne vide.

CLES ATTENDUES:
SALIENT
REASON
"""

SALIENCE_SYSTEM_PROMPT = """Vous êtes un évaluateur d'élicitation qui doit déterminer si un moment est SALIENT pour l'apprentissage d'un apprenti.

Un moment est SALIENT uniquement si :
1) Il a une utilité pédagogique particulière (geste critique, étape clé, risque d'erreur, signal sensoriel déterminant)
2) Cette utilité est EXPLICITEMENT mentionnée dans la transcription (pas d'inférence)

Règles STRICTES :
- Si l'utilité n'est pas clairement expliquée, répondez SALIENT: false
- Ne devinez JAMAIS un outil, un matériau ou un geste non mentionné
- Si les informations sont vagues ou génériques, répondez SALIENT: false
- Votre réponse doit être courte et factuelle

Vous recevrez la transcription et, si disponibles, des tags extraits (outils, matériaux, techniques). Utilisez-les uniquement comme rappel, pas comme source d'inférence.
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


def _ensure_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(v) for v in value if v is not None]
    if value is None:
        return []
    return [str(value)]


def _normalize_dimension(dim: Any) -> Dict[str, Any]:
    if not isinstance(dim, dict):
        dim = {}
    return {
        "covered": bool(dim.get("covered", False)),
        "missing_elements": _ensure_list(dim.get("missing_elements")),
        "what_is_good": _ensure_list(dim.get("what_is_good")),
        "prompts": _ensure_list(dim.get("prompts")),
    }


def _normalize_review_result(result: Any) -> Dict[str, Any]:
    if not isinstance(result, dict):
        result = {}

    tier = result.get("completeness_tier", "MINIMAL")
    if tier not in {"MINIMAL", "PARTIAL", "SUBSTANTIAL", "COMPLETE"}:
        tier = "MINIMAL"

    try:
        score = int(float(result.get("completeness_score", 0)))
    except (TypeError, ValueError):
        score = 0
    score = max(0, min(100, score))

    sensations = result.get("sensations_analysis")
    if not isinstance(sensations, dict):
        sensations = {}

    dimensions = result.get("dimensions")
    if not isinstance(dimensions, dict):
        dimensions = {}

    normalized = {
        "completeness_tier": tier,
        "completeness_score": score,
        "sensations_analysis": {
            "visual_mentioned": bool(sensations.get("visual_mentioned", False)),
            "tactile_mentioned": bool(sensations.get("tactile_mentioned", False)),
            "auditory_mentioned": bool(sensations.get("auditory_mentioned", False)),
            "proprioceptive_mentioned": bool(
                sensations.get("proprioceptive_mentioned", False)
            ),
            "examples": _ensure_list(sensations.get("examples")),
        },
        "dimensions": {
            "HOW": _normalize_dimension(dimensions.get("HOW")),
            "EVALUATION": _normalize_dimension(dimensions.get("EVALUATION")),
            "FEEDBACK": _normalize_dimension(dimensions.get("FEEDBACK")),
        },
        "priority_prompts": _ensure_list(result.get("priority_prompts")),
        "ready_to_proceed": bool(result.get("ready_to_proceed", False)),
    }

    return normalized


def _fallback_review_result() -> Dict[str, Any]:
    return {
        "completeness_tier": "MINIMAL",
        "completeness_score": 0,
        "sensations_analysis": {
            "visual_mentioned": False,
            "tactile_mentioned": False,
            "auditory_mentioned": False,
            "proprioceptive_mentioned": False,
            "examples": [],
        },
        "dimensions": {
            "HOW": {
                "covered": False,
                "missing_elements": ["tous les éléments"],
                "what_is_good": [],
                "prompts": [
                    "Veuillez décrire l'exécution pas à pas, y compris les outils, la posture et les sensations."
                ],
            },
            "EVALUATION": {
                "covered": False,
                "missing_elements": ["tous les éléments"],
                "what_is_good": [],
                "prompts": [
                    "Comment savez-vous que cette étape est correcte (indices visuels, tactiles, auditifs) ?"
                ],
            },
            "FEEDBACK": {
                "covered": False,
                "missing_elements": ["tous les éléments"],
                "what_is_good": [],
                "prompts": ["Quelles erreurs sont courantes et comment les corriger ?"],
            },
        },
        "priority_prompts": [
            "Veuillez détailler l'exécution et les sensations clés pour cette étape."
        ],
        "ready_to_proceed": False,
    }


def _parse_keyed_review(text: str) -> Dict[str, Any]:
    lines = [ln.strip() for ln in text.splitlines() if ":" in ln]
    kv: Dict[str, str] = {}
    for ln in lines:
        key, val = ln.split(":", 1)
        kv[key.strip().upper()] = val.strip()

    def _split_list(key: str) -> List[str]:
        raw = kv.get(key, "")
        if not raw:
            return []
        return [v.strip() for v in raw.split("|") if v.strip()]

    def _to_bool(key: str) -> bool:
        return kv.get(key, "").lower() == "true"

    tier = kv.get("TIER", "MINIMAL").upper()
    if tier not in {"MINIMAL", "PARTIAL", "SUBSTANTIAL", "COMPLETE"}:
        tier = "MINIMAL"

    try:
        score = int(float(kv.get("SCORE", "0")))
    except (TypeError, ValueError):
        score = 0
    score = max(0, min(100, score))

    result = {
        "completeness_tier": tier,
        "completeness_score": score,
        "sensations_analysis": {
            "visual_mentioned": _to_bool("SENS_VISUAL"),
            "tactile_mentioned": _to_bool("SENS_TACTILE"),
            "auditory_mentioned": _to_bool("SENS_AUDITORY"),
            "proprioceptive_mentioned": _to_bool("SENS_PROPRIO"),
            "examples": _split_list("SENS_EXAMPLES"),
        },
        "dimensions": {
            "HOW": {
                "covered": _to_bool("HOW_COVERED"),
                "missing_elements": _split_list("HOW_MISSING"),
                "what_is_good": _split_list("HOW_GOOD"),
                "prompts": _split_list("HOW_PROMPTS"),
            },
            "EVALUATION": {
                "covered": _to_bool("EVAL_COVERED"),
                "missing_elements": _split_list("EVAL_MISSING"),
                "what_is_good": _split_list("EVAL_GOOD"),
                "prompts": _split_list("EVAL_PROMPTS"),
            },
            "FEEDBACK": {
                "covered": _to_bool("FB_COVERED"),
                "missing_elements": _split_list("FB_MISSING"),
                "what_is_good": _split_list("FB_GOOD"),
                "prompts": _split_list("FB_PROMPTS"),
            },
        },
        "priority_prompts": _split_list("PRIORITY_PROMPTS"),
        "ready_to_proceed": _to_bool("READY"),
    }

    return _normalize_review_result(result)


def _parse_keyed_salience(text: str) -> Dict[str, Any]:
    lines = [ln.strip() for ln in text.splitlines() if ":" in ln]
    kv: Dict[str, str] = {}
    for ln in lines:
        key, val = ln.split(":", 1)
        kv[key.strip().upper()] = val.strip()

    def _to_bool(key: str) -> bool:
        return kv.get(key, "").lower() == "true"

    return {
        "is_salient": _to_bool("SALIENT"),
        "reason": kv.get("REASON", ""),
    }


def _is_perfect_review(review_result: Dict[str, Any]) -> bool:
    dimensions = (
        review_result.get("dimensions", {}) if isinstance(review_result, dict) else {}
    )
    covered_count = sum(1 for dim in dimensions.values() if dim.get("covered", False))
    return covered_count == 3


async def assess_salience(
    transcription: str,
    review_result: Dict[str, Any],
    tags: Optional[List[Dict[str, str]]] = None,
    craft: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Decide if a reviewed moment is salient for apprentice learning.

    A salient moment only exists when the AI review is perfect (3/3) and the moment
    has explicit, particular learning value.
    """
    if not transcription or len(transcription.strip()) < 5:
        return {"is_salient": False, "reason": "Transcription trop courte"}

    if not _is_perfect_review(review_result):
        return {"is_salient": False, "reason": "Revue non parfaite (3/3 requis)"}

    if not FIREWORKS_API_KEY:
        raise Exception("FIREWORKS_API_KEY not configured")

    tags_payload = "Aucun tag." if not tags else json.dumps(tags, ensure_ascii=False)
    craft_context = f"Domaine: {craft}" if craft else ""

    user_message = (
        f"{craft_context}\nTags: {tags_payload}\n\nTranscription: {transcription}\n\n"
        "Décidez si ce moment est SALIENT pour un apprenti."
    )

    headers = {
        "Authorization": f"Bearer {FIREWORKS_API_KEY}",
        "Content-Type": "application/json",
    }

    prompt = f"""{SALIENCE_SYSTEM_PROMPT}

{SALIENCE_KEYED_OUTPUT_INSTRUCTIONS}

{user_message}

Réponse :
"""

    payload = {
        "model": FIREWORKS_LLM_MODEL,
        "prompt": prompt,
        "max_tokens": 180,
        "temperature": 0.2,
        "top_p": 0.9,
        "frequency_penalty": 0.2,
        "presence_penalty": 0.1,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                FIREWORKS_LLM_API_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=45),
            ) as response:
                response.raise_for_status()
                result = await response.json()

        if "choices" not in result or len(result["choices"]) == 0:
            return {"is_salient": False, "reason": "Réponse LLM vide"}

        content = result["choices"][0].get("text", "").strip()
        if not content:
            return {"is_salient": False, "reason": "Réponse LLM vide"}

        try:
            salience = _parse_keyed_salience(content)
        except Exception:
            logger.error(f"Failed to parse salience response: {content}")
            return {"is_salient": False, "reason": "Parsing salience failed"}

        return salience

    except aiohttp.ClientError as e:
        logger.error(f"HTTP error during salience assessment: {e}")
        return {"is_salient": False, "reason": "Erreur réseau"}
    except Exception as e:
        logger.error(f"Error during salience assessment: {e}")
        return {"is_salient": False, "reason": "Erreur interne"}


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
- **SENSATIONS CRITIQUES**: Retour tactile (pression, texture, température), retour proprioceptif (position du corps, mouvement), indices visuels (couleur, forme), indices auditifs (sons spécifiques)

Si manquant, générez des invites comme :
- "Quel outil spécifique tenez-vous dans votre main [gauche/droite] à [horodatage] ?"
- "Comment cette technique est-elle appelée dans la terminologie de la joaillerie/du soufflage de verre ?"
- "Pouvez-vous décrire le positionnement de vos mains par rapport à [outil/matériau] ?"
- "À quelle distance approximative tenez-vous [l'outil] de [point de référence] ?"
- "Combien de temps cette étape prend-elle généralement ?"
- **"Que ressentez-vous dans vos mains/doigts pendant cette étape ?"**
- **"Quelle est la sensation tactile que vous recherchez ici ?"**
- **"Y a-t-il une température/pression spécifique que vous percevez ?"**

### Dimension ÉVALUATION (Critères de réussite)
Vérifiez la présence de :
- **SENSATIONS VISUELLES**: Couleur, brillance, forme, texture visible
- **SENSATIONS TACTILES**: Texture au toucher, température, dureté, souplesse
- **SENSATIONS AUDITIVES**: Sons spécifiques (craquements, clics, vibrations)
- **SENSATIONS PROPRIOCEPTIVES**: Résistance, fluidité du mouvement, équilibre
- Contrôles de qualité (comment vérifier l'exactitude)
- Résultats mesurables (dimensions, apparence)

Si manquant, générez des invites comme :
- "Comment sauriez-vous que cette étape a été effectuée correctement ?"
- **"Quels indices visuels indiquent le succès ? (couleur, brillance, forme)"**
- **"Qu'est-ce que cela doit sentir au toucher lorsque c'est correct ?"**
- **"Y a-t-il un son ou une sensation particulière qui indique que c'est réussi ?"**
- **"Quelle résistance/pression devez-vous ressentir pour savoir que c'est bon ?"**

### Dimension FEEDBACK (Modes d'erreur et récupération)
Vérifiez la présence de :
- Erreurs courantes (ce qui se passe mal)
- **SIGNAUX SENSORIELS d'erreur**: Changement de couleur/texture/son/sensation indiquant un problème
- Symptômes d'erreur (comment reconnaître l'échec)
- Actions correctives (comment corriger ou éviter les erreurs)
- Actions correctives (comment corriger ou éviter les erreurs)
- Conseils de pratique (à quoi faire attention pendant l'apprentissage)

Si manquant, générez des invites comme :
- "Qu'est-ce qui se passe généralement mal lorsque les apprentis essaient cela pour la première fois ?"
- **"Comment pouvez-vous dire visuellement/tactilement si vous avez fait une erreur ?"**
- "Que feriez-vous pour récupérer si [erreur spécifique] se produit ?"
- **"Quels changements de sensation (texture, température, résistance) indiquent un problème ?"**
- **"Quel son ou signal sensoriel avertit que quelque chose ne va pas ?"**
- "Que devraient surveiller les apprenants pendant la pratique ?"

## Format de sortie

Retournez un objet JSON :

```json
{
  "completeness_tier": "MINIMAL|PARTIAL|SUBSTANTIAL|COMPLETE",
  "completeness_score": 0-100,
  "sensations_analysis": {
    "visual_mentioned": true/false,
    "tactile_mentioned": true/false,
    "auditory_mentioned": true/false,
    "proprioceptive_mentioned": true/false,
    "examples": ["L'expert décrit la sensation de chaleur", "Mentionne le son du clic"]
  },
  "dimensions": {
    "HOW": {
      "covered": true/false,
      "missing_elements": ["noms d'outils", "positionnement spatial", "sensations tactiles"],
      "what_is_good": ["L'expert nomme l'outil spécifique 'pince brucelles'", "Décrit la sensation de résistance"],
      "prompts": ["Quel outil spécifique...", "Que ressentez-vous dans vos mains..."]
    },
    "EVALUATION": {
      "covered": true/false,
      "missing_elements": ["indices visuels", "feedback tactile"],
      "what_is_good": ["Indique le résultat visuel 'la surface devient brillante'", "Décrit la texture attendue"],
      "prompts": ["Comment sauriez-vous...", "Qu'est-ce que cela doit sentir au toucher..."]
    },
    "FEEDBACK": {
      "covered": true/false,
      "missing_elements": ["erreurs courantes", "signaux sensoriels d'erreur"],
      "what_is_good": ["Mentionne une erreur courante 'si ça craque, c'est trop rapide'"],
      "prompts": ["Comment pouvez-vous dire visuellement/tactilement...", "Quel changement de sensation indique un problème..."]
    }
  },
  "priority_prompts": ["Lacune la plus critique à combler en premier", "..."],
  "ready_to_proceed": true/false
}
```

## Rubrique de notation de complétude

Utilisez cette rubrique pour déterminer "completeness_tier" et "completeness_score":

**MINIMAL (0-25)**: Transcription très courte (<20 mots) OU seulement une description narrative sans détails techniques. Aucune dimension couverte.

**PARTIAL (26-50)**: Une dimension partiellement couverte OU mentions superficielles de 2+ dimensions sans détails substantiels. L'expert commence à décrire "quoi" mais pas "comment".

**SUBSTANTIAL (51-75)**: Dimension COMMENT bien couverte (noms d'outils, positionnement, séquence) OU deux dimensions partiellement couvertes. Suffisant pour qu'un apprenti commence, mais manque de critères de réussite ou gestion d'erreurs.

**COMPLETE (76-100)**: Dimension COMMENT complète ET au moins une autre dimension (ÉVALUATION ou FEEDBACK) bien couverte. L'apprenti peut exécuter, évaluer son travail, et comprendre les erreurs potentielles.

## Règles critiques

1. NE JAMAIS générer d'affirmations factuelles sur le domaine de l'artisanat
2. NE JAMAIS suggérer des noms d'outils, des techniques ou des mesures spécifiques
3. Identifiez SEULEMENT quel TYPE d'information manque
4. Formulez les invites comme des questions ouvertes qui guident sans diriger
5. Priorisez COMMENT > ÉVALUATION > FEEDBACK lorsque plusieurs lacunes existent
6. Définissez ready_to_proceed=true SEULEMENT lorsque la dimension COMMENT est complète et au moins une autre dimension (ÉVALUATION ou FEEDBACK) est couverte
7. Si la transcription est très courte (< 20 mots), considérez toutes les dimensions comme incomplètes
8. Soyez strict : une mention superficielle ne suffit pas, il faut des détails substantiels
9. Pour "what_is_good", citez EXACTEMENT ce que l'expert a bien fait dans la transcription (utiliser des phrases directes de la transcription). Ceci rend l'IA explicable et réduit le biais.
10. Si une dimension n'a AUCUN élément présent, "what_is_good" doit être une liste vide []
11. **PRIORITÉ AUX SENSATIONS**: Remplissez "sensations_analysis" en identifiant quelles modalités sensorielles sont mentionnées (visuel, tactile, auditif, proprioceptif). Les apprentis ont BESOIN de savoir ce qu'ils doivent RESSENTIR/VOIR/ENTENDRE pour réussir. Si les sensations manquent, priorisez les invites sur les sensations.
12. Si des métadonnées (tags) sont fournies, utilisez-les UNIQUEMENT pour formuler des questions ciblées (ex: "Vous avez mentionné {tag}, pouvez-vous préciser... ?"). Ne déduisez aucun fait nouveau.

Analysez maintenant la transcription suivante et identifiez les lacunes :"""


async def review_elicitation(
    transcription: str,
    video_context: Optional[str] = None,
    tags: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Review an elicitation transcription and identify gaps in HOW/EVALUATION/FEEDBACK dimensions.

    Args:
        transcription: The elicitation transcript to review
        video_context: Optional context about the video (title, craft domain, etc.)
        tags: Optional list of metadata tags extracted from the transcription
              Format: [{"name": "pince_brucelles", "category": "tool"}, ...]

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
            "completeness_tier": "MINIMAL",
            "completeness_score": 0,
            "sensations_analysis": {
                "visual_mentioned": False,
                "tactile_mentioned": False,
                "auditory_mentioned": False,
                "proprioceptive_mentioned": False,
                "examples": [],
            },
            "dimensions": {
                "HOW": {
                    "covered": False,
                    "missing_elements": ["tous les éléments"],
                    "what_is_good": [],
                    "prompts": [
                        "La transcription est trop courte. Veuillez fournir plus de détails sur l'exécution de cette action."
                    ],
                },
                "EVALUATION": {
                    "covered": False,
                    "missing_elements": ["tous les éléments"],
                    "what_is_good": [],
                    "prompts": [
                        "Comment savez-vous que cette action a été effectuée correctement ?"
                    ],
                },
                "FEEDBACK": {
                    "covered": False,
                    "missing_elements": ["tous les éléments"],
                    "what_is_good": [],
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
        if tags:
            try:
                tags_json = json.dumps(tags, ensure_ascii=False)
            except Exception:
                tags_json = str(tags)
            user_message = (
                f"Métadonnées mentionnées (tags) : {tags_json}\n\n{user_message}"
            )

        # Prepare API request (Fireworks completions expects a prompt, not chat messages)
        headers = {
            "Authorization": f"Bearer {FIREWORKS_API_KEY}",
            "Content-Type": "application/json",
        }

        prompt = f"""{ELICITATION_REVIEWER_SYSTEM_PROMPT}

    {REVIEW_KEYED_OUTPUT_INSTRUCTIONS}

    {user_message}

    Réponse :
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

        # Deterministic parsing (no JSON from LLM)
        try:
            review_result = _parse_keyed_review(content)
        except Exception:
            logger.error(f"Failed to parse keyed review response: {content}")
            review_result = _fallback_review_result()

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
