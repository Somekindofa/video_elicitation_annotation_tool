# LLM Session Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rule-based `/api/coverage/summary` endpoint with an LLM call that reads the actual session transcript and produces a personalized, contextually grounded analysis.

**Architecture:** A new `session_analysis_service.py` (modelled after `judge_service.py`) holds the prompt and the async HTTP call to the Infomaniak Apertus-70B model. `coverage_routes.py` calls it from `summary_endpoint`, falls back to the existing `_build_summary()` on any LLM error, and enforces a per-user rate limit of 5 session analyses per hour. No frontend changes are required — the response shape (`summary`, `weakest_phase`, `follow_ups`) is unchanged.

**Tech Stack:** Python 3.11+, FastAPI, aiohttp, Pydantic v2, Infomaniak Apertus-70B via OpenAI-compatible API (`INFOMANIAK_LLM_API_URL`, `INFOMANIAK_LLM_MODEL`, `INFOMANIAK_API_KEY` from `config.py`), pytest + pytest-asyncio for integration tests.

---

## Conceptual Prompt Design

The prompt uses the same **keyed-line format** as `judge_service.py` — deterministic, no JSON from the LLM, parsed with `split(":", 1)`.

### System prompt (sent as `role: system`)

```
Vous êtes un coach pédagogique analysant une session d'élicitation d'expert.
L'élicitation vise à capturer trois phases d'un geste professionnel :
  - Quoi : les actions concrètes réalisées (gestes, outils, séquence)
  - Comment : la manière précise d'exécuter (vitesse, position, nuance)
  - Pourquoi : la raison ou l'objectif derrière l'action

Vous recevez le transcript complet de la session et les scores de couverture
des trois phases calculés automatiquement.

Votre tâche :
1. Écrire un résumé personnalisé de 2-3 phrases qui s'appuie sur ce que
   l'expert a RÉELLEMENT dit (citez ou paraphrasez), pas sur les scores seuls.
2. Identifier la phase la plus faible (si une est absente ou partielle).
3. Proposer 2-3 questions de relance spécifiques au contenu du transcript,
   pour guider l'expert à approfondir ce qui manque.

Règles :
- Ne répétez pas de formules génériques. Les questions doivent mentionner
  un élément concret issu du transcript.
- Si toutes les phases sont couvertes, WEAKEST_PHASE: none et proposez une
  question d'approfondissement sur le détail le plus riche du transcript.
- Répondez UNIQUEMENT en lignes "CLE: valeur". Pas de JSON. Pas de markdown.
- Les listes de follow-ups sont numérotées FOLLOW_UP_1, FOLLOW_UP_2, FOLLOW_UP_3.
- Booléens non requis ici. Longueur de SUMMARY : 2-3 phrases maximum.

CLES ATTENDUES (dans cet ordre) :
SUMMARY
WEAKEST_PHASE
FOLLOW_UP_1
FOLLOW_UP_2
FOLLOW_UP_3
```

### User message (built at call time)

```
TRANSCRIPT:
{full transcript — all annotation transcriptions joined by blank lines}

SCORES:
Quoi    — statut: {covered|partial|absent}, occurrences: {hits}
Comment — statut: {covered|partial|absent}, occurrences: {hits}
Pourquoi — statut: {covered|partial|absent}, occurrences: {hits}
```

### Response example

```
SUMMARY: L'expert décrit clairement la séquence de soufflage et nomme ses outils. La dimension "pourquoi" reste peu développée — la raison d'incliner la canne à 45° n'est pas expliquée.
WEAKEST_PHASE: pourquoi
FOLLOW_UP_1: Vous mentionnez incliner la canne — pour quelle raison précisément faites-vous ce geste à ce moment-là ?
FOLLOW_UP_2: Que se passerait-il si vous accélériez le soufflage au lieu de souffler lentement ?
FOLLOW_UP_3: Quel résultat visuel vous indique que la bulle a la bonne taille avant de la détacher ?
```

### Parser output

```python
{
    "summary": "L'expert décrit clairement...",
    "weakest_phase": "pourquoi",   # None if WEAKEST_PHASE is "none" or missing
    "follow_ups": ["Vous mentionnez...", "Que se passerait-il...", "Quel résultat..."]
}
```

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `backend/session_analysis_service.py` | Prompt constant, `_parse_analysis()`, `analyze_session()` async function |
| **Modify** | `backend/coverage_routes.py` | Make `summary_endpoint` async; call `analyze_session()`; fallback to `_build_summary()`; add rate limit |
| **Modify** | `backend/test_integration.py` | Integration test: POST `/api/coverage/summary` with a real transcript, assert LLM-generated summary differs from the rule-based canned sentences |

