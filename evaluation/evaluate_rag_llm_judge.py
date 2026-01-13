"""
LLM-as-a-Judge RAG Evaluation for 3-Fold Data Extraction
Uses a judge LLM to evaluate the quality of extended transcripts
based on the 3-fold structure with custom prompts
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional
import pandas as pd
import aiohttp

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from llm_service import generate_extended_transcript
from config import FIREWORKS_API_KEY


# Judge prompts for each fold
MOVEMENT_DESCRIPTION_JUDGE_PROMPT = """
Vous êtes un expert en évaluation de descriptions de mouvements artisanaux.

TÂCHE: Évaluez la qualité de la description du mouvement dans la transcription étendue.

TRANSCRIPTION ORIGINALE:
{transcription}

TRANSCRIPTION ÉTENDUE:
{extended_transcript}

CRITÈRES D'ÉVALUATION (Fold 1 - Priorité 1):
1. **Utilisation de verbes d'action** (40%): La description utilise-t-elle des verbes précis et variés pour décrire le mouvement (tourner, lisser, maintenir, presser, guider, etc.)?
2. **Utilisation d'adverbes qualificatifs** (30%): Y a-t-il des adverbes décrivant l'intensité, la vitesse, la manière (doucement, régulièrement, rapidement, fermement, continuellement)?
3. **Description détaillée du mouvement** (30%): Le mouvement est-il décrit de manière détaillée (position, angle, rotation, pression, timing)?

INSTRUCTIONS:
- Évaluez chaque critère sur une échelle de 0 à 10
- Fournissez une justification courte pour chaque score
- Calculez un score global pondéré

RÉPONDEZ AU FORMAT JSON:
{{
  "verb_usage": {{
    "score": <0-10>,
    "justification": "<explication courte>"
  }},
  "adverb_usage": {{
    "score": <0-10>,
    "justification": "<explication courte>"
  }},
  "movement_detail": {{
    "score": <0-10>,
    "justification": "<explication courte>"
  }},
  "overall_score": <0-10>,
  "overall_justification": "<synthèse courte>"
}}
"""

EVALUATION_CUES_JUDGE_PROMPT = """
Vous êtes un expert en évaluation de critères pédagogiques pour l'apprentissage de gestes artisanaux.

TÂCHE: Évaluez la qualité des critères d'évaluation fournis dans la transcription étendue.

TRANSCRIPTION ORIGINALE:
{transcription}

TRANSCRIPTION ÉTENDUE:
{extended_transcript}

CRITÈRES D'ÉVALUATION (Fold 2 - Priorité 2):
1. **Indicateurs de succès** (40%): La transcription décrit-elle clairement à quoi ressemble une exécution réussie (surface lisse, symétrie, coupe nette, etc.)?
2. **Indicateurs d'échec** (30%): Les erreurs courantes et leurs manifestations sont-elles décrites (marques, déformation, fils de verre, etc.)?
3. **Critères de qualité** (30%): Les caractéristiques requises pour une exécution "bien faite" sont-elles précisées (pression uniforme, angle stable, mouvement décisif)?

INSTRUCTIONS:
- Évaluez chaque critère sur une échelle de 0 à 10
- Fournissez une justification courte pour chaque score
- Calculez un score global pondéré

RÉPONDEZ AU FORMAT JSON:
{{
  "success_indicators": {{
    "score": <0-10>,
    "justification": "<explication courte>"
  }},
  "failure_indicators": {{
    "score": <0-10>,
    "justification": "<explication courte>"
  }},
  "quality_criteria": {{
    "score": <0-10>,
    "justification": "<explication courte>"
  }},
  "overall_score": <0-10>,
  "overall_justification": "<synthèse courte>"
}}
"""

IMPROVEMENT_FEEDBACK_JUDGE_PROMPT = """
Vous êtes un expert en évaluation de retours pédagogiques pour l'amélioration de gestes artisanaux.

TÂCHE: Évaluez la qualité des conseils d'amélioration dans la transcription étendue.

