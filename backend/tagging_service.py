"""
Tagging service for extracting metadata from elicitation transcripts using LLM.
Tags help categorize annotations by tools, materials, techniques, and handling methods.
RAG-focused extraction ensures tags are relevant for downstream retrieval and apprentice learning.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

import aiohttp

from config import FIREWORKS_API_KEY, FIREWORKS_LLM_API_URL, FIREWORKS_LLM_MODEL

logger = logging.getLogger(__name__)

# Fireworks tagging diagnostics (last request)
LAST_FIREWORKS_TAG_REQUEST_AT: Optional[str] = None
LAST_FIREWORKS_TAG_STATUS: Optional[int] = None
LAST_FIREWORKS_TAG_ERROR: Optional[str] = None

# Deterministic, key-value output instructions (no JSON from LLM)
TAG_KEYED_OUTPUT_INSTRUCTIONS = """
Répondez UNIQUEMENT sous forme de lignes "TAG: nom | catégorie".
NE PRODUSEZ PAS de JSON. Aucune ligne vide.

Catégories autorisées: tool, material, technique, handling, sensation
Exemples:
TAG: pince_brucelles | tool
TAG: verre | material
"""


def deduplicate_tags(tags: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Remove duplicate tags by (name, category) pair.
    Maintains insertion order, keeping first occurrence.

    Args:
        tags: List of tag dicts with 'name' and 'category' keys

    Returns:
        List of deduplicated tags
    """
    seen: Set[tuple] = set()
    deduped: List[Dict[str, str]] = []

    for tag in tags:
        if not isinstance(tag, dict):
            continue
        name = tag.get("name", "").strip().lower()
        category = tag.get("category", "").strip().lower()

        # Use (name, category) pair as unique key
        key = (name, category)
        if key not in seen:
            seen.add(key)
            deduped.append(tag)
        else:
            logger.debug(f"Skipped duplicate tag: {name} ({category})")

    return deduped


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


def _normalize_tags(tags: Any) -> List[Dict[str, str]]:
    valid_categories = {"tool", "material", "technique", "handling", "sensation"}
    normalized: List[Dict[str, str]] = []

    if not isinstance(tags, list):
        return normalized

    for tag in tags:
        if not isinstance(tag, dict):
            continue
        name = tag.get("name")
        category = tag.get("category")
        if not name or not category:
            continue
        name = str(name).strip().lower().replace(" ", "_")
        category = str(category).strip().lower()
        if not name or category not in valid_categories:
            continue
        normalized.append({"name": name, "category": category})

    return normalized


def _filter_tags_against_transcript(
    tags: List[Dict[str, str]], transcription: str
) -> List[Dict[str, str]]:
    """
    Filter tags by checking if their core concepts appear in the transcript.
    This helps reject hallucinated tags that weren't mentioned.

    Strategy: Extract key words from tag name and check if they (or close variants)
    appear in the original transcription.
    """
    transcription_lower = transcription.lower()
    filtered = []

    for tag in tags:
        name = tag.get("name", "").lower()

        # Split tag name by underscores to get component words
        tag_components = name.split("_")

        # Check if ANY significant component appears in transcript
        # (filters out pure hallucinations but allows reasonable inferences)
        found = False
        for component in tag_components:
            if len(component) > 2 and component in transcription_lower:
                found = True
                break

        if found:
            filtered.append(tag)
            logger.debug(f"[TAGGING] Tag validated: {name} (found in transcript)")
        else:
            logger.debug(
                f"[TAGGING] Tag REJECTED (hallucination): {name} (NOT in transcript)"
            )

    return filtered