---

## Task 1: Create `session_analysis_service.py`

**Files:**
- Create: `backend/session_analysis_service.py`

- [ ] **Step 1: Write a failing unit test for `_parse_analysis()`**

Create a temporary test file `backend/test_session_analysis.py`:

```python
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from session_analysis_service import _parse_analysis

def test_parse_full_response():
    raw = (
        "SUMMARY: L'expert détaille bien les gestes mais évite les raisons.\n"
        "WEAKEST_PHASE: pourquoi\n"
        "FOLLOW_UP_1: Pourquoi inclinez-vous la canne à ce moment ?\n"
        "FOLLOW_UP_2: Quel signe visuel vous indique que c'est prêt ?\n"
        "FOLLOW_UP_3: Que se passerait-il si vous souffliez plus fort ?\n"
    )
    result = _parse_analysis(raw)
    assert result["summary"] == "L'expert détaille bien les gestes mais évite les raisons."
    assert result["weakest_phase"] == "pourquoi"
    assert len(result["follow_ups"]) == 3
    assert "inclinez" in result["follow_ups"][0]

def test_parse_all_covered():
    raw = (
        "SUMMARY: Session complète et riche en détails.\n"
        "WEAKEST_PHASE: none\n"
        "FOLLOW_UP_1: Pouvez-vous décrire la sensation au bout des doigts ?\n"
    )
    result = _parse_analysis(raw)
    assert result["weakest_phase"] is None
    assert len(result["follow_ups"]) == 1

def test_parse_missing_follow_ups():
    raw = "SUMMARY: Résumé court.\nWEAKEST_PHASE: quoi\n"
    result = _parse_analysis(raw)
    assert result["summary"] == "Résumé court."
    assert result["follow_ups"] == []
```

- [ ] **Step 2: Run the test to confirm it fails (module not found)**

```bash
cd /opt/video_elicitation_annotation_tool/backend
python3 -m pytest test_session_analysis.py -v
```

Expected: `ModuleNotFoundError: No module named 'session_analysis_service'`

- [ ] **Step 3: Create `session_analysis_service.py` with the prompt and parser**

