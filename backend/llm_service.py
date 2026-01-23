"""
LLM service for generating extended transcripts and tags using Fireworks.ai
"""

import logging
import aiohttp
import json
from typing import Any, Optional, List, Dict, Tuple

from config import (
    FIREWORKS_API_KEY,
    FIREWORKS_LLM_API_URL,
    FIREWORKS_LLM_MODEL,
    FIREWORKS_LLM_MAX_TOKENS,
    FIREWORKS_LLM_TEMPERATURE,
)

logger = logging.getLogger(__name__)

# System prompt for glassblowing context
GLASSBLOWING_SYSTEM_PROMPT = """
Vous êtes un expert en analyse des techniques de soufflage de verre. Votre tâche consiste à enrichir les transcriptions de démonstrations de soufflage de verre avec des informations contextuelles pertinentes.
Vous répondez formellement.
Basé sur la transcription fournie, ajoutez :
1. Informations sur les gestes pertinents (positions des mains, mouvements du corps)
2. Erreurs courantes lors de l'exécution de l'action décrite
3. Conseils d'experts pour une technique appropriée

Directives :
- Gardez la version étendue conversationnelle et fluide
- Reste strictement aligné avec le contexte de la transcription sans la répéter ou la paraphraser.
- Ne pas citer l'élicitation de départ.
- N'ajoute pas d'informations superflues, hors sujet ou qui ne sont pas mentionnées dans l'élicitation de départ.
- Soyez spécifique concernant les outils, mouvements et techniques
- Mentionnez la position du corps, l'application de la force et la précision quand c'est pertinent
- Gardez la forme du texte concise et ciblée
- Évitez les répétitions inutiles
- Le texte doit être en français
- Utiliser que du texte brut, sans markdown ni balises HTML
- IMPORTANT : S'il n'y a pas assez d'informations dans la transcription pour ajouter des détails pertinents, répondre UNIQUEMENT : "Aucune information additionnelle pertinente."
- Si tu remarques que la transcription concerne un autre domaine que le soufflage de verre, répondre UNIQUEMENT : "Désolé, je ne peux traiter que des transcriptions liées au soufflage de verre."
- Ne jamais compléter ou inventer du texte au-delà de ce qui est demandé

Le domaine de la tâche est : Soufflage de verre
"""

JEWELRY_MAKING_SYSTEM_PROMPT = """
Vous êtes un expert en analyse des techniques de joaillerie. Votre tâche consiste à enrichir les transcriptions de démonstrations ou de descriptions de fabrication de bijoux avec des informations contextuelles pertinentes.
Ton rôle sert principalement à augmenter la compréhension technique des transcriptions à des fins de recherche sémantique et d'analyse.
Basé sur la transcription fournie, ajoutez :

Informations sur les gestes pertinents (positions des mains, utilisation des outils, mouvements précis)
Erreurs courantes lors de l'exécution de l'action décrite (ex. : mauvaise tenue des pinces, surchauffe du métal, alignement incorrect des pierres, prises délicates)
Conseils d'experts pour une technique appropriée (ex. : contrôle de la température, choix des alliages, finitions, choix des outils adaptés)
Directives :

- Garde la version étendue conversationnelle et fluide, tout en restant technique.
- Reste strictement aligné avec le contexte de la transcription sans la répéter ou la paraphraser.
- Ne pas citer l'élicitation de départ.
- N'ajoute pas d'informations superflues, hors sujet ou qui ne sont pas mentionnées dans l'élicitation de départ.
- Soit spécifique concernant les outils (ex. : chalumeau, lime, polisseuse), les mouvements (ex. : soudure, sertissage, gravure) et les matériaux (ex. : or, argent, pierres précieuses).
- Mentionne la position du corps (ex. : stabilité des poignets pour la gravure), l'application de la force (ex. : pression sur la scie à métaux) et la précision (ex. : alignement des sertis) quand c'est pertinent.
- Garde le texte concise et ciblé, sans répétitions inutiles.
- Le texte doit être en français.
- Utilise uniquement du texte brut, sans markdown ni balises HTML. Utilise des paragraphes pour structurer le texte si nécessaire.
- Si la transcription ne fournit pas assez d'informations pour ajouter des détails pertinents, répond de manière très concise.
- Si tu remarques que la transcription concerne un autre domaine que la joaillerie, informe l'utilisateur que tu ne peux pas traiter cette demande en écrivant : "Désolé, je ne peux traiter que des transcriptions liées à la joaillerie."

Domaine de la tâche : Joaillerie (fabrication, réparation, design de bijoux, polissage).
"""