TRANSCRIPTION ORIGINALE:
{transcription}

TRANSCRIPTION ÉTENDUE:
{extended_transcript}

CRITÈRES D'ÉVALUATION (Fold 3 - Priorité 3):
1. **Corrections d'erreurs** (60%): Des corrections concrètes sont-elles fournies pour les erreurs courantes (ajuster la pression, accélérer le mouvement, stabiliser l'angle)?
2. **Conseils pratiques** (40%): Des conseils pratiques pour progresser sont-ils donnés (exercer, répéter, commencer lentement, utiliser un repère visuel)?

INSTRUCTIONS:
- Évaluez chaque critère sur une échelle de 0 à 10
- Fournissez une justification courte pour chaque score
- Calculez un score global pondéré

RÉPONDEZ AU FORMAT JSON:
{{
  "error_corrections": {{
    "score": <0-10>,
    "justification": "<explication courte>"
  }},
  "practice_tips": {{
    "score": <0-10>,
    "justification": "<explication courte>"
  }},
  "overall_score": <0-10>,
  "overall_justification": "<synthèse courte>"
}}
"""


class LLMJudgeEvaluator:
    """Evaluator using LLM-as-a-Judge for 3-fold data extraction"""

    def __init__(self, test_data_path: str, judge_api_key: str, judge_model: str = "gpt-4-turbo"):
        """
        Initialize evaluator with test data and judge configuration

        Args:
            test_data_path: Path to JSON file containing test cases
            judge_api_key: API key for the judge LLM (OpenAI, Anthropic, etc.)
            judge_model: Model to use as judge (default: gpt-4-turbo)
        """
        self.test_data_path = Path(test_data_path)
        self.test_cases = self._load_test_data()
        self.judge_api_key = judge_api_key
        self.judge_model = judge_model

    def _load_test_data(self) -> List[Dict]:
        """Load test cases from JSON file"""
        with open(self.test_data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data["test_cases"]

    async def call_judge_llm(self, prompt: str) -> Dict:
        """
        Call the judge LLM with a prompt

        Args:
            prompt: The evaluation prompt

        Returns:
            Parsed JSON response from judge
        """
        # Using OpenAI API format (adjust for other providers)
        headers = {
            "Authorization": f"Bearer {self.judge_api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.judge_model,
            "messages": [
                {"role": "system", "content": "You are an expert evaluator. Always respond with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,  # Lower temperature for more consistent evaluation
            "response_format": {"type": "json_object"} if "gpt-4" in self.judge_model else None
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Judge LLM API error: {error_text}")

                result = await response.json()
                content = result["choices"][0]["message"]["content"]

                # Parse JSON response
                try:
                    return json.loads(content)
                except json.JSONDecodeError:
                    # Try to extract JSON from markdown code blocks
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0].strip()
                    elif "```" in content:
                        content = content.split("```")[1].split("```")[0].strip()
                    return json.loads(content)

    async def evaluate_with_judge(self, transcription: str, extended_transcript: str) -> Dict:
        """
        Evaluate extended transcript using LLM-as-a-Judge for all 3 folds

        Args:
            transcription: Original transcription
            extended_transcript: Generated extended transcript

        Returns:
            Dictionary with judge scores for all folds
        """
        # Evaluate Fold 1: Movement Description
        print("  Evaluating Fold 1: Movement Description...")
        fold1_prompt = MOVEMENT_DESCRIPTION_JUDGE_PROMPT.format(
            transcription=transcription,
            extended_transcript=extended_transcript
        )
        fold1_result = await self.call_judge_llm(fold1_prompt)

        # Evaluate Fold 2: Evaluation Cues
        print("  Evaluating Fold 2: Evaluation Cues...")
        fold2_prompt = EVALUATION_CUES_JUDGE_PROMPT.format(
            transcription=transcription,
            extended_transcript=extended_transcript
        )
        fold2_result = await self.call_judge_llm(fold2_prompt)

        # Evaluate Fold 3: Improvement Feedback
        print("  Evaluating Fold 3: Improvement Feedback...")
        fold3_prompt = IMPROVEMENT_FEEDBACK_JUDGE_PROMPT.format(
            transcription=transcription,
            extended_transcript=extended_transcript
        )
        fold3_result = await self.call_judge_llm(fold3_prompt)

        # Calculate weighted overall score (Priority: 1=50%, 2=30%, 3=20%)
        overall_score = (
            fold1_result["overall_score"] * 0.5 +
            fold2_result["overall_score"] * 0.3 +
            fold3_result["overall_score"] * 0.2
        )

        return {
            "fold1_movement_description": fold1_result,
            "fold2_evaluation_cues": fold2_result,
            "fold3_improvement_feedback": fold3_result,
            "overall_weighted_score": overall_score,
        }

    async def generate_and_evaluate(self) -> List[Dict]:
        """
        Generate extended transcripts and evaluate them with LLM judge

        Returns:
            List of evaluation results
        """
        results = []

        for test_case in self.test_cases:
            print(f"\n{'='*80}")
            print(f"Test Case {test_case['id']}: {test_case['craft'].upper()}")
            print(f"{'='*80}")
            print(f"\nOriginal Transcription:")
            print(f"  {test_case['transcription']}")

            # Generate extended transcript
            print(f"\nGenerating extended transcript...")
            extended_transcript = await generate_extended_transcript(
                test_case["transcription"], craft=test_case["craft"]
            )

            if extended_transcript:
                print(f"\nGenerated Extended Transcript:")
                print(f"  {extended_transcript[:300]}..." if len(extended_transcript) > 300 else f"  {extended_transcript}")

                # Evaluate with LLM judge
                print(f"\nEvaluating with LLM-as-a-Judge...")
                judge_results = await self.evaluate_with_judge(
                    test_case["transcription"],
                    extended_transcript
                )

                result = {
                    "test_case_id": test_case["id"],
                    "craft": test_case["craft"],
                    "original_transcription": test_case["transcription"],
                    "extended_transcript": extended_transcript,
                    "reference_answer": test_case["reference_answer"],
                    **judge_results,
                }

                results.append(result)

                # Print scores
                print(f"\n📊 LLM Judge Scores (0-10 scale):")
                print(f"  1️⃣  Movement Description:  {judge_results['fold1_movement_description']['overall_score']:.1f}/10 (Weight: 50%)")
                print(f"  2️⃣  Evaluation Cues:       {judge_results['fold2_evaluation_cues']['overall_score']:.1f}/10 (Weight: 30%)")
                print(f"  3️⃣  Improvement Feedback:  {judge_results['fold3_improvement_feedback']['overall_score']:.1f}/10 (Weight: 20%)")
                print(f"  📈 Overall Weighted Score: {judge_results['overall_weighted_score']:.1f}/10")

            else:
                print(f"\n❌ ERROR: Failed to generate extended transcript")
                results.append({
                    "test_case_id": test_case["id"],
                    "craft": test_case["craft"],
                    "original_transcription": test_case["transcription"],
                    "extended_transcript": None,
                    "error": "Generation failed",
                })

        return results

    async def run_evaluation(self, output_dir: Optional[str] = None) -> pd.DataFrame:
        """
        Run complete evaluation pipeline

        Args:
            output_dir: Directory to save results

        Returns:
            DataFrame with evaluation results
        """
        if output_dir is None:
            output_dir = Path(__file__).parent / "results"
        else:
            output_dir = Path(output_dir)

        output_dir.mkdir(parents=True, exist_ok=True)

        # Generate and evaluate
        print("\n" + "="*80)
        print("LLM-as-a-Judge Evaluation for 3-Fold Data Extraction")
        print("="*80)
        results = await self.generate_and_evaluate()

        if not results:
            print("\n❌ ERROR: No results generated.")
            return pd.DataFrame()

        # Create DataFrame with detailed results
        results_df = self._compile_results(results)

        # Save results
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        csv_path = output_dir / f"llm_judge_evaluation_{timestamp}.csv"
        results_df.to_csv(csv_path, index=False, encoding="utf-8")

        json_path = output_dir / f"llm_judge_evaluation_{timestamp}.json"
        results_json = results_df.to_dict(orient="records")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(results_json, f, indent=2, ensure_ascii=False)

        # Print summary
        self._print_summary(results_df)

        print("\n" + "="*80)
        print("✓ EVALUATION COMPLETE")
        print("="*80)
        print(f"\nResults saved to:")
        print(f"  📄 {csv_path}")
        print(f"  📄 {json_path}")

        return results_df

    def _compile_results(self, results: List[Dict]) -> pd.DataFrame:
        """Compile results into a DataFrame"""
        compiled = []

        for result in results:
            if "error" in result:
                compiled.append(result)
                continue

            compiled_result = {
                "test_case_id": result["test_case_id"],
                "craft": result["craft"],
                "original_transcription": result["original_transcription"],
                "extended_transcript": result["extended_transcript"],

                # Fold 1 scores
                "fold1_overall": result["fold1_movement_description"]["overall_score"],
                "fold1_verb_usage": result["fold1_movement_description"]["verb_usage"]["score"],
                "fold1_adverb_usage": result["fold1_movement_description"]["adverb_usage"]["score"],
                "fold1_movement_detail": result["fold1_movement_description"]["movement_detail"]["score"],
                "fold1_justification": result["fold1_movement_description"]["overall_justification"],

                # Fold 2 scores
                "fold2_overall": result["fold2_evaluation_cues"]["overall_score"],
                "fold2_success_indicators": result["fold2_evaluation_cues"]["success_indicators"]["score"],
                "fold2_failure_indicators": result["fold2_evaluation_cues"]["failure_indicators"]["score"],
                "fold2_quality_criteria": result["fold2_evaluation_cues"]["quality_criteria"]["score"],
                "fold2_justification": result["fold2_evaluation_cues"]["overall_justification"],

                # Fold 3 scores
                "fold3_overall": result["fold3_improvement_feedback"]["overall_score"],
                "fold3_error_corrections": result["fold3_improvement_feedback"]["error_corrections"]["score"],
                "fold3_practice_tips": result["fold3_improvement_feedback"]["practice_tips"]["score"],
                "fold3_justification": result["fold3_improvement_feedback"]["overall_justification"],

                # Overall
                "overall_weighted_score": result["overall_weighted_score"],
            }
            compiled.append(compiled_result)

        return pd.DataFrame(compiled)

    def _print_summary(self, df: pd.DataFrame):
        """Print summary statistics"""
        print("\n" + "="*80)
        print("LLM-AS-A-JUDGE EVALUATION SUMMARY")
        print("="*80)

        valid_df = df[df['extended_transcript'].notna()]

        if valid_df.empty:
            print("\n❌ No valid results to summarize.")
            return

        print(f"\nTotal Test Cases:    {len(df)}")
        print(f"Successful:          {len(valid_df)}")
        print(f"Failed:              {len(df) - len(valid_df)}")

        print("\n📊 3-FOLD SCORES (0-10 scale, weighted by priority):")
        print(f"  1️⃣  Movement Description:    {valid_df['fold1_overall'].mean():.2f}/10 (Weight: 50%)")
        print(f"      ├─ Verb Usage:          {valid_df['fold1_verb_usage'].mean():.2f}/10")
        print(f"      ├─ Adverb Usage:        {valid_df['fold1_adverb_usage'].mean():.2f}/10")
        print(f"      └─ Movement Detail:     {valid_df['fold1_movement_detail'].mean():.2f}/10")

        print(f"\n  2️⃣  Evaluation Cues:         {valid_df['fold2_overall'].mean():.2f}/10 (Weight: 30%)")
        print(f"      ├─ Success Indicators:  {valid_df['fold2_success_indicators'].mean():.2f}/10")
        print(f"      ├─ Failure Indicators:  {valid_df['fold2_failure_indicators'].mean():.2f}/10")
        print(f"      └─ Quality Criteria:    {valid_df['fold2_quality_criteria'].mean():.2f}/10")

        print(f"\n  3️⃣  Improvement Feedback:    {valid_df['fold3_overall'].mean():.2f}/10 (Weight: 20%)")
        print(f"      ├─ Error Corrections:   {valid_df['fold3_error_corrections'].mean():.2f}/10")
        print(f"      └─ Practice Tips:       {valid_df['fold3_practice_tips'].mean():.2f}/10")

        print(f"\n  📈 OVERALL WEIGHTED SCORE:   {valid_df['overall_weighted_score'].mean():.2f}/10")

        # Performance interpretation
        overall_score = valid_df['overall_weighted_score'].mean()
        print("\n📊 Performance Interpretation:")
        if overall_score >= 8.0:
            print("  ✅ EXCELLENT: Judge rates system outputs as high quality")
        elif overall_score >= 6.0:
            print("  ⚠️  GOOD: Judge sees quality but room for improvement")
        elif overall_score >= 4.0:
            print("  ⚠️  MODERATE: Significant quality gaps identified by judge")
        else:
            print("  ❌ POOR: Judge rates outputs as needing major improvement")

        # Breakdown by craft
        print("\n📊 Breakdown by Craft:")
        for craft in valid_df['craft'].unique():
            craft_df = valid_df[valid_df['craft'] == craft]
            print(f"\n  {craft.upper()}:")
            print(f"    Test Cases:              {len(craft_df)}")
            print(f"    Movement Description:    {craft_df['fold1_overall'].mean():.2f}/10")
            print(f"    Evaluation Cues:         {craft_df['fold2_overall'].mean():.2f}/10")
            print(f"    Improvement Feedback:    {craft_df['fold3_overall'].mean():.2f}/10")
            print(f"    Overall Score:           {craft_df['overall_weighted_score'].mean():.2f}/10")


async def main():
    """Main evaluation entry point"""
    print("\n" + "="*80)
    print("LLM-as-a-Judge Evaluation for 3-Fold Data Extraction")
    print("Video Elicitation Annotation Tool")
    print("="*80)

    # Check API keys
    if not FIREWORKS_API_KEY:
        print("\n❌ ERROR: FIREWORKS_API_KEY not set in environment.")
        print("Please set it in your .env file or environment variables.")
        return

    print("\n✓ FIREWORKS_API_KEY: Found (for generation)")

    judge_api_key = os.getenv("OPENAI_API_KEY")
    if not judge_api_key:
        print("❌ ERROR: OPENAI_API_KEY not set (needed for judge LLM)")
        print("Please set OPENAI_API_KEY in your .env file")
        print("\nAlternatively, you can modify this script to use:")
        print("  - Anthropic Claude API")
        print("  - Google Gemini API")
        print("  - Or another strong LLM as judge")
        return

    print("✓ OPENAI_API_KEY: Found (for judge)")

    # Initialize evaluator
    test_data_path = Path(__file__).parent / "test_data" / "sample_transcriptions.json"

    if not test_data_path.exists():
        print(f"\n❌ ERROR: Test data not found at {test_data_path}")
        return

    evaluator = LLMJudgeEvaluator(
        str(test_data_path),
        judge_api_key=judge_api_key,
        judge_model="gpt-4-turbo"  # Can change to "gpt-4", "claude-3-sonnet", etc.
    )

    print(f"✓ Test Cases: {len(evaluator.test_cases)} loaded")
    print(f"✓ Judge Model: {evaluator.judge_model}")

    print("\nEvaluation Structure:")
    print("  1. Movement Description (Priority 1, Weight: 50%)")
    print("  2. Evaluation Cues (Priority 2, Weight: 30%)")
    print("  3. Improvement Feedback (Priority 3, Weight: 20%)")

    # Run evaluation
    results_df = await evaluator.run_evaluation()

    if not results_df.empty:
        print("\n✅ Evaluation completed successfully!")
    else:
        print("\n❌ Evaluation failed. Please check error messages above.")


if __name__ == "__main__":
    asyncio.run(main())
