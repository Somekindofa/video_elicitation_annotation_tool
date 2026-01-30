# AI Elicitation Reviewer - Implementation Guide

## Implementation Status: Backend Complete, Frontend In Progress

### Completed Backend Changes ✅

#### 1. New Review Service (`backend/review_service.py`)
- **System Prompt**: French-language prompt analyzing 3 dimensions
  - **HOW**: Tools, techniques, body positioning, spatial/temporal details
  - **EVALUATION**: Sensory indicators, quality checks, measurable outcomes
  - **FEEDBACK**: Common errors, symptoms, recovery strategies

- **API Integration**: Fireworks LLM (same model as extended transcript)
- **Response Format**:
```json
{
  "completeness_score": 0-100,
  "dimensions": {
    "HOW": {
      "covered": false,
      "missing_elements": ["tool names", "spatial positioning"],
      "prompts": ["What specific tool...", "Can you describe hand position..."]
    },
    "EVALUATION": {...},
    "FEEDBACK": {...}
  },
  "priority_prompts": ["Most critical gap first"],
  "ready_to_proceed": false
}
```

#### 2. Data Model Updates (`backend/models.py`)
**Removed Fields**:
- `extended_transcript` (Text)
- `extended_transcript_status` (String)

**Added Fields**:
- `review_status` - pending/processing/completed/failed/skipped
- `review_results` - JSON string with full review object
- `review_timestamp` - When review completed
- `review_attempts` - Count of review cycles (for override logic)

#### 3. New API Endpoints (`backend/main.py`)
- **`POST /api/annotations/{id}/review`**
  - Triggers AI review of elicitation
  - Returns immediately, processes in background
  - Increments `review_attempts` counter

- **WebSocket Events Added**:
  - `review_status` - Processing started
  - `review_complete` - Review done, includes full review_results
  - `review_error` - Review failed

- **Removed Endpoints**:
  - `POST /api/annotations/{id}/regenerate-extended` (deleted)

#### 4. Modified Behavior
- **Transcription Flow**: After transcription completes → Auto-triggers AI review (not extended transcript)
- **Export Data**: Now includes `review_status` and `review_results` instead of `extended_transcript`
- **Tagging**: Now uses only `transcription` (not extended transcript)

---

### Frontend Changes Required 🚧

#### Files to Modify

**1. `js/app.js` - Remove Extended Transcript UI**
Lines to remove/replace:
- Lines 516-529: Extended transcript WebSocket handlers
- Lines 1093-1188: Extended transcript HTML generation
- Lines 1482-1513: `regenerateExtendedTranscript()` function
- Lines 1644-1677: `toggleExtendedTranscript()`, `updateExtendedTranscript()` functions

**New Functions Needed**:
```javascript
// Handle review WebSocket events
function handleReviewStatus(annotationId, status) {
    // Show "AI analyzing..." spinner
}

function handleReviewComplete(annotationId, reviewResults) {
    // Render review panel with dimensions
}

function renderReviewPanel(annotation) {
    // Create dimension cards (HOW/EVAL/FEEDBACK)
    // Show prompts, progress indicator
    // Add "Edit Elicitation" and "Mark Complete" buttons
}

async function editElicitation(annotationId) {
    // Open modal with current transcription
    // Allow editing
    // Re-trigger review on save
}

async function markElicitationComplete(annotationId) {
    // Allow proceeding even if not ready_to_proceed=true
    // After 2 attempts (review_attempts >= 2)
}
```

**2. `css/styles.css` - Remove Extended Transcript Styles**
Lines to remove: 1218+ (`.extended-transcript-*` classes)

**New Styles Needed**:
```css
/* Review Panel */
.review-panel {
    margin-top: 16px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 8px;
}

.dimension-card {
    background: white;
    padding: 12px;
    margin-bottom: 12px;
    border-left: 4px solid #28a745; /* Green if covered */
}

.dimension-card.incomplete {
    border-left-color: #ffc107; /* Yellow if incomplete */
}

.dimension-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
}

.prompts-list {
    margin-top: 12px;
    padding-left: 20px;
}

.prompt-item {
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
}

.address-prompt-btn {
    font-size: 12px;
    padding: 4px 8px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.progress-indicator {
    text-align: center;
    font-weight: bold;
    margin-bottom: 12px;
}

.progress-bar {
    height: 8px;
    background: #e9ecef;
    border-radius: 4px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: #28a745;
    transition: width 0.3s ease;
}

.review-actions {
    display: flex;
    gap: 12px;
    margin-top: 16px;
}

.edit-elicitation-btn {
    flex: 1;
    padding: 10px;
    background: #6c757d;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.mark-complete-btn {
    flex: 1;
    padding: 10px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.mark-complete-btn:disabled {
    background: #6c757d;
    cursor: not-allowed;
    opacity: 0.5;
}
```