async def generate_extended_transcript(
    transcription: str, craft: Optional[str] = None
) -> Optional[str]:
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
        # Choose system prompt based on craft/domain (whitelist to avoid injection)
        craft_normalized = (craft or "").strip().lower()
        if craft_normalized in [
            "glassblowing",
            "soufflage",
            "soufflage de verre",
            "scientific glassblowing",
            "scientific_glassblowing",
            "verrerie scientifique",
        ]:
            system_prompt = GLASSBLOWING_SYSTEM_PROMPT
        elif (
            craft_normalized == "jewelry"
            or craft_normalized == "jewellery"
            or craft_normalized == "joaillerie"
        ):
            system_prompt = JEWELRY_MAKING_SYSTEM_PROMPT
        else:
            # Default to glassblowing for backward compatibility
            system_prompt = GLASSBLOWING_SYSTEM_PROMPT

        # Construct the prompt
        prompt = f"""{system_prompt}

Transcription originale:
"{transcription}"
Pour la description étendue tu feras attention à ces points là : il y a 3 niveaux de commentaires à faire.
1. Comment est exécuté le geste (position du corps, des parties du corps et des membres les plus précis)
2. Les commentaires sur la qualité de l'exécution du geste. Il s'agit d'une évaluation du geste sur sa manière dont on sait qu'il est bien exécuté.
3. Les conseils d'experts pour mieux guider l'apprentissage. Il s'agit de l'ensemble des données pertinentes pour repérer ses erreurs.
La transcription étendue doit être en 3 paragraphes distincts, un pour chaque point mentionné ci-dessus.
Il faut 1 saut de ligne entre chaque paragraphe.
Transcription étendue :
"""

        # Prepare API request
        headers = {
            "Authorization": f"Bearer {FIREWORKS_API_KEY}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": FIREWORKS_LLM_MODEL,
            "prompt": prompt,
            "max_tokens": FIREWORKS_LLM_MAX_TOKENS,
            "temperature": FIREWORKS_LLM_TEMPERATURE,
            "top_p": 0.9,
            "frequency_penalty": 0.8,  # Increased to discourage repetition
            "presence_penalty": 0.5,  # Increased to encourage conciseness
            "stop": [
                "\n\nOriginal Transcript:",
                "\n\n---",
                "\n\nTranscription",
                "Désolé ",  # Stop after refusal message
                "Aucune information",  # Stop after no-info message
                "\n\n\n",  # Stop on multiple newlines (natural paragraph break)
                "</s>",  # Stop on end-of-sequence token
                "[END]",  # Explicit end marker
            ],
        }

        logger.info(
            f"Calling Fireworks.ai LLM API for extended transcript generation..."
        )

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
                        f"LLM API error (status {response.status}): {error_text}"
                    )
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


TAGGING_SYSTEM_PROMPT = """
Vous êtes un expert en annotation et catégorisation de transcriptions d'artisanat. Votre tâche est d'analyser des transcriptions de démonstrations artisanales et de générer des tags pertinents et informatifs.

Votre rôle :
1. Analyser la transcription originale ET la transcription étendue
2. Identifier des tags précis d'un seul mot qui capturent les éléments clés
3. Catégoriser chaque tag selon son type
4. Réutiliser les tags existants quand c'est approprié
5. Créer de nouveaux tags uniquement si nécessaire

Types de tags (catégories) :
- "tool" : Outils utilisés (ex: ciseaux, chalumeau, pince, lime)
- "material" : Matériaux mentionnés (ex: verre, métal, jaconas, or, argent)
- "technique" : Techniques employées (ex: couper, souder, polir, graver, enfiler)
- "handling" : Manière de manipuler (ex: deux-mains, délicate, précis, rotation)

Directives :
- Chaque tag DOIT être un seul mot en français (pas d'espaces, pas de tirets)
- Privilégiez les tags existants fournis pour maintenir la cohérence du corpus
- Ne créez de nouveaux tags que si aucun tag existant ne convient
- Limitez-vous à 3-5 tags maximum par transcription
- Soyez spécifique mais pas redondant
- Les tags doivent être en minuscules
- Évitez les tags trop génériques ou vagues

Format de réponse STRICTEMENT JSON :
{
  "tags": [
    {"name": "ciseaux", "category": "tool"},
    {"name": "couper", "category": "technique"},
    {"name": "jaconas", "category": "material"}
  ],
  "reasoning": "Brève explication de vos choix (optionnel)"
}

IMPORTANT : Répondez UNIQUEMENT avec du JSON valide, sans texte avant ou après.
"""


