# 3-Fold Cross-Modal RAG Evaluation

This directory contains tools for evaluating the quality of your Cross-Modal RAG system used in the Video Elicitation Annotation Tool.

## Overview

Your RAG system performs **3-fold data extraction** from expert elicitations, with the following priority order:

### Priority 1: Movement Description (50% weight)
**How the gesture is made** - Detailed explanations using:
- Verbs (tourner, lisser, maintenir, couper, presser)
- Adverbs (doucement, régulièrement, rapidement, fermement)
- Movement descriptions (rotation, pression, position, angle)

### Priority 2: Evaluation Cues (30% weight)
**What to look for in the movement**:
- **Success indicators**: What a well-executed movement looks like (surface lisse, symétrie, coupe nette)
- **Failure indicators**: Common flaws and what they look like (marques, déformation, fils de verre)
- **Quality criteria**: Requirements for "well done" execution (pression uniforme, angle stable, mouvement décisif)

### Priority 3: Improvement Feedback (20% weight)
**How to improve the movement**:
- **Error corrections**: How to fix specific mistakes (ajuster la pression, accélérer le mouvement)
- **Practice tips**: How to improve for next iterations (exercer, répéter, commencer lentement)

## Evaluation Approaches

This framework offers three evaluation approaches, from simplest to most sophisticated:

### 1. **Ragas with Generic Metrics** (`evaluate_rag.py`)
Uses Ragas framework with standard RAG metrics (faithfulness, relevancy, precision, recall). These are general-purpose metrics that don't specifically target your 3-fold structure.

**Pros**: Industry-standard, well-tested
**Cons**: Not aligned with your specific 3-fold priorities

### 2. **LLM-as-a-Judge with Custom Prompts** (`evaluate_rag_llm_judge.py`) ⭐ RECOMMENDED
Uses a judge LLM (GPT-4, Claude, etc.) with custom prompts specifically designed for your 3-fold structure. The judge evaluates each fold independently and provides justifications.

**Pros**:
- Aligned with your 3-fold priorities
- Understands semantic meaning (not just keywords)
- Provides qualitative feedback and justifications
- Can catch nuanced quality issues

**Cons**:
- Requires API key for judge LLM (costs money)
- Slower than Ragas (3 judge calls per test case)

**This is the best approach for your use case!**

## What Can Be Evaluated?

### LLM-as-a-Judge Evaluation (Recommended)

**Movement Description Score:**
- Verb coverage (40%)
- Adverb coverage (30%)
- Keyword coverage (30%)

**Evaluation Cues Score:**
- Success indicator coverage (40%)
- Failure indicator coverage (30%)
- Quality criteria coverage (30%)

**Improvement Feedback Score:**
- Error correction coverage (60%)
- Practice tip coverage (40%)

**Overall 3-Fold Score:**
Weighted average: Movement (50%) + Evaluation (30%) + Improvement (20%)

### 2. **Quality Metrics** (Custom)
- **Length Score**: Is the extended transcript an appropriate length (3-5x original)?
- **Completeness**: Are all 3 folds present (description, evaluation, feedback language)?
- **Structure**: Does it use paragraph breaks to separate sections?

### 3. **Ragas Metrics** (Optional - requires OpenAI API)
- **Faithfulness**: How faithful is the extended transcript to the original?
- **Answer Relevancy**: How relevant is the extended content?
- **Context Precision**: How precisely is the context used?
- **Context Recall**: How much context is utilized?

## Directory Structure

```
evaluation/
├── README.md                          # This file
├── evaluate_rag_llm_judge.py          # ⭐ LLM-as-a-Judge (RECOMMENDED)
├── evaluate_rag.py                    # Ragas with generic metrics
├── test_data/
│   └── sample_transcriptions.json     # Test cases for 3-fold evaluation
└── results/                           # Evaluation results (auto-generated)
    ├── llm_judge_evaluation_*.csv     # LLM-as-a-Judge results
    ├── llm_judge_evaluation_*.json
    ├── threefold_ragas_evaluation_*.csv
    └── threefold_ragas_evaluation_*.json
```

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

Make sure your `.env` file contains:

```env
FIREWORKS_API_KEY=your_fireworks_api_key_here
```