**3. Edit Elicitation Modal**
New HTML structure:
```html
<div id="editElicitationModal" class="modal">
    <div class="modal-content">
        <span class="close">&times;</span>
        <h2>Edit Elicitation</h2>
        <p class="help-text">Add missing information based on AI review prompts:</p>
        <div id="promptsToAddress"></div>
        <textarea id="elicitationTextEdit" rows="10"></textarea>
        <div class="modal-actions">
            <button id="saveElicitationBtn">Save & Re-Review</button>
            <button class="cancel-btn">Cancel</button>
        </div>
    </div>
</div>
```

---

### Database Migration Notes

The SQLAlchemy models will **auto-migrate** on server restart:
- New columns (`review_status`, `review_results`, etc.) will be added
- Old columns (`extended_transcript`, `extended_transcript_status`) will remain but unused
  - **Safe to delete manually**: `ALTER TABLE annotations DROP COLUMN extended_transcript;`
  - Or leave them (will be ignored by new code)

Existing data:
- All annotations will have `review_status='pending'` initially
- Frontend should check `if (annotation.review_status === 'pending')` → show "Trigger Review" button

---

### Testing Checklist

#### Backend Tests
- [x] Review service parses French transcriptions correctly
- [x] API endpoint `/review` returns 400 if no transcription
- [x] WebSocket broadcasts `review_complete` with correct structure
- [ ] Short transcriptions (<20 words) handled gracefully
- [ ] Review attempts counter increments correctly

#### Frontend Tests
- [ ] Extended transcript UI completely removed
- [ ] Review panel renders after transcription completes
- [ ] Dimension cards show correct covered/incomplete status
- [ ] Prompts display in French
- [ ] Edit modal populates with current transcription
- [ ] Re-review triggered after edit saves
- [ ] "Mark Complete" button disabled until ready_to_proceed=true OR review_attempts>=2
- [ ] Progress indicator updates correctly (X/3 dimensions)

#### Integration Tests
- [ ] Full flow: Record → Transcribe → Auto-Review → Edit → Re-Review → Complete
- [ ] Multiple review cycles work correctly
- [ ] Export includes review results instead of extended transcript
- [ ] Old annotations (with extended_transcript) don't crash UI

---

### UX Flow Diagram

```
1. Expert records elicitation audio
   ↓
2. System transcribes via Whisper
   ↓
3. **NEW**: Auto-triggers AI review
   ↓
4. Review panel shows gaps in HOW/EVAL/FEEDBACK
   ↓
5. Expert clicks "Edit Elicitation" on specific prompt
   ↓
6. Modal opens with transcript + prompts
   ↓
7. Expert adds missing info
   ↓
8. Save → Re-review triggered
   ↓
9. Panel updates with new completeness score
   ↓
10. When ready_to_proceed=true OR 2+ attempts:
    "Mark as Complete" button enabled
   ↓
11. Expert proceeds to next segment
```

---

### Configuration Notes

**LLM Settings** (in `backend/review_service.py`):
- Model: Uses `FIREWORKS_LLM_MODEL` from config (currently `llama-v3p3-70b-instruct`)
- Temperature: 0.3 (lower than extended transcript for consistency)
- Max tokens: 800 (enough for JSON response with prompts)
- Response format: `{"type": "json_object"}` (forces valid JSON)

**Review Limits**:
- Max review attempts before override: 2 (configurable)
- Auto-trigger after transcription: YES
- Cache review results: YES (stored in `review_results` column)

---

### Future Enhancements (Out of Scope for Initial Implementation)

1. **Expert can skip specific prompts** with justification
   - Add `skipped_prompts` field to annotation model
   - UI checkbox: "This information is not relevant to this segment"

2. **Review quality metrics**
   - Track how many prompts were addressed vs skipped
   - Aggregate statistics per expert/project

3. **Custom dimension weights**
   - Allow projects to prioritize FEEDBACK over EVALUATION
   - Configurable `ready_to_proceed` logic

4. **Multi-language support**
   - System prompt translation for non-French crafts
   - Language detection from video metadata

---

### Developer Notes

**Why remove extended transcript?**
- LLM hallucination risk: Extended transcript could invent facts
- Quality concerns: Experts reported inaccurate gesture details
- Pedagogical goal: Force experts to be explicit, not rely on AI inference

**Why auto-trigger review?**
- Immediate feedback loop: Expert knows gaps while still in context
- Prevents incomplete elicitations from being marked complete
- Reduces post-production cleanup work

**Why 3 dimensions (HOW/EVAL/FEEDBACK)?**
- Based on cognitive apprenticeship research (Collins, Brown, Newman)
- HOW = conceptual knowledge
- EVALUATION = metacognitive monitoring
- FEEDBACK = error recovery (critical for learners)

---

### Contact & Support

For questions about this implementation:
- Review system prompt: See `backend/review_service.py` lines 23-150
- API endpoint: `backend/main.py` lines 1082+
- Frontend example: See `TESTING_GUIDE.md` for manual testing workflow

