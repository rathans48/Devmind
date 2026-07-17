import os
import sys
import types
import warnings
import math
from dotenv import load_dotenv

# Silence contradictory deprecation logs entirely
warnings.filterwarnings("ignore", category=DeprecationWarning)

# DYNAMIC PATH RESOLUTION: Relocate from evals/ to backend/
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "backend", "env"))

if not os.path.exists(ENV_PATH):
    ENV_PATH = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "backend", ".env"))

print(f"🔌 Loading environment variables from: {ENV_PATH}")
load_dotenv(dotenv_path=ENV_PATH)

# KEY NORMALIZER: Extract your Gemini key no matter its alias 
TARGET_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or os.getenv("OPENAI_API_KEY")

if TARGET_KEY:
    os.environ["GEMINI_API_KEY"] = TARGET_KEY
    os.environ["GOOGLE_API_KEY"] = TARGET_KEY
else:
    print("[Eval Error] Could not find a valid API key in your environment.")
    sys.exit(1)

# Monkeypatch upstream Ragas import crash
if "langchain_community.chat_models.vertexai" not in sys.modules:
    dummy_chat = types.ModuleType("langchain_community.chat_models.vertexai")
    dummy_chat.ChatVertexAI = type("ChatVertexAI", (object,), {})
    sys.modules["langchain_community.chat_models.vertexai"] = dummy_chat

# Ragas v0.2+ Architecture Imports
from google import genai
from ragas import evaluate, EvaluationDataset, SingleTurnSample
from ragas.llms import llm_factory
from ragas.metrics import Faithfulness, ResponseRelevancy
from ragas.run_config import RunConfig

# UNIVERSAL EMBEDDING WRAPPER: Equipped to satisfy legacy LangChain interfaces
class GoogleGenAIEmbeddingsWrapper:
    def __init__(self, client: genai.Client):
        self.client = client
        self.model = "text-embedding-004"

    def _execute_embedding(self, text: str) -> list[float]:
        res = self.client.models.embed_content(
            model=self.model,
            contents=text
        )
        return res.embeddings[0].values

    def embed_query(self, text: str) -> list[float]:
        return self._execute_embedding(text)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._execute_embedding(t) for t in texts]

# 1. Initialize the Google GenAI Components as our Evaluation Judges
def get_evaluator_components():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    
    llm = llm_factory("gemini-2.0-flash", provider="google", client=client)
    embeddings = GoogleGenAIEmbeddingsWrapper(client)
    
    return llm, embeddings

# 2. Compile Your Golden Test Dataset using modern Ragas Schema Elements
def load_test_dataset() -> EvaluationDataset:
    samples = [
        SingleTurnSample(
            user_input="DEBUG: def add(a, b): return(a-b)",
            response="Error Identified: The function performs subtraction instead of addition. Corrected implementation: def add(a, b): return a + b",
            retrieved_contexts=[
                "The add utility function must calculate the arithmetic sum of two numeric parameters.",
                "Shadowing standard library methods should be avoided by utilizing clean identifiers."
            ]
        ),
        SingleTurnSample(
            user_input="Generate documentation for a simple sum function.",
            response="## Technical Documentation: add Function\nSummary: Calculates the arithmetic sum of two numbers. Time Complexity: O(1).",
            retrieved_contexts=[
                "The add function takes a: float and b: float and returns their cumulative sum with constant runtime characteristics."
            ]
        )
    ]
    return EvaluationDataset(samples=samples)

# 3. Main Evaluation Runner Lifecycle (Synchronous Execution Engine)
def main():
    print("🚀 [RAGAs Eval] Initializing multi-agent performance verification suite...")
    
    judge_llm, judge_embeddings = get_evaluator_components()
    test_dataset = load_test_dataset()
    
    metrics = [
        Faithfulness(llm=judge_llm),
        ResponseRelevancy(llm=judge_llm, embeddings=judge_embeddings)
    ]
    
    rate_limiting_config = RunConfig(
        max_workers=1,
        timeout=90,
        max_retries=10,
        max_wait=60
    )
    
    print(f"📊 Running metrics over {len(test_dataset)} production test samples...")
    
    try:
        results = evaluate(
            dataset=test_dataset,
            metrics=metrics,
            show_progress=True,
            run_config=rate_limiting_config
        )
        
        # 🧠 FIX: Safely extract aggregated means via the official Pandas export layer
        results_df = results.to_pandas()
        mean_scores = results_df.mean(numeric_only=True).to_dict()
        results_dict = {str(k).lower(): float(v) for k, v in mean_scores.items()}
        
        faithfulness_score = results_dict.get('faithfulness', float('nan'))
        relevancy_score = results_dict.get('response_relevancy', float('nan'))
        
        print("\n==========================================")
        print("🎉 EVALUATION SUITE COMPLETE")
        print("==========================================")
        print(f"🔹 Faithfulness Score:  {f'{faithfulness_score:.4f}' if not math.isnan(faithfulness_score) else 'NaN (API Error)'}")
        print(f"🔹 Response Relevancy: {f'{relevancy_score:.4f}' if not math.isnan(relevancy_score) else 'NaN (API Error)'}")
        print("==========================================\n")
        
        target_threshold = 0.80
        failed_metrics = []
        
        for metric_name, score in results_dict.items():
            if math.isnan(score):
                failed_metrics.append(f"{metric_name.title()} (Returned NaN due to 429 Quota Exhaustion)")
            elif score < target_threshold:
                failed_metrics.append(f"{metric_name.title()} ({score:.4f} < {target_threshold})")
                
        if failed_metrics:
            print(f"❌ [Gate Blown] Quality threshold check failed for:\n - " + "\n - ".join(failed_metrics))
            sys.exit(1)
        else:
            print("✅ [Gate Passed] All core multi-agent metrics are above 0.80!")
            sys.exit(0)
            
    except Exception as e:
        print(f"💥 [Runtime System Crash] Evaluation pipeline failed to execute: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()