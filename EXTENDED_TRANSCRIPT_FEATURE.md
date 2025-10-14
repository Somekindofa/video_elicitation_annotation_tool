# Extended Transcript Feature Documentation

## Overview
This feature adds an AI-powered layer to the annotation tool that enhances raw Whisper transcriptions with contextual information about glassblowing techniques, common mistakes, and expert tips.

## Feature Branch
**Branch Name:** `feature/extended-transcript-llm`

## Architecture

### Backend Components

#### 1. Database Schema Updates (`backend/models.py`)
Added new fields to the `Annotation` model:
- `extended_transcript` (Text): Stores the LLM-generated enhanced transcript
- `extended_transcript_status` (String): Status tracking (pending/processing/completed/failed)
- `feedback` (Integer): User rating (1 for thumbs up, 0 for thumbs down, null for no feedback)
- `feedback_choices` (String): JSON string storing array of binary choices from feedback form

#### 2. LLM Service (`backend/llm_service.py`)
New module for Fireworks.ai LLM integration:
- **Model:** Llama 3.1 8B Instruct
- **API:** Fireworks.ai Completion endpoint
- **Max Tokens:** 512
- **Temperature:** 0.7
- **System Prompt:** Custom prompt for glassblowing domain expertise

**Key Function:** `generate_extended_transcript(transcription: str)`
- Takes raw Whisper transcript as input
- Sends to LLM with specialized system prompt
- Returns enhanced transcript with:
  - Relevant gesture information
  - Common mistakes
  - Expert tips

#### 3. Main Application Updates (`backend/main.py`)

**New Background Process:** `process_extended_transcript(annotation_id, transcription)`
- Triggered automatically after transcription completes
- Updates status to "processing"
- Calls LLM service
- Stores result in database
- Broadcasts completion via WebSocket

**New API Endpoint:** `POST /api/annotations/{annotation_id}/feedback`
- Accepts feedback data (thumbs up/down + choices)
- Stores in database
- Returns success confirmation

**Export Enhancement:**
- Export now includes extended transcripts and feedback data

#### 4. Configuration Updates (`backend/config.py`)
Added LLM-specific settings:
- `FIREWORKS_LLM_API_URL`: Completion API endpoint
- `FIREWORKS_LLM_MODEL`: Model identifier
- `FIREWORKS_LLM_MAX_TOKENS`: Token limit (512)
- `FIREWORKS_LLM_TEMPERATURE`: Sampling temperature (0.7)

### Frontend Components

#### 1. UI Elements (`frontend/css/styles.css`)

**Progress Indicator:**
- Small bar with hammer icon (Font Awesome)
- Three blinking ellipsis dots
- Amber/warning color scheme
- Appears below transcript during LLM processing

