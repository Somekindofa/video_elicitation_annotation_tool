"""
Coverage API routes.

Two stateless endpoints:
- POST /api/coverage/score      — transcript → per-phase score
- POST /api/coverage/aggregate  — list of per-annotation scores → per-video aggregate + plateau

Both are authenticated via the Moodle JWT dependency used elsewhere in the app.
The caller (Moodle plugin or frontend) is responsible for carrying the per-annotation
scores around; the backend keeps no state.
"""

from __future__ import annotations

import json
import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import MoodleUser, verify_moodle_jwt
import coverage_detector
import database_compat as db
import session_advisory_service

router = APIRouter(prefix="/api/coverage", tags=["coverage"])

logger = logging.getLogger(__name__)


# --- Schemas ---------------------------------------------------------------

PhaseStatus = Literal["absent", "partial", "covered"]


class PhaseScore(BaseModel):
    hits: int
    per_100_tok: float
    status: PhaseStatus


class Marker(BaseModel):
    text: str
    char_start: int
    char_end: int


class MarkerBuckets(BaseModel):
    quoi: list[Marker] = Field(default_factory=list)
    comment: list[Marker] = Field(default_factory=list)
    pourquoi: list[Marker] = Field(default_factory=list)


class Score(BaseModel):
    token_count: int
    quoi: PhaseScore
    comment: PhaseScore
    pourquoi: PhaseScore
    markers: MarkerBuckets = Field(default_factory=MarkerBuckets)


class ScoreRequest(BaseModel):
    transcript: str = Field(..., max_length=50_000)


class AggregateRequest(BaseModel):
    per_annotation_scores: list[Score] = Field(default_factory=list, max_length=200)


class AggregateResponse(BaseModel):
    aggregate: dict
    plateau: bool


class PhaseScoreIn(BaseModel):
    hits: int = Field(0, ge=0)
    per_100_tok: float = Field(0.0, ge=0.0)
    status: PhaseStatus = "absent"


class AnnotationForAdvisory(BaseModel):
    id: int
    transcription: str = Field("", max_length=10_000)


class SummaryRequest(BaseModel):
    video_id: int
    transcript: str = Field(..., min_length=1, max_length=60_000)
    phase_scores: dict[Literal["quoi", "comment", "pourquoi"], PhaseScoreIn]
    lang: Literal["fr", "en"] = "fr"
    annotations: list[AnnotationForAdvisory] = Field(default_factory=list, max_length=500)


class SummaryResponse(BaseModel):
    summary: str
    weakest_phase: Literal["quoi", "comment", "pourquoi"] | None = None
    follow_ups: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    advisory_flag: Optional[str] = None
    source: Literal["ai", "fallback"] = "fallback"
    advisory_id: Optional[int] = None


class AdvisoryDecisionRequest(BaseModel):
    advisory_id: int
    decision: Literal["continued", "ended"]


# --- Routes ----------------------------------------------------------------

@router.post("/score", response_model=Score)
async def score_endpoint(
    req: ScoreRequest,
    _user: MoodleUser = Depends(verify_moodle_jwt),
) -> dict:
    """Score a single annotation transcript against Quoi / Comment / Pourquoi."""
    return await coverage_detector.score_transcript(req.transcript)


@router.post("/aggregate", response_model=AggregateResponse)
async def aggregate_endpoint(
    req: AggregateRequest,
    _user: MoodleUser = Depends(verify_moodle_jwt),
) -> dict:
    """
    Aggregate per-annotation scores into a per-video total, and report whether
    the last two annotations added negligible new signal (plateau).
    """
    scores = [s.model_dump() for s in req.per_annotation_scores]

    if not scores:
        return {
            "aggregate": coverage_detector.aggregate_scores([]),
            "plateau": False,
        }

    # Progressive aggregates — plateau_detector compares consecutive snapshots.
    history = [coverage_detector.aggregate_scores(scores[: i + 1]) for i in range(len(scores))]

    return {
        "aggregate": history[-1],
        "plateau": coverage_detector.detect_plateau(history),
    }


# --- Summary (rule-based) --------------------------------------------------
# Generates a session summary from the phase scores without an external LLM
# call, since the craftpilot backend does not expose a structured summary
# endpoint.

_STATUS_ORDER = {"absent": 0, "partial": 1, "covered": 2}

