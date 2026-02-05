# Video Elicitation Annotation Tool - AI Agent Instructions

## Quick Start (TL;DR)

**What it does**: Research tool capturing expert craftsmen knowledge via video annotation with audio elicitations → AI pipeline (transcription/judge/tagging/review) for traditional crafts RAG system.

**Key Commands**:
```bash
# Windows startup (handles venv, deps, auto-migration, server)
start.bat

# Manual: Run from backend/ directory
cd backend && python main.py
```

**Architecture**: FastAPI async backend + vanilla JS frontend + SQLite + WebSocket real-time updates  
**Port**: `8005` (not 8000!)  
**Critical Dependencies**: 
- `FIREWORKS_API_KEY` (required in `.env`) - powers ALL AI services (Whisper transcription + Llama 3.3 70B LLM)
- French language throughout (prompts, UI, transcription)

**Import Pattern** (CRITICAL):
```python
# In backend files: Use relative imports WITHOUT package notation
import database as db  # ✓ CORRECT
from backend import database  # ✗ WRONG - breaks direct execution
```

**Background Processing Pipeline**: Annotation → Transcription → Judge → Tagging → Review (each stage broadcasts WebSocket updates)

**Database**: Unified `migration.py` system (6 idempotent migrations). To add columns: edit `migration.py`, register in `MIGRATIONS` list, run `python backend/migration.py`

**Development Guides**: See `/guides/` directory for recent feature documentation (task editing, tagging upgrades)

**Common Pitfall**: Don't use `db.get_session()` in background tasks - create new session with `AsyncSessionLocal()` instead

---

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

### Database Migration System
**Single unified system**: `backend/migration.py` (7+ idempotent migrations, ~500 lines)
```bash
python backend/migration.py              # Run all pending migrations (auto-runs on start.bat)
python backend/migration.py --check      # Dry-run: show what would happen
python backend/migration.py --reset      # DANGER: Delete and recreate database
```
**Key principle**: All migrations check if columns exist before adding (idempotent, safe to run multiple times)
**To add new migration**: 
1. Define `def migration_NNN_name(cursor) -> str` in `migration.py`
2. Register in `MIGRATIONS` list: `("NNN_name", migration_NNN_name)`
3. Run `python migration.py`
See inline comments in `migration.py` for examples and patterns

**Latest migration**: Video segments table (migration_007_add_video_segments)

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
   - If `needs_review=false` → Shows "Force Review" button (allows manual override)
   - If `needs_review=true` → Auto-triggers next stage (tagging)
4. **Background Task 3**: `process_tagging()` → Extracts tools/materials/techniques → broadcasts `tagging_complete`
5. **Background Task 4**: `process_review()` → Multi-dimensional quality analysis (HOW/EVAL/FEEDBACK) + salience detection → broadcasts `review_complete`
6. **Background Task 5**: `process_task_detection()` → Auto-detects task name from transcription → stores in `detected_task`

```python
# All background tasks use AsyncSessionLocal() to create independent sessions
async with db.AsyncSessionLocal() as session:
    await db.update_annotation(session, annotation_id, update_data)
```

**Key Services**:
- **judge_service.py**: Determines if elicitation needs AI review (lightweight gatekeeper) - **NO CONFIDENCE METRIC** (removed Feb 2026)
- **review_service.py**: Multi-dimensional quality assessment + salience detection
- **tagging_service.py**: Extracts structured metadata (tags) for RAG retrieval
- **task_detector_service.py**: Auto-detects task name from transcription (conservative detection)
- **llm_service.py**: Domain-specific LLM prompts (glassblowing, jewelry) - DEPRECATED for new features

### WebSocket Message Types
Frontend must handle these real-time events:
- `annotation_created` - New annotation saved
- `transcription_status: "processing"` - Whisper started
- `transcription_complete` - Whisper done, includes `transcription` text
- `transcription_error` - Whisper failed
- `judge_status: "processing"` - Judge analysis started
- `judge_complete` - Judge done, includes `judge_decision` (needs_review, reasoning, missing_elements, strengths) **NO CONFIDENCE**
- `judge_error` - Judge failed
- `tagging_status: "processing"` - Tag extraction started
- `tagging_complete` - Tags extracted, includes array of tags with `name` and `category`
- `tagging_error` - Tagging failed
- `review_status: "processing"` - Multi-dimensional review started
- `review_complete` - Review done, includes `review_results` (dimensions, prompts, salience) + `is_salient` flag
- `review_error` - Review failed
- `annotation_deleted` - Cleanup trigger
- `task_detection_complete` - Task auto-detected, includes `detected_task` name