```python
"""
Session analysis service.

Calls the Infomaniak Apertus-70B LLM to produce a personalised session
summary grounded in the actual transcript, replacing the rule-based
_build_summary() fallback when the API is reachable.
"""

import logging
from typing import Any

import aiohttp

from config import INFOMANIAK_API_KEY, INFOMANIAK_LLM_API_URL, INFOMANIAK_LLM_MODEL

logger = logging.getLogger(__name__)

ANALYSIS_SYSTEM_PROMPT = """Vous êtes un coach pédagogique analysant une session d'élicitation d'expert.
L'élicitation vise à capturer trois phases d'un geste professionnel :
  - Quoi : les actions concrètes réalisées (gestes, outils, séquence)
  - Comment : la manière précise d'exécuter (vitesse, position, nuance)
  - Pourquoi : la raison ou l'objectif derrière l'action

Vous recevez le transcript complet de la session et les scores de couverture
des trois phases calculés automatiquement.

Votre tâche :
1. Écrire un résumé personnalisé de 2-3 phrases qui s'appuie sur ce que
   l'expert a RÉELLEMENT dit (citez ou paraphrasez), pas sur les scores seuls.
2. Identifier la phase la plus faible (si une est absente ou partielle).
3. Proposer 2-3 questions de relance spécifiques au contenu du transcript,
   pour guider l'expert à approfondir ce qui manque.

Règles :
- Ne répétez pas de formules génériques. Les questions doivent mentionner
  un élément concret issu du transcript.
- Si toutes les phases sont couvertes, WEAKEST_PHASE: none et proposez une
  question d'approfondissement sur le détail le plus riche du transcript.
- Répondez UNIQUEMENT en lignes "CLE: valeur". Pas de JSON. Pas de markdown.
- Les listes de follow-ups sont numérotées FOLLOW_UP_1, FOLLOW_UP_2, FOLLOW_UP_3.
- Longueur de SUMMARY : 2-3 phrases maximum.

CLES ATTENDUES (dans cet ordre) :
SUMMARY
WEAKEST_PHASE
FOLLOW_UP_1
FOLLOW_UP_2
FOLLOW_UP_3"""


def _parse_analysis(text: str) -> dict[str, Any]:
    """Parse keyed-line LLM output into the SummaryResponse shape."""
    lines = [ln.strip() for ln in text.splitlines() if ":" in ln]
    kv: dict[str, str] = {}
    for ln in lines:
        key, val = ln.split(":", 1)
        kv[key.strip().upper()] = val.strip()

    weakest_raw = kv.get("WEAKEST_PHASE", "").lower()
    weakest = weakest_raw if weakest_raw in {"quoi", "comment", "pourquoi"} else None

    follow_ups = [
        kv[k]
        for k in ("FOLLOW_UP_1", "FOLLOW_UP_2", "FOLLOW_UP_3")
        if kv.get(k)
    ]

    return {
        "summary": kv.get("SUMMARY", ""),
        "weakest_phase": weakest,
        "follow_ups": follow_ups,
    }


def _build_user_message(transcript: str, phase_scores: dict) -> str:
    lines = ["TRANSCRIPT:", transcript, "", "SCORES:"]
    labels = {"quoi": "Quoi", "comment": "Comment", "pourquoi": "Pourquoi"}
    for phase, label in labels.items():
        s = phase_scores.get(phase, {})
        status = s.get("status", "absent") if isinstance(s, dict) else getattr(s, "status", "absent")
        hits = s.get("hits", 0) if isinstance(s, dict) else getattr(s, "hits", 0)
        lines.append(f"{label} — statut: {status}, occurrences: {hits}")
    return "\n".join(lines)


async def analyze_session(
    transcript: str,
    phase_scores: dict,
) -> dict[str, Any]:
    """
    Call the LLM to produce a personalised session analysis.

    Returns a dict with keys: summary, weakest_phase, follow_ups.
    Raises Exception on API failure so the caller can fall back.
    """
    if not INFOMANIAK_API_KEY:
        raise Exception("INFOMANIAK_API_KEY not configured")

    headers = {
        "Authorization": f"Bearer {INFOMANIAK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": INFOMANIAK_LLM_MODEL,
        "messages": [
            {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_message(transcript, phase_scores)},
        ],
        "max_tokens": 350,
        "temperature": 0.4,
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0,
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            INFOMANIAK_LLM_API_URL,
            headers=headers,
            json=payload,
            timeout=aiohttp.ClientTimeout(total=60),
        ) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"Infomaniak API {response.status}: {error_text[:200]}")

            result = await response.json()

    choices = result.get("choices", [])
    if not choices:
        raise Exception("Empty choices in Infomaniak response")

    content = choices[0]["message"]["content"].strip()
    logger.info(f"Session analysis LLM response: {content[:300]}")
    return _parse_analysis(content)
```

- [ ] **Step 4: Run the parser tests — they should pass now**

```bash
cd /opt/video_elicitation_annotation_tool/backend
python3 -m pytest test_session_analysis.py -v
```

Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
cd /opt/video_elicitation_annotation_tool
git add backend/session_analysis_service.py backend/test_session_analysis.py
git commit -m "feat: add LLM session analysis service with keyed-line prompt"
```

---

## Task 2: Wire the service into `coverage_routes.py`

**Files:**
- Modify: `backend/coverage_routes.py`

The `summary_endpoint` currently calls `_build_summary()` synchronously. We make it `async`, try `analyze_session()`, and fall back on any exception.

- [ ] **Step 1: Add the import and rate-limit dependency at the top of `coverage_routes.py`**

Open `backend/coverage_routes.py`. After the existing imports add:

```python
from main import _enforce_rate_limit
from session_analysis_service import analyze_session
```

> **Note:** `_enforce_rate_limit` is already defined in `main.py` and used there for other endpoints. Importing it here keeps the rate-limiting logic centralised.

- [ ] **Step 2: Replace `summary_endpoint` with the async version**

Find the existing function (currently lines ~187-193):

```python
@router.post("/summary", response_model=SummaryResponse)
async def summary_endpoint(
    req: SummaryRequest,
    _user: MoodleUser = Depends(verify_moodle_jwt),
) -> dict:
    """Generate a session summary from the phase scores."""
    return _build_summary(req.phase_scores)
