# Video Elicitation Annotation Tool - AI Agent Instructions

## Project Overview
Research tool for the European "ReSource" project: annotate glassblowing videos with synchronized audio elicitations, automatic transcription (Whisper via Fireworks.ai), and AI-enhanced transcripts (Llama 3.1 via Fireworks.ai). Built for traditional crafts knowledge capture and RAG system integration.

**Architecture**: FastAPI async backend + vanilla JS frontend + SQLite + WebSocket real-time updates

## Critical Setup Knowledge

### Running the Application
```bash
# Windows: Use the startup script (handles venv, deps, directories)
start.bat

# Manual: Must run from backend directory
cd backend
python main.py
```

**Port**: `8005` (not 8000 - see `config.py`, README.md is outdated)

### Environment Requirements
- **FIREWORKS_API_KEY** required in `.env` or environment - used for BOTH Whisper transcription AND LLM extended transcripts
- **GOOGLE_DRIVE_API_KEY** optional in `.env` - enables public Google Drive folder access
- Virtual environment automatically created by `start.bat` (`.venv/` directory)
- No local Whisper model - all transcription is cloud-based via Fireworks.ai
- Database auto-migrates on startup (SQLite async via aiosqlite in `elicitations_db/`)

## Architecture Deep Dive

### Backend Module Import Pattern
**CRITICAL**: Backend uses **relative imports without package notation** to allow `python main.py` direct execution:
```python
# In backend/main.py
import database as db  # NOT: from backend import database
import models
from transcription import transcribe_audio_simple
from config import HOST, PORT
```

All backend files are in `backend/` but imported as if they're in the current directory when running `main.py` from `backend/`.

### Async Processing Pipeline
1. **Audio Recording** → `create_annotation()` saves WAV, returns immediately
2. **Background Task 1**: `process_transcription()` → Fireworks Whisper API → broadcasts via WebSocket
3. **Background Task 2**: `process_extended_transcript()` → Fireworks LLM API (Llama 3.1 70B) → broadcasts via WebSocket

```python
# Both tasks use AsyncSessionLocal() to create independent sessions
async with db.AsyncSessionLocal() as session:
    await db.update_annotation(session, annotation_id, update_data)
```

### WebSocket Message Types
Frontend must handle these real-time events:
- `annotation_created` - New annotation saved
- `transcription_status: "processing"` - Whisper started
- `transcription_complete` - Whisper done, includes `transcription` text
- `extended_transcript_status: "processing"` - LLM started  
- `extended_transcript_complete` - LLM done, includes `extended_transcript` text
- `extended_transcript_error` / `transcription_error` - Failures
- `annotation_deleted` - Cleanup trigger

### Database Schema Highlights
```python
# Annotation model has TWO processing pipelines:
transcription_status: pending/processing/completed/failed
extended_transcript_status: pending/processing/completed/failed

# Feedback system (French UI):
feedback: Integer (1=thumbs up, 0=thumbs down, null=no feedback)
feedback_choices: String (JSON array like "[1,0,1,1,0]")
```

### LLM System Prompt Context
Located in `backend/llm_service.py` - French language prompt specialized for glassblowing:
- Adds gesture details (hand positions, body movements)
- Identifies common mistakes
- Provides expert tips
- **Temperature 0.9** for creative enhancement (not factual extraction)
- Max 360 tokens, frequency_penalty 0.5, presence_penalty 0.3

## Development Patterns

### Adding New API Endpoints
1. Define Pydantic schemas in `models.py` (both SQLAlchemy and Pydantic schemas)
2. Add CRUD operations in `database.py` using async sessions
3. Create endpoint in `main.py` with `Depends(db.get_session)`
4. Broadcast WebSocket updates via `manager.broadcast()` if real-time needed

### Frontend State Management
Single `state` object in `app.js`:
```javascript
const state = {
    currentVideo: null,      // Video DOM element
    currentVideoId: null,    // Database ID
    videos: [],              // All uploaded videos
    annotations: [],         // Current video's annotations
    projects: [],            // Project list
    // ... recording state, WebSocket, etc.
};
```

All UI updates check this state - no framework, pure DOM manipulation.

### Export Format Structure
```json
{
  "video_file": "filename.mp4",
  "annotations": [{
    "transcription": "...",
    "extended_transcript": "...",  // LLM-enhanced
    "feedback": 1,
    "feedback_choices": [1, 0, 1, 1, 0]  // Array form
  }]
}
```

## Common Workflows

### Testing Transcription Pipeline
```python
# Backend test
python backend/test_imports.py

# Test LLM directly
from backend.llm_service import generate_extended_transcript
result = await generate_extended_transcript("Le souffleur de verre...")
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
- Extended transcripts are in French
- Feedback modal UI is French ("Merci pour votre avis...")
- Feedback choices are domain-specific to glassblowing techniques
- `FIREWORKS_LANGUAGE = "fr"` in config

### File Organization
```
frontend/
├── index.html          # Single-page app
├── js/app.js          # All JS logic (~1500 lines - no bundler)
└── css/styles.css     # Complete styling