### Database Schema Highlights
```python
# Annotation model has FIVE processing pipelines (see backend/models.py Annotation class):
transcription_status: pending/processing/completed/failed
judge_status: pending/processing/completed/failed
judge_decision: Text (JSON string with needs_review, reasoning, missing_elements, strengths)
detected_task: Text (auto-detected task name from transcription, nullable)
tagging_status: pending/processing/completed/failed
tags: Text (JSON array of {name, category} objects)
review_status: pending/processing/completed/failed/skipped
review_results: Text (JSON string with tier, score, dimensions[HOW/EVAL/FEEDBACK], priority_prompts)
review_attempts: Integer (tracks re-review cycles)
is_salient: Integer (1=salient moment, 0=not salient)

# Craft/domain context (affects LLM prompts):
craft: String (e.g., "glassblowing", "jewelry", "scientific_glassblowing")
task: String (free text or from Tasks taxonomy)
detected_task: String (nullable - auto-detected task name from transcription via task_detector_service)

# Video Segments (NEW - for focused elicitation work):
VideoSegment model: parent_video_id, name, start_time, end_time, thumbnail_path, created_at, updated_at
- Relationship: Video has many segments (cascade delete)
- Used to create sub-clips of videos for annotation workflow

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
5. Run `python backend/migration.py` to auto-add columns (or restart via `start.bat`)
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
    currentTab: 'annotate',  // Active tab: 'annotate', 'projects', 'segment'
    // Segmentation state (NEW)
    segmentVideoId: null,    // Video being segmented
    segmentVideoElement: null, // Video player for segmentation
    segments: [],            // Created segments for current video
    segmentStartTime: null,  // Segment start marker
    segmentEndTime: null,    // Segment end marker
    // ... recording state, WebSocket, etc.
};
```

All UI updates check this state - no framework, pure DOM manipulation. Three tabs: Annotate (main), Projects (dataset organization), Segment (video trimming).

**Tab Management**: `switchTab(tabName)` clears previous tab state and initializes new tab (annotate/projects/segment)

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
    "judge_decision": {"needs_review": true, "reasoning": "...", "missing_elements": [...], "strengths": [...]},
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
print(judge_result)  # {"needs_review": true, "reasoning": "...", "missing_elements": [...], "strengths": [...]}

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
# Schema auto-creates on first run
# Database location: chroma_langchain_db/annotations.db
# To reset: delete annotations.db and restart server

