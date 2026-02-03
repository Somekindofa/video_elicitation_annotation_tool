# Confidence Score Removal & Task Editing Feature

**Date**: February 3, 2026  
**Status**: Active  
**Changes**: Judge service simplification + Task field editability

## Overview

Two key improvements to the annotation interface:

1. **Removed untrustworthy confidence metric** from judge service
2. **Added editable task field** for user control over task assignment

## Problem Solved

### Confidence Score Issues
The judge service was returning a LLM-generated `confidence` value (0.0-1.0) which was:
- **Hallucinated**: LLM generated arbitrary numbers with no grounding in reality
- **Unused in logic**: Decision was based only on `needs_review` boolean, not confidence
- **Misleading to users**: "85% confidence" gave false impression of reliability
- **Impossible to validate**: No way to verify if the number was correct

**Solution**: Removed confidence entirely. Judge now outputs only:
- `needs_review` (boolean) - Decision based on semantic analysis
- `reasoning` - Explanation of why review is/isn't needed
- `missing_elements` - List of gaps found (observable)
- `strengths` - List of positive aspects found (observable)

### Task Assignment
Previously, task was:
- Only auto-detected by LLM (`detected_task`)
- Not directly editable by user
- User had to accept AI suggestion or leave blank

**Solution**: Added inline task editing field that users can modify at any time

## Changes Made

### Backend Changes: `backend/judge_service.py`

1. **Removed from output instructions**:
   ```
   - CONFIDENCE key removed from JUDGE_KEYED_OUTPUT_INSTRUCTIONS
   ```

2. **Updated parsing function `_parse_keyed_judge()`**:
   - Removed confidence extraction and validation
   - Simplified to 4 fields only

3. **Updated decision logic**:
   - Changed rule from: `(confidence < 0.6) OR (missing >= 2) OR (no sensations)`
   - Changed to: `(missing >= 2) OR (no sensations)`
   - Removed confidence-based decisions

4. **All return values**:
   - Removed `"confidence": 0.5` from all error/fallback paths
   - Simplified to minimal required fields

### Frontend Changes: `js/app.js`

1. **Removed confidence display** (line ~996):
   ```javascript
   // BEFORE:
   <strong>Confidence:</strong> ${(judge.confidence * 100).toFixed(0)}%
   
   // AFTER: (line removed)
   ```

2. **Simplified decision logic** (line ~982):
   ```javascript
   // BEFORE:
   if (judge.needs_review === false && judge.confidence > 0.75)
   
   // AFTER:
   if (judge.needs_review === false)
   ```

3. **Added task editing row** (line ~1132-1134):
   ```html
   <div class="annotation-task-row">
       <label for="task-${annotation.id}">Task:</label>
       <input type="text" id="task-${annotation.id}" 
              class="annotation-task-input" 
              value="${annotation.task || ''}" 
              placeholder="Enter or edit task" 
              onchange="updateAnnotationTask(${annotation.id}, this.value)">
   </div>
   ```

4. **Added task update function** (new function):
   ```javascript
   async function updateAnnotationTask(annotationId, newTask) {
       // Sends PUT /api/annotations/{id} with { task: newTask }
       // Updates state and shows success/error toast
   }
   ```

### Frontend Styling: `css/styles.css`

Added `.annotation-task-row` and `.annotation-task-input` styles:
```css
.annotation-task-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-sm);
    font-size: 0.875rem;
}

.annotation-task-input {
    flex: 1;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    /* ... focus states ... */
}
```

**Note**: No backend changes needed for task editing - `PUT /api/annotations/{id}` already supports `task` field in `AnnotationUpdate` schema.

## API Changes

### Judge Service Response

**Before**:
```json
{
    "needs_review": true,
    "confidence": 0.85,
    "reasoning": "...",
    "missing_elements": ["..."],
    "strengths": ["..."]
}
```

**After**:
```json
{
    "needs_review": true,
    "reasoning": "...",
    "missing_elements": ["..."],
    "strengths": ["..."]
}
```

### Annotation Update Endpoint

**Existing functionality**:
```bash
PUT /api/annotations/{annotation_id}
Content-Type: application/json

{
    "task": "new_task_name"
}
```

The `task` field was already supported in `AnnotationUpdate` schema - no new endpoints added.

## User Experience

### Before
1. Judge shows "AI found this elicitation complete" + 85% confidence
2. User confused: "Why only 85%? Is it safe to trust?"
3. Task is auto-detected, user cannot change it easily

### After
1. Judge shows "AI found this elicitation complete"
2. No false confidence metric
3. User can see confidence doesn't matter - judge either says needs review or doesn't
4. **New**: Task field is visible and directly editable
5. User can click on task input and type/modify the task name
6. Changes auto-save on blur/enter

## Testing Checklist

- [ ] Verify judge responses no longer include confidence in WebSocket messages
- [ ] Verify UI doesn't display confidence score anymore
- [ ] Verify task field appears in annotation view
- [ ] Try editing task name - should auto-save
- [ ] Verify task persists after page reload
- [ ] Verify error toast appears if task update fails
- [ ] Verify success toast appears after task update
- [ ] Test empty task (clearing the field)
- [ ] Test special characters in task name
- [ ] Verify detected_task still appears as badge (separate from editable task)

## Browser Console Debugging

```javascript
// Check judge decision structure
console.log(annotation.judge_decision);
// Should NOT have 'confidence' key

// Test task update
updateAnnotationTask(123, "new_task_name");
// Check Network tab for PUT request, verify response
```

## Monitoring

Since confidence is removed, judge decision tree is simpler:

1. **If transcription < 20 chars**: `needs_review=true` (obviously incomplete)
2. **If LLM finds 2+ missing elements**: `needs_review=true`
3. **If LLM detects no sensations**: `needs_review=true`
4. **Otherwise**: `needs_review=false` (elicitation sufficiently complete)

Monitor:
- % of annotations with `needs_review=true` (should be ~30-50%)
- Task update success rate (should be 100%)
- Task coverage (% of annotations with non-empty task)

## Backward Compatibility

- ✓ Existing annotations with old judge decisions still work
- ✓ Old detected_task field unchanged
- ✓ No database migration needed
- ✓ API remains backward compatible (confidence field simply not returned)

**Action**: No migration or special handling required for existing data.

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Confidence** | Hallucinated by LLM | Removed (no false trust) |
| **Decision Logic** | Confidence + semantic | Semantic only (clearer) |
| **Task Control** | Auto-detected only | User can edit directly |
| **UI Clarity** | Confusing confidence %  | Clear pass/fail decision |
| **Debuggability** | Hard to explain numbers | Easy to see decision logic |

## Related Files

- `backend/judge_service.py` - Simplified judge service
- `js/app.js` - UI updates and task editing function
- `css/styles.css` - Task input field styling
- `backend/models.py` - AnnotationUpdate schema (unchanged, already supports task)

---

**For questions or issues**, check:
1. Browser console for JavaScript errors
2. Backend logs for failed API calls
3. Network tab for PUT request structure
