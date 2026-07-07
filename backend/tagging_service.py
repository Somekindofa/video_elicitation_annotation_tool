"""
Tagging service for extracting metadata from elicitation transcripts using LLM.
Tags help categorize annotations by tools, materials, techniques, and handling methods.
RAG-focused extraction ensures tags are relevant for downstream retrieval and apprentice learning.
"""

import json
import logging
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

import aiohttp

from config import INFOMANIAK_API_KEY, INFOMANIAK_LLM_API_URL, INFOMANIAK_LLM_MODEL

logger = logging.getLogger(__name__)

# LLM tagging diagnostics (last request)
LAST_LLM_TAG_REQUEST_AT: Optional[str] = None
LAST_LLM_TAG_STATUS: Optional[int] = None
LAST_LLM_TAG_ERROR: Optional[str] = None

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


def slugify_tag_name(name: str) -> str:
    """
    Convert a tag name (possibly typed by a human, in French) to snake_case.
    Strips accents (e.g. "à" -> "a") via NFKD decomposition before collapsing
    any run of non-alphanumeric characters into a single underscore.
    """
    decomposed = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "_", ascii_only.lower()).strip("_")


def _normalize_tags(tags: Any) -> List[Dict[str, str]]:
    """
    Normalize and validate tags.
    - Converts to lowercase with underscores
    - Validates category is in allowed list
    - ENFORCES MAX 4 WORDS per tag name (rejects longer tags)
    """
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
        name = slugify_tag_name(str(name))
        category = str(category).strip().lower()

        # REJECT tags that are too long (> 4 words)
        word_count = len(name.split("_"))
        if word_count > 4:
            logger.debug(
                f"[TAGGING] REJECTED tag (too long - {word_count} words): {name}"
            )
            continue

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

⚠️ RÈGLES ABSOLUES

1. **N'INFÉREZ JAMAIS** - Seulement ce qui est EXPLICITEMENT mentionné
2. **TAGS COURTS** - Maximum 4 mots, préférer 1-2 mots
3. **NOMS D'ENTITÉS** - Pas de phrases descriptives complètes
4. **FILTRAGE RAG** - Le tag doit pouvoir servir de filtre de recherche

## INTERDICTIONS STRICTES

❌ **PAS DE PHRASES DESCRIPTIVES**
  - Exemple INTERDIT: "eviter_de_chauffer_plus_une_partie_qu_une_autre"
  - Exemple INTERDIT: "tourner_delicatement_le_verre_avec_mon_pouce_et_mon_index_tout_en_maintenant_a_la_perpendiculaire"
  - Raison: Ce sont des instructions, pas des tags filtrable

❌ **PAS D'INFÉRENCES**
  - "sodium" mentionné ≠ taguer "verre_sodique"
  - "pince" implicite ≠ taguer "pince"

❌ **PAS DE TAGS GÉNÉRIQUES**
  - Interdit: "outil", "main", "faire", "chose", "objet"

❌ **PAS DE TAGS ÉVIDENTS**
  - Interdit: "regarder", "tenir", "toucher", "bouger"

## Catégories de Tags (STRICTES)

### TOOL (outil) - NOM SPÉCIFIQUE UNIQUEMENT
✓ **BON**: "pince_brucelles", "chalumeau", "mandrin", "lime_diamant"
✗ **MAUVAIS**: "outil", "pince" (trop générique), "main", "doigt"
**Règle**: 1-3 mots maximum, nom propre de l'outil

### MATERIAL (matériau) - NOM DU MATÉRIAU UNIQUEMENT
✓ **BON**: "verre_sodique", "argent", "or_18k", "acier"
✗ **MAUVAIS**: "matériau", "chose", "substance", "air", "eau" (transitoires)
**Règle**: 1-2 mots maximum, avec qualité si critique (ex: or_18k)

### TECHNIQUE (technique) - NOM D'ACTION CONCIS
✓ **BON**: "enfilage", "soudure", "polissage", "recuit"
✗ **MAUVAIS**: "faire", "processus", "eviter_de_chauffer_plus_une_partie_qu_une_autre"
**Règle**: 1-2 mots maximum, forme nominale (nom du procédé)
**Exception**: Si un qualificatif est CRITIQUE pour la technique: "soudure_a_froid" OK

### HANDLING (manipulation) - GESTE CRITIQUE CONCIS
✓ **BON**: "rotation_continue", "pression_legere", "mouvement_circulaire"
✗ **MAUVAIS**: "tourner_delicatement_le_verre_avec_mon_pouce_et_mon_index_tout_en_maintenant_a_la_perpendiculaire"
✗ **MAUVAIS**: "tenir", "bouger", "manipulation"
**Règle**: Maximum 2-3 mots pour le geste ET son intensité/direction si critique
**Astuce**: Si vous devez écrire plus de 4 mots, c'est une instruction, PAS un tag

### SENSATION (sensation) - INDICATEUR SENSORIEL CONCIS
✓ **BON**: "chaleur_intense", "resistance", "son_cristallin", "texture_lisse"
✗ **MAUVAIS**: "quelque_chose", "sensation", "feeling"
**Règle**: 1-2 mots maximum, sensation + qualité si nécessaire

## Exemples Contrastés

### ✓ TAGS CORRECTS (Filtrables RAG)
```
TAG: pince_brucelles | tool
TAG: argent | material
TAG: enfilage | technique
TAG: rotation_douce | handling
TAG: chaleur_intense | sensation
```