# Inspect manually:
pip install sqlite-web
sqlite_web chroma_langchain_db/annotations.db
```

### Recent Feature Documentation
Check `/guides/` directory for detailed feature upgrade documentation:
- **Task Editing**: Inline edit for detected tasks (removed unreliable confidence scores)
- **Tagging Upgrade**: Enforced 4-word max for RAG-optimized tags

## API Endpoints Reference

**40+ endpoints across 7 resource groups. All async, use FastAPI dependency injection for sessions.**

### Health & Frontend (2 endpoints)
- `GET /` - Serve index.html frontend application
- `GET /api/health` - Health check with whisper model info

### Video Management (8 endpoints)
- `POST /api/videos/upload` - Upload video file (multipart/form-data) - returns VideoResponse
- `GET /api/videos` - List all videos with pagination
- `GET /api/videos/{video_id}` - Get video metadata
- `GET /api/videos/{video_id}/file` - Stream video file (supports range requests)
- `PUT /api/videos/{video_id}` - Update video metadata (project_id, batch_position, craft, task)
- `DELETE /api/videos/{video_id}` - Delete video and associated annotations
- `GET /api/videos/local/browse?directory=C:\path` - Browse local filesystem for videos
- `POST /api/videos/local/register` - Register local video file without copying (see `is_local` flag)

### Project Management (6 endpoints)
- `POST /api/projects` - Create new dataset project (name, description)
- `GET /api/projects` - List all projects with video counts
- `GET /api/projects/{project_id}` - Get project details
- `GET /api/projects/{project_id}/videos` - List videos in project (ordered by batch_position)
- `PUT /api/projects/{project_id}` - Update project (name, description)
- `DELETE /api/projects/{project_id}` - Delete project and unlink videos

### Tag Management (2 endpoints)
- `GET /api/tags` - List all tags with usage counts and categories
- `GET /api/tags/{tag_name}` - Get single tag details (name, category, usage_count)

### Task Taxonomy (3 endpoints)
- `GET /api/tasks?craft=jewelry&published=1` - List tasks filtered by craft/publish status
- `POST /api/tasks` - Create new task (name, craft, description, is_published)
- `DELETE /api/tasks/{task_name}?craft=jewelry` - Delete task for specific craft

### Annotation Management (8 endpoints)
- `POST /api/annotations` - Create annotation with audio recording (multipart: video_id, start_time, end_time, audio_blob, craft, task) - **auto-triggers transcription**
- `GET /api/annotations` - List annotations (paginated, can filter by video_id)
- `GET /api/annotations/{annotation_id}` - Get annotation details with all pipeline results
- `PUT /api/annotations/{annotation_id}` - Update annotation (transcription, craft, task, feedback, etc.)
- `DELETE /api/annotations/{annotation_id}` - Delete annotation and audio file
- `POST /api/annotations/{annotation_id}/feedback` - Submit thumbs up/down feedback with choice array
- `POST /api/annotations/{annotation_id}/review` - **Manually trigger AI review** (multi-dimensional assessment + salience)
- `POST /api/annotations/{annotation_id}/tags` - **Manually trigger tagging** (extract metadata)

### Maintenance & Diagnostics (3 endpoints)
- `POST /api/maintenance/auto-trigger-tagging` - Run tagging on all annotations with needs_review=true
- `POST /api/maintenance/deduplicate-tags` - Merge duplicate tags and update annotation references
- `GET /api/diagnostics/tagging-fireworks` - Debug endpoint: show last Fireworks API request/response for tagging

### Export (1 endpoint)
- `GET /api/export/{video_id}` - Export all annotations for video as JSON with full pipeline results

### Video Segments (4 endpoints)
- `POST /api/segments` - Create new video segment (requires parent_video_id, start_time, end_time, optional name)
- `GET /api/segments/video/{video_id}` - List all segments for a parent video (ordered by start_time)
- `GET /api/segments/{segment_id}` - Get specific segment details
- `PUT /api/segments/{segment_id}` - Update segment (name, start_time, end_time)
- `DELETE /api/segments/{segment_id}` - Delete video segment

## Testing New Services Before Integration

**Pattern for validating new AI services before merging into main pipeline:**

### 1. **Unit Test in Python REPL** (No database needed)
```python
# From backend/ directory
cd backend
python

# Import and test function synchronously
from new_service import analyze_something

# Test with French text (project uses French)
result = await analyze_something("Expert décrit la technique...")
assert result["needs_review"] is not None  # Check expected output structure
print(result)
```

### 2. **Integration Test with Real Annotation** (Full pipeline)
```python
# From backend/ directory
import asyncio
from database import AsyncSessionLocal
from new_service import analyze_something_async

async def test():
    # Get real annotation with transcription
    async with AsyncSessionLocal() as session:
        annotation = await db.get_annotation(session, 123)  # Use real annotation ID
        
        result = await analyze_something_async(annotation.transcription)
        print(f"Result: {result}")
        
        # Verify JSON serializable (will be stored in database)
        import json
        json_str = json.dumps(result)
        print(f"Serialized: {json_str}")

asyncio.run(test())
```

### 3. **WebSocket Broadcasting Validation** (Real-time frontend updates)
```python
# In main.py, add temporary debugging code:
async def process_new_service(annotation_id: int, transcription: str):
    try:
        # Broadcast "processing" status
        await manager.broadcast({
            "type": "new_service_status",
            "status": "processing",
            "annotation_id": annotation_id
        })
        
        # Run service
        result = await new_service_function(transcription)
        
        # Broadcast results
        await manager.broadcast({
            "type": "new_service_complete",
            "annotation_id": annotation_id,
            "results": result  # Frontend expects this structure
        })
    except Exception as e:
        await manager.broadcast({
            "type": "new_service_error",
            "annotation_id": annotation_id,
            "error": str(e)
        })
