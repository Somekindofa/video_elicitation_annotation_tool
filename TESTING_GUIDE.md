# Extended Transcript Feature - Setup & Testing Guide

## Quick Setup

### 1. Switch to Feature Branch
```bash
git checkout feature/extended-transcript-llm
```

### 2. Set Environment Variable
Create or update your `.env` file in the project root:
```env
FIREWORKS_API_KEY=your_fireworks_api_key_here
```

**Get your API key from:** https://fireworks.ai/

### 3. Install Dependencies
Dependencies should already be installed, but if needed:
```bash
pip install -r requirements.txt
```

### 4. Database Migration
The database will automatically update when you start the server. The new columns will be added to the annotations table:
- `extended_transcript`
- `extended_transcript_status`
- `feedback`
- `feedback_choices`

### 5. Start the Application
```bash
# Windows
start.bat

# Or manually
python backend/main.py
```

The application will start on `http://localhost:8005`

## Testing the Feature

### Step 1: Create an Annotation
1. Upload a video
2. Start playback
3. Click the record button (red circle)
4. Speak for a few seconds
5. Stop recording

### Step 2: Watch Transcription
- The annotation will appear in the right panel
- Status will show "Transcribing audio..." with spinner
- Once complete, raw transcript appears

### Step 3: Watch Extended Transcript Generation
- A small bar appears below the transcript
- Shows hammer icon (🔨) with three blinking dots (...)
- This indicates LLM is processing

### Step 4: View Extended Transcript
- Once processing completes, the progress indicator disappears
- A clickable bar appears with "See Extended Transcript" and caret-down icon (▼)
- Click to expand and view the enhanced content
- The extended transcript includes:
  - Gesture details
  - Common mistakes
  - Expert tips specific to glassblowing

### Step 5: Provide Feedback
1. Click thumbs up (👍) or thumbs down (👎)
2. A modal appears in French
3. Select applicable items from the checklist
4. Click "Soumettre" (Submit)
5. The button will show active state (green for positive, red for negative)

### Step 6: Export Data
1. Click "Export Annotations" button
2. Download JSON file
3. Verify it includes:
   - `extended_transcript` field
   - `feedback` field
   - `feedback_choices` array

## Testing Checklist

### Backend Tests
- [ ] Server starts without errors
- [ ] WebSocket connection established
- [ ] Transcription completes successfully
- [ ] Extended transcript generation triggers automatically
- [ ] Extended transcript status updates sent via WebSocket
- [ ] Feedback submission endpoint works
- [ ] Export includes new fields

### Frontend Tests
- [ ] Progress indicator appears during LLM processing
- [ ] Hammer icon animates (swings)
- [ ] Ellipsis dots blink alternately
- [ ] Toggle section expands/collapses smoothly
- [ ] Caret icon flips direction
- [ ] Feedback modal displays correctly
- [ ] Correct choices shown for positive/negative feedback
- [ ] Checkbox selections highlight
- [ ] Modal closes on background click
- [ ] Submit button works
- [ ] Active state shows on feedback buttons
- [ ] Multiple annotations work independently

### Edge Cases
- [ ] Empty transcript handling
- [ ] LLM API timeout/error handling
- [ ] No API key configured (graceful failure)
- [ ] Multiple annotations processed in parallel
- [ ] Changing feedback (clicking different thumb)
- [ ] Closing modal without submitting

## Common Issues & Solutions

### Issue: Extended Transcript Not Generating
**Symptoms:** Progress indicator never appears or stays stuck

**Solutions:**
1. Check backend console for errors
2. Verify `FIREWORKS_API_KEY` is set correctly
3. Test API key with curl:
   ```bash
   curl -X POST "https://api.fireworks.ai/inference/v1/completions" \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"accounts/fireworks/models/llama-v3p1-8b-instruct","prompt":"Test","max_tokens":10}'
   ```
4. Check Fireworks.ai account status and quota

### Issue: WebSocket Disconnects
**Symptoms:** UI doesn't update automatically

**Solutions:**
1. Check browser console for WebSocket errors
2. Refresh the page to reconnect
3. Restart the backend server

### Issue: Feedback Modal in Wrong Language
**Symptoms:** English text instead of French

**Solutions:**
1. Clear browser cache
2. Hard refresh (Ctrl+F5)
3. Check `app.js` was updated correctly

### Issue: Database Errors
**Symptoms:** Errors about missing columns

**Solutions:**
1. Delete the old database: `data/annotations.db`
2. Restart the server (it will create new schema)
3. Re-upload videos and create annotations

## Debugging Tips

### Enable Detailed Logging
Edit `backend/config.py`:
```python
LOG_LEVEL = "DEBUG"
```

### Check WebSocket Messages
Open browser DevTools > Network > WS tab
Monitor messages in real-time

### Test LLM Service Directly
```python
import asyncio
from backend.llm_service import generate_extended_transcript

async def test():
    result = await generate_extended_transcript("The glassblower rotates the pipe.")
    print(result)

asyncio.run(test())
```

### Monitor Database Changes
```bash
# Install sqlite3 viewer
pip install sqlite-web

# View database
sqlite_web data/annotations.db
```

## Performance Expectations

- **Transcription Time:** 2-10 seconds (depending on audio length)
- **Extended Transcript Generation:** 3-8 seconds (LLM processing)
- **Total Time from Recording to Extended Transcript:** 5-18 seconds

## API Rate Limits

Fireworks.ai free tier limits:
- ~100 requests/minute
- Check your account for specific limits

## Next Steps After Testing

1. **If everything works:**
   - Document any issues found
   - Create detailed feedback for improvements
   - Prepare for merge to main

2. **If issues found:**
   - Document the bug with reproduction steps
   - Check logs for error messages
   - Create issue tickets

3. **For production deployment:**
   - Review API key security
   - Set up monitoring for LLM API calls
   - Configure rate limiting
   - Set up error alerting

## Contact & Support

For questions or issues with this feature, check:
- Backend logs in terminal
- Browser console (F12)
- `EXTENDED_TRANSCRIPT_FEATURE.md` for architecture details