**Extended Transcript Section:**
- Collapsible/expandable area
- Caret-down icon changes to caret-up when expanded
- Light blue background (#f0f9ff) with border
- Smooth transition animation (max-height)

**Feedback Buttons:**
- Thumbs up and thumbs down buttons
- Active state styling (green for positive, red for negative)
- Hover effects with opacity changes

**Feedback Modal:**
- Centered overlay modal
- French language interface
- Multi-choice checkboxes
- Selection highlighting
- Submit/Cancel buttons

#### 2. JavaScript Logic (`frontend/js/app.js`)

**Key Functions:**

1. `toggleExtendedTranscript(annotationId)`
   - Expands/collapses extended transcript
   - Updates icon and text

2. `updateExtendedTranscriptStatus(annotationId, status)`
   - Updates annotation status in local state
   - Triggers re-render

3. `updateExtendedTranscript(annotationId, extendedTranscript)`
   - Stores extended transcript in local state
   - Triggers re-render

4. `handleFeedback(annotationId, feedbackValue, event)`
   - Initiates feedback process
   - Shows feedback modal

5. `showFeedbackModal(annotationId, feedbackValue)`
   - Creates/displays feedback modal
   - Dynamically generates choices based on positive/negative feedback

6. `submitFeedbackModal(annotationId, feedbackValue)`
   - Collects selected choices
   - Sends to backend API
   - Updates UI

**WebSocket Event Handlers:**
- `extended_transcript_status`: Updates processing status
- `extended_transcript_complete`: Stores result and refreshes UI
- `extended_transcript_error`: Shows error notification

## User Flow

1. **Recording & Transcription:**
   - User records audio annotation
   - Whisper transcribes audio
   - Transcript displayed in annotation card

2. **Extended Transcript Generation:**
   - Progress indicator appears (hammer + ellipsis)
   - LLM processes transcript in background
   - Upon completion, indicator replaced with expandable section

3. **Viewing Extended Transcript:**
   - User clicks "See Extended Transcript" bar
   - Section expands showing enhanced content
   - Caret icon flips, text changes to "Hide Extended Transcript"

4. **Providing Feedback:**
   - User clicks thumbs up or thumbs down
   - French modal appears
   - User selects applicable items from multi-choice list
   - Submits feedback
   - Button shows active state

## Feedback Form Content

### Positive Feedback (Thumbs Up)
"Merci pour votre avis. Veuillez sélectionner ce qui vous a plu :"

1. Les erreurs communes sont pertinentes
2. La spécificité du mouvement (pourquoi le faire) est correctement décrite
3. La description générale du geste est précise (quelle main utiliser, position des jambes...)
4. La description fine du geste est précise (rotation dans les mains, force dans les jambes...)
5. Tous les outils mentionnés sont corrects et font partie de la séquence visionnée

### Negative Feedback (Thumbs Down)
"Merci pour votre avis. Veuillez sélectionner ce qui vous a déplu :"

1. Les erreurs communes ne sont pas pertinentes
2. La spécificité du mouvement (pourquoi le faire) n'est pas correctement décrite
3. La description générale du geste n'est pas précise (quelle main utiliser, position des jambes...)
4. La description fine du geste n'est pas précise (rotation dans les mains, force dans les jambes...)
5. Les outils mentionnés ne sont pas corrects ou ne font pas partie de la séquence visionnée
6. Cette version décrit au delà du transcript / Ne décrit pas assez le transcript

## API Endpoints

### Submit Feedback
```
POST /api/annotations/{annotation_id}/feedback
```

**Request Body:**
```json
{
  "annotation_id": 123,
  "feedback": 1,
  "feedback_choices": [1, 0, 1, 1, 0]
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Feedback submitted successfully",
  "annotation_id": 123
}
```

## WebSocket Messages

### Extended Transcript Status
```json
{
  "type": "extended_transcript_status",
  "annotation_id": 123,
  "status": "processing"
}
```

### Extended Transcript Complete
```json
{
  "type": "extended_transcript_complete",
  "annotation_id": 123,
  "extended_transcript": "Enhanced transcript text..."
}
```

### Extended Transcript Error
```json
{
  "type": "extended_transcript_error",
  "annotation_id": 123,
  "error": "Error message"
}
```

## Database Schema

### Annotation Table Updates
```sql
extended_transcript TEXT NULL
extended_transcript_status VARCHAR DEFAULT 'pending'
feedback INTEGER NULL
feedback_choices VARCHAR NULL
```

## Configuration Requirements

### Environment Variables
Ensure `FIREWORKS_API_KEY` is set in your environment or `.env` file:
```bash
FIREWORKS_API_KEY=your_api_key_here
```

## Testing Checklist

- [ ] Extended transcript generation after transcription completes
- [ ] Progress indicator displays correctly with animations
- [ ] Extended transcript section expands/collapses smoothly
- [ ] Feedback buttons respond to clicks
- [ ] Feedback modal displays with correct choices (positive vs negative)
- [ ] Checkbox selections highlight properly
- [ ] Feedback submission updates button state
- [ ] WebSocket updates trigger UI changes
- [ ] Export includes extended transcript and feedback data
- [ ] Multiple annotations handle extended transcripts independently

## Future Enhancements

1. **Analytics Dashboard:** Aggregate feedback data to improve LLM prompts
2. **Custom Prompts:** Allow domain experts to customize system prompts
3. **Multi-language Support:** Support for languages beyond French
4. **A/B Testing:** Compare different LLM models or prompts
5. **Feedback Visualization:** Show statistics on most helpful features

## Troubleshooting

### Extended Transcript Not Generating
- Check `FIREWORKS_API_KEY` is set correctly
- Verify API quota/limits not exceeded
- Check backend logs for LLM API errors
- Ensure network connectivity to Fireworks.ai

### UI Not Updating
- Check browser console for JavaScript errors
- Verify WebSocket connection is active
- Clear browser cache and reload

### Feedback Not Submitting
- Check network tab for API errors
- Verify annotation exists in database
- Check backend logs for validation errors

## Git Workflow

### Merging to Main
When feature is tested and approved:
```bash
git checkout main
git merge feature/extended-transcript-llm
git push origin main
```

### Creating Pull Request
```bash
git push origin feature/extended-transcript-llm
# Then create PR on GitHub/GitLab
```

## License & Attribution
Part of the ReSource Project - Video Elicitation Annotation Tool
