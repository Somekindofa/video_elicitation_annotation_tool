"""
Unit tests for coverage_detector's LLM-based Quoi/Comment/Pourquoi scoring.

The LLM call (_extract_phrases) is mocked — these tests exercise the
language-agnostic parts that matter regardless of what the LLM returns:
anti-hallucination substring verification, char offset computation, hit/status
thresholds, and graceful fallback on API failure. This mirrors the mocking
approach in test_session_advisory_service.py (test_integration.py is reserved
for real-API tests).

Run from the backend/ directory:
    python3 -m pytest test_coverage_detector.py -v
"""

from unittest.mock import AsyncMock, patch

import pytest

import coverage_detector as cd


def _mock_extract(phrases: dict[str, list[str]]):
    return AsyncMock(return_value=phrases)


@pytest.mark.asyncio
async def test_empty_transcript_is_absent():
    result = await cd.score_transcript("")
    assert result["token_count"] == 0
    for phase in ("quoi", "comment", "pourquoi"):
        assert result[phase] == {"hits": 0, "per_100_tok": 0.0, "status": "absent"}
        assert result["markers"][phase] == []


@pytest.mark.asyncio
async def test_verified_phrase_is_counted_with_correct_offsets():
    text = "Je prends la canne et je tourne doucement."
    with patch.object(cd, "_extract_phrases", _mock_extract({
        "quoi": ["je prends la canne"], "comment": [], "pourquoi": [],
    })):
        result = await cd.score_transcript(text)

    assert result["quoi"]["hits"] == 1
    marker = result["markers"]["quoi"][0]
    assert text[marker["char_start"]:marker["char_end"]].lower() == "je prends la canne"


@pytest.mark.asyncio
async def test_hallucinated_phrase_is_rejected():
    text = "Je prends la canne."
    with patch.object(cd, "_extract_phrases", _mock_extract({
        "quoi": ["je fais quelque chose qui n'est pas dans le texte"],
        "comment": [], "pourquoi": [],
    })):
        result = await cd.score_transcript(text)

    assert result["quoi"]["hits"] == 0
    assert result["markers"]["quoi"] == []


@pytest.mark.asyncio
async def test_duplicate_phrases_deduplicated():
    text = "Je chauffe le verre. Je chauffe le verre encore."
    with patch.object(cd, "_extract_phrases", _mock_extract({
        "quoi": ["je chauffe le verre", "Je chauffe le verre"],
        "comment": [], "pourquoi": [],
    })):
        result = await cd.score_transcript(text)

    assert result["quoi"]["hits"] == 1


@pytest.mark.asyncio
async def test_status_thresholds():
    text = " ".join(["mot"] * 100)  # 100 tokens, so per_100_tok == hits
    five_hits = [f"evidence phrase {i}" for i in range(5)]
    text_with_evidence = text + " " + " ".join(five_hits)

    with patch.object(cd, "_extract_phrases", _mock_extract({
        "quoi": five_hits, "comment": [], "pourquoi": [],
    })):
        result = await cd.score_transcript(text_with_evidence)

    assert result["quoi"]["status"] == "covered"
    assert result["comment"]["status"] == "absent"


@pytest.mark.asyncio
async def test_llm_failure_falls_back_to_absent():
    text = "Je prends la canne et je tourne."
    with patch.object(cd, "INFOMANIAK_API_KEY", ""):
        result = await cd.score_transcript(text)

    for phase in ("quoi", "comment", "pourquoi"):
        assert result[phase]["status"] == "absent"


@pytest.mark.asyncio
async def test_english_and_greek_transcripts_supported():
    """No per-language branching — the same code path verifies phrases in
    any language the LLM returns them in."""
    english = "I pick up the tool and turn it slowly because the glass needs even heat."
    with patch.object(cd, "_extract_phrases", _mock_extract({
        "quoi": ["I pick up the tool"],
        "comment": ["turn it slowly"],
        "pourquoi": ["because the glass needs even heat"],
    })):
        result = await cd.score_transcript(english)
    assert result["quoi"]["hits"] == 1
    assert result["comment"]["hits"] == 1
    assert result["pourquoi"]["hits"] == 1

    greek = "Παίρνω το εργαλείο και το γυρίζω αργά."
    with patch.object(cd, "_extract_phrases", _mock_extract({
        "quoi": ["Παίρνω το εργαλείο"], "comment": ["το γυρίζω αργά"], "pourquoi": [],
    })):
        result = await cd.score_transcript(greek)
    assert result["quoi"]["hits"] == 1
    assert result["comment"]["hits"] == 1


def test_aggregate_and_plateau_unchanged():
    """aggregate_scores/detect_plateau are pure math — unaffected by the LLM rewrite."""
    scores = [
        {"token_count": 100, "quoi": {"hits": 3}, "comment": {"hits": 1}, "pourquoi": {"hits": 0}},
        {"token_count": 100, "quoi": {"hits": 2}, "comment": {"hits": 1}, "pourquoi": {"hits": 0}},
    ]
    agg = cd.aggregate_scores(scores)
    assert agg["token_count"] == 200
    assert agg["quoi"]["hits"] == 5
    assert agg["quoi"]["status"] == "covered"
    assert agg["comment"]["status"] == "partial"
    assert agg["pourquoi"]["status"] == "absent"
