# Video Elicitation Annotation Tool - AI Agent Instructions

## Project Overview
Research tool for the European "ReSource" project: capture expert craftsmen knowledge through video annotation with synchronized audio elicitations, automatic transcription (Whisper), AI-powered quality assessment (Judge), multi-dimensional review (HOW/EVAL/FEEDBACK), salience detection, and automatic tagging. Built for traditional crafts knowledge capture and RAG system integration.

**Architecture**: FastAPI async backend + vanilla JS frontend + SQLite + WebSocket real-time updates

## Critical Setup Knowledge

### Running the Application
```bash
# Windows: Use the startup script (handles venv, deps, auto-migration, server start)
start.bat

# Manual: Must run from backend directory
cd backend
python main.py
```

**Port**: `8005` (not 8000 - see `backend/config.py`, README.md is outdated on this)

### Environment Requirements
- **FIREWORKS_API_KEY** required in `.env` or environment - used for ALL AI operations (Whisper transcription + Llama 3.3 70B LLM for judge/review/tagging)
- **GOOGLE_DRIVE_API_KEY** optional in `.env` - enables public Google Drive folder video streaming
- Virtual environment automatically created by `start.bat` (`.venv/` directory)
- No local Whisper model - all transcription is cloud-based via Fireworks.ai
- Database auto-migrates on startup (SQLite async via aiosqlite in `chroma_langchain_db/annotations.db`)

## Architecture Deep Dive

### Backend Module Import Pattern
**CRITICAL**: Backend uses **relative imports without package notation** to allow `python main.py` direct execution:
```python
# In backend/main.py
import database as db  # NOT: from backend import database
import models
from transcription import transcribe_audio_simple
from judge_service import judge_elicitation
from review_service import review_elicitation, assess_salience
from tagging_service import extract_tags
from config import HOST, PORT
```

All backend files are in `backend/` but imported as if they're in the current directory when running `main.py` from `backend/`.

### Async Processing Pipeline (Multi-Stage AI Analysis)
1. **Audio Recording** → `create_annotation()` saves WAV, returns immediately
2. **Background Task 1**: `process_transcription()` → Fireworks Whisper API → broadcasts `transcription_complete`
3. **Background Task 2**: `process_judge()` → LLM analyzes if elicitation needs review → broadcasts `judge_complete`
   - If `needs_review=false` with high confidence → Shows "Force Review" button (allows manual override)
   - If `needs_review=true` → Auto-triggers next stage (tagging)
4. **Background Task 3**: `process_tagging()` → Extracts tools/materials/techniques → broadcasts `tagging_complete`
5. **Background Task 4**: `process_review()` → Multi-dimensional quality analysis (HOW/EVAL/FEEDBACK) + salience detection → broadcasts `review_complete`

```python
# All background tasks use AsyncSessionLocal() to create independent sessions
async with db.AsyncSessionLocal() as session:
    await db.update_annotation(session, annotation_id, update_data)
```

**Key Services**:
- **judge_service.py**: Determines if elicitation needs AI review (lightweight gatekeeper)
- **review_service.py**: Multi-dimensional quality assessment + salience detection
- **tagging_service.py**: Extracts structured metadata (tags) for RAG retrieval
- **llm_service.py**: Domain-specific LLM prompts (glassblowing, jewelry) - DEPRECATED for new features

### WebSocket Message Types
Frontend must handle these real-time events:
- `annotation_created` - New annotation saved
- `transcription_status: "processing"` - Whisper started
- `transcription_complete` - Whisper done, includes `transcription` text
- `transcription_error` - Whisper failed
- `judge_status: "processing"` - Judge analysis started
- `judge_complete` - Judge done, includes `judge_decision` (needs_review, confidence, reasoning)
- `judge_error` - Judge failed
- `tagging_status: "processing"` - Tag extraction started
- `tagging_complete` - Tags extracted, includes array of tags with `name` and `category`
- `tagging_error` - Tagging failed
- `review_status: "processing"` - Multi-dimensional review started
- `review_complete` - Review done, includes `review_results` (dimensions, prompts, salience) + `is_salient` flag
- `review_error` - Review failed
- `annotation_deleted` - Cleanup trigger

