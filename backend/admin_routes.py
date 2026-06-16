"""
Admin routes — integration test runner via Server-Sent Events.

Endpoints:
  POST /api/admin/token       — exchange long-lived secret for a short-lived SSE token
  GET  /api/admin/tests       — test catalogue (JSON)
  GET  /api/admin/run?suite=… — SSE stream of pytest output

Auth flow:
  Regular fetch requests (tests catalogue): send the secret in the
  Authorization header — "Authorization: Bearer <ADMIN_SECRET>".

  EventSource cannot send custom headers, so /api/admin/run uses a
  short-lived token instead:
    1. POST /api/admin/token  { "secret": "..." }  → { "token": "...", "expires_in": 60 }
    2. new EventSource("/api/admin/run?suite=all&token=<token>")

  Tokens expire after 60 seconds and are never written to access logs.

  If ADMIN_SECRET is not set, all endpoints are open (trusted internal
  network / port-forward only).

suite=all   → full 13-test suite (tests share state, must run in order)
suite=light → independent tests only (01-04)
suite=<id>  → single test by name (only safe for independent tests)
"""

import asyncio
import json
import re
import secrets
import sys
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import ADMIN_SECRET

router = APIRouter(prefix="/api/admin", tags=["admin"])

BACKEND_DIR = Path(__file__).resolve().parent

# Short-lived SSE tokens: {token: expiry_monotonic}
_TOKEN_TTL = 60
_tokens: dict[str, float] = {}


def _issue_token() -> str:
    now = time.monotonic()
    # Purge expired tokens
    for t in [k for k, exp in _tokens.items() if exp < now]:
        del _tokens[t]
    tok = secrets.token_urlsafe(32)
    _tokens[tok] = now + _TOKEN_TTL
    return tok


def _consume_token(token: str) -> bool:
    exp = _tokens.get(token)
    if exp is None or time.monotonic() > exp:
        _tokens.pop(token, None)
        return False
    return True


def _verify_secret(request: Request) -> None:
    """Authenticate admin requests. If ADMIN_SECRET is not set, access is open.

    Accepts two forms:
    - Authorization: Bearer <ADMIN_SECRET>  (regular fetch requests)
    - ?token=<short-lived-token>            (EventSource — can't set headers)
    """
    if not ADMIN_SECRET:
        return
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer ") and secrets.compare_digest(auth[7:], ADMIN_SECRET):
        return
    token = request.query_params.get("token", "")
    if token and _consume_token(token):
        return
    raise HTTPException(status_code=403, detail="Invalid admin secret")


class _TokenRequest(BaseModel):
    secret: str


@router.post("/token")
async def issue_token(req: _TokenRequest):
    """Exchange the long-lived secret for a short-lived SSE token (60 s)."""
    if ADMIN_SECRET and not secrets.compare_digest(req.secret, ADMIN_SECRET):
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    return {"token": _issue_token(), "expires_in": _TOKEN_TTL}

# Prevent concurrent test runs (they share a DB and file state)
_run_lock = asyncio.Lock()

TESTS = [
    {"id": "test_01_health",                   "label": "Health check",                     "independent": True},
    {"id": "test_02_stt_transcribe_only",      "label": "STT — Infomaniak Whisper",         "independent": True},
    {"id": "test_03_coverage_nlp_score",       "label": "NLP — Coverage score (spaCy)",     "independent": True},
    {"id": "test_04_coverage_nlp_aggregate",   "label": "NLP — Coverage aggregate",         "independent": True},
    {"id": "test_05_create_project",           "label": "CRUD — Create project",            "independent": False},
    {"id": "test_06_upload_dummy_video",       "label": "CRUD — Upload video",              "independent": False},
    {"id": "test_07_full_annotation_pipeline", "label": "Pipeline — STT + Judge (auto)",    "independent": False},
    {"id": "test_08_tagging_llm",              "label": "LLM — Tag extraction",             "independent": False},
    {"id": "test_09_task_detection",           "label": "LLM — Task detection",             "independent": False},
    {"id": "test_10_review_endpoint",          "label": "Endpoint — Review (stub)",         "independent": False},
    {"id": "test_11_diagnostics",              "label": "Endpoint — LLM diagnostics",       "independent": False},
    {"id": "test_12_export_corpus",            "label": "Endpoint — Corpus export",         "independent": False},
    {"id": "test_99_cleanup",                  "label": "Cleanup — Remove test artifacts",  "independent": False},
]


@router.get("/tests")
async def list_tests(request: Request):
    """Return the test catalogue — used by the admin page to build the list."""
    _verify_secret(request)
    return {"tests": TESTS}