def _parse_keyed_tags(text: str, transcription: str = "") -> List[Dict[str, str]]:
    tags: List[Dict[str, str]] = []
    logger.debug(f"[TAGGING] Parsing keyed tags from text length: {len(text)} chars")
    for ln in text.splitlines():
        line = ln.strip()
        if not line or ":" not in line:
            continue
        key, val = line.split(":", 1)
        if key.strip().upper() != "TAG":
            logger.debug(f"[TAGGING] Skipped non-TAG line: {key.strip()}")
            continue
        parts = [p.strip() for p in val.split("|")]
        if len(parts) != 2:
            logger.debug(
                f"[TAGGING] Skipped malformed TAG line (expected name|category): {val}"
            )
            continue
        name, category = parts
        tags.append({"name": name, "category": category})

    # Normalize first
    normalized = _normalize_tags(tags)
    logger.debug(
        f"[TAGGING] After parsing: {len(tags)} raw tags, {len(normalized)} after normalization"
    )

    # Filter against transcript to remove hallucinations
    if transcription:
        filtered = _filter_tags_against_transcript(normalized, transcription)
        logger.debug(
            f"[TAGGING] After transcript validation: {len(normalized)} → {len(filtered)} tags (removed {len(normalized) - len(filtered)} hallucinations)"
        )
    else:
        filtered = normalized

    # Then deduplicate
    deduped = deduplicate_tags(filtered)
    logger.debug(f"[TAGGING] After deduplication: {len(deduped)} final tags")
    return deduped


