"""
Integration tests — the canonical way to verify the full system.

Every AI component and key endpoint is tested against real external APIs
(Infomaniak Whisper STT, Infomaniak Apertus LLM). No mocking.

Adding a new feature with an endpoint? Add its test here.

Run from the backend/ directory:
    python3 -m pytest test_integration.py -v -s

Prerequisites (auto-installed at setup time):
    pip3 install pytest pytest-asyncio httpx
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx
import pytest
import pytest_asyncio

# Backend must be on the import path when pytest is invoked from project root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ── Paths ─────────────────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
AUDIO_TEST_FILE = PROJECT_ROOT / "data" / "audio" / "audio_test_file.wav"

# ── Shared state (passed between ordered tests via module-level dict) ──────────
# Tests are ordered by name (01_, 02_, ..., 99_) so earlier tests populate
# state that later tests consume.
_state: dict[str, Any] = {}


# ── Fixture ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def client():
    """
    ASGI test client that wraps the FastAPI app in-process.
    No real HTTP server is started. Background asyncio tasks (transcription,
    judge, tagging) share the event loop with the tests, so polling works.

    STT language is patched to 'en' for the English harvard test audio.
    After the module finishes, 'fr' is restored.
    """
    # Patch STT language BEFORE main imports transcription at module level
    import transcription as _tr
    _tr.INFOMANIAK_STT_LANGUAGE = "en"

    from main import app
    from auth import create_moodle_jwt

    # Generate a JWT for userid=9999 — works in both standalone and Moodle modes.
    # In standalone mode (MOODLE_INTEGRATION=false) the header is ignored;
    # in Moodle mode it is verified with the configured secret.
    token = create_moodle_jwt(
        userid=9999,
        username="test_integration",
        contextid=0,
        roles=["admin"],
        expires_minutes=180,
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
        timeout=360.0,  # STT batch polling can take up to 5 min
    ) as ac:
        yield ac

    _tr.INFOMANIAK_STT_LANGUAGE = "fr"


# ── Polling helper ─────────────────────────────────────────────────────────────

async def _poll(
    client: httpx.AsyncClient,
    annotation_id: int,
    field: str,
    done_values: set,
    timeout: int = 300,
) -> dict:
    """
    Poll GET /api/annotations/{id} every 3 seconds until `field` is in
    `done_values`, then return the full annotation dict.
    Raises TimeoutError if the deadline is reached.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        resp = await client.get(f"/api/annotations/{annotation_id}")
        assert resp.status_code == 200, f"Poll failed: {resp.text}"
        data = resp.json()
        if data.get(field) in done_values:
            return data
        await asyncio.sleep(3)
    raise TimeoutError(
        f"annotation {annotation_id}: '{field}' never reached {done_values} "
        f"within {timeout}s"
    )


# ── Tests ──────────────────────────────────────────────────────────────────────

