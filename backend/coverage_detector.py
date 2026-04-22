"""
Coverage detector for elicitation transcripts.

Classifies transcript tokens against three phase registers:
- Quoi     (What)      — first-person present-tense action verbs.
- Comment  (How)       — manner adverbs, sequential/instrumental phrases, gerundives.
- Pourquoi (Why)       — causal, teleological, and intentional markers.

Pure function: one transcript in, per-phase hits + status out. No state.
Aggregation across annotations and plateau detection live elsewhere
(see coverage_service / /api/coverage endpoint).

Model loaded once at import time. Disable parser/NER — we only need
tokenization, POS tagging and morphology.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import spacy
from spacy.matcher import Matcher, PhraseMatcher

logger = logging.getLogger(__name__)

_LEXICON_PATH = Path(__file__).parent / "coverage_lexicon.json"
_MODEL_NAME = "fr_core_news_md"


def _load_lexicon() -> dict[str, Any]:
    with _LEXICON_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _load_nlp() -> spacy.language.Language:
    # parser/NER/attribute_ruler not needed; tagger + morphologizer give us
    # POS + morph for first-person/tense filters.
    return spacy.load(_MODEL_NAME, disable=["parser", "ner", "attribute_ruler"])


_LEXICON = _load_lexicon()
_NLP = _load_nlp()
_THRESHOLDS = _LEXICON["thresholds"]


def _build_phrase_matcher(nlp, phrases: list[str]) -> PhraseMatcher:
    matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
    patterns = [nlp.make_doc(p) for p in phrases if p]
    matcher.add("PHRASES", patterns)
    return matcher


def _build_matchers(nlp):
    q = _LEXICON["quoi"]
    c = _LEXICON["comment"]
    p = _LEXICON["pourquoi"]

    # --- PhraseMatchers for fixed multi-word and single-word markers. ---
    quoi_verb_forms = _build_phrase_matcher(nlp, q["action_verb_forms"])

    comment_phrases = _build_phrase_matcher(
        nlp,
        c["manner_adverbs"] + c["sequential_phrases"] + c["instrumental_phrases"],
    )

    pourquoi_phrases = _build_phrase_matcher(
        nlp,
        p["causal_phrases"] + p["teleological_phrases"] + p["intentional_phrases"],
    )

    # --- Token Matcher for patterns needing POS/morph constraints. ---
    tok_matcher = Matcher(nlp.vocab)

    # QUOI fallback: any finite present-tense 1st-person verb — catches craft
    # verbs not in the allowlist. Tagged as a distinct match id so we can
    # count it with a lower weight than explicit allowlist hits.
    tok_matcher.add(
        "QUOI_1P_VERB",
        [[{"POS": "VERB",
           "MORPH": {"IS_SUPERSET": ["Person=1", "Tense=Pres", "VerbForm=Fin"]}}]],
    )

    # COMMENT gerundive: "en" + present participle. Canonical French manner.
    tok_matcher.add(
        "COMMENT_GERUNDIVE",
        [[{"LOWER": "en"},
          {"POS": "VERB", "MORPH": {"IS_SUPERSET": ["VerbForm=Part"]}}]],
    )

    # POURQUOI teleological: "pour" + infinitive verb. Distinguishes purposive
    # "pour + INF" from prepositional "pour + NOUN" ("pour le verre").
    tok_matcher.add(
        "POURQUOI_POUR_INF",
        [[{"LOWER": "pour"},
          {"POS": "VERB", "MORPH": {"IS_SUPERSET": ["VerbForm=Inf"]}}]],
    )

    # POURQUOI intentional verb lemma near first-person subject. Looser than
    # requiring adjacency — we accept the verb alone if its lemma is in the
    # intentional list, since negation and modals often intervene.
    intentional_lemmas = _LEXICON["pourquoi"]["intentional_verb_lemmas"]
    tok_matcher.add(
        "POURQUOI_INTENT_VERB",
        [[{"LEMMA": {"IN": intentional_lemmas}, "POS": "VERB"}]],
    )

    return {
        "quoi_verbs": quoi_verb_forms,
        "comment_phrases": comment_phrases,
        "pourquoi_phrases": pourquoi_phrases,
        "tok": tok_matcher,
    }


_MATCHERS = _build_matchers(_NLP)


def _status_for(hits: float, per_100: float) -> str:
    if hits >= _THRESHOLDS["covered_min_hits"] and per_100 >= _THRESHOLDS["covered_rate"]:
        return "covered"
    if hits >= _THRESHOLDS["partial_min_hits"] and per_100 >= _THRESHOLDS["partial_rate"]:
        return "partial"
    return "absent"


def score_transcript(text: str) -> dict[str, Any]:
    """
    Score a single transcript against the three phases.

    Returns:
      {
        "token_count": int,
        "quoi":     {"hits": int, "per_100_tok": float, "status": str},
        "comment":  {...},
        "pourquoi": {...}
      }

    Hits are counted with de-duplication on token spans — overlapping matches
    at the same position count once per phase.
    """
    if not text or not text.strip():
        empty = {"hits": 0, "per_100_tok": 0.0, "status": "absent"}
        return {"token_count": 0, "quoi": dict(empty), "comment": dict(empty), "pourquoi": dict(empty)}

    doc = _NLP(text)
    token_count = len([t for t in doc if not t.is_punct and not t.is_space])

    def count_unique_spans(matches: list[tuple[int, int, int]]) -> int:
        # matches: list of (match_id, start, end) — dedupe by (start, end) span.
        return len({(s, e) for _, s, e in matches})

    # Phrase matches.
    quoi_hits = count_unique_spans(_MATCHERS["quoi_verbs"](doc))
    comment_hits = count_unique_spans(_MATCHERS["comment_phrases"](doc))
    pourquoi_hits = count_unique_spans(_MATCHERS["pourquoi_phrases"](doc))

    # Token-level matches — partition by match id.
    tok_matches = _MATCHERS["tok"](doc)
    by_label: dict[str, set[tuple[int, int]]] = {
        "QUOI_1P_VERB": set(),
        "COMMENT_GERUNDIVE": set(),
        "POURQUOI_POUR_INF": set(),
        "POURQUOI_INTENT_VERB": set(),
    }
    for match_id, start, end in tok_matches:
        label = _NLP.vocab.strings[match_id]
        if label in by_label:
            by_label[label].add((start, end))

    # Generic 1p-verb fallback is weaker evidence than the allowlist: count
    # every 2 fallback matches as 1 hit. Keeps recall for rare craft verbs
    # without letting "je fais / je dis / je pense" saturate Quoi.
    quoi_hits += len(by_label["QUOI_1P_VERB"]) // 2
    comment_hits += len(by_label["COMMENT_GERUNDIVE"])
    pourquoi_hits += (
        len(by_label["POURQUOI_POUR_INF"])
        + len(by_label["POURQUOI_INTENT_VERB"])
    )

    # Normalise per 100 tokens; avoid divide-by-zero.
    norm = 100.0 / max(token_count, 1)

    def pack(hits: int) -> dict[str, Any]:
        per_100 = round(hits * norm, 2)
        return {"hits": int(hits), "per_100_tok": per_100, "status": _status_for(hits, per_100)}

    return {
        "token_count": token_count,
        "quoi": pack(quoi_hits),
        "comment": pack(comment_hits),
        "pourquoi": pack(pourquoi_hits),
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
    """Hot-reload the lexicon JSON. Useful when tuning markers without restarting."""
    global _LEXICON, _THRESHOLDS, _MATCHERS
    _LEXICON = _load_lexicon()
    _THRESHOLDS = _LEXICON["thresholds"]
    _MATCHERS = _build_matchers(_NLP)
    logger.info("coverage lexicon reloaded")
