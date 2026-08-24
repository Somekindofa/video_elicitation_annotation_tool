"""
Coverage detector for elicitation transcripts.

Classifies transcript content against three phase registers:
- Quoi     (What)      — concrete first-person action description.
- Comment  (How)       — manner, sequence, or instrumental detail.
- Pourquoi (Why)       — causal, teleological, and intentional markers.

Language-agnostic: an LLM call extracts verbatim evidence phrases per phase
directly from the transcript (any language), each phrase is verified as an
actual substring of the transcript (anti-hallucination check, same pattern as
tagging_service._filter_tags_against_transcript), and per-phase hit counts /
status are derived from the verified phrases. No spaCy, no per-language
lexicon — one code path for every language Whisper can transcribe.

score_transcript() makes a network call, so it's async; the /api/coverage/score
route awaits it. Aggregation across annotations and plateau detection
(aggregate_scores / detect_plateau) are pure math over hit counts and remain
synchronous.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

import aiohttp

from config import INFOMANIAK_API_KEY, INFOMANIAK_LLM_API_URL, INFOMANIAK_LLM_MODEL

logger = logging.getLogger(__name__)

_LEXICON_PATH = Path(__file__).parent / "coverage_lexicon.json"
_WORD_RE = re.compile(r"\w+", re.UNICODE)

_PHASE_KEYS = ("quoi", "comment", "pourquoi")


def _load_lexicon() -> dict[str, Any]:
    with _LEXICON_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


_LEXICON = _load_lexicon()
_THRESHOLDS = _LEXICON["thresholds"]


COVERAGE_SYSTEM_PROMPT = """You are analyzing a transcript of a craft expert describing their work. The transcript may be in ANY language — do not translate anything, work in the transcript's own language.

For each of three phases, extract the exact verbatim phrases from the transcript that count as evidence for that phase. Every phrase must be copied character-for-character from the transcript — no paraphrasing, no translation, no correction of speech errors.

QUOI (What): concrete first-person action phrases — what the speaker is physically doing right now (e.g. "I pick up the rod", "je tourne la canne").
COMMENT (How): manner, sequence, or instrumental detail — how the action is carried out (speed, tool used, order of steps, technique detail).
POURQUOI (Why): causal, purposive, or intentional phrases — why the speaker does it (the goal, the reason, what would go wrong otherwise).

Extract at most 15 phrases per phase, each roughly 2-12 words, only when genuinely present in the transcript. Leave a phase's list empty if there is no evidence for it. Never invent a phrase that is not verbatim in the transcript.

Respond ONLY as lines "KEY: phrase one | phrase two | ...". Produce NO JSON and no other text.

