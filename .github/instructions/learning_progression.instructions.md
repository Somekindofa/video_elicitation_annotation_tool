---
applyTo: '**'
---

# User JavaScript Learning Progression

## Current Level: Very Novice (February 2026)

The user is actively learning JavaScript through hands-on implementation with guided support.

### Learning Style & Approach
- **Prefers step-by-step explanations** with small, focused code snippets
- **Learns by doing** — implements features with guidance rather than copy-pasting full solutions
- **Needs conceptual framing** — explain WHY before HOW (e.g., "helpers go outside functions because...")
- **Benefits from TODOs** — skeleton code with TODO comments helps them understand structure before filling in logic

### Recent Learning Milestones

#### February 5, 2026: Live Scrubbing Feature (Video Segmentation)
**What they learned:**
- Function placement: helpers go **outside** caller functions, at the same level
- Video element API: `player.currentTime = time` to seek frames
- Value clamping: `Math.max(0, Math.min(time, max))` pattern
- Code organization: keeping related functions together in logical sections

**What they did:**
- Uncommented provided skeleton code
- Placed `previewSegmentFrame()` helper in correct location (between `handleTouchDrag` and `handleDrag`)
- Connected helper call inside `handleDrag()` to enable live scrubbing
- Successfully implemented feature by understanding structure rather than blindly pasting

**Implementation pattern used:**
```javascript
// Helper defined outside (reusable, efficient)
function previewSegmentFrame(time) {
    const player = document.getElementById('segmentVideoPlayer');
    if (!player || !player.duration) return;
    const safeTime = Math.max(0, Math.min(time, player.duration));
    player.currentTime = safeTime;
}

// Caller uses helper
function handleDrag(e) {
    // ... compute time ...
    previewSegmentFrame(time);  // ← User placed this correctly
}
```

### Teaching Guidelines for Future Interactions

1. **Always explain placement first** — "where does this go and why?"
2. **Use TODO-driven teaching** — provide skeleton with TODOs, let them fill in
3. **One concept at a time** — don't introduce advanced patterns until basics are solid
4. **Connect to their working code** — reference existing functions by name and line numbers
5. **Celebrate incremental progress** — acknowledge when they get structure/placement right

### Skills NOT Yet Acquired
- Event listener patterns (only seen basic `addEventListener` usage)
- Async/await and promises (not covered)
- Array methods beyond basic iteration
- DOM manipulation beyond `getElementById`
- Scoping and closures (implicit understanding only)
- ES6 features (arrow functions, destructuring, template literals)

### Next Learning Opportunities
When the user asks for new features, consider teaching:
- Event delegation patterns
- Simple state management patterns (they already use `state` object)
- More DOM query methods (`querySelector`, `querySelectorAll`)
- Guard clauses and early returns (they've seen `if (!x) return`)

### Important Notes
- User reads and follows system_prompt.instructions.md — prefers "patient coding mentor" approach
- User benefits from comparing "right way" vs "wrong way" with explanations
- User successfully navigates large codebase (3976 lines) with guidance on where to look
