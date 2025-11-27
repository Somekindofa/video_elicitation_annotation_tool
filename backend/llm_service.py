"""
LLM service for generating extended transcripts using Fireworks.ai
"""
import logging
import aiohttp
from typing import Optional

from config import (
    FIREWORKS_API_KEY,
    FIREWORKS_LLM_API_URL,
    FIREWORKS_LLM_MODEL,
    FIREWORKS_LLM_MAX_TOKENS,
    FIREWORKS_LLM_TEMPERATURE
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
- Restez étroitement aligné avec le contexte de la transcription
- N'ajoutez pas d'informations excessives ou non pertinentes
- Soyez spécifique concernant les outils, mouvements et techniques
- Mentionnez la position du corps, l'application de la force et la précision quand c'est pertinent
- Gardez la forme du texte concise et ciblée
- Évitez les répétitions inutiles
- Le texte doit être en français
- Utiliser que du texte brut, sans markdown ni balises HTML
- S'il n'y a pas assez d'informations dans la transcription pour ajouter des détails pertinents, répondre de manière très concise.

Le domaine de la tâche est : Soufflage de verre
"""

JEWELRY_MAKING_SYSTEM_PROMPT = """
Vous êtes un expert en analyse des techniques de joaillerie. Votre tâche consiste à enrichir les transcriptions de démonstrations ou de descriptions de fabrication de bijoux avec des informations contextuelles pertinentes.
Basé sur la transcription fournie, ajoutez :

Informations sur les gestes pertinents (positions des mains, utilisation des outils, mouvements précis)
Erreurs courantes lors de l'exécution de l'action décrite (ex. : mauvaise tenue des pinces, surchauffe du métal, alignement incorrect des pierres)
Conseils d'experts pour une technique appropriée (ex. : contrôle de la température, choix des alliages, finitions)
Directives :

Gardez la version étendue conversationnelle et fluide, tout en restant technique.
Restez strictement aligné avec le contexte de la transcription.
N'ajoutez pas d'informations superflues ou hors sujet.
Soyez spécifique concernant les outils (ex. : chalumeau, lime, polisseuse), les mouvements (ex. : soudure, sertissage, gravure) et les matériaux (ex. : or, argent, pierres précieuses).
Mentionnez la position du corps (ex. : stabilité des poignets pour la gravure), l’application de la force (ex. : pression sur la scie à métaux) et la précision (ex. : alignement des sertis) quand c'est pertinent.
Gardez le texte concise et ciblé, sans répétitions inutiles.
Le texte doit être en français.
Utilisez uniquement du texte brut, sans markdown ni balises HTML.
Si la transcription ne fournit pas assez d'informations pour ajouter des détails pertinents, répondez de manière très concise.
Domaine de la tâche : Joaillerie (fabrication, réparation, design de bijoux, polissage).
"""

async def generate_extended_transcript(transcription: str) -> Optional[str]:
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
        # Construct the prompt
        prompt = f"""{JEWELRY_MAKING_SYSTEM_PROMPT}

Transcription originale:
"{transcription}"

Transcription étendue (ajouter des détails sur les gestes, les erreurs courantes et les conseils d'experts):
"""

        # Prepare API request
        headers = {
            "Authorization": f"Bearer {FIREWORKS_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": FIREWORKS_LLM_MODEL,
            "prompt": prompt,
            "max_tokens": FIREWORKS_LLM_MAX_TOKENS,
            "temperature": FIREWORKS_LLM_TEMPERATURE,
            "top_p": 0.9,
            "frequency_penalty": 0.5,
            "presence_penalty": 0.3,
            "stop": ["\n\nOriginal Transcript:", "\n\n---"]
        }
        
        logger.info(f"Calling Fireworks.ai LLM API for extended transcript generation...")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                FIREWORKS_LLM_API_URL,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(f"LLM API error (status {response.status}): {error_text}")
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

async def tag_transcript(transcription: str) -> Optional[str]:
    #TODO
    return

async def test_llm_connection() -> bool:
    """
    Test the LLM API connection
    
    Returns:
        True if connection successful, False otherwise
    """
    test_transcript = "The glassblower rotates the pipe while heating the glass."
    result = await generate_extended_transcript(test_transcript)
    return result is not None