```

### 4. **Database Serialization** (JSON fields must be valid)
```python
# All complex fields stored as JSON strings, not objects
import json
from models import AnnotationUpdate

# ✅ CORRECT - serialize to JSON string before storing
update_data = models.AnnotationUpdate(
    new_service_results=json.dumps({"tier": 1, "score": 85})
)

# ❌ WRONG - passing dict directly
# update_data = models.AnnotationUpdate(new_service_results={"tier": 1})  # FAILS
```

### 5. **Idempotency Check** (Service must be safe to re-run)
```python
# Service should handle:
# - Already processed annotations (check status != "pending")
# - Partial results from previous failures
# - Re-running with same input produces same output

# Before adding to background pipeline, verify:
# 1. Multiple runs with same input → same output
# 2. No side effects (no file deletions, external API side effects)
# 3. Can safely interrupt and resume
```

### 6. **Performance Baseline** (Don't block UI)
```python
import time

# Measure execution time
start = time.time()
result = await new_service(test_transcription)
elapsed = time.time() - start

print(f"Processing time: {elapsed:.2f}s")

# ✅ Good: < 5 seconds (non-blocking background task)
# ⚠️  Warning: 5-30 seconds (background task, may timeout)
# ❌ Bad: > 30 seconds (exceeds typical WebSocket timeout)
```

### 7. **Error Handling** (Consistent with project patterns)
```python
# Follow the project error handling pattern:
try:
    result = await my_service(text)
except HTTPException:
    raise  # FastAPI exceptions pass through
except Exception as e:
    logger.error(f"Service error: {e}")
    raise HTTPException(status_code=500, detail=str(e))

# For background tasks (no HTTP response):
# Catch all exceptions and broadcast error via WebSocket
```

### Checklist Before Integrating into Pipeline
- ✅ Output structure documented (expected keys, types)
- ✅ Handles French text correctly (no ASCII-only assumptions)
- ✅ JSON serializable results (no datetime, custom objects)
- ✅ Idempotent (safe to re-run)
- ✅ Performance baseline < 30 seconds per annotation
- ✅ Error messages logged and broadcast via WebSocket
- ✅ Database migration added if new columns needed (see `backend/migration.py` for pattern)
- ✅ Frontend handler added for WebSocket messages (js/app.js)
- ✅ Tested with real annotations and Fireworks API (not mocked)

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
js/app.js              # All JS logic (~3100 lines - no bundler)
css/styles.css         # Complete styling

backend/
├── main.py            # Entry point (run from backend dir) - 2255 lines, 34+ endpoints
├── database.py        # Async SQLAlchemy operations
├── models.py          # SQLAlchemy ORM + Pydantic schemas (5 tables)
├── config.py          # Centralized configuration and paths
├── transcription.py   # Fireworks Whisper client
├── judge_service.py   # LLM judge (needs_review decision)
├── review_service.py  # Multi-dimensional review + salience
├── tagging_service.py # Tag extraction (5 categories)
├── task_detector_service.py # Auto-detect tasks from transcription
├── migration.py       # Unified migration system (6 idempotent migrations) ← IMPORTANT: NEW SYSTEM
├── llm_service.py     # Legacy extended transcript service (deprecated)
└── test_imports.py    # Quick test for imports and basic setup

chroma_langchain_db/   # Database location
└── annotations.db     # SQLite database (auto-created/migrated)

data/                  # Git-ignored runtime data
├── videos/            # Uploaded videos (UUID prefixed)
├── audio/             # WAV recordings (annotation_{uuid}.wav)
└── exports/           # JSON exports with timestamps

.venv/                 # Python virtual environment (created by start.bat)

guides/                # Feature documentation and upgrade guides
├── CONFIDENCE_REMOVAL_AND_TASK_EDITING.md  # Judge confidence removal + task editing (Feb 2026)
└── TAGGING_PROMPT_UPGRADE.md              # Tag length enforcement + RAG optimization (Feb 2026)

evaluation/            # Testing data and results (not actively used)
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
**Transcription → Judge → Tagging → Review (with Salience) + Task Detection**

1. **Judge Service** (`judge_service.py`):
   - Lightweight completeness assessment
   - Outputs: `needs_review` (bool), `reasoning`, `missing_elements`, `strengths`
   - If `needs_review=false` → Shows "Force Review" button (allows manual override)
   - If `needs_review=true` → Auto-triggers tagging

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

4. **Task Detection Service** (`task_detector_service.py`) - NEW:
   - Automatically identifies performative tasks from transcription text
   - Conservative approach - only assigns clear, explicit task names
   - Outputs: `detected_task` (string or null), `confidence` (0-1), `reasoning`
   - Can run during transcription or manually via API

### Video Segmentation System (NEW)
Professional video trimmer interface for creating focused annotation workflows:
- **Purpose**: Create named time segments (e.g., "Étirage n°2") from long videos for targeted elicitation
- **UI Features**: Dark-themed timeline scrubber with cyan accents, drag handles, manual time inputs
- **Playback Control**: Auto-pause at segment end time using `timeupdate` event listener
- **Workflow**: Set start/end markers → create segment → load segment for annotation
- **Frontend Tab**: Dedicated "Segment" tab with overlay controls on video player
- **Integration**: Segments appear in video selector as sub-items under parent videos

**Segmentation Implementation Details**:
```javascript
// Frontend: app.js segment functions (~450 lines)
- loadVideoForSegmentation(videoId)  // Initialize segment tab
- createSegment()                     // Create segment with name, times
- loadVideoSegment(videoId, segment) // Load and auto-pause at end_time
- seekToSegment(segmentId)           // Jump to segment start
- editSegment(segmentId)             // Update segment metadata
- deleteSegment(segmentId)           // Remove segment