### ✗ TAGS INTERDITS (Trop longs/descriptifs)
```
TAG: eviter_de_chauffer_plus_une_partie_qu_une_autre | technique
  → ❌ C'est une phrase d'instruction, pas un nom de technique
  → ✓ Remplacer par: "chauffage_uniforme" SI et SEULEMENT SI ces mots exacts sont dans la transcription

TAG: tourner_delicatement_le_verre_avec_mon_pouce_et_mon_index_tout_en_maintenant_a_la_perpendiculaire | handling
  → ❌ Phrase complète = pas un tag
  → ✓ Remplacer par: "rotation_douce" ou "rotation_bimanuelle" (max 2-3 mots)

TAG: outil | tool
  → ❌ Trop générique, inutile pour filtrage

TAG: main | handling
  → ❌ Évident, toujours présent
```

## Test de Validité d'un Tag

Avant d'accepter un tag, vérifier:
1. ✓ Le tag fait moins de 4 mots? (Sinon REJETER)
2. ✓ C'est un NOM d'entité/concept, pas une PHRASE? (Sinon REJETER)
3. ✓ Il apparaît TEXTUELLEMENT dans la transcription? (Sinon REJETER)
4. ✓ Il permettrait de filtrer/chercher d'autres élicitations similaires? (Sinon REJETER)
5. ✓ C'est assez spécifique pour être utile? (Sinon REJETER)

## Règles de Sortie

1. **MINIMUM 5 mots** dans la transcription (sinon retourner liste vide)
2. **MAXIMUM 10 tags** (qualité > quantité)
3. **PAS DE DOUBLONS** - même nom/catégorie = une seule fois
4. **EN CAS DE DOUTE: NE PAS TAGUER** - Mieux rien que du bruit

## Format de Sortie STRICT

Retournez UNIQUEMENT des lignes:
```
TAG: nom_court | catégorie
```

Analysez maintenant la transcription suivante et extrayez UNIQUEMENT les tags COURTS et PERTINENTS pour RAG:"""


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
    if not INFOMANIAK_API_KEY:
        logger.error("[TAGGING] INFOMANIAK_API_KEY not found in environment")
        raise Exception("Infomaniak API key not configured")

    logger.error("[TAGGING] extract_tags called")
    print("[TAGGING] extract_tags called")

    # Minimum 5 words of content for meaningful tagging (RAG requirement)
    word_count = len(transcription.strip().split())
    if word_count < 5:
        logger.error(
            f"[TAGGING] Transcription too short ({word_count} words) for tag extraction - minimum 5 required"
        )
        return {"tags": []}

    user_content = f"Transcription: {transcription}"
    if craft:
        user_content += f"\nDomaine: {craft}"

    logger.error(f"[TAGGING] Built messages, user content length: {len(user_content)} chars")
    print(f"[TAGGING] Built messages, user content length: {len(user_content)} chars")

    logger.error("[TAGGING] Calling Infomaniak LLM for tag extraction")
    print("[TAGGING] Calling Infomaniak LLM for tag extraction")
    headers = {
        "Authorization": f"Bearer {INFOMANIAK_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": INFOMANIAK_LLM_MODEL,
        "messages": [
            {"role": "system", "content": f"{TAGGING_SYSTEM_PROMPT}\n\n{TAG_KEYED_OUTPUT_INSTRUCTIONS}"},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": 300,
        "temperature": 0.0,
        "top_p": 0.95,
        "frequency_penalty": 0.8,
        "presence_penalty": 0.6,
    }

    global LAST_LLM_TAG_REQUEST_AT, LAST_LLM_TAG_STATUS, LAST_LLM_TAG_ERROR

    try:
        async with aiohttp.ClientSession() as session:
            logger.error(f"[TAGGING] Sending request to {INFOMANIAK_LLM_API_URL}")
            print(f"[TAGGING] Sending request to {INFOMANIAK_LLM_API_URL}")
            LAST_LLM_TAG_REQUEST_AT = datetime.now(timezone.utc).isoformat()
            LAST_LLM_TAG_STATUS = None
            LAST_LLM_TAG_ERROR = None
            async with session.post(
                INFOMANIAK_LLM_API_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as response:
                logger.error(f"[TAGGING] Received response status: {response.status}")
                print(f"[TAGGING] Received response status: {response.status}")
                LAST_LLM_TAG_STATUS = response.status
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(
                        f"[TAGGING] Infomaniak API error: {response.status} - {error_text}"
                    )
                    LAST_LLM_TAG_ERROR = error_text
                    raise Exception(f"Infomaniak API returned status {response.status}")

                result = await response.json()
                logger.error(
                    f"[TAGGING] Parsed JSON response, keys: {list(result.keys())}"
                )
                print(f"[TAGGING] Parsed JSON response, keys: {list(result.keys())}")

                if "choices" not in result or len(result["choices"]) == 0:
                    logger.error("[TAGGING] No choices in Infomaniak response")
                    raise Exception("Invalid response from Infomaniak API")

                content = result["choices"][0]["message"]["content"].strip()
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
        LAST_LLM_TAG_ERROR = str(e)
        logger.error(
            f"[TAGGING] Network error calling Infomaniak API: {e}", exc_info=True
        )
        return {"tags": []}
    except Exception as e:
        LAST_LLM_TAG_ERROR = str(e)
        logger.error(f"[TAGGING] Error extracting tags: {e}", exc_info=True)
        return {"tags": []}
