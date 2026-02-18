# Tagging Prompt Upgrade Guide

**Date**: February 3, 2026  
**Status**: Active  
**Applies to**: `backend/tagging_service.py`

## Overview

The tagging system was upgraded to generate **shorter, more relevant tags** suitable for RAG (Retrieval-Augmented Generation) filtering and metadata search. The previous implementation produced verbose, descriptive tags that were not useful for downstream systems.

## Problem Statement

### Issues with Previous Implementation

1. **Verbose Tags** (7+ words)
   - `eviter_de_chauffer_plus_une_partie_qu_une_autre` (7 words)
   - `tourner_delicatement_le_verre_avec_mon_pouce_et_mon_index_tout_en_maintenant_a_la_perpendiculaire` (13 words)
   - These are **instructions**, not **metadata tags**

2. **Non-filterable in RAG**
   - Tags should be discrete, searchable entities
   - Long descriptive tags break RAG metadata filtering
   - Impossible to reuse across multiple elicitations

3. **Hallucinations**
   - System generated tags not explicitly mentioned in transcription
   - Tags inferred from context rather than stated facts

## Solution

### Core Changes

#### 1. Length Enforcement (Maximum 4 Words)

**LLM Prompt Level**:
- Explicit instruction: "Maximum 4 mots, préférer 1-2 mots"
- Examples showing good (short) vs bad (long) tags
- Test checklist: reject if tag is longer than 4 words

**Code Level** (`_normalize_tags()`):
```python
word_count = len(name.split("_"))
if word_count > 4:
    logger.debug(f"[TAGGING] REJECTED tag (too long - {word_count} words): {name}")
    continue
```
Tags exceeding 4 words are automatically filtered out.

#### 2. Entity Names, Not Phrases

**Rule**: A valid tag is a **noun or concept name**, not a **complete sentence or instruction**.

**Good** (entities):
- `pince_brucelles` (tool name)
- `enfilage` (technique name)
- `rotation_douce` (manipulation with intensity)

**Bad** (instructions/phrases):
- `eviter_de_chauffer_plus_une_partie_qu_une_autre` ← This describes what to avoid, not an entity
- `tourner_delicatement_le_verre_avec_mon_pouce_et_mon_index_tout_en_maintenant_a_la_perpendiculaire` ← This is a complete procedure

#### 3. Stricter Category Guidelines

Each category now enforces specific word limits:

| Category | Max Words | Examples | Anti-Examples |
|----------|-----------|----------|----------------|
| **TOOL** | 2-3 | `pince_brucelles`, `chalumeau` | `outil` (generic), `main` (obvious) |
| **MATERIAL** | 1-2 | `argent`, `verre_sodique` | `matériau`, `air` (transient) |
| **TECHNIQUE** | 1-2 | `enfilage`, `soudure` | `faire`, `procédé` (vague) |
| **HANDLING** | 2-3 | `rotation_douce`, `pression_legere` | Long instruction phrases |
| **SENSATION** | 2 | `chaleur_intense`, `resistance` | Generic sensation descriptions |

#### 4. Validation at Two Levels

**Prompt Level** - LLM is instructed to:
1. ✓ Check tag length < 4 words
2. ✓ Verify it's a NAME, not a PHRASE
3. ✓ Confirm it appears in transcription
4. ✓ Ensure it's useful for RAG filtering
5. ✓ Check it's specific enough

**Code Level** - Python validates:
- Rejects tags > 4 words
- Filters tags not appearing in transcript
- Deduplicates (name, category) pairs
- Validates against approved categories

## Configuration Changes

### LLM Parameters

| Parameter | Before | After | Reason |
|-----------|--------|-------|--------|
| `max_tokens` | 400 | 300 | Concise tags need fewer tokens |
| `frequency_penalty` | 0.5 | 0.8 | Stronger penalty for verbose repetition |
| `presence_penalty` | 0.5 | 0.6 | Encourage diverse, concise tags |

### Tag Limits

| Limit | Before | After | Reason |
|-------|--------|-------|--------|
| Max tags per annotation | 12 | 10 | Quality over quantity |
| Min transcription length | 5 words | 5 words | No change (still required) |

## Implementation Details

### Location: `backend/tagging_service.py`

**Modified Functions**:

1. **`TAGGING_SYSTEM_PROMPT`** (~200 lines)
   - Added section: "INTERDICTIONS STRICTES" with exact problematic examples
   - Added test checklist for validating tags
   - Replaced verbose examples with concise ones
   - Removed ambiguous length guidance

2. **`_normalize_tags()`**
   - Added `word_count` validation
   - Logs rejected tags with reason
   - Enforces 4-word maximum at code level

3. **LLM payload**
   - Updated `max_tokens`, `frequency_penalty`, `presence_penalty`

### How to Test

#### 1. Manual Testing (Python REPL)

```python
from tagging_service import extract_tags
import asyncio

# Test with French transcription
test_text = """
Je prends la pince brucelles pour saisir délicatement l'argent.
Je dois tourner le verre avec rotation douce tout en maintenant.
"""

result = await extract_tags(test_text, craft="jewelry")
print(result)

# Should output:
# {
#   "tags": [
#     {"name": "pince_brucelles", "category": "tool"},
#     {"name": "argent", "category": "material"},
#     {"name": "rotation_douce", "category": "handling"}
#   ]
# }
```