```

Replace it with:

```python
@router.post("/summary", response_model=SummaryResponse)
async def summary_endpoint(
    req: SummaryRequest,
    current_user: MoodleUser = Depends(verify_moodle_jwt),
) -> dict:
    """Generate a personalised session analysis via LLM, falling back to rule-based summary."""
    # 5 LLM session analyses per user per hour.
    _enforce_rate_limit(f"session_analysis:{current_user.userid}", max_requests=5, window_seconds=3600)

    try:
        result = await analyze_session(req.transcript, {
            p: s.model_dump() for p, s in req.phase_scores.items()
        })
        # Ensure the result has all required fields before returning.
        if result.get("summary"):
            return result
        raise ValueError("Empty summary from LLM")
    except Exception as e:
        logger.warning(f"LLM session analysis failed, using rule-based fallback: {e}")
        return _build_summary(req.phase_scores)
```

Also add `import logging` and `logger = logging.getLogger(__name__)` near the top if not already present (check first — `coverage_routes.py` may not have them).

- [ ] **Step 3: Verify the module imports cleanly**

```bash
cd /opt/video_elicitation_annotation_tool/backend
python3 -c "from coverage_routes import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd /opt/video_elicitation_annotation_tool
git add backend/coverage_routes.py
git commit -m "feat: wire LLM analyze_session into /api/coverage/summary with rule-based fallback"
```

---

## Task 3: Integration test

**Files:**
- Modify: `backend/test_integration.py`

The existing integration tests hit live APIs (no mocking). This test does the same: POST a realistic French transcript to `/api/coverage/summary` and assert the LLM-produced summary is personalised (contains content from the transcript), not the canned rule-based sentence.

- [ ] **Step 1: Add the test at the end of `test_integration.py`**

```python
@pytest.mark.asyncio
async def test_99_session_analysis_llm(client):
    """
    POST /api/coverage/summary with a real transcript.
    The LLM response must:
    - Contain text from the transcript (personalisation check).
    - Not equal any canned rule-based sentence.
    - Return at least one follow-up question.
    """
    transcript = (
        "Je prends la canne et je la plonge dans le four à 1100 degrés. "
        "Je fais tourner lentement pour que le verre s'enroule uniformément autour. "
        "Ensuite je souffle doucement, par petites bouffées, pour agrandir la bulle progressivement."
    )
    phase_scores = {
        "quoi":    {"hits": 4, "per_100_tok": 8.0,  "status": "covered"},
        "comment": {"hits": 2, "per_100_tok": 4.0,  "status": "partial"},
        "pourquoi":{"hits": 0, "per_100_tok": 0.0,  "status": "absent"},
    }

    resp = await client.post(
        "/api/coverage/summary",
        json={"transcript": transcript, "phase_scores": phase_scores},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert "summary" in data
    assert len(data["summary"]) > 20, "Summary too short to be real"

    # Personalisation: LLM must reference something from the transcript
    summary_lower = data["summary"].lower()
    assert any(
        word in summary_lower
        for word in ("canne", "four", "souffl", "bulle", "verre", "tourner")
    ), f"Summary does not reference transcript content: {data['summary']}"

    # Must not be a canned rule-based sentence
    assert "Les phases" not in data["summary"], \
        "Got rule-based summary instead of LLM output"

    # Weakest phase should be pourquoi (absent)
    assert data.get("weakest_phase") == "pourquoi"

    # At least one follow-up
    assert len(data.get("follow_ups", [])) >= 1, "Expected at least one follow-up question"
```

- [ ] **Step 2: Run the integration test**

```bash
cd /opt/video_elicitation_annotation_tool/backend
python3 -m pytest test_integration.py::test_99_session_analysis_llm -v -s
```

Expected: PASSED (may take 5–15 s for the LLM call)

If it fails with a rate-limit or API error, check `INFOMANIAK_API_KEY` is set in the environment.

- [ ] **Step 3: Commit**

```bash
cd /opt/video_elicitation_annotation_tool
git add backend/test_integration.py
git commit -m "test: integration test for LLM-backed session analysis endpoint"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| LLM replaces rule-based summary | Task 2 — `analyze_session()` called first |
| Transcript actually read by backend | Task 1 — `_build_user_message()` includes full transcript |
| Personalised output grounded in transcript | Task 1 — prompt instructs model to cite/paraphrase |
| Graceful fallback if LLM fails | Task 2 — `except Exception` → `_build_summary()` |
| Rate limiting | Task 2 — `_enforce_rate_limit("session_analysis:...", 5, 3600)` |
| Response shape unchanged (no frontend changes) | Task 2 — `SummaryResponse` Pydantic model unchanged |
| Integration test | Task 3 |

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:** `phase_scores` is passed as `dict` (after `.model_dump()` on each `PhaseScoreIn`); `_build_user_message()` handles both dict and model shapes via `isinstance` guard. Consistent across Tasks 1 and 2.