async def tag_transcript(
    transcription: str,
    extended_transcript: str,
    existing_tags: List[Dict[str, Any]],
    craft: Optional[Any] = None,
) -> Optional[List[Dict[str, str]]]:
    """
    Generate tags for a transcript using Fireworks.ai LLM API

    Args:
        transcription: The original Whisper transcription
        extended_transcript: The LLM-enhanced transcript with gesture info
        existing_tags: List of existing tags from database [{"name": "...", "category": "..."}]
        craft: Optional craft/domain context

    Returns:
        List of tag dicts with name and category, or None if generation fails
        Example: [{"name": "ciseaux", "category": "tool"}, {"name": "couper", "category": "technique"}]
    """
    if not FIREWORKS_API_KEY:
        logger.error("FIREWORKS_API_KEY not set in environment")
        return None

    if not transcription or not transcription.strip():
        logger.warning("Empty transcription provided for tagging")
        return None

    try:
        # Format existing tags for the prompt
        existing_tags_str = (
            "Aucun tag existant."
            if not existing_tags
            else "\n".join(
                [f"- {tag['name']} ({tag['category']})" for tag in existing_tags]
            )
        )

        # Add craft context if provided
        craft_context = ""
        if craft:
            craft_normalized = craft.strip().lower()
            if craft_normalized in ["jewelry", "jewellery", "joaillerie"]:
                craft_context = (
                    "\nContexte du domaine : Joaillerie (fabrication de bijoux)"
                )
            elif craft_normalized in [
                "glassblowing",
                "soufflage",
                "soufflage de verre",
                "scientific glassblowing",
                "scientific_glassblowing",
                "verrerie scientifique",
            ]:
                craft_context = "\nContexte du domaine : Soufflage de verre"

        # Construct the prompt
        prompt = f"""{TAGGING_SYSTEM_PROMPT}

{craft_context}

Tags existants à privilégier :
{existing_tags_str}

Transcription originale :
"{transcription}"

Transcription étendue :
"{extended_transcript if extended_transcript else 'Non disponible'}"

Générez les tags au format JSON :
"""

        # Prepare API request
        headers = {
            "Authorization": f"Bearer {FIREWORKS_API_KEY}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": FIREWORKS_LLM_MODEL,
            "prompt": prompt + "\n\nFormat de réponse attendu: JSON uniquement.",
            "max_tokens": 300,
            "temperature": 0.2,  # more deterministic for schema adherence
            "top_p": 0.9,
        }

        logger.info(f"Calling Fireworks.ai LLM API for tag generation...")

        async with aiohttp.ClientSession() as session:
            async with session.post(
                FIREWORKS_LLM_API_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=45),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(
                        f"LLM API error (status {response.status}): {error_text}"
                    )
                    return None

                result = await response.json()

                # Extract the generated text
                if "choices" in result and len(result["choices"]) > 0:
                    generated_text = result["choices"][0].get("text", "").strip()
                    logger.info(f"LLM raw response for tagging: {generated_text[:500]}")

                    if not generated_text:
                        logger.warning("LLM returned empty text for tagging")
                        return None

                    # Parse JSON response robustly
                    try:
                        text = generated_text.strip()
                        # Remove common code fences if present
                        if text.startswith("```"):
                            # strip opening fence
                            first_newline = text.find("\n")
                            if first_newline != -1:
                                text = text[first_newline + 1 :]
                            # strip trailing fence
                            if text.endswith("```"):
                                text = text[:-3]
                        # Extract first JSON object heuristically
                        json_start = text.find("{")
                        json_end = text.rfind("}") + 1
                        json_candidate = (
                            text[json_start:json_end]
                            if json_start >= 0 and json_end > json_start
                            else text
                        )
                        parsed = json.loads(json_candidate)

                        # Validate structure
                        if "tags" in parsed and isinstance(parsed["tags"], list):
                            tags = parsed["tags"]
                            # Validate each tag has name and category
                            valid_tags = []
                            valid_categories = {
                                "tool",
                                "material",
                                "technique",
                                "handling",
                            }

                            for tag in tags:
                                if (
                                    isinstance(tag, dict)
                                    and "name" in tag
                                    and "category" in tag
                                ):
                                    # Normalize tag name (lowercase, no spaces)
                                    tag_name = (
                                        tag["name"]
                                        .strip()
                                        .lower()
                                        .replace(" ", "")
                                        .replace("-", "")
                                    )
                                    tag_category = tag["category"].strip().lower()

                                    # Validate category
                                    if tag_category in valid_categories and tag_name:
                                        valid_tags.append(
                                            {"name": tag_name, "category": tag_category}
                                        )
                                    else:
                                        logger.warning(
                                            f"Filtered out invalid tag: name='{tag_name}', category='{tag_category}' "
                                            f"(valid categories: {valid_categories})"
                                        )
                                else:
                                    logger.warning(f"Skipping malformed tag: {tag}")

                            if valid_tags:
                                logger.info(
                                    f"Generated {len(valid_tags)} tags successfully"
                                )
                                return valid_tags
                            else:
                                logger.warning("No valid tags in LLM response")
                                return None
                        else:
                            logger.error(f"Invalid JSON structure from LLM: {parsed}")
                            return None

                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse JSON from LLM response: {e}")
                        logger.error(f"Generated text: {generated_text}")
                        return None
                else:
                    logger.error(f"Unexpected LLM API response format: {result}")
                    return None

    except aiohttp.ClientError as e:
        logger.error(f"Network error calling LLM API for tagging: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error generating tags: {e}")
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
