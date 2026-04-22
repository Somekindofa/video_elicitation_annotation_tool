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

import os
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
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


class Score(BaseModel):
    token_count: int
    quoi: PhaseScore
    comment: PhaseScore
    pourquoi: PhaseScore


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


# --- Summary proxy ---------------------------------------------------------
# Forwards to the craftpilot backend (Infomaniak LLM) with the shared
# X-Internal-Token. Keeping the browser off that backend means the internal
# token never leaves the server.

_CRAFTPILOT_URL = os.getenv("CRAFTPILOT_URL", "http://127.0.0.1:8000")
_INTERNAL_TOKEN = os.getenv("CRAFTPILOT_INTERNAL_TOKEN", "")


@router.post("/summary", response_model=SummaryResponse)
async def summary_endpoint(
    req: SummaryRequest,
    _user: MoodleUser = Depends(verify_moodle_jwt),
) -> dict:
    """Proxy to craftpilot's /api/session-summary (Infomaniak mistral3)."""
    if not _INTERNAL_TOKEN:
        raise HTTPException(status_code=503, detail="Summary service not configured")

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{_CRAFTPILOT_URL}/api/session-summary",
            json=req.model_dump(),
            headers={"X-Internal-Token": _INTERNAL_TOKEN, "Content-Type": "application/json"},
        )
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Upstream error: {r.text[:200]}")
    return r.json()