Expected keys, in this order:
QUOI
COMMENT
POURQUOI"""


def _parse_keyed_phrases(text: str) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {k: [] for k in _PHASE_KEYS}
    key_map = {"QUOI": "quoi", "COMMENT": "comment", "POURQUOI": "pourquoi"}
    for ln in text.splitlines():
        line = ln.strip()
        if not line or ":" not in line:
            continue
        key, val = line.split(":", 1)
        norm_key = key_map.get(key.strip().upper())
        if not norm_key:
            continue
        result[norm_key] = [p.strip() for p in val.split("|") if p.strip()]
    return result


def _verify_phrases(phrases: list[str], text: str) -> list[dict[str, Any]]:
    """
    Keep only phrases that verifiably appear (case-insensitive substring) in
    the transcript — rejects LLM-hallucinated evidence, same anti-hallucination
    pattern as tagging_service._filter_tags_against_transcript. Computes
    char_start/char_end from the first occurrence for frontend highlighting.
    """
    text_lower = text.lower()
    seen: set[str] = set()
    markers: list[dict[str, Any]] = []

    for phrase in phrases:
        p = phrase.strip()
        if not p:
            continue
        p_lower = p.lower()
        if p_lower in seen:
            continue
        idx = text_lower.find(p_lower)
        if idx == -1:
            continue
        seen.add(p_lower)
        markers.append({
            "text": text[idx : idx + len(p)],
            "char_start": idx,
            "char_end": idx + len(p),
        })

    markers.sort(key=lambda m: m["char_start"])
    return markers


async def _extract_phrases(text: str) -> dict[str, list[str]]:
    """Call the LLM for verbatim evidence phrases. Returns empty lists for
    every phase on any failure — score_transcript then reports 'absent'
    rather than raising, matching the fallback pattern used elsewhere
    (judge_service, task_detector_service, tagging_service)."""
    empty = {k: [] for k in _PHASE_KEYS}

    if not INFOMANIAK_API_KEY:
        logger.error("INFOMANIAK_API_KEY not configured — coverage scoring disabled")
        return empty

    headers = {
        "Authorization": f"Bearer {INFOMANIAK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": INFOMANIAK_LLM_MODEL,
        "messages": [
            {"role": "system", "content": COVERAGE_SYSTEM_PROMPT},
            {"role": "user", "content": f"Transcript:\n{text}"},
        ],
        "max_tokens": 500,
        "temperature": 0.0,
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
                    logger.error(f"Coverage LLM error: {response.status} - {error_text}")
                    return empty

                result = await response.json()
                if "choices" not in result or not result["choices"]:
                    logger.error("No choices in coverage LLM response")
                    return empty

                content = result["choices"][0]["message"]["content"].strip()
                return _parse_keyed_phrases(content)

    except Exception as e:
        logger.error(f"Coverage LLM call failed: {e}")
        return empty


def _status_for(hits: float, per_100: float) -> str:
    if hits >= _THRESHOLDS["covered_min_hits"] and per_100 >= _THRESHOLDS["covered_rate"]:
        return "covered"
    if hits >= _THRESHOLDS["partial_min_hits"] and per_100 >= _THRESHOLDS["partial_rate"]:
        return "partial"
    return "absent"


async def score_transcript(text: str) -> dict[str, Any]:
    """
    Score a single transcript against the three phases.

    Returns:
      {
        "token_count": int,
        "quoi":     {"hits": int, "per_100_tok": float, "status": str},
        "comment":  {...},
        "pourquoi": {...},
        "markers": {"quoi": [...], "comment": [...], "pourquoi": [...]}
      }
    """
    if not text or not text.strip():
        empty = {"hits": 0, "per_100_tok": 0.0, "status": "absent"}
        return {
            "token_count": 0,
            "quoi": dict(empty),
            "comment": dict(empty),
            "pourquoi": dict(empty),
            "markers": {"quoi": [], "comment": [], "pourquoi": []},
        }

    token_count = len(_WORD_RE.findall(text))

    phrases_by_phase = await _extract_phrases(text)
    markers = {
        phase: _verify_phrases(phrases_by_phase.get(phase, []), text)
        for phase in _PHASE_KEYS
    }

    norm = 100.0 / max(token_count, 1)

    def pack(hits: int) -> dict[str, Any]:
        per_100 = round(hits * norm, 2)
        return {"hits": int(hits), "per_100_tok": per_100, "status": _status_for(hits, per_100)}

    return {
        "token_count": token_count,
        "quoi": pack(len(markers["quoi"])),
        "comment": pack(len(markers["comment"])),
        "pourquoi": pack(len(markers["pourquoi"])),
        "markers": markers,
    }


def aggregate_scores(per_annotation_scores: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Sum per-annotation hit counts into a per-video aggregate and recompute status.

    Input is a list of dicts as returned by score_transcript. Output has the
    same shape; per_100_tok is computed from total hits over total tokens.
    """
    total_tokens = sum(s.get("token_count", 0) for s in per_annotation_scores)
    totals = {"quoi": 0, "comment": 0, "pourquoi": 0}
    for s in per_annotation_scores:
        for k in totals:
            totals[k] += s.get(k, {}).get("hits", 0)

    norm = 100.0 / max(total_tokens, 1)

    def pack(hits: int) -> dict[str, Any]:
        per_100 = round(hits * norm, 2)
        return {"hits": int(hits), "per_100_tok": per_100, "status": _status_for(hits, per_100)}

    return {
        "token_count": total_tokens,
        "quoi": pack(totals["quoi"]),
        "comment": pack(totals["comment"]),
        "pourquoi": pack(totals["pourquoi"]),
        "annotation_count": len(per_annotation_scores),
    }


def detect_plateau(
    aggregate_history: list[dict[str, Any]],
    epsilon_hits: int | None = None,
) -> bool:
    """
    Return True when the last two entries of aggregate_history each added
    fewer than epsilon_hits to EVERY phase relative to the entry before them,
    AND every phase in the most recent aggregate is at least 'partial'.

    Requires at least 3 aggregate snapshots (baseline + 2 new annotations).
    The 'partial or better' gate prevents early plateau when the user simply
    hasn't spoken enough yet.
    """
    if epsilon_hits is None:
        epsilon_hits = _THRESHOLDS["plateau_epsilon_hits"]

    if len(aggregate_history) < 3:
        return False

    last = aggregate_history[-1]
    for phase in ("quoi", "comment", "pourquoi"):
        if last.get(phase, {}).get("status") == "absent":
            return False

    for i in (-1, -2):
        prev = aggregate_history[i - 1]
        curr = aggregate_history[i]
        for phase in ("quoi", "comment", "pourquoi"):
            delta = curr.get(phase, {}).get("hits", 0) - prev.get(phase, {}).get("hits", 0)
            if delta >= epsilon_hits:
                return False

    return True


def reload_lexicon() -> None:
    """Hot-reload the thresholds JSON. Useful when tuning without restarting."""
    global _LEXICON, _THRESHOLDS
    _LEXICON = _load_lexicon()
    _THRESHOLDS = _LEXICON["thresholds"]
    logger.info("coverage thresholds reloaded")