_FOLLOW_UPS: dict[str, dict[str, list[str]]] = {
    "fr": {
        "quoi": [
            "Pouvez-vous décrire plus précisément les actions concrètes que vous réalisez ?",
            "Quels gestes effectuez-vous exactement à ce moment-là ?",
        ],
        "comment": [
            "Comment procédez-vous ? Pouvez-vous préciser la vitesse, l'outil ou la séquence ?",
            "De quelle manière réalisez-vous cette action (lentement, d'abord… puis…) ?",
        ],
        "pourquoi": [
            "Pour quelle raison faites-vous cela ? Quel est l'objectif visé ?",
            "Qu'est-ce qui se passerait si vous ne le faisiez pas ?",
        ],
    },
    "en": {
        "quoi": [
            "Could you describe more precisely the concrete actions you're performing?",
            "What gestures do you make exactly at that moment?",
        ],
        "comment": [
            "How do you proceed? Can you specify the speed, tool, or sequence?",
            "In what way do you carry out this action (slowly, first… then…)?",
        ],
        "pourquoi": [
            "Why do you do this? What is the intended goal?",
            "What would happen if you didn't do it?",
        ],
    },
}

# Phase labels are domain terms (Quoi/Comment/Pourquoi) — kept in French in
# both locales on purpose, matching the frontend's COVERAGE_PHASE_META.
_PHASE_LABELS = {"quoi": "Quoi", "comment": "Comment", "pourquoi": "Pourquoi"}

_SUMMARY_STRINGS = {
    "fr": {
        "covered": "Les phases {labels} sont bien couvertes.",
        "partial": "Les phases {labels} sont partiellement abordées.",
        "absent": "Les phases {labels} sont absentes de la session.",
        "complete": "La session est complète — les trois phases sont couvertes.",
    },
    "en": {
        "covered": "The {labels} phases are well covered.",
        "partial": "The {labels} phases are only partially covered.",
        "absent": "The {labels} phases are absent from the session.",
        "complete": "The session is complete — all three phases are covered.",
    },
}


def _build_summary(phase_scores: dict[str, PhaseScoreIn], lang: str = "fr") -> dict:
    phases = ["quoi", "comment", "pourquoi"]
    strings = _SUMMARY_STRINGS.get(lang, _SUMMARY_STRINGS["fr"])
    follow_ups_by_phase = _FOLLOW_UPS.get(lang, _FOLLOW_UPS["fr"])

    covered = [p for p in phases if phase_scores[p].status == "covered"]
    partial = [p for p in phases if phase_scores[p].status == "partial"]
    absent  = [p for p in phases if phase_scores[p].status == "absent"]

    # Weakest phase: lowest status; None if all covered.
    weakest: str | None = min(phases, key=lambda p: _STATUS_ORDER[phase_scores[p].status])
    if phase_scores[weakest].status == "covered":
        weakest = None

    parts = []
    if covered:
        labels = ", ".join(_PHASE_LABELS[p] for p in covered)
        parts.append(strings["covered"].format(labels=labels))
    if partial:
        labels = ", ".join(_PHASE_LABELS[p] for p in partial)
        parts.append(strings["partial"].format(labels=labels))
    if absent:
        labels = ", ".join(_PHASE_LABELS[p] for p in absent)
        parts.append(strings["absent"].format(labels=labels))

    summary = " ".join(parts) if parts else strings["complete"]

    # Follow-up questions for incomplete phases.
    follow_ups: list[str] = []
    for p in partial + absent:
        follow_ups.extend(follow_ups_by_phase[p])

    return {"summary": summary, "weakest_phase": weakest, "follow_ups": follow_ups}


@router.post("/summary", response_model=SummaryResponse)
async def summary_endpoint(
    req: SummaryRequest,
    user: MoodleUser = Depends(verify_moodle_jwt),
) -> dict:
    """
    Generate a session summary from the phase scores, localized to req.lang,
    augmented with an AI advisory when available (falls back to the
    deterministic summary on any guardrail/API failure — see
    session_advisory_service.generate_session_advisory).
    """
    base = _build_summary(req.phase_scores, req.lang)

    advisory = await session_advisory_service.generate_session_advisory(
        annotations=[a.model_dump() for a in req.annotations],
        lang=req.lang,
    )

    if advisory["source"] != "ai":
        return base

    row = await db.create_session_advisory(
        video_id=req.video_id,
        user_id=user.userid,
        suggestions=json.dumps(advisory["suggestions"]),
        concerns=json.dumps(advisory["concerns"]),
        advisory_flag=advisory["advisory_flag"],
        guard_verdict=advisory["guard_verdict"],
    )

    return {
        **base,
        "suggestions": advisory["suggestions"],
        "concerns": advisory["concerns"],
        "advisory_flag": advisory["advisory_flag"],
        "source": "ai",
        "advisory_id": row["id"],
    }


@router.post("/advisory-decision")
async def advisory_decision_endpoint(
    req: AdvisoryDecisionRequest,
    _user: MoodleUser = Depends(verify_moodle_jwt),
) -> dict:
    """Record whether the user continued or ended the session after seeing the AI advisory."""
    row = await db.record_advisory_decision(req.advisory_id, req.decision)
    if row is None:
        raise HTTPException(status_code=404, detail="Session advisory not found")
    return {"status": "success"}
