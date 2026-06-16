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

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import MoodleUser, verify_moodle_jwt
import coverage_detector

router = APIRouter(prefix="/api/coverage", tags=["coverage"])


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


class SummaryRequest(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=60_000)
    phase_scores: dict[Literal["quoi", "comment", "pourquoi"], PhaseScoreIn]


class SummaryResponse(BaseModel):
    summary: str
    weakest_phase: Literal["quoi", "comment", "pourquoi"] | None = None
    follow_ups: list[str] = Field(default_factory=list)


# --- Routes ----------------------------------------------------------------

@router.post("/score", response_model=Score)
async def score_endpoint(
    req: ScoreRequest,
    _user: MoodleUser = Depends(verify_moodle_jwt),
) -> dict:
    """Score a single annotation transcript against Quoi / Comment / Pourquoi."""
    return coverage_detector.score_transcript(req.transcript)


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

_FOLLOW_UPS_FR: dict[str, list[str]] = {
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
}

_PHASE_LABELS_FR = {"quoi": "Quoi", "comment": "Comment", "pourquoi": "Pourquoi"}
_STATUS_LABELS_FR = {"absent": "absent", "partial": "partiel", "covered": "couvert"}


def _build_summary(phase_scores: dict[str, PhaseScoreIn]) -> dict:
    phases = ["quoi", "comment", "pourquoi"]

    covered = [p for p in phases if phase_scores[p].status == "covered"]
    partial = [p for p in phases if phase_scores[p].status == "partial"]
    absent  = [p for p in phases if phase_scores[p].status == "absent"]

    # Weakest phase: lowest status; None if all covered.
    weakest: str | None = min(phases, key=lambda p: _STATUS_ORDER[phase_scores[p].status])
    if phase_scores[weakest].status == "covered":
        weakest = None

    # Build a short French summary sentence.
    parts = []
    if covered:
        labels = ", ".join(_PHASE_LABELS_FR[p] for p in covered)
        parts.append(f"Les phases {labels} sont bien couvertes.")
    if partial:
        labels = ", ".join(_PHASE_LABELS_FR[p] for p in partial)
        parts.append(f"Les phases {labels} sont partiellement abordées.")
    if absent:
        labels = ", ".join(_PHASE_LABELS_FR[p] for p in absent)
        parts.append(f"Les phases {labels} sont absentes de la session.")

    if not parts:
        summary = "La session est complète — les trois phases sont couvertes."
    else:
        summary = " ".join(parts)

    # Follow-up questions for incomplete phases.
    follow_ups: list[str] = []
    for p in partial + absent:
        follow_ups.extend(_FOLLOW_UPS_FR[p])

    return {"summary": summary, "weakest_phase": weakest, "follow_ups": follow_ups}


@router.post("/summary", response_model=SummaryResponse)
async def summary_endpoint(
    req: SummaryRequest,
    _user: MoodleUser = Depends(verify_moodle_jwt),
) -> dict:
    """Generate a session summary from the phase scores."""
    return _build_summary(req.phase_scores)
