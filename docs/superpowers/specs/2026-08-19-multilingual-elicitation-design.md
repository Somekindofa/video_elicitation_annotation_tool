# Multilingual Elicitation Pipeline — Design Spec

**Date:** 2026-08-19
**Status:** Draft (pending user review)

## Summary

The AI backend pipeline (STT, coverage detection, tagging, judge, task
detection) is hardcoded to French. When an interviewee spoke a different
language, Whisper was force-decoded as French (`language: "fr"`), producing
a garbled, auto-translated, truncated transcript — and everything downstream
inherited the damage.

This spec makes the pipeline detect and follow the **session language**
(what the interviewee actually spoke) end to end, with real support for
French, English, and Greek, and graceful degradation for any other language
Whisper detects. This is independent of the existing `currentLang` UI
toggle (fr/en) in `js/app.js`, which controls the interviewer's interface
text and is out of scope here.

## Two language concepts

| | UI language (`currentLang`) | Session language (new) |
|---|---|---|
| What it controls | Interviewer's interface text | STT decoding, coverage scoring, tagging, judge/task-detector output |
| Source | Existing toggle, `localStorage.appLang`, fr/en only | Detected by Whisper per recording |
| Scope of this change | Untouched | This entire spec |

Judge/task-detector output is written **in the session language** (per
user decision) — analysis prose matches the transcript, not the
interviewer's UI.

## 1. STT (`transcription.py`, `config.py`)

- Remove `INFOMANIAK_STT_LANGUAGE = "fr"` from the submit form in
  `transcribe_audio()` — omitting `language` lets Whisper auto-detect.
- The API response already includes a `language` field
  (`transcription.py:106`), currently read into the return dict but
  discarded by callers. Callers switch from `transcribe_audio_simple()`
  to `transcribe_audio()` so they get `language` back alongside `text`.

## 2. Data model

New column on `Annotation` (`models.py`):

```python
language = Column(String, nullable=True)  # ISO 639-1 code detected by Whisper (e.g. "fr", "en", "el")
```

Added via the existing auto-migration (`migrate_db.py` derives new columns
from `models.py` — no new migration tooling needed). Run after the model
change lands.

## 3. Propagation (`main.py`)

At both transcription call sites (audio upload handlers, currently
`transcribe_audio_simple`):
- switch to `transcribe_audio()`, store `result["language"]` on the
  `Annotation` row alongside `result["text"]`.
- pass `annotation.language` into `detect_task()`, `extract_tags()`, and
  `judge_elicitation()` calls.

Frontend (`js/app.js`): when calling `/api/coverage/score`, include the
annotation's `language` (already fetched as part of annotation data) in
the request body so `coverage_detector` can route to the right handling.

## 4. Coverage detector — full LLM replacement

`coverage_detector.py` currently does linguistic pattern matching with
spaCy (`fr_core_news_md`, French-only lexicon in `coverage_lexicon.json`).
Per decision, this is replaced **entirely** with an LLM-based classifier —
one code path for all languages, no per-language spaCy models or
hand-authored lexicons to maintain.

`score_transcript()` becomes `async` (it now makes an LLM call) — the
`/api/coverage/score` route in `coverage_routes.py` awaits it. The
module's current "pure function, no state" framing goes away; update the
docstring.

**New flow:**
1. Send the transcript to the Infomaniak LLM (same client `judge_service.py`
   uses) with a language-neutral prompt: identify, for each of Quoi/Comment/
   Pourquoi, the exact verbatim phrases in the transcript that count as
   evidence (concrete first-person action / manner details / causal-intent
   markers). Ask for quoted spans back, not offsets — LLMs are unreliable at
   raw character counting.
2. For each returned phrase, verify it appears in the transcript via
   substring search (case-insensitive) — same anti-hallucination pattern
   `tagging_service._filter_tags_against_transcript` already uses.
   Unverified phrases are dropped.
3. Compute `char_start`/`char_end` from the verified match position (first
   occurrence) — preserves the existing `MarkerBuckets` contract the
   frontend highlighting relies on.
4. `token_count` switches from spaCy tokenization to a simple regex word
   count (`\w+`), so it's language-agnostic.
5. `hits` = count of verified phrases per phase. `per_100_tok` and
   `status` (absent/partial/covered) keep the existing formula and
   thresholds in `coverage_lexicon.json` — those were already labeled
   "tune empirically once real transcripts are available," so they're not
   assumed correct, just kept as a starting point.
6. `aggregate_scores()` and `detect_plateau()` are pure math over hit
   counts — unchanged.

**Cleanup (optional, noted not required):** once nothing calls into spaCy,
`fr_core_news_md` and `spacy` can be dropped from `requirements.txt`. Left
as an implementation-time judgment call, not forced by this spec.

## 5. LLM prompt services (`tagging_service.py`, `judge_service.py`, `task_detector_service.py`)

These prompts stay mostly as-is (they're instructions to the LLM, not
user-facing text — an LLM reads its French instructions fine while
analyzing an English or Greek transcript). Two surgical additions instead
of maintaining three parallel translated prompt sets (avoids drift):

- **`tagging_service.py`**: tags are already required to appear verbatim
  in the transcript (existing rule), so they naturally come out in the
  session's language with no prompt change needed.
- **`judge_service.py`**: append an instruction so `reasoning`,
  `missing_elements`, `strengths` are written in the session language —
  pass the detected language in, map the code to a name (fr → français,
  en → English, el → Ελληνικά; anything else → "the same language as the
  transcript").
- **`task_detector_service.py`**: same instruction addition; also replace
  the hardcoded French user-prompt line (`"Quelle est la tâche ? ..."`)
  with an English instruction line (these are LLM instructions, not
  displayed text, so this is just for maintainability, not translation).

This generalizes past fr/en/el "for free" — any language Whisper detects
gets the same graceful instruction, just without curated examples.

## Out of scope

- Translating `js/app.js` UI strings to Greek, or adding a third UI
  language toggle.
- `session_advisory_service.py` / `coverage_routes.py`'s existing
  `lang: Literal["fr","en"]` summary feature — already correctly scoped to
  UI language (interviewer-facing), untouched by this spec.
- Retuning `coverage_lexicon.json` thresholds against real non-French
  transcripts — flagged as a known follow-up, not blocking.

## Testing

- Unit: `coverage_detector.score_transcript` against fixture transcripts
  in French, English, Greek — assert verified markers are real substrings
  and offsets resolve correctly.
- Integration: record (or use a fixture audio file) in a non-French
  language end to end — transcription, `Annotation.language` populated,
  coverage score returned, tags extracted in-language, judge reasoning in
  the session language.
- Regression: existing French fixtures/tests (`test_integration.py`,
  `test_session_advisory_service.py`) still pass — French behavior should
  not regress now that spaCy is gone from the coverage path.