For Ragas automated metrics (optional):
```env
OPENAI_API_KEY=your_openai_api_key_here  # Used by Ragas for evaluation
```

### 3. Run Evaluation

**Recommended: Simple 3-Fold Evaluation**

This uses custom metrics aligned with your 3-fold structure:

```bash
cd evaluation
python evaluate_rag_simple.py
```

**Optional: Full Evaluation with Ragas**

This includes automated Ragas metrics (requires OpenAI API):

```bash
cd evaluation
python evaluate_rag.py
```

### 4. View Results

Results are saved in `evaluation/results/`:
- `threefold_evaluation_*.csv` - CSV files for spreadsheet analysis
- `threefold_evaluation_*.json` - JSON files for programmatic access

## How Evaluation Works

### Test Cases

The evaluation uses test cases from `test_data/sample_transcriptions.json`. Each test case includes:

```json
{
  "id": 1,
  "craft": "glassblowing",
  "transcription": "On utilise le jaconas pour lisser le verre...",
  "expected_elements": {
    "movement_description": {
      "verbs": ["tourner", "lisser", "maintenir"],
      "adverbs": ["doucement", "régulièrement"],
      "keywords": ["pression", "constante"]
    },
    "evaluation_cues": {
      "success_indicators": ["surface lisse", "symétrie"],
      "failure_indicators": ["marques", "déformation"],
      "quality_criteria": ["pression uniforme", "vitesse constante"]
    },
    "improvement_feedback": {
      "error_corrections": ["ajuster la pression"],
      "practice_tips": ["exercer", "répéter"]
    }
  },
  "reference_answer": "..."
}
```

### Evaluation Process

1. **Generation**: Each transcription is sent to your LLM service to generate an extended transcript
2. **3-Fold Analysis**: Checks coverage of each fold (movement, evaluation, improvement)
3. **Quality Assessment**: Evaluates length, structure, and completeness
4. **Ragas Metrics** (optional): Automated evaluation using Ragas framework
5. **Results Compilation**: Generates CSV and JSON reports with all metrics

### Understanding Scores

#### 3-Fold Scores (0.0 to 1.0)

**Movement Description Score** (Priority 1, 50% weight):
- 0.80-1.00 = Excellent: Rich verb/adverb usage, detailed descriptions
- 0.60-0.79 = Good: Decent coverage but missing some details
- 0.40-0.59 = Moderate: Basic description, lacks precision
- 0.00-0.39 = Poor: Minimal or no movement description

**Evaluation Cues Score** (Priority 2, 30% weight):
- 0.80-1.00 = Excellent: Clear success/failure indicators and quality criteria
- 0.60-0.79 = Good: Covers most evaluation aspects
- 0.40-0.59 = Moderate: Some evaluation elements missing
- 0.00-0.39 = Poor: Little to no evaluation guidance

**Improvement Feedback Score** (Priority 3, 20% weight):
- 0.80-1.00 = Excellent: Actionable corrections and practice tips
- 0.60-0.79 = Good: Provides some improvement guidance
- 0.40-0.59 = Moderate: Generic or incomplete feedback
- 0.00-0.39 = Poor: No improvement feedback

**Overall 3-Fold Score**:
Weighted combination of the three scores above. Target: > 0.70 for production use.

## Sample Output

```
3-FOLD EVALUATION SUMMARY
================================================================================

Total Test Cases:    6
Successful:          6
Failed:              0

📊 3-FOLD SCORES (Weighted by Priority):
  1️⃣  Movement Description:    78.33% (Weight: 50%)
      ├─ Verb Coverage:       75.00%
      ├─ Adverb Coverage:     66.67%
      └─ Keyword Coverage:    90.00%

  2️⃣  Evaluation Cues:         72.22% (Weight: 30%)
      ├─ Success Indicators:  70.83%
      ├─ Failure Indicators:  66.67%
      └─ Quality Criteria:    77.78%

  3️⃣  Improvement Feedback:    65.00% (Weight: 20%)
      ├─ Error Corrections:   66.67%
      └─ Practice Tips:       62.50%

  📈 OVERALL 3-FOLD SCORE:     73.17%

📊 Quality Metrics:
  Length Score:        0.92/1.0
  Length Ratio:        3.8x
  Completeness:        100.00%

📊 Performance Interpretation:
  ⚠️  GOOD: System captures most elements, some improvement needed

💡 Recommendations:
  🟠 Priority 2: Enhance evaluation cues (success/failure indicators)
  🟡 Priority 3: Add more improvement feedback (corrections, practice tips)
```