@router.get("/run")
async def run_tests(
    request: Request,
    suite: str = "all",
):
    """
    SSE stream of pytest output.
    Each event is a JSON object:
      {"type": "output"|"pass"|"fail"|"info"|"done"|"error", "line": "..."}
    The final event has type "done" and includes returncode, passed, failed counts.
    """
    _verify_secret(request)

    if _run_lock.locked():
        async def _busy():
            yield f"data: {json.dumps({'type': 'error', 'line': 'Tests are already running — try again in a moment.'})}\n\n"
        return StreamingResponse(_busy(), media_type="text/event-stream")

    # Build pytest command
    if suite == "all":
        cmd = [
            sys.executable, "-m", "pytest", "test_integration.py",
            "-v", "-s", "--tb=short", "--no-header", "-p", "no:cacheprovider",
        ]
    elif suite == "light":
        nodes = [f"test_integration.py::{t['id']}" for t in TESTS if t["independent"]]
        cmd = [sys.executable, "-m", "pytest", *nodes, "-v", "-s", "--tb=short", "--no-header"]
    else:
        # Single test by id — validated against known test ids
        known_ids = {t["id"] for t in TESTS}
        if suite not in known_ids:
            async def _bad():
                yield f"data: {json.dumps({'type': 'error', 'line': f'Unknown test: {suite}'})}\n\n"
            return StreamingResponse(_bad(), media_type="text/event-stream")
        cmd = [
            sys.executable, "-m", "pytest", f"test_integration.py::{suite}",
            "-v", "-s", "--tb=short", "--no-header", "-p", "no:cacheprovider",
        ]

    async def _stream():
        async with _run_lock:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=str(BACKEND_DIR),
            )

            passed = failed = 0
            # Track the currently-executing test so we can attribute a
            # bare "PASSED" / "FAILED" line (which pytest emits on its own
            # line when the test produces -s print output).
            current_test: Optional[str] = None
            # Suppress RE_START once we enter pytest's warnings/summary section,
            # which re-uses bare test node IDs as section headings.
            in_warnings = False

            # Patterns
            RE_SAMELINE = re.compile(
                r"test_integration\.py::(\w+)\s+(PASSED|FAILED|ERROR)"
            )
            RE_START = re.compile(r"test_integration\.py::(\w+)\s*$")

            async for raw in proc.stdout:
                line = raw.decode("utf-8", errors="replace").rstrip()
                if not line:
                    continue

                lower = line.lower()
                if "warnings summary" in lower or "short test summary" in lower:
                    in_warnings = True
                    current_test = None

                same = RE_SAMELINE.search(line)
                start = RE_START.search(line)
                bare = line.strip()

                if same:
                    # e.g. "test_integration.py::test_01_health PASSED [ 7%]"
                    tid = same.group(1)
                    result = same.group(2)
                    current_test = None
                    if result == "PASSED":
                        passed += 1
                        ltype = "pass"
                    else:
                        failed += 1
                        ltype = "fail"
                    yield f"data: {json.dumps({'type': ltype, 'line': line, 'test_id': tid})}\n\n"

                elif start and bare == start.group(0).strip() and not in_warnings:
                    # e.g. "test_integration.py::test_03_coverage_nlp_score"
                    # (test starting, result not yet known)
                    current_test = start.group(1)
                    yield f"data: {json.dumps({'type': 'output', 'line': line, 'test_id': current_test, 'event': 'start'})}\n\n"

                elif bare in ("PASSED",) and current_test:
                    # Bare "PASSED" on its own line — belongs to current_test
                    passed += 1
                    tid, current_test = current_test, None
                    yield f"data: {json.dumps({'type': 'pass', 'line': line, 'test_id': tid})}\n\n"

                elif bare in ("FAILED", "ERROR") and current_test:
                    failed += 1
                    tid, current_test = current_test, None
                    yield f"data: {json.dumps({'type': 'fail', 'line': line, 'test_id': tid})}\n\n"

                elif line.startswith("  ["):
                    yield f"data: {json.dumps({'type': 'info', 'line': line})}\n\n"

                elif line.startswith("FAILED") or line.startswith("ERROR"):
                    yield f"data: {json.dumps({'type': 'fail', 'line': line})}\n\n"

                else:
                    yield f"data: {json.dumps({'type': 'output', 'line': line})}\n\n"

            returncode = await proc.wait()
            yield f"data: {json.dumps({'type': 'done', 'line': '', 'returncode': returncode, 'passed': passed, 'failed': failed})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # prevent nginx from buffering SSE
        },
    )