### Database Schema Highlights
```python
# Annotation model has FIVE processing pipelines (see backend/models.py Annotation class):
transcription_status: pending/processing/completed/failed
judge_status: pending/processing/completed/failed
judge_decision: Text (JSON string with needs_review, confidence, reasoning, missing_elements, strengths)
tagging_status: pending/processing/completed/failed
tags: Text (JSON array of {name, category} objects)
review_status: pending/processing/completed/failed/skipped
review_results: Text (JSON string with tier, score, dimensions[HOW/EVAL/FEEDBACK], priority_prompts)
review_attempts: Integer (tracks re-review cycles)
is_salient: Integer (1=salient moment, 0=not salient)

# Craft/domain context (affects LLM prompts):
craft: String (e.g., "glassblowing", "jewelry", "scientific_glassblowing")
task: String (free text or from Tasks taxonomy)

# Legacy feedback system (French UI) - still present but not actively used:
feedback: Integer (1=thumbs up, 0=thumbs down, null=no feedback)
feedback_choices: String (JSON array like "[1,0,1,1,0]")
```

### AI Review Dimensions (Multi-Dimensional Quality Assessment)
Located in `backend/review_service.py` - French language prompts analyze 3 core dimensions + sensory indicators:

**Three Core Dimensions** (see `REVIEW_SYSTEM_PROMPT` and `REVIEW_KEYED_OUTPUT_INSTRUCTIONS`):
1. **HOW (Comment)**: Procedural execution details (tools, techniques, body positioning, spatial/temporal details)
2. **EVALUATION (Évaluation)**: Success criteria, quality indicators, sensory checks, measurable outcomes
3. **FEEDBACK (Retour d'Expérience)**: Common errors, symptoms, recovery strategies, troubleshooting

**Sensory Indicators**: Visual, tactile, auditory, proprioceptive cues for quality assessment

**Salience Detection** (see `SALIENCE_SYSTEM_PROMPT`): Determines if moment is pedagogically valuable for apprentices
- Must have explicit utility (critical gesture, key step, error risk, sensory signal)
- No inference allowed - only based on what's explicitly stated
- Returns boolean `is_salient` flag

**Key-Value Output Format**: LLM returns structured text (not JSON) parsed by custom parser
- Prevents JSON hallucination issues
- Example: `TIER: 1`, `SCORE: 85`, `READY: true`, `HOW_COVERED: true`, `HOW_PROMPTS: What tool... | Can you describe...`

## Development Patterns

### Adding New AI Services
1. Create service file in `backend/` (e.g., `new_service.py`) with LLM prompts
2. Use key-value output format (see `review_service.py` for pattern) - NOT JSON from LLM
3. Add background processing function in `main.py` (e.g., `async def process_new_service()`)
4. Add database fields to `models.py` (e.g., `new_service_status`, `new_service_results`)
5. Run `python backend/migrate_db.py` to auto-add columns (or restart via `start.bat`)
6. Add WebSocket broadcast events (`new_service_status`, `new_service_complete`, `new_service_error`)
7. Update frontend WebSocket handler in `js/app.js` to display results

### Adding New API Endpoints
1. Define Pydantic schemas in `models.py` (both SQLAlchemy and Pydantic schemas)
2. Add CRUD operations in `database.py` using async sessions
3. Create endpoint in `main.py` with `Depends(db.get_session)`
4. Launch background tasks with `asyncio.create_task(process_function(...))`
5. Broadcast WebSocket updates via `manager.broadcast()` for real-time UI updates

### Frontend State Management
Single `state` object in `js/app.js`:
```javascript
const state = {
    currentVideo: null,      // Video DOM element
    currentVideoId: null,    // Database ID
    videos: [],              // All uploaded videos
    annotations: [],         // Current video's annotations
    projects: [],            // Project list
    showReviewPanels: {},    // Track which review panels are visible
    // ... recording state, WebSocket, etc.
};
```

All UI updates check this state - no framework, pure DOM manipulation. Review panels toggle visibility on click.

### Export Format Structure
```json
{
  "video_file": "filename.mp4",
  "video_id": 123,
  "project_id": 5,
  "craft": "jewelry",
  "annotations": [{
    "id": 456,
    "start_time": 12.5,
    "end_time": 25.3,
    "transcription": "Expert describes technique...",
    "transcription_status": "completed",
    "judge_decision": {"needs_review": true, "confidence": 0.85},
    "tags": [{"name": "pince_brucelles", "category": "tool"}, {"name": "argent", "category": "material"}],
    "review_status": "completed",
    "review_results": {"tier": 1, "score": 85, "dimensions": {...}, "priority_prompts": [...]},
    "is_salient": 1,
    "craft": "jewelry",
    "task": "sertissage"
  }]
}
```

## Common Workflows

### Testing Full AI Pipeline
```python
# Test imports and basic setup
python backend/test_imports.py

# Test individual services (from backend/ directory)
from judge_service import judge_elicitation
from review_service import review_elicitation, assess_salience
from tagging_service import extract_tags

# Example: Test judge
judge_result = await judge_elicitation("Le maître explique comment tenir les pinces...")
print(judge_result)  # {"needs_review": true, "confidence": 0.9, ...}

# Example: Test tagging
tags = await extract_tags("Il utilise la pince brucelles sur l'argent...")
print(tags)  # [{"name": "pince_brucelles", "category": "tool"}, ...]
```

### Debugging WebSocket Issues
Check browser DevTools > Network > WS tab. Backend logs show:
```
WebSocket connected. Total connections: 1
Transcription completed for annotation 123
Extended transcript completed for annotation 123
```

### Database Inspection
```bash
# No ORM migrations - schema auto-creates
# To reset: delete data/annotations.db and restart server

# Inspect manually:
pip install sqlite-web
sqlite_web data/annotations.db
```

## Project-Specific Conventions

### French Language Context
- All LLM prompts and outputs are in French (judge, review, tagging)
- Review dimensions use French terminology: "Comment" (HOW), "Évaluation" (EVALUATION), "Retour d'Expérience" (FEEDBACK)
- UI is French ("Forcer la Révision", "Marqué comme Salient", "Complet")
- `FIREWORKS_LANGUAGE = "fr"` in config for Whisper transcription

### Domain-Specific Prompts
- **Glassblowing**: `GLASSBLOWING_SYSTEM_PROMPT` in `llm_service.py` (legacy)
- **Jewelry**: `JEWELRY_MAKING_SYSTEM_PROMPT` in `llm_service.py` (legacy)
- **Judge**: Domain-agnostic completeness assessment (`judge_service.py`)
- **Review**: Procedural knowledge quality analysis (`review_service.py`)
- **Tagging**: 5 categories - tool, material, technique, handling, sensation (`tagging_service.py`)

### Tag Categories (RAG-Optimized)
Tags extracted by `tagging_service.py` use strict categories:
- **tool**: Instruments, equipment (e.g., "pince_brucelles", "chalumeau")
- **material**: Raw materials (e.g., "argent", "verre", "or")
- **technique**: Actions, methods (e.g., "sertissage", "soudure", "polissage")
- **handling**: Body movements, grip patterns (e.g., "prise_delicate")
- **sensation**: Sensory indicators (e.g., "chaleur", "resistance")

### File Organization
```
index.html             # Single-page app (at project root)
js/app.js              # All JS logic (~2500 lines - no bundler)
css/styles.css         # Complete styling

backend/
├── main.py            # Entry point (run from backend dir) - 2000+ lines, 34+ endpoints
├── database.py        # Async SQLAlchemy operations
├── models.py          # SQLAlchemy ORM + Pydantic schemas (5 tables)
├── config.py          # Centralized configuration and paths
├── transcription.py   # Fireworks Whisper client
├── judge_service.py   # LLM judge (needs_review decision)
├── review_service.py  # Multi-dimensional review + salience
├── tagging_service.py # Tag extraction (5 categories)
├── llm_service.py     # Legacy extended transcript service (deprecated)
├── migrate_db.py      # Auto-migration script (reads models.py)
└── migrate_*.py       # Individual migration scripts (historical)

chroma_langchain_db/   # Database location
└── annotations.db     # SQLite database (auto-created/migrated)

data/                  # Git-ignored runtime data
├── videos/            # Uploaded videos (UUID prefixed)
├── audio/             # WAV recordings (annotation_{uuid}.wav)
└── exports/           # JSON exports with timestamps

.venv/                 # Python virtual environment (created by start.bat)

evaluation/            # Testing data and results (not actively used)
MIGRATIONS.md          # Database migration documentation
IMPLEMENTATION_GUIDE.md # Backend implementation details (may be outdated)
```

### Error Handling Pattern
```python
try:
    # Operation
except HTTPException:
    raise  # Pass through FastAPI exceptions
except Exception as e:
    logger.error(f"Context: {e}")
    raise HTTPException(status_code=500, detail=str(e))
```

## Integration Points

### Fireworks.ai APIs
**Transcription**: `https://audio-turbo.us-virginia-1.direct.fireworks.ai/v1/audio/transcriptions`
- Model: `whisper-v3-turbo`
- VAD: `silero` (voice activity detection)
- Temperature: 0 (deterministic)
- Language: French (`fr`)

**LLM** (used for all AI services): `https://api.fireworks.ai/inference/v1/completions`  
- Model: `llama-v3p3-70b-instruct` (not 8B)
- Max tokens: 4096 (changed from 360)
- Temperature: 1 (changed from 0.9)
- Used by: judge_service, review_service, tagging_service, llm_service (legacy)

### Browser APIs
- `MediaRecorder` API for WAV audio capture
- HTML5 `<video>` element (no framework wrapper)
- Native File API for video uploads
- WebSocket for bidirectional real-time updates

## Key Features & Components

### Multi-Stage AI Pipeline (Current Architecture)
**Transcription → Judge → Tagging → Review (with Salience)**

1. **Judge Service** (`judge_service.py`):
   - Lightweight completeness assessment
   - Outputs: `needs_review` (bool), `confidence` (0-1), `reasoning`, `missing_elements`, `strengths`
   - If `needs_review=false` + high confidence → user can force review manually
   - If `needs_review=true` → auto-triggers tagging

2. **Tagging Service** (`tagging_service.py`):
   - Extracts structured metadata for RAG retrieval
   - 5 categories: tool, material, technique, handling, sensation
   - Stored as JSON array: `[{"name": "pince_brucelles", "category": "tool"}, ...]`
   - Auto-triggers review after completion

3. **Review Service** (`review_service.py`):
   - Multi-dimensional quality assessment (HOW/EVAL/FEEDBACK)
   - Salience detection (pedagogical value for apprentices)
   - Outputs tier (1-4), score (0-100), dimension coverage, priority prompts
   - Can be manually re-triggered via `POST /api/annotations/{id}/review`

### Projects System
Videos can be organized into projects (datasets) with batch ordering:
```python
# Projects have many videos, videos belong to optional project
project.videos  # Ordered by batch_position
video.project_id  # Nullable - videos can exist standalone
video.batch_position  # Integer position in batch (for ordered annotation workflows)
video.craft  # Domain context (glassblowing, jewelry, etc.)
```

API endpoints: `POST /api/projects`, `GET /api/projects/{id}/videos`, `PUT /api/videos/{id}` to assign project/position

### Video Source Types
Three ways to load videos (see `video.source_type` and `video.is_local`):
1. **Uploaded** (`source_type="uploaded"`, `is_local=0`) - File copied to `data/videos/`
2. **Local** (`source_type="local"`, `is_local=1`) - File referenced by absolute path, no copying (for large GB files)
3. **Google Drive** (`source_type="gdrive"`) - Streamed from public GDrive folders (requires `GOOGLE_DRIVE_API_KEY`)

Local video workflow: `GET /api/videos/local/browse?directory=C:\path` → `POST /api/videos/local/register` with filepath

### Tasks Taxonomy
Structured task descriptions per craft domain:
```python
task = {"name": "sertissage", "craft": "jewelry", "description": "...", "is_published": 1}
```
API: `GET /api/tasks?craft=jewelry&published=1`, `POST /api/tasks`, `DELETE /api/tasks/{name}?craft=...`

## Key Files Reference

- `backend/config.py` - ALL configuration, file paths, API settings, environment variables, LLM settings
- `backend/main.py` - Complete API surface (34+ endpoints), WebSocket manager, 5 background processing pipelines
- `backend/models.py` - Database schema (5 tables: projects, videos, annotations, tags, tasks) + Pydantic schemas
- `backend/database.py` - All CRUD operations, uses `AsyncSessionLocal()` for background tasks
- `backend/judge_service.py` - Completeness assessment (needs_review decision)
- `backend/review_service.py` - Multi-dimensional review + salience detection (HOW/EVAL/FEEDBACK)
- `backend/tagging_service.py` - Tag extraction (5 categories for RAG)
- `backend/llm_service.py` - LEGACY extended transcript service (not used in current pipeline)
- `backend/transcription.py` - Fireworks Whisper API client
- `backend/migrate_db.py` - Auto-migration script (reads models.py, applies schema changes)
- `js/app.js` - Complete frontend logic (~2500 lines - search for function names like `loadVideos`, `updateReviewResults`)
- `start.bat` - Windows startup script (venv, deps, migration, server launch)
- `MIGRATIONS.md` - Database migration system documentation
- `IMPLEMENTATION_GUIDE.md` - Backend implementation details (may be outdated - check git blame)

## Avoiding Common Mistakes

1. **Don't import backend modules with package notation** - use `import module` not `from backend import module`
2. **Don't forget asyncio.create_task()** for background processing - blocks UX otherwise
3. **Don't use db.get_session() in background tasks** - create new session with `AsyncSessionLocal()`
4. **Don't modify annotations.db directly** - auto-migration handles schema changes (run `migrate_db.py`)
5. **Port is 8005 not 8000** - check `backend/config.py` lines 28-29
6. **Don't return JSON from LLM** - use key-value format (see `review_service.py` for pattern)
7. **Don't skip WebSocket broadcasts** - frontend relies on real-time updates for all AI services
8. **Database is in chroma_langchain_db/** not `elicitations_db/` - check `config.py` DATABASE_URL
9. **Frontend expects JSON strings for complex fields** - serialize `tags`, `judge_decision`, `review_results` before storing
10. **LLM temperature is 1, max_tokens is 4096** - changed from earlier versions (0.9 / 360 tokens)

## Testing Approach
- No automated test suite - use manual testing with real audio/video
- Test full pipeline: Transcription → Judge → Tagging → Review
- Monitor WebSocket messages in browser DevTools Network > WS tab
- Check backend logs for API errors (Fireworks quota, network issues, JSON parsing)
- Use `GET /api/diagnostics/tagging-fireworks` to check last Fireworks API request/response
- Test individual services with Python REPL (see "Common Workflows" section)

## Domain Context
Traditional crafts video annotation for AI-assisted learning (Moodle plugin integration planned). Target crafts: glassblowing, jewelry making, scientific glassblowing. Videos show expert craftsmen explaining techniques in French. AI pipeline captures:
- **Explicit knowledge**: Transcribed verbal explanations
- **Tacit knowledge**: Tools, materials, techniques extracted via tagging
- **Quality assessment**: Multi-dimensional review identifies gaps in procedural knowledge
- **Pedagogical value**: Salience detection highlights critical moments for apprentices

**Research Goal**: Build RAG system with rich metadata for retrieval and generation of apprentice-focused learning content.