async def test_01_health(client: httpx.AsyncClient):
    """Server is up and the Infomaniak API key is configured."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["whisper_model"]["api_configured"] is True, (
        "INFOMANIAK_API_KEY not set — all STT and LLM tests will fail"
    )


async def test_02_stt_transcribe_only(client: httpx.AsyncClient):
    """
    STT — Infomaniak Whisper async batch API.
    Submits the 18-second Harvard speech WAV and expects a non-trivial
    english transcription back (real external API call).
    """
    assert AUDIO_TEST_FILE.exists(), f"Test audio missing at: {AUDIO_TEST_FILE}"

    with open(AUDIO_TEST_FILE, "rb") as f:
        resp = await client.post(
            "/api/annotations/transcribe-only",
            files={"audio_blob": ("audio_test_file.wav", f, "audio/wav")},
        )

    assert resp.status_code == 200, f"STT endpoint failed: {resp.text}"
    data = resp.json()
    assert "transcription" in data
    text = data["transcription"].strip()
    assert len(text) > 20, f"Transcription suspiciously short: {repr(text)}"
    _state["stt_text"] = text
    print(f"\n  [STT] {text[:120]}...")


async def test_03_coverage_nlp_score(client: httpx.AsyncClient):
    """
    NLP coverage scorer — local spaCy (fr_core_news_md) with French lexicon.
    Uses a French sentence to exercise the Quoi/Comment/Pourquoi detection
    and character-offset marker extraction.
    """
    sample = (
        "Je commence par chauffer le métal pour savoir ce que je veux faire, "
        "parce que la couleur indique la température et donc comment procéder."
    )
    resp = await client.post("/api/coverage/score", json={"transcript": sample})
    assert resp.status_code == 200, f"Coverage score failed: {resp.text}"
    data = resp.json()

    assert "token_count" in data and data["token_count"] > 0
    for phase in ("quoi", "comment", "pourquoi"):
        assert phase in data, f"Missing phase '{phase}'"
        s = data[phase]
        assert s["status"] in ("absent", "partial", "covered")
        assert isinstance(s["hits"], int) and s["hits"] >= 0

    assert "markers" in data
    for bucket in ("quoi", "comment", "pourquoi"):
        assert bucket in data["markers"]

    print(
        f"\n  [NLP] quoi={data['quoi']['status']}  "
        f"comment={data['comment']['status']}  "
        f"pourquoi={data['pourquoi']['status']}"
    )


async def test_04_coverage_nlp_aggregate(client: httpx.AsyncClient):
    """
    NLP coverage aggregation — combines multiple per-annotation scores
    and detects whether the corpus has reached a learning plateau.
    """
    scores = [
        {"token_count": 30, "quoi": {"hits": 3, "per_100_tok": 1.0, "status": "covered"},
         "comment": {"hits": 1, "per_100_tok": 0.3, "status": "partial"},
         "pourquoi": {"hits": 0, "per_100_tok": 0.0, "status": "absent"},
         "markers": {"quoi": [], "comment": [], "pourquoi": []}},
        {"token_count": 25, "quoi": {"hits": 2, "per_100_tok": 0.8, "status": "partial"},
         "comment": {"hits": 3, "per_100_tok": 1.2, "status": "covered"},
         "pourquoi": {"hits": 1, "per_100_tok": 0.4, "status": "partial"},
         "markers": {"quoi": [], "comment": [], "pourquoi": []}},
    ]
    resp = await client.post(
        "/api/coverage/aggregate", json={"per_annotation_scores": scores}
    )
    assert resp.status_code == 200, f"Coverage aggregate failed: {resp.text}"
    data = resp.json()
    assert "aggregate" in data
    assert "plateau" in data
    assert isinstance(data["plateau"], bool)
    print(f"\n  [NLP AGG] plateau={data['plateau']}")


async def test_05_create_project(client: httpx.AsyncClient):
    """Create a test project as the container for the test video."""
    resp = await client.post("/api/projects", json={
        "name": "Integration Test Project",
        "description": "Auto-created by test_integration.py — safe to delete",
    })
    assert resp.status_code == 200, resp.text
    _state["project_id"] = resp.json()["id"]


async def test_06_upload_dummy_video(client: httpx.AsyncClient):
    """
    Register a minimal dummy .mp4 file so annotations have a valid parent video.
    The server does not validate video content, only the file extension.
    """
    dummy_path = PROJECT_ROOT / "data" / "videos" / "_test_dummy.mp4"
    dummy_path.parent.mkdir(parents=True, exist_ok=True)
    dummy_path.write_bytes(b"DUMMY_MP4_FOR_INTEGRATION_TESTS")
    _state["dummy_video_path"] = dummy_path

    with open(dummy_path, "rb") as f:
        resp = await client.post(
            "/api/videos/upload",
            files={"file": ("_test_dummy.mp4", f, "video/mp4")},
        )

    assert resp.status_code in (200, 409), resp.text

    if resp.status_code == 200:
        _state["video_id"] = resp.json()["id"]
    else:
        # 409 = idempotent re-run; find the existing record
        list_resp = await client.get("/api/videos")
        videos = list_resp.json()
        match = [v for v in videos if "_test_dummy" in v.get("filename", "")]
        assert match, "Could not find the test dummy video after a 409 response"
        _state["video_id"] = match[0]["id"]


async def test_07_full_annotation_pipeline(client: httpx.AsyncClient):
    """
    Full annotation pipeline — creates annotation with the harvard WAV, then
    polls until both of these auto-triggered background tasks complete:
      1. Transcription  — Infomaniak Whisper async batch API
      2. Judge          — Infomaniak Apertus LLM (auto-triggered after STT)
    """
    video_id = _state["video_id"]

    with open(AUDIO_TEST_FILE, "rb") as f:
        resp = await client.post(
            "/api/annotations",
            params={"video_id": video_id, "start_time": 0.0, "end_time": 18.0},
            data={"craft": "glassblowing"},
            files={"audio_blob": ("audio_test_file.wav", f, "audio/wav")},
        )

    assert resp.status_code == 200, f"Annotation creation failed: {resp.text}"
    annotation_id = resp.json()["id"]
    _state["annotation_id"] = annotation_id
    print(f"\n  [PIPELINE] Annotation created: ID={annotation_id}")

    # 1. Wait for STT transcription
    data = await _poll(
        client, annotation_id, "transcription_status",
        {"completed", "failed"}, timeout=300,
    )
    assert data["transcription_status"] == "completed", (
        f"Transcription did not complete.\n  Annotation: {data}"
    )
    transcription = data.get("transcription", "")
    assert transcription, "Transcription text is empty after status=completed"
    _state["annotation_transcription"] = transcription
    print(f"  [STT] {transcription[:100]}...")

    # 2. Wait for judge (auto-triggered after transcription completes)
    data = await _poll(
        client, annotation_id, "judge_status",
        {"completed", "failed"}, timeout=120,
    )
    assert data["judge_status"] == "completed", (
        f"Judge did not complete.\n  Annotation: {data}"
    )
    judge_raw = data.get("judge_decision")
    judge = json.loads(judge_raw) if isinstance(judge_raw, str) else (judge_raw or {})
    assert "needs_review" in judge, f"Judge decision missing 'needs_review': {judge}"
    _state["judge_decision"] = judge
    print(f"  [JUDGE] needs_review={judge.get('needs_review')}")


async def test_08_tagging_llm(client: httpx.AsyncClient):
    """
    LLM Tagging — Infomaniak Apertus-70B extracts structured tags.
    Manually triggers tagging via the endpoint (independent of the judge's
    auto-pipeline decision) to guarantee the endpoint is exercised.
    """
    annotation_id = _state["annotation_id"]

    resp = await client.post(f"/api/annotations/{annotation_id}/tags")
    assert resp.status_code == 200, f"Tag trigger failed: {resp.text}"

    data = await _poll(
        client, annotation_id, "tagging_status",
        {"completed", "failed"}, timeout=120,
    )
    assert data["tagging_status"] == "completed", (
        f"Tagging did not complete.\n  Annotation: {data}"
    )

    tags_raw = data.get("tags")
    tags = json.loads(tags_raw) if isinstance(tags_raw, str) else (tags_raw or [])
    assert isinstance(tags, list)
    _state["tags"] = tags
    print(f"\n  [TAGGING] {len(tags)} tags: {[t.get('name') for t in tags]}")


async def test_09_task_detection(client: httpx.AsyncClient):
    """
    Task detector — LLM-based, auto-triggered after tagging completes.
    Status must reach 'completed'; detected_task may legitimately be null
    for generic speech that doesn't describe a single named craft technique.
    """
    annotation_id = _state["annotation_id"]

    data = await _poll(
        client, annotation_id, "detected_task_status",
        {"completed", "failed"}, timeout=120,
    )
    assert data["detected_task_status"] == "completed", (
        f"Task detection did not complete.\n  Annotation: {data}"
    )
    print(
        f"\n  [TASK] detected_task={data.get('detected_task')}  "
        f"confidence={data.get('detected_task_confidence')}"
    )


async def test_10_review_endpoint(client: httpx.AsyncClient):
    """
    Review endpoint — process_review is currently a no-op stub (replaced by
    spaCy coverage + Infomaniak summary on 2026-04-21). Endpoint must still
    return 200 and queue without error so the frontend flow isn't broken.
    """
    annotation_id = _state["annotation_id"]
    resp = await client.post(f"/api/annotations/{annotation_id}/review")
    assert resp.status_code == 200, resp.text
    assert resp.json().get("status") == "success"


async def test_11_diagnostics(client: httpx.AsyncClient):
    """Diagnostics endpoint reflects state from the LLM tagging call above."""
    resp = await client.get("/api/diagnostics/tagging-llm")
    assert resp.status_code == 200
    data = resp.json()
    assert "last_request_at" in data
    assert "last_status" in data
    print(f"\n  [DIAG] last_status={data['last_status']}")


async def test_12_export_corpus(client: httpx.AsyncClient):
    """Corpus export includes the annotation created during this test run."""
    resp = await client.get("/api/export/corpus?only_transcribed=true")
    assert resp.status_code == 200
    data = resp.json()
    assert "corpus" in data
    ids = [item["id"] for item in data["corpus"]]
    assert _state["annotation_id"] in ids, (
        f"Test annotation {_state['annotation_id']} not in exported corpus"
    )
    print(f"\n  [EXPORT] Corpus total: {data['total_annotations']} annotations")


async def test_99_cleanup(client: httpx.AsyncClient):
    """
    Delete all test artifacts created during this run.
    Named '99_' so pytest runs it last even if earlier tests fail.
    """
    ann_id = _state.get("annotation_id")
    if ann_id:
        r = await client.delete(f"/api/annotations/{ann_id}")
        print(f"\n  [CLEANUP] annotation {ann_id} → HTTP {r.status_code}")

    vid_id = _state.get("video_id")
    if vid_id:
        r = await client.delete(f"/api/videos/{vid_id}")
        print(f"  [CLEANUP] video {vid_id} → HTTP {r.status_code}")

    proj_id = _state.get("project_id")
    if proj_id:
        r = await client.delete(f"/api/projects/{proj_id}")
        print(f"  [CLEANUP] project {proj_id} → HTTP {r.status_code}")

    dummy = _state.get("dummy_video_path")
    if dummy and Path(str(dummy)).exists():
        Path(str(dummy)).unlink()
        print("  [CLEANUP] dummy video file removed")