// Backend: database.py segment CRUD
- create_video_segment(session, segment_data)
- get_video_segment(session, segment_id)
- get_segments_by_video(session, video_id)
- update_video_segment(session, segment_id, update_data)
- delete_video_segment(session, segment_id)
``ol"}, ...]`
   - Auto-triggers review after completion

3. **Review Service** (`review_service.py`):
   - Multi-dimensional quality assessment (HOW/EVAL/FEEDBACK)
   - Salience detection (pedagogical value for apprentices)
   - Outputs tier (1-4), score (0-100), dimension coverage, priority prompts
   - Can be manually re-triggered via `POST /api/annotations/{id}/review`

### Projects System
Videos can be organized into projects (datasets) with batch ordering:
```python
# Projects have many videos, videos belong to optional projectconservative LLM approach)
- `backend/migration.py` - **UNIFIED migration system** (includes video_segments table migration)
video.project_id  # Nullable - videos can exist standalone
video.batch_position  # Integer position in batch (for ordered annotation workflows)
video.craft  # Domain context (glassblowing, jewelry, etc.)
```

API endpoints: `POST /api/projects`, `GET /api/projects/{id}/videos`, `PUT /api/videos/{id}` to assign project/position

### Video Source Types
Three ways to load & Auto-Detection
Structured task descriptions per craft domain:
```python
task = {"name": "sertissage", "craft": "jewelry", "description": "...", "is_published": 1}
```
API: `GET /api/tasks?craft=jewelry&published=1`, `POST /api/tasks`, `DELETE /api/tasks/{name}?craft=...`

**Task Auto-Detection** (NEW): `task_detector_service.py` automatically analyzes transcriptions to identify performative tasks
- Conservative by design - only assigns task names for explicit, actionable descriptions
- Returns `detected_task` (string or null) and `confidence` (0-1)
12. **Segment playback must auto-pause** - remove old `_segmentEndHandler` before adding new one in `loadVideoSegment()`
13. **Task detection is conservative** - only returns `detected_task` for explicit performative descriptions, not general explanations
- Distinguishes performative actions from general descriptions/history/concepts
- Example: "L'expert explique comment on polit les arêtes" → `detected_task="polissage"er` with filepath

### Tasks Taxonomy
Structured task descriptions per craft domain:
```python
task = {"name": "sertissage", "craft": "jewelry", "description": "...", "is_published": 1}
```
API: `GET /api/tasks?craft=jewelry&published=1`, `POST /api/tasks`, `DELETE /api/tasks/{name}?craft=...`

## Key Files Reference