#### 2. Validation Checklist

After generating tags, verify:

- [ ] No tag exceeds 4 words
- [ ] All tags appear in original transcription
- [ ] Tags are nouns/concepts, not complete phrases
- [ ] Tags fit one of 5 categories
- [ ] Total tags ≤ 10
- [ ] No duplicates

#### 3. Problematic Transcriptions to Avoid

These patterns should now NOT generate long tags:

```
Transcription with instruction: "You should avoid heating one part more than another"
✓ Good: (no tag generated OR generic: "uniform_heating" IF explicitly mentioned)
✗ Bad: "avoid_heating_one_part_more_than_another" (7 words - rejected)

Transcription with procedure: "Turn the glass gently with your thumb and index while keeping perpendicular"
✓ Good: "rotation_douce", "perpendicular_angle" (2 words each)
✗ Bad: "turn_glass_with_thumb_index_keeping_perpendicular" (5+ words - rejected)
```

## Tag Examples

### ✓ Correct Tags (Short, Filterable)

```
Tool Examples:
TAG: pince_brucelles | tool
TAG: chalumeau | tool
TAG: mandrin | tool

Material Examples:
TAG: argent | material
TAG: verre_sodique | material
TAG: or_18k | material

Technique Examples:
TAG: enfilage | technique
TAG: soudure | technique
TAG: polissage | technique

Handling Examples:
TAG: rotation_douce | handling
TAG: pression_legere | handling
TAG: mouvement_circulaire | handling

Sensation Examples:
TAG: chaleur_intense | sensation
TAG: resistance_tactile | sensation
TAG: son_cristallin | sensation
```

### ✗ Rejected Tags (Long, Instructional)

```
TAG: eviter_de_chauffer_plus_une_partie_qu_une_autre | technique
  ✗ 7 words (exceeds 4)
  ✗ Instruction phrase, not entity name
  → Rejected at code level (word_count > 4)

TAG: tourner_delicatement_le_verre_avec_mon_pouce_et_mon_index_tout_en_maintenant_a_la_perpendiculaire | handling
  ✗ 13 words (exceeds 4)
  ✗ Complete procedure description
  → Rejected at code level (word_count > 4)

TAG: outil | tool
  ✗ Generic, not useful for RAG filtering
  → Rejected by prompt (LLM trained to avoid)

TAG: main | handling
  ✗ Obvious/universal (hands always involved)
  → Rejected by prompt (LLM trained to avoid)
```

## RAG Integration

### Why This Matters for RAG

**Before Upgrade**:
- Long tags = poor metadata for filtering
- Hallucinated tags = false positives in retrieval
- Verbose tags = low reusability across documents

**After Upgrade**:
- Short tags = precise metadata filters
- Tags only from transcription = no false positives
- Reusable tags = find similar elicitations efficiently

### Example RAG Query

```
Query: "Show me jewelry enfilage techniques with silver"

Filter:
- technique: "enfilage"
- material: "argent"
- craft: "jewelry"

Returns all annotations with these exact tags
```

## Maintenance

### When to Update This Guide

- [ ] If max word count changes
- [ ] If new categories are added
- [ ] If validation rules change
- [ ] After running large evaluation against new prompt

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Still getting long tags | LLM not following prompt | Check Fireworks API model version, increase `frequency_penalty` |
| Too few tags | Overly strict validation | Reduce `presence_penalty`, check transcript content |
| Hallucinated tags | Transcript filtering not working | Verify transcript filter logic in `_filter_tags_against_transcript()` |
| Tags not appearing in UI | Database serialization | Ensure `tags` field is JSON string, not object |

### Monitoring

Track these metrics:

```python
# In tagging logs, monitor:
- Average tags per annotation (target: 3-7)
- Percentage of tags rejected for length (target: < 5%)
- Percentage of tags rejected for hallucination (target: < 10%)
- Most common tag categories (should be balanced across 5 categories)
```

## Backward Compatibility

The upgrade **does not** break existing functionality:

- ✓ Annotations created before upgrade still have old tags
- ✓ Tag structure remains `{"name": "...", "category": "..."}`
- ✓ Database schema unchanged
- ✓ API response format unchanged

**Action**: No migration needed. New annotations will use improved prompt automatically.

## References

- **Modified File**: `backend/tagging_service.py`
- **Related Services**: 
  - `review_service.py` (uses tags in review prompt)
  - `database.py` (stores tags as JSON)
- **API Endpoint**: `POST /api/annotations/{id}/tags` (manually trigger tagging)

## Checklist for Deployment

- [ ] Code changes applied to `tagging_service.py`
- [ ] Testing completed with sample transcriptions
- [ ] Monitoring logs configured
- [ ] This guide added to documentation
- [ ] Prompt reviewed by domain expert (optional)
- [ ] Database backup taken (if production)
- [ ] Monitor first 50 annotations for tag quality