## Interpreting Results

### What to Look For

**Excellent Performance (Overall > 80%):**
- Movement descriptions are rich and detailed
- Clear evaluation criteria for success/failure
- Actionable improvement feedback present
- All 3 folds well-represented

**Good Performance (Overall 60-80%):**
- Most elements present but some gaps
- Focus improvements on lowest-scoring fold
- Check craft-specific breakdown for patterns

**Needs Improvement (Overall < 60%):**
- Significant gaps in one or more folds
- Review LLM prompts in `backend/llm_service.py`
- Consider increasing `max_tokens` in `config.py`
- May need prompt engineering for 3-fold structure

### Priority-Based Improvement

Since the evaluation uses **weighted priorities**, focus improvements in this order:

1. **First**: Improve Movement Description (Priority 1, 50% weight)
   - Add more action verbs to prompts
   - Emphasize adverbs and movement quality
   - Request detailed step-by-step descriptions

2. **Second**: Enhance Evaluation Cues (Priority 2, 30% weight)
   - Explicitly request success/failure indicators
   - Ask for quality criteria
   - Request observable characteristics

3. **Third**: Add Improvement Feedback (Priority 3, 20% weight)
   - Request error corrections
   - Ask for practice tips
   - Include progression advice

## Customizing Evaluation

### Adding New Test Cases

Edit `test_data/sample_transcriptions.json` and add new test cases following the 3-fold structure:

```json
{
  "id": 7,
  "craft": "your_craft",
  "transcription": "Your transcription...",
  "expected_elements": {
    "movement_description": {
      "verbs": ["verb1", "verb2"],
      "adverbs": ["adverb1"],
      "keywords": ["keyword1", "keyword2"]
    },
    "evaluation_cues": {
      "success_indicators": ["success1", "success2"],
      "failure_indicators": ["failure1"],
      "quality_criteria": ["criteria1"]
    },
    "improvement_feedback": {
      "error_corrections": ["correction1"],
      "practice_tips": ["tip1", "tip2"]
    }
  },
  "reference_answer": "Expected output..."
}
```

### Adjusting Weights

In `evaluate_rag_simple.py`, line 167-171, you can adjust the priority weights:

```python
overall_threefold_score = (
    movement_description_score * 0.5 +  # Priority 1 (default: 50%)
    evaluation_cues_score * 0.3 +        # Priority 2 (default: 30%)
    improvement_feedback_score * 0.2     # Priority 3 (default: 20%)
)
```

For example, if evaluation cues become more important:
```python
overall_threefold_score = (
    movement_description_score * 0.4 +  # Reduce to 40%
    evaluation_cues_score * 0.4 +        # Increase to 40%
    improvement_feedback_score * 0.2     # Keep at 20%
)
```

### Creating Custom Sub-Metrics

You can add more granular evaluation by extending the `_evaluate_three_folds` method:

```python
# Example: Check for specific movement phases
has_preparation_phase = "préparer" in extended_lower or "positionner" in extended_lower
has_execution_phase = "exécuter" in extended_lower or "réaliser" in extended_lower
has_completion_phase = "terminer" in extended_lower or "finir" in extended_lower

phase_completeness = (
    (1 if has_preparation_phase else 0) +
    (1 if has_execution_phase else 0) +
    (1 if has_completion_phase else 0)
) / 3
```

## Troubleshooting

### Issue: "Low movement description score"
**Solution**:
- Review prompts in `backend/llm_service.py` lines 21-44 (glassblowing) or 46-68 (jewelry)
- Add explicit instructions to use action verbs and adverbs
- Request detailed movement descriptions
- Example addition: "Décrivez le mouvement en utilisant des verbes d'action précis et des adverbes pour qualifier l'intensité et la vitesse."

### Issue: "Low evaluation cues score"
**Solution**:
- Modify prompts to explicitly request success/failure indicators
- Add: "Indiquez les critères de succès (à quoi ressemble une bonne exécution) et les erreurs courantes (à quoi ressemble un échec)."
- Emphasize observable characteristics