# System prompt for tag extraction - RAG-optimized for apprentice learning metadata
TAGGING_SYSTEM_PROMPT = """Vous êtes un Système d'Extraction de Tags analysant des transcriptions d'élicitations d'artisans experts.
Votre rôle est d'identifier UNIQUEMENT les métadonnées HAUTEMENT PERTINENTES pour la RÉCUPÉRATION (RAG) et l'APPRENTISSAGE d'apprentis.

⚠️ RÈGLE ABSOLUE: N'INFÉREZ JAMAIS ET N'SUPPOSEZ JAMAIS
- ✋ PAS DE DOUBLONS TECHNOLOGIQUES: Même si c'est "logique", ne le tagguez QUE s'il est EXPLICITEMENT MENTIONNÉ
- ✋ PAS D'HYPOTHÈSES: "Sodium" ≠ autorise à taguer "verre_sodique" si non mentionné
- ✋ PAS D'OUTILS IMPLICITES: Ne tagguez PAS "pince" si l'artisan ne l'a pas nommée
- ✋ PAS D'INFÉRENCE CONTEXTUELLE: Même si logique, si ce n'est PAS ÉCRIT, ce n'est PAS TAGGÉ
- ✋ EXTRACTION TEXTUELLE UNIQUEMENT: Lisez littéralement la transcription, rien de plus

## Principes RAG - Tagging Strict

Les tags doivent FACILITER LA RECHERCHE pour les apprentis:
- ✓ Spécifiques et concrets (filtrage précis)
- ✓ Réutilisables pour trouver d'autres élicitations similaires
- ✓ Essentiels pour comprender ou reproduire la technique
- ✓ SEULEMENT SI MENTIONNÉ EXPLICITEMENT dans la transcription
- ✗ Génériques, vagues, ou redondants
- ✗ Évidentes ou implicites (ex: "main", "personne")
- ✗ Inférées ou supposées (ex: "sodium" n'implique pas "verre_sodique")

## Catégories de Tags (STRICTES)

### TOOL (outil) - SEULEMENT OUTILS NOMMÉS SPÉCIFIQUES
✓ Accepter: "pince_brucelles", "chalumeau", "mandrin", "tournevis_plat", "spatule_metal"
✗ Refuser: "outil", "objet", "main", "doigt", "appareil"
- Noms complets et spécifiques tels que mentionnés
- REJECTER les outils génériques (marteau sans type, tournevis sans précision)
- Si plusieurs types du même outil: TAG séparé pour chaque (ex: tournevis_plat vs tournevis_cruciforme)

### MATERIAL (matériau) - SEULEMENT MATÉRIAUX PERTINENTS POUR APPRENTISSAGE
✓ Accepter: "verre_sodique", "or_18k", "argent", "fil_acier", "cire_perdue"
✗ Refuser: "chose", "matériel", "substance_vague", "ça"
- Matériaux avec qualité/type si spécifié (ex: "or_18k" pas juste "or")
- REJETER les matériaux transitoires non-essentiels (ex: "air", "eau")

### TECHNIQUE (technique) - SEULEMENT TECHNIQUES APPRENTISSABLES
✓ Accepter: "enfilage", "soudure_a_froid", "coulage", "polissage_grain_400"
✗ Refuser: "faire", "processus", "étape", "action_vague"
- Noms d'action spécifiques (forme nominale ou verbe d'action)
- INCLURE le niveau/type si mentionné (ex: polissage_grain_400 plutôt que juste polissage)
- REJECTER les techniques évidentes (couper, tenir, regarder)

### HANDLING (manipulation) - SEULEMENT GESTES CRITIQUES
✓ Accepter: "rotation_continue", "pression_legere", "mouvement_circulaire", "traction_douce"
✗ Refuser: "bouger", "faire", "tenir", "manipulation"
- Gestes CRITIQUES pour la qualité ou sécurité du résultat
- Inclure l'intensité/direction si importante (ex: rotation_continue vs rotation_unique)
- REJECTER les gestes évidents ou universels

### SENSATION (sensation) - SEULEMENT SENSATIONS CRITIQUES POUR APPRENTISSAGE
✓ Accepter: "chaleur_extreme", "resistance_tactile", "son_cristallin", "sensation_lisse"
✗ Refuser: "quelque_chose", "sensation", "feeling"
- Sensations qui INDIQUENT la qualité/progrès du travail (critères de feedback)
- Inclure intensité/qualité si mentionnée (ex: chaleur_extreme vs chaleur, son_clair vs bruit)
- REJECTER les sensations évidentes (froid quand pas mentionné, "existence de chose")

## Format de Sortie

Retournez UNIQUEMENT des lignes au format:
TAG: nom | catégorie

Exemples VALIDES (pertinents RAG):
TAG: pince_brucelles | tool
TAG: chalumeau_propane | tool
TAG: verre_sodique | material
TAG: enfilage | technique
TAG: rotation_continue | handling
TAG: chaleur_critique | sensation

Exemples INVALIDES (REJETER ces patterns):
TAG: outil | tool          (✗ trop générique)
TAG: main | handling       (✗ évident)
TAG: faire | technique     (✗ trop vague)
TAG: chose | material      (✗ non-spécifique)
TAG: air | material        (✗ transitoire)

## CAS D'ÉTUDE: HALLUCINATIONS À ÉVITER ABSOLUMENT

TRANSCRIPTION: "Je mets mes lunettes de protection avec filtre Didymium pour filtrer la lumière jaune-oranger du sodium."
❌ HALLUCINATIONS À ÉVITER:
  TAG: verre_sodique | material     (✗ "sodium" mentionné ≠ "verre sodique" n'est PAS mentionné - NE PAS INFÉRER)
  TAG: pinces_brucelles | tool      (✗ jamais mentionné - hallucination pure)
  TAG: mandrin | tool               (✗ jamais mentionné - hallucination pure)
  TAG: tournevis_plat | tool        (✗ jamais mentionné - hallucination pure)
✓ CORRECT À TAGUER:
  TAG: lunettes_protection | tool      (✓ explicitement: "lunettes de protection")
  TAG: filtre_didymium | tool          (✓ explicitement: "filtre Didymium")
  TAG: filtration_lumiere | technique  (✓ explicitement: "filtrer la lumière")

## Règles Critiques pour RAG-Qualité

1. *** MINIMUM 5 mots de contenu AVANT de retourner tags (sinon liste vide) ***
2. *** REJETER les tags génériques - SEULEMENT concrets et spécifiques ***
3. *** REJETER les évidences/universels (main, bouger, faire) ***
4. *** MAXIMUM 12 tags (qualité > quantité) ***
5. *** Prioriser les éléments APPRENTISSABLES et CRITIQUES ***
6. *** PAS DE DOUBLONS - même nom/catégorie = une seule fois ***
7. *** SI PAS SÛR: MIEUX REJETER QUE SURCHARGER ***

Analysez maintenant la transcription suivante et extrayez UNIQUEMENT les tags pertinents pour RAG/apprentissage:"""


async def extract_tags(
    transcription: str, craft: Optional[str] = None
) -> Dict[str, Any]:
    """
    Extract metadata tags from an elicitation transcription using LLM.

    Args:
        transcription: The elicitation transcript to analyze
        craft: Optional craft/domain context (e.g., 'glassblowing', 'jewelry')

    Returns:
        Dictionary with extracted tags:
        {
            "tags": [
                {"name": "tool_name", "category": "tool"},
                ...
            ]
        }

    Raises:
        Exception: If LLM API call fails or returns invalid response
    """
    if not FIREWORKS_API_KEY:
        logger.error("[TAGGING] FIREWORKS_API_KEY not found in environment")
        raise Exception("Fireworks API key not configured")

    logger.error("[TAGGING] extract_tags called")
    print("[TAGGING] extract_tags called")

    # Minimum 5 words of content for meaningful tagging (RAG requirement)
    word_count = len(transcription.strip().split())
    if word_count < 5:
        logger.error(
            f"[TAGGING] Transcription too short ({word_count} words) for tag extraction - minimum 5 required"
        )
        return {"tags": []}

    # Build prompt
    prompt = f"""{TAGGING_SYSTEM_PROMPT}

{TAG_KEYED_OUTPUT_INSTRUCTIONS}

Transcription: {transcription}
{f'Domaine: {craft}' if craft else ''}
"""
    logger.error(f"[TAGGING] Built prompt, length: {len(prompt)} chars")
    print(f"[TAGGING] Built prompt, length: {len(prompt)} chars")

    # Call Fireworks LLM API
    logger.error("[TAGGING] Calling Fireworks LLM for tag extraction")
    print("[TAGGING] Calling Fireworks LLM for tag extraction")
    headers = {
        "Authorization": f"Bearer {FIREWORKS_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": FIREWORKS_LLM_MODEL,
        "prompt": prompt,
        "max_tokens": 400,
        "temperature": 0.0,  # Absolute zero temperature: maximally deterministic, no hallucinations
        "top_p": 0.95,
        "frequency_penalty": 0.5,  # Increased: strongly penalize repeated tokens
        "presence_penalty": 0.5,  # Increased: strongly penalize unused tokens from training
    }

    global LAST_FIREWORKS_TAG_REQUEST_AT, LAST_FIREWORKS_TAG_STATUS, LAST_FIREWORKS_TAG_ERROR

    try:
        async with aiohttp.ClientSession() as session:
            logger.error(f"[TAGGING] Sending request to {FIREWORKS_LLM_API_URL}")
            print(f"[TAGGING] Sending request to {FIREWORKS_LLM_API_URL}")
            LAST_FIREWORKS_TAG_REQUEST_AT = datetime.now(timezone.utc).isoformat()
            LAST_FIREWORKS_TAG_STATUS = None
            LAST_FIREWORKS_TAG_ERROR = None
            async with session.post(
                FIREWORKS_LLM_API_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as response:
                logger.error(f"[TAGGING] Received response status: {response.status}")
                print(f"[TAGGING] Received response status: {response.status}")
                LAST_FIREWORKS_TAG_STATUS = response.status
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(
                        f"[TAGGING] Fireworks API error: {response.status} - {error_text}"
                    )
                    LAST_FIREWORKS_TAG_ERROR = error_text
                    raise Exception(f"Fireworks API returned status {response.status}")

                result = await response.json()
                logger.error(
                    f"[TAGGING] Parsed JSON response, keys: {list(result.keys())}"
                )
                print(f"[TAGGING] Parsed JSON response, keys: {list(result.keys())}")

                if "choices" not in result or len(result["choices"]) == 0:
                    logger.error("[TAGGING] No choices in Fireworks response")
                    raise Exception("Invalid response from Fireworks API")

                content = result["choices"][0]["text"].strip()
                logger.error(
                    f"[TAGGING] LLM tag extraction response (first 300 chars): {content[:300]}"
                )
                logger.error(
                    f"[TAGGING] Full LLM response length: {len(content)} chars"
                )
                print(
                    f"[TAGGING] LLM tag extraction response (first 300 chars): {content[:300]}"
                )
                print(f"[TAGGING] Full LLM response length: {len(content)} chars")

                # Parse deterministic tag lines, filtering against original transcript
                validated_tags = _parse_keyed_tags(content, transcription)
                logger.error(
                    f"[TAGGING] Parsed {len(validated_tags)} valid tags from LLM output"
                )
                print(
                    f"[TAGGING] Parsed {len(validated_tags)} valid tags from LLM output"
                )

                return {"tags": validated_tags}

    except aiohttp.ClientError as e:
        LAST_FIREWORKS_TAG_ERROR = str(e)
        logger.error(
            f"[TAGGING] Network error calling Fireworks API: {e}", exc_info=True
        )
        return {"tags": []}
    except Exception as e:
        LAST_FIREWORKS_TAG_ERROR = str(e)
        logger.error(f"[TAGGING] Error extracting tags: {e}", exc_info=True)
        return {"tags": []}
