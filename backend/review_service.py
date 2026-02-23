"""
AI Elicitation Reviewer Service

Analyzes expert elicitations for gaps in procedural knowledge dimensions:
- HOW: Procedural execution details (tools, techniques, positioning)
- EVALUATION: Success criteria and quality indicators
- FEEDBACK: Error modes, common mistakes, and recovery strategies

Architecture: decomposed atomic calls.
- The LLM only answers boolean presence/absence questions (max_tokens=5)
  or extracts a single verbatim quote from the transcription (max_tokens=80).
- All structure, scoring, tier computation, and follow-up prompts are
  owned entirely by Python code. The LLM never touches the skeleton.
"""

import asyncio
import logging
import aiohttp
import json
from typing import Dict, Any, Optional, List, Tuple

from config import (
    FIREWORKS_API_KEY,
    FIREWORKS_LLM_API_URL,
    FIREWORKS_LLM_MODEL,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Static follow-up prompt bank (Python-owned, never LLM-generated)
# Each entry: (dimension, signal_key) -> list of questions
# The first applicable missing signal's question is used.
# ---------------------------------------------------------------------------
_HOW_PROMPTS: Dict[str, List[str]] = {
    "tools": [
        "Quel outil spécifique tenez-vous dans votre main à cette étape ?",
        "Comment s'appelle l'outil que vous utilisez dans la terminologie du domaine ?",
    ],
    "positioning": [
        "Comment positionnez-vous votre corps, vos bras et vos mains pendant cette étape ?",
        "Pouvez-vous décrire l'angle ou l'orientation de vos mains par rapport à la pièce ?",
    ],
    "sequence": [
        "Combien de temps cette étape dure-t-elle généralement ?",
        "Dans quel ordre effectuez-vous les gestes — qu'est-ce qui doit se passer en premier ?",
    ],
    "sensations": [
        "Que ressentez-vous dans vos mains ou votre corps pendant cette étape ?",
        "Y a-t-il une température, une pression ou une résistance particulière que vous percevez ?",
    ],
}

_EVAL_PROMPTS: Dict[str, List[str]] = {
    "visual": [
        "Quels indices visuels vous indiquent que cette étape est réussie (couleur, forme, brillance) ?",
        "À quoi cela ressemble-t-il visuellement lorsque c'est correct ?",
    ],
    "sensory": [
        "Qu'est-ce que cela doit sentir au toucher ou à la résistance lorsque c'est correct ?",
        "Y a-t-il un son ou une sensation corporelle qui confirme que l'étape est bien réalisée ?",
    ],
}

_FEEDBACK_PROMPTS: Dict[str, List[str]] = {
    "errors": [
        "Qu'est-ce qui se passe généralement mal lorsque les apprentis essaient cela pour la première fois ?",
        "Quelles sont les erreurs les plus fréquentes à cette étape, et comment les éviter ?",
    ],
    "error_signals": [
        "Quel changement de couleur, de texture, de son ou de résistance vous signale qu'une erreur est en train de se produire ?",
        "Comment reconnaissez-vous visuellement ou tactilement qu'une correction est nécessaire ?",
    ],
}

_SENSATION_PROMPTS = [
    "Pouvez-vous décrire les sensations clés (visuelles, tactiles, auditives, proprioceptives) qui guident cette étape ?",
]


def _pick_prompts(prompt_bank: Dict[str, List[str]], missing_keys: List[str]) -> List[str]:
    """Pick the first question for each missing signal, deduplicated."""
    result = []
    seen = set()
    for key in missing_keys:
        questions = prompt_bank.get(key, [])
        for q in questions:
            if q not in seen:
                seen.add(q)
                result.append(q)
                break
    return result


# ---------------------------------------------------------------------------
# Tier and score — computed deterministically from signal counts
# ---------------------------------------------------------------------------

def _compute_tier_and_score(
    how_signals: Dict[str, bool],
    eval_signals: Dict[str, bool],
    fb_signals: Dict[str, bool],
    word_count: int,
) -> Tuple[str, int]:
    """
    Derive tier and score purely from signal booleans. No LLM involved.

    HOW is covered when: tools + (positioning OR sequence) + sensations
    EVAL is covered when: visual + sensory
    FEEDBACK is covered when: errors + error_signals
    """
    how_covered = how_signals["tools"] and (how_signals["positioning"] or how_signals["sequence"]) and how_signals["sensations"]
    eval_covered = eval_signals["visual"] and eval_signals["sensory"]
    fb_covered = fb_signals["errors"] and fb_signals["error_signals"]

    covered_count = sum([how_covered, eval_covered, fb_covered])

    # Partial credit within HOW
    how_partial = sum(how_signals.values())  # 0-4
    eval_partial = sum(eval_signals.values())  # 0-2
    fb_partial = sum(fb_signals.values())  # 0-2

    if word_count < 20:
        return "MINIMAL", max(0, min(10, word_count // 2))

    if covered_count == 3:
        score = 80 + min(20, how_partial * 3 + eval_partial * 3 + fb_partial * 4)
        return "COMPLETE", min(100, score)

    if covered_count == 2:
        score = 60 + how_partial * 2 + eval_partial * 2 + fb_partial * 2
        return "SUBSTANTIAL", min(79, score)

    if covered_count == 1 or (how_partial + eval_partial + fb_partial) >= 3:
        score = 30 + how_partial * 3 + eval_partial * 4 + fb_partial * 4
        return "PARTIAL", min(59, max(26, score))

    if (how_partial + eval_partial + fb_partial) >= 1:
        return "PARTIAL", max(26, 15 + (how_partial + eval_partial + fb_partial) * 5)

    return "MINIMAL", max(0, min(25, word_count))


# ---------------------------------------------------------------------------
# LLM primitives — boolean detection and quote extraction
# ---------------------------------------------------------------------------

_BOOL_SYSTEM = (
    "Tu es un détecteur de présence. "
    "Tu reçois une transcription et une question. "
    "Réponds UNIQUEMENT par 'true' ou 'false', sans aucun autre mot."
)

_QUOTE_SYSTEM = (
    "Tu es un extracteur de citations. "
    "Tu reçois une transcription et une question. "
    "Réponds avec UN SEUL fragment exact copié mot pour mot depuis la transcription (15 mots max). "
    "Si rien de pertinent n'est présent, réponds uniquement par le mot 'ABSENT'."
)


async def _llm_bool(session: aiohttp.ClientSession, transcription: str, question: str) -> bool:
    """Ask the LLM a yes/no question about the transcription. Returns True/False."""
    prompt = (
        f"{_BOOL_SYSTEM}\n\n"
        f"Transcription : \"{transcription}\"\n\n"
        f"Question : {question}\n\n"
        "Réponse :"
    )
    payload = {
        "model": FIREWORKS_LLM_MODEL,
        "prompt": prompt,
        "max_tokens": 5,
        "temperature": 0.0,
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0,
    }
    headers = {
        "Authorization": f"Bearer {FIREWORKS_API_KEY}",
        "Content-Type": "application/json",
    }
    async with session.post(
        FIREWORKS_LLM_API_URL,
        headers=headers,
        json=payload,
        timeout=aiohttp.ClientTimeout(total=30),
    ) as resp:
        resp.raise_for_status()
        data = await resp.json()
    text = data["choices"][0].get("text", "").strip().lower()
    return text.startswith("true")


async def _llm_quote(session: aiohttp.ClientSession, transcription: str, question: str) -> Optional[str]:
    """Extract a verbatim quote from the transcription answering the question. Returns None if absent."""
    prompt = (
        f"{_QUOTE_SYSTEM}\n\n"
        f"Transcription : \"{transcription}\"\n\n"
        f"Question : {question}\n\n"
        "Citation extraite :"
    )
    payload = {
        "model": FIREWORKS_LLM_MODEL,
        "prompt": prompt,
        "max_tokens": 80,
        "temperature": 0.0,
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0,
    }
    headers = {
        "Authorization": f"Bearer {FIREWORKS_API_KEY}",
        "Content-Type": "application/json",
    }
    async with session.post(
        FIREWORKS_LLM_API_URL,
        headers=headers,
        json=payload,
        timeout=aiohttp.ClientTimeout(total=30),
    ) as resp:
        resp.raise_for_status()
        data = await resp.json()
    text = data["choices"][0].get("text", "").strip().strip('"').strip("'")
    if not text or text.upper() == "ABSENT" or len(text) < 3:
        return None
    return text


# ---------------------------------------------------------------------------
# Boolean detection questions (kept minimal and unambiguous)
# ---------------------------------------------------------------------------

_HOW_QUESTIONS = {
    "tools": "La transcription mentionne-t-elle le nom d'un outil spécifique (pas juste 'l'outil') ?",
    "positioning": "La transcription décrit-elle la position du corps, des mains ou des doigts de l'expert ?",
    "sequence": "La transcription indique-t-elle un ordre d'opérations, une durée ou un timing ?",
    "sensations": "La transcription décrit-elle une sensation tactile, proprioceptive ou une résistance ressentie pendant l'action ?",
}

_EVAL_QUESTIONS = {
    "visual": "La transcription décrit-elle un indice visuel qui permet de savoir si l'étape est réussie (couleur, forme, brillance) ?",
    "sensory": "La transcription décrit-elle une sensation (au toucher, à l'oreille, à la résistance) qui indique que l'étape est correctement réalisée ?",
}

_FEEDBACK_QUESTIONS = {
    "errors": "La transcription mentionne-t-elle une erreur courante ou une façon dont l'étape peut mal se passer ?",
    "error_signals": "La transcription mentionne-t-elle un signal sensoriel (son, couleur, texture, résistance) qui indique qu'une erreur est en train de se produire ?",
}

_SENSATION_QUESTIONS = {
    "visual": "La transcription mentionne-t-elle une sensation ou un indice visuel (couleur, forme, brillance, texture vue) ?",
    "tactile": "La transcription mentionne-t-elle une sensation tactile (toucher, température, texture au contact) ?",
    "auditory": "La transcription mentionne-t-elle un son ou indice auditif ?",
    "proprioceptive": "La transcription mentionne-t-elle une sensation proprioceptive (poids, résistance, équilibre, position du corps) ?",
}

_QUOTE_QUESTIONS = {
    "HOW": "Quel est le fragment qui décrit le mieux comment l'expert exécute le geste (outil, positionnement ou séquence) ?",
    "EVALUATION": "Quel est le fragment qui décrit le mieux comment l'expert évalue la réussite de l'étape ?",
    "FEEDBACK": "Quel est le fragment qui décrit le mieux une erreur ou un signal d'erreur mentionné par l'expert ?",
}


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

async def review_elicitation(
    transcription: str,
    video_context: Optional[str] = None,
    tags: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Review an elicitation transcription and identify gaps in HOW/EVALUATION/FEEDBACK.

    The LLM only answers boolean detection questions and extracts verbatim quotes.
    All structure, scoring, tier and follow-up prompts are Python-owned.
    """
    if not FIREWORKS_API_KEY:
        raise Exception("FIREWORKS_API_KEY not configured")

    word_count = len(transcription.split()) if transcription else 0

    if not transcription or word_count < 5:
        return _empty_result()

    async with aiohttp.ClientSession() as session:
        # ------------------------------------------------------------------
        # Phase 1: run all boolean detection calls in parallel
        # 4 HOW + 2 EVAL + 2 FEEDBACK + 4 SENSATION = 12 parallel calls
        # ------------------------------------------------------------------
        (
            how_tools, how_pos, how_seq, how_sens,
            eval_vis, eval_sens,
            fb_err, fb_sig,
            sens_vis, sens_tac, sens_aud, sens_pro,
        ) = await asyncio.gather(
            _llm_bool(session, transcription, _HOW_QUESTIONS["tools"]),
            _llm_bool(session, transcription, _HOW_QUESTIONS["positioning"]),
            _llm_bool(session, transcription, _HOW_QUESTIONS["sequence"]),
            _llm_bool(session, transcription, _HOW_QUESTIONS["sensations"]),
            _llm_bool(session, transcription, _EVAL_QUESTIONS["visual"]),
            _llm_bool(session, transcription, _EVAL_QUESTIONS["sensory"]),
            _llm_bool(session, transcription, _FEEDBACK_QUESTIONS["errors"]),
            _llm_bool(session, transcription, _FEEDBACK_QUESTIONS["error_signals"]),
            _llm_bool(session, transcription, _SENSATION_QUESTIONS["visual"]),
            _llm_bool(session, transcription, _SENSATION_QUESTIONS["tactile"]),
            _llm_bool(session, transcription, _SENSATION_QUESTIONS["auditory"]),
            _llm_bool(session, transcription, _SENSATION_QUESTIONS["proprioceptive"]),
        )

    how_signals = {"tools": how_tools, "positioning": how_pos, "sequence": how_seq, "sensations": how_sens}
    eval_signals = {"visual": eval_vis, "sensory": eval_sens}
    fb_signals = {"errors": fb_err, "error_signals": fb_sig}

    # ------------------------------------------------------------------
    # Phase 2: determine covered dimensions (Python logic)
    # ------------------------------------------------------------------
    how_covered = how_signals["tools"] and (how_signals["positioning"] or how_signals["sequence"]) and how_signals["sensations"]
    eval_covered = eval_signals["visual"] and eval_signals["sensory"]
    fb_covered = fb_signals["errors"] and fb_signals["error_signals"]

    # ------------------------------------------------------------------
    # Phase 3: extract quotes in parallel (only for covered dimensions)
    # ------------------------------------------------------------------
    async with aiohttp.ClientSession() as session:
        quote_tasks = {}
        if how_covered:
            quote_tasks["HOW"] = asyncio.create_task(_llm_quote(session, transcription, _QUOTE_QUESTIONS["HOW"]))
        if eval_covered:
            quote_tasks["EVAL"] = asyncio.create_task(_llm_quote(session, transcription, _QUOTE_QUESTIONS["EVALUATION"]))
        if fb_covered:
            quote_tasks["FB"] = asyncio.create_task(_llm_quote(session, transcription, _QUOTE_QUESTIONS["FEEDBACK"]))

        quotes: Dict[str, Optional[str]] = {}
        for key, task in quote_tasks.items():
            quotes[key] = await task

    # ------------------------------------------------------------------
    # Phase 4: compute missing signals and select prompts (Python only)
    # ------------------------------------------------------------------
    how_missing_keys = [k for k, v in how_signals.items() if not v]
    eval_missing_keys = [k for k, v in eval_signals.items() if not v]
    fb_missing_keys = [k for k, v in fb_signals.items() if not v]

    how_prompts = _pick_prompts(_HOW_PROMPTS, how_missing_keys)
    eval_prompts = _pick_prompts(_EVAL_PROMPTS, eval_missing_keys)
    fb_prompts = _pick_prompts(_FEEDBACK_PROMPTS, fb_missing_keys)

    # Missing elements: human-readable labels for each missing signal
    _signal_labels = {
        "tools": "nom d'outil spécifique",
        "positioning": "positionnement du corps/mains",
        "sequence": "séquence temporelle / timing",
        "sensations": "sensations tactiles ou proprioceptives",
        "visual": "indices visuels de réussite",
        "sensory": "sensations de réussite (toucher/ouïe/résistance)",
        "errors": "erreurs courantes",
        "error_signals": "signaux sensoriels d'erreur",
    }
    how_missing_labels = [_signal_labels[k] for k in how_missing_keys]
    eval_missing_labels = [_signal_labels[k] for k in eval_missing_keys]
    fb_missing_labels = [_signal_labels[k] for k in fb_missing_keys]

    # ------------------------------------------------------------------
    # Phase 5: compute tier and score (Python only)
    # ------------------------------------------------------------------
    tier, score = _compute_tier_and_score(how_signals, eval_signals, fb_signals, word_count)

    # ready_to_proceed: HOW covered + at least one other
    ready = how_covered and (eval_covered or fb_covered)

    # Priority prompts: pick the first prompt from the most important missing dimension
    priority_prompts: List[str] = []
    for prompts in [how_prompts, eval_prompts, fb_prompts]:
        if prompts:
            priority_prompts.append(prompts[0])
            break
    if not priority_prompts and not (how_covered and eval_covered and fb_covered):
        priority_prompts = _SENSATION_PROMPTS if not (sens_vis or sens_tac or sens_aud or sens_pro) else [
            "Pouvez-vous compléter la description de l'étape avec plus de détails sur l'exécution ?"
        ]

    # ------------------------------------------------------------------
    # Assemble result (Python-owned skeleton, LLM only filled booleans + quotes)
    # ------------------------------------------------------------------
    def _quote_list(key: str) -> List[str]:
        q = quotes.get(key)
        return [q] if q else []

    result = {
        "completeness_tier": tier,
        "completeness_score": score,
        "sensations_analysis": {
            "visual_mentioned": sens_vis,
            "tactile_mentioned": sens_tac,
            "auditory_mentioned": sens_aud,
            "proprioceptive_mentioned": sens_pro,
            "examples": [],  # quotes for sensations not extracted (low value, high cost)
        },
        "dimensions": {
            "HOW": {
                "covered": how_covered,
                "missing_elements": how_missing_labels,
                "what_is_good": _quote_list("HOW"),
                "prompts": how_prompts,
            },
            "EVALUATION": {
                "covered": eval_covered,
                "missing_elements": eval_missing_labels,
                "what_is_good": _quote_list("EVAL"),
                "prompts": eval_prompts,
            },
            "FEEDBACK": {
                "covered": fb_covered,
                "missing_elements": fb_missing_labels,
                "what_is_good": _quote_list("FB"),
                "prompts": fb_prompts,
            },
        },
        "priority_prompts": priority_prompts,
        "ready_to_proceed": ready,
    }

    logger.info(
        f"Review completed: tier={tier}, score={score}, "
        f"how={how_covered}, eval={eval_covered}, fb={fb_covered}, ready={ready}"
    )
    return result


def _empty_result() -> Dict[str, Any]:
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
                "prompts": ["La transcription est trop courte. Veuillez décrire l'exécution de cette action."],
            },
            "EVALUATION": {
                "covered": False,
                "missing_elements": ["tous les éléments"],
                "what_is_good": [],
                "prompts": ["Comment savez-vous que cette action a été effectuée correctement ?"],
            },
            "FEEDBACK": {
                "covered": False,
                "missing_elements": ["tous les éléments"],
                "what_is_good": [],
                "prompts": ["Quelles erreurs sont courantes lors de cette action ?"],
            },
        },
        "priority_prompts": ["La transcription est trop courte. Veuillez fournir plus de détails."],
        "ready_to_proceed": False,
    }


# ---------------------------------------------------------------------------
# Fallback (used externally if the pipeline raises)
# ---------------------------------------------------------------------------

def _fallback_review_result() -> Dict[str, Any]:
    return _empty_result()


# ---------------------------------------------------------------------------
# Salience assessment (unchanged logic, same atomic approach)
# ---------------------------------------------------------------------------

_SALIENCE_BOOL_QUESTION = (
    "Ce moment d'élicitation a-t-il une utilité pédagogique particulière et explicite "
    "(geste critique, étape clé, risque d'erreur, signal sensoriel déterminant) "
    "qui est clairement mentionnée dans la transcription ?"
)

_SALIENCE_REASON_QUESTION = (
    "En une phrase courte, quel est l'élément pédagogique explicitement mentionné "
    "qui rend ce moment particulièrement utile pour un apprenti ?"
)


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
    Only called when review is perfect (3/3). Uses the same atomic LLM approach.
    """
    if not transcription or len(transcription.strip()) < 5:
        return {"is_salient": False, "reason": "Transcription trop courte"}

    if not _is_perfect_review(review_result):
        return {"is_salient": False, "reason": "Revue non parfaite (3/3 requis)"}

    if not FIREWORKS_API_KEY:
        raise Exception("FIREWORKS_API_KEY not configured")

    async with aiohttp.ClientSession() as session:
        is_salient, reason_raw = await asyncio.gather(
            _llm_bool(session, transcription, _SALIENCE_BOOL_QUESTION),
            _llm_quote(session, transcription, _SALIENCE_REASON_QUESTION),
        )

    reason = reason_raw if reason_raw else (
        "Moment pédagogiquement pertinent." if is_salient else "Aucune utilité pédagogique explicite détectée."
    )

    return {"is_salient": is_salient, "reason": reason}


# ---------------------------------------------------------------------------
# Dimension summary (unchanged interface)
# ---------------------------------------------------------------------------

async def get_dimension_summary(review_result: Dict[str, Any]) -> str:
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
