"""
Full RAG Evaluation Script with Ragas Metrics for 3-Fold Data Extraction
Evaluates extended transcript generation based on:
1. Movement description (verbs, adverbs, movement explanations)
2. Evaluation cues (success/failure indicators, quality criteria)
3. Improvement feedback (error corrections, practice tips)

Includes both custom metrics and Ragas automated evaluation
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional
import pandas as pd

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from llm_service import generate_extended_transcript
from config import FIREWORKS_API_KEY

# Import Ragas components
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)
from datasets import Dataset


class ThreeFoldRAGEvaluatorWithRagas:
    """Evaluator for 3-fold data extraction RAG system with Ragas metrics"""

    def __init__(self, test_data_path: str):
        """
        Initialize evaluator with test data

        Args:
            test_data_path: Path to JSON file containing test cases
        """
        self.test_data_path = Path(test_data_path)
        self.test_cases = self._load_test_data()
        self.results = []

    def _load_test_data(self) -> List[Dict]:
        """Load test cases from JSON file"""
        with open(self.test_data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data["test_cases"]

    async def generate_responses(self) -> List[Dict]:
        """
        Generate extended transcripts for all test cases

        Returns:
            List of dictionaries with questions, contexts, answers, and evaluations
        """
        responses = []

        for test_case in self.test_cases:
            print(f"\n{'='*80}")
            print(f"Processing Test Case {test_case['id']}: {test_case['craft']}")
            print(f"Original Transcription: {test_case['transcription']}")
            print(f"{'='*80}")

            # Generate extended transcript
            extended_transcript = await generate_extended_transcript(
                test_case["transcription"], craft=test_case["craft"]
            )

            if extended_transcript:
                print(f"\nGenerated Extended Transcript:\n{extended_transcript}\n")

                # Prepare data for Ragas evaluation
                question = (
                    f"Pour la transcription '{test_case['transcription']}', "
                    "fournissez : 1) une description du mouvement avec verbes et adverbes, "
                    "2) les critères d'évaluation (succès/échec), "
                    "3) des conseils d'amélioration."
                )

                context = test_case["transcription"]
                answer = extended_transcript
                ground_truth = test_case["reference_answer"]

                # Evaluate 3-fold structure
                fold_scores = self._evaluate_three_folds(test_case, extended_transcript)

                response_data = {
                    "question": question,
                    "contexts": [context],
                    "answer": answer,
                    "ground_truth": ground_truth,
                    "test_case_id": test_case["id"],
                    "craft": test_case["craft"],
                    "original_transcription": test_case["transcription"],
                    "custom_metrics": fold_scores,
                }

                responses.append(response_data)

            else:
                print(f"ERROR: Failed to generate extended transcript for test case {test_case['id']}")

        return responses

    def _evaluate_three_folds(self, test_case: Dict, extended_transcript: str) -> Dict:
        """
        Evaluate the 3-fold structure of data extraction

        Args:
            test_case: Test case with expected elements
            extended_transcript: Generated extended transcript

        Returns:
            Dictionary with 3-fold evaluation scores
        """
        extended_lower = extended_transcript.lower()
        expected = test_case["expected_elements"]

        # FOLD 1: Movement Description
        movement = expected["movement_description"]
        verb_hits = sum(1 for verb in movement["verbs"] if verb.lower() in extended_lower)
        verb_score = verb_hits / len(movement["verbs"]) if movement["verbs"] else 0

        adverb_hits = sum(1 for adverb in movement["adverbs"] if adverb.lower() in extended_lower)
        adverb_score = adverb_hits / len(movement["adverbs"]) if movement["adverbs"] else 0

        keyword_hits = sum(1 for keyword in movement["keywords"] if keyword.lower() in extended_lower)
        keyword_score = keyword_hits / len(movement["keywords"]) if movement["keywords"] else 0

        movement_description_score = (verb_score * 0.4 + adverb_score * 0.3 + keyword_score * 0.3)

        # FOLD 2: Evaluation Cues
        eval_cues = expected["evaluation_cues"]
        success_hits = sum(1 for indicator in eval_cues["success_indicators"]
                          if indicator.lower() in extended_lower)
        success_score = success_hits / len(eval_cues["success_indicators"]) if eval_cues["success_indicators"] else 0

        failure_hits = sum(1 for indicator in eval_cues["failure_indicators"]
                          if indicator.lower() in extended_lower)
        failure_score = failure_hits / len(eval_cues["failure_indicators"]) if eval_cues["failure_indicators"] else 0

        quality_hits = sum(1 for criterion in eval_cues["quality_criteria"]
                          if any(word in extended_lower for word in criterion.lower().split()))
        quality_score = quality_hits / len(eval_cues["quality_criteria"]) if eval_cues["quality_criteria"] else 0

        evaluation_cues_score = (success_score * 0.4 + failure_score * 0.3 + quality_score * 0.3)

        # FOLD 3: Improvement Feedback
        feedback = expected["improvement_feedback"]
        correction_hits = sum(1 for correction in feedback["error_corrections"]
                             if any(word in extended_lower for word in correction.lower().split()))
        correction_score = correction_hits / len(feedback["error_corrections"]) if feedback["error_corrections"] else 0

        tip_hits = sum(1 for tip in feedback["practice_tips"]
                      if tip.lower() in extended_lower)
        tip_score = tip_hits / len(feedback["practice_tips"]) if feedback["practice_tips"] else 0

        improvement_feedback_score = (correction_score * 0.6 + tip_score * 0.4)

        # Overall score weighted by priority
        overall_threefold_score = (
            movement_description_score * 0.5 +
            evaluation_cues_score * 0.3 +
            improvement_feedback_score * 0.2
        )

        return {
            "movement_description_score": movement_description_score,
            "evaluation_cues_score": evaluation_cues_score,
            "improvement_feedback_score": improvement_feedback_score,
            "overall_threefold_score": overall_threefold_score,
        }

    def evaluate_with_ragas(self, responses: List[Dict]) -> Dict:
        """
        Evaluate responses using Ragas metrics

        Args:
            responses: List of response dictionaries

        Returns:
            Evaluation results dictionary
        """
        dataset_dict = {
            "question": [r["question"] for r in responses],
            "contexts": [r["contexts"] for r in responses],
            "answer": [r["answer"] for r in responses],
            "ground_truth": [r["ground_truth"] for r in responses],
        }

        dataset = Dataset.from_dict(dataset_dict)

        print("\n" + "="*80)
        print("Running Ragas Evaluation...")
        print("="*80 + "\n")

        results = evaluate(
            dataset,
            metrics=[
                faithfulness,
                answer_relevancy,
                context_precision,
                context_recall,
            ],
        )

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

        # Generate responses
        print("\n" + "="*80)
        print("STEP 1: Generating Extended Transcripts")
        print("="*80)
        responses = await self.generate_responses()

        if not responses:
            print("\nERROR: No responses generated.")
            return pd.DataFrame()

        # Evaluate with Ragas
        print("\n" + "="*80)
        print("STEP 2: Evaluating with Ragas Metrics")
        print("="*80)

        try:
            ragas_results = self.evaluate_with_ragas(responses)
            print("\nRagas Evaluation Complete!")
            print(ragas_results)
        except Exception as e:
            print(f"\nWARNING: Ragas evaluation failed: {e}")
            print("Continuing with custom metrics only.\n")
            ragas_results = None

        # Compile results
        results_df = self._compile_results(responses, ragas_results)

        # Save results
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        csv_path = output_dir / f"threefold_ragas_evaluation_{timestamp}.csv"
        results_df.to_csv(csv_path, index=False, encoding="utf-8")

        json_path = output_dir / f"threefold_ragas_evaluation_{timestamp}.json"
        results_json = results_df.to_dict(orient="records")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(results_json, f, indent=2, ensure_ascii=False)

        print("\n" + "="*80)
        print("EVALUATION COMPLETE")
        print("="*80)
        print(f"\nResults saved to:")
        print(f"  - {csv_path}")
        print(f"  - {json_path}")

        return results_df

    def _compile_results(
        self, responses: List[Dict], ragas_results: Optional[Dict]
    ) -> pd.DataFrame:
        """Compile results into a DataFrame"""
        compiled = []

        for i, response in enumerate(responses):
            result = {
                "test_case_id": response["test_case_id"],
                "craft": response["craft"],
                "original_transcription": response["original_transcription"],
                "extended_transcript": response["answer"],
                "reference_answer": response["ground_truth"],
            }

            # Add custom 3-fold metrics
            custom = response["custom_metrics"]
            result.update({
                "movement_description_score": custom["movement_description_score"],
                "evaluation_cues_score": custom["evaluation_cues_score"],
                "improvement_feedback_score": custom["improvement_feedback_score"],
                "overall_threefold_score": custom["overall_threefold_score"],
            })

            # Add Ragas metrics if available
            if ragas_results is not None:
                try:
                    result.update({
                        "faithfulness": ragas_results["faithfulness"][i],
                        "answer_relevancy": ragas_results["answer_relevancy"][i],
                        "context_precision": ragas_results["context_precision"][i],
                        "context_recall": ragas_results["context_recall"][i],
                    })
                except (KeyError, IndexError, TypeError):
                    pass

            compiled.append(result)

        df = pd.DataFrame(compiled)

        # Print summary
        print("\n" + "="*80)
        print("EVALUATION SUMMARY")
        print("="*80)
        print("\n3-Fold Custom Metrics (Average):")
        print(f"  Movement Description:  {df['movement_description_score'].mean():.2%} (Priority 1, Weight: 50%)")
        print(f"  Evaluation Cues:       {df['evaluation_cues_score'].mean():.2%} (Priority 2, Weight: 30%)")
        print(f"  Improvement Feedback:  {df['improvement_feedback_score'].mean():.2%} (Priority 3, Weight: 20%)")
        print(f"  Overall 3-Fold Score:  {df['overall_threefold_score'].mean():.2%}")

        if "faithfulness" in df.columns:
            print("\nRagas Metrics (Average):")
            print(f"  Faithfulness:          {df['faithfulness'].mean():.2f}")
            print(f"  Answer Relevancy:      {df['answer_relevancy'].mean():.2f}")
            print(f"  Context Precision:     {df['context_precision'].mean():.2f}")
            print(f"  Context Recall:        {df['context_recall'].mean():.2f}")

        return df


async def main():
    """Main evaluation entry point"""
    print("\n" + "="*80)
    print("3-Fold Data Extraction RAG Evaluation with Ragas")
    print("Video Elicitation Annotation Tool")
    print("="*80)

    # Check API keys
    if not FIREWORKS_API_KEY:
        print("\nERROR: FIREWORKS_API_KEY not set in environment.")
        print("Please set it in your .env file or environment variables.")
        return

    print("\nFIREWORKS_API_KEY: ✓ Found")

    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        print("OPENAI_API_KEY: ⚠️  Not found (Ragas evaluation may fail)")
        print("Set OPENAI_API_KEY for automated Ragas metrics, or use evaluate_rag_simple.py instead")
    else:
        print("OPENAI_API_KEY: ✓ Found")

    # Initialize evaluator
    test_data_path = Path(__file__).parent / "test_data" / "sample_transcriptions.json"
    evaluator = ThreeFoldRAGEvaluatorWithRagas(str(test_data_path))

    print(f"\nTest Cases: {len(evaluator.test_cases)} loaded")
    print("\nEvaluation Structure:")
    print("  1. Movement Description (Priority 1, Weight: 50%)")
    print("  2. Evaluation Cues (Priority 2, Weight: 30%)")
    print("  3. Improvement Feedback (Priority 3, Weight: 20%)")

    # Run evaluation
    results_df = await evaluator.run_evaluation()

    if not results_df.empty:
        print("\n" + "="*80)
        print("Evaluation completed successfully!")
        print("="*80)
    else:
        print("\nEvaluation failed. Please check error messages above.")


if __name__ == "__main__":
    asyncio.run(main())