- `backend/config.py` - ALL configuration, file paths, API settings, environment variables, LLM settings (PORT=8005)
- `backend/main.py` - Complete API surface (34+ endpoints, 2255 lines), WebSocket manager, 5 background processing pipelines
- `backend/models.py` - Database schema (5 tables: projects, videos, annotations, tags, tasks) + Pydantic schemas (432 lines)
- `backend/database.py` - All CRUD operations, uses `AsyncSessionLocal()` for background tasks
- `backend/judge_service.py` - Completeness assessment (needs_review decision, confidence removed Feb 2026)
- `backend/review_service.py` - Multi-dimensional review + salience detection (HOW/EVAL/FEEDBACK)
- `backend/tagging_service.py` - Tag extraction (5 categories for RAG, max 4 words per tag)
- `backend/task_detector_service.py` - Auto-detect tasks from transcription
- `backend/migration.py` - **UNIFIED migration system** (6 idempotent migrations, replaces scattered migrate_*.py files)
- `backend/llm_service.py` - LEGACY extended transcript service (not used in current pipeline)
- `backend/transcription.py` - Fireworks Whisper API client
- `js/app.js` - Complete frontend logic (3101 lines - search for function names like `loadVideos`, `updateReviewResults`)
- `start.bat` - Windows startup script (venv, deps, migration, server launch)
- `guides/CONFIDENCE_REMOVAL_AND_TASK_EDITING.md` - Judge confidence removal + inline task editing feature (Feb 2026)
- `guides/TAGGING_PROMPT_UPGRADE.md` - Tag length enforcement (max 4 words) + RAG optimization (Feb 2026)

## Avoiding Common Mistakes

1. **Don't import backend modules with package notation** - use `import module` not `from backend import module`
2. **Don't forget asyncio.create_task()** for background processing - blocks UX otherwise
3. **Don't use db.get_session() in background tasks** - create new session with `AsyncSessionLocal()`
4. **Don't manually modify annotations.db** - let unified `backend/migration.py` handle schema changes (auto-runs on start.bat)
5. **Port is 8005 not 8000** - check `backend/config.py` line 31 (README.md shows outdated port 8000)
6. **Don't return JSON from LLM** - use key-value format (see `review_service.py` for pattern)
7. **Don't skip WebSocket broadcasts** - frontend relies on real-time updates for all AI services
8. **Database is in chroma_langchain_db/annotations.db** not `elicitations_db/` - check `config.py` DATABASE_URL
9. **Frontend expects JSON strings for complex fields** - serialize `tags`, `judge_decision`, `review_results` before storing
10. **LLM temperature is 1, max_tokens is 4096** - changed from earlier versions (0.9 / 360 tokens)
11. **Don't edit individual migration files** - use unified `backend/migration.py` system instead

## Testing Approach
- **No automated test suite** - manual testing with real audio/video (see `evaluation/` for test data)
- Test full pipeline: Transcription → Judge → Tagging → Review
- Monitor WebSocket messages in browser DevTools Network > WS tab
- Check backend logs for API errors (Fireworks quota, network issues, JSON parsing)
- Use `GET /api/diagnostics/tagging-fireworks` to check last Fireworks API request/response
- Test individual services with Python REPL (see "Common Workflows" section above)
- `backend/test_imports.py` - Quick sanity check for imports and basic setup

## Domain Context
Traditional crafts video annotation for AI-assisted learning (Moodle plugin integration planned). Target crafts: glassblowing, jewelry making, scientific glassblowing. Videos show expert craftsmen explaining techniques in French. AI pipeline captures:
- **Explicit knowledge**: Transcribed verbal explanations
- **Tacit knowledge**: Tools, materials, techniques extracted via tagging
- **Quality assessment**: Multi-dimensional review identifies gaps in procedural knowledge
- **Pedagogical value**: Salience detection highlights critical moments for apprentices

**Research Goal**: Build RAG system with rich metadata for retrieval and generation of apprentice-focused learning content.

## Additional AI Agent Instructions

This repository contains additional agent-specific instructions in `.github/instructions/`:

- **`markdown_guides.instructions.md`**: Directs agents to use `/guides/` folder for documentation
- **`system_prompt.instructions.md`**: Defines "patient coding mentor" role for learning-focused interactions

These instructions complement this main guide and apply to specific interaction patterns with AI coding assistants.