backend/
├── main.py            # Entry point (run from backend dir)
├── database.py        # Async SQLAlchemy operations
├── models.py          # SQLAlchemy ORM + Pydantic schemas
├── transcription.py   # Fireworks Whisper client
├── llm_service.py     # Fireworks LLM client (Llama 3.3 70B)
├── gdrive_service.py  # Google Drive video streaming integration
└── config.py          # Centralized configuration and paths

elicitations_db/       # SQLite database directory
└── annotations.db     # Main database file

data/                  # Git-ignored runtime data
├── videos/            # Uploaded videos (UUID prefixed)
├── audio/             # WAV recordings (annotation_{uuid}.wav)
└── exports/           # JSON exports with timestamps

.venv/                 # Python virtual environment (created by start.bat)
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

**LLM**: `https://api.fireworks.ai/inference/v1/completions`  
- Model: `llama-v3p3-70b-instruct` (changed from 8B to 70B)
- Max tokens: 360 (concise enhancements)
- Temperature: 0.9 (creative additions)

### Browser APIs
- `MediaRecorder` API for WAV audio capture
- HTML5 `<video>` element (no framework wrapper)
- Native File API for video uploads
- WebSocket for bidirectional real-time updates

## Key Features & Components

### Projects System
Videos can be organized into projects (datasets) with batch ordering:
```python
# Projects have many videos, videos belong to optional project
project.videos  # Ordered by batch_position
video.project_id  # Nullable - videos can exist standalone
video.batch_position  # Integer position in batch (for ordered annotation workflows)
```

API endpoints: `POST /api/projects`, `GET /api/projects/{id}/videos`, `PUT /api/videos/{id}` to assign project/position

### Video Source Types
Three ways to load videos (see `video.source_type` and `video.is_local`):
1. **Uploaded** (`source_type="uploaded"`, `is_local=0`) - File copied to `data/videos/`
2. **Local** (`source_type="local"`, `is_local=1`) - File referenced by absolute path, no copying (for large GB files)
3. **Google Drive** (`source_type="gdrive"`) - Streamed from public GDrive folders via `gdrive_service.py`

Local video workflow: `GET /api/videos/local/browse?directory=C:\path` → `POST /api/videos/local/register` with filepath

### LLM Prompt Customization
`llm_service.py` contains domain-specific system prompts:
- `GLASSBLOWING_SYSTEM_PROMPT` - Default for glassblowing videos
- `JEWELRY_MAKING_SYSTEM_PROMPT` - Alternative for jewelry crafts
- **Currently active**: Jewelry prompt (line 87: `prompt = f"""{JEWELRY_MAKING_SYSTEM_PROMPT}...`)
- Change by swapping prompt variable in `generate_extended_transcript()`

## Key Files Reference

- `backend/config.py` - ALL configuration, file paths, API settings, environment variables
- `backend/main.py` - Complete API surface (26 endpoints), WebSocket manager, background task launchers
- `backend/llm_service.py` - Domain-specific system prompts for LLM (glassblowing/jewelry)
- `backend/database.py` - All CRUD operations, uses `AsyncSessionLocal()` for background tasks
- `backend/gdrive_service.py` - Google Drive API integration for video streaming
- `frontend/js/app.js` - Complete frontend logic (search for function names like `loadVideos`, `recordAnnotation`)
- `start.bat` - Windows startup script (venv creation, dependency install, server launch)

## Avoiding Common Mistakes

1. **Don't import backend modules with package notation** - use `import module` not `from backend import module`
2. **Don't forget asyncio.create_task()** for background processing - blocks UX otherwise
3. **Don't use db.get_session() in background tasks** - create new session with `AsyncSessionLocal()`
4. **Don't modify annotations.db directly** - auto-migration handles schema changes
5. **Port is 8005 not 8000** - check `config.py` HOST/PORT constants
6. **Frontend expects JSON strings for feedback_choices** - serialize arrays before storing
7. **LLM temperature is 0.9** - designed for creative enhancement, not factual extraction

## Testing Approach
- No automated test suite - use manual testing workflows from `TESTING_GUIDE.md`
- Test transcription → extended transcript pipeline with real audio
- Monitor WebSocket messages in browser DevTools
- Check backend logs for API errors (Fireworks quota, network issues)

## Domain Context
Glassblowing video annotation for AI-assisted learning (Moodle plugin integration planned). Videos show expert craftsmen explaining techniques in French. Extended transcripts add tacit knowledge about gestures, common errors, and expert tips that aren't always verbalized.