### Issue: "Low improvement feedback score"
**Solution**:
- Add explicit feedback section to prompts
- Request: "Fournissez des conseils d'amélioration concrets et des exercices pratiques pour progresser."
- Include error correction strategies

### Issue: "Length ratio too low (< 3x)"
**Solution**:
- Increase `FIREWORKS_LLM_MAX_TOKENS` in `backend/config.py` (currently 1524)
- Try 2048 or 3072 for more detailed outputs
- Adjust stop sequences if transcripts are being cut off

### Issue: "Missing structural paragraphs"
**Solution**:
- Update prompts to request 3 distinct paragraphs
- Example: "La transcription étendue doit être en 3 paragraphes distincts : 1) Description du mouvement, 2) Critères d'évaluation, 3) Conseils d'amélioration."
- Request markdown formatting or double line breaks

## Best Practices

1. **Align Prompts with 3-Fold Structure**: Update your LLM prompts in `backend/llm_service.py` to explicitly request the 3 folds in order

2. **Regular Evaluation**: Run evaluations after any changes to:
   - System prompts
   - LLM model or parameters
   - Craft-specific content

3. **Craft-Specific Test Cases**: Create separate test case files for each craft domain:
   ```bash
   python evaluate_rag_simple.py --test-data test_data/glassblowing_advanced.json
   python evaluate_rag_simple.py --test-data test_data/jewelry_basic.json
   ```

4. **Track Improvements**: Save evaluation results to version control to track progress over time

5. **Balance All 3 Folds**: Don't over-optimize for one fold at the expense of others. The weighted score helps maintain balance, but review individual fold scores regularly.

6. **Use Real Examples**: Replace sample test cases with real transcriptions from your expert elicitations for more accurate evaluation

7. **Human Review**: Automated metrics are helpful, but manually review outputs to ensure they align with your pedagogical goals

## Aligning System Prompts with 3-Fold Structure

Your current prompts in `backend/llm_service.py` can be enhanced to better match the 3-fold priority. Example structure:

```python
ENHANCED_SYSTEM_PROMPT = """
Vous êtes un expert en analyse des techniques de [craft]. Votre tâche consiste à enrichir
les transcriptions selon cette structure précise en 3 parties :

**Partie 1 - Description du mouvement (PRIORITÉ HAUTE):**
Décrivez comment le geste est réalisé en utilisant:
- Des verbes d'action précis (tourner, lisser, maintenir, presser...)
- Des adverbes qualifiant l'intensité et la vitesse (doucement, régulièrement, rapidement...)
- Des descriptions détaillées des mouvements, positions, et transitions

**Partie 2 - Critères d'évaluation (PRIORITÉ MOYENNE):**
Expliquez ce qu'il faut observer dans le mouvement:
- Indicateurs de succès: à quoi ressemble une exécution réussie
- Indicateurs d'échec: quelles sont les erreurs possibles et comment les reconnaître
- Critères de qualité: quelles caractéristiques le mouvement DOIT avoir pour être "bien fait"

**Partie 3 - Conseils d'amélioration (PRIORITÉ BASSE):**
Fournissez des retours sur les erreurs et l'amélioration:
- Corrections d'erreurs: comment corriger les défauts spécifiques
- Conseils pratiques: comment s'améliorer pour les prochaines tentatives

Directives:
- Utilisez 3 paragraphes distincts (2 sauts de ligne entre chaque)
- Restez fidèle à la transcription originale
- Soyez concis mais complet (3-5x la longueur de l'original)
- Utilisez un langage technique approprié au domaine
"""
```

## Further Reading

- [Ragas Documentation](https://docs.ragas.io/)
- [RAG Evaluation Best Practices](https://docs.ragas.io/en/stable/concepts/metrics/)
- [Video Elicitation Research](https://en.wikipedia.org/wiki/Video_elicitation)

## Contributing

To improve the evaluation framework:

1. Add new test cases that represent real expert elicitations
2. Implement new metrics specific to your craft domains
3. Document your evaluation findings and share insights
4. Propose improvements to the 3-fold scoring weights based on your needs
