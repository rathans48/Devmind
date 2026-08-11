"""
DevMind RAGAs Evaluation Suite
-------------------------------
Runs Faithfulness + Response Relevancy evaluation on a golden test dataset.
Uses gemini-3.1-flash-lite as the judge LLM (low cost, generous quota).

Usage:
    cd devmind/
    python evals/run_evals.py
"""

import os
import sys
import types
import warnings
import math
from pathlib import Path
from dotenv import load_dotenv


warnings.filterwarnings("ignore", category=DeprecationWarning)

# ---------------------------------------------------------------------------
# 1. ENVIRONMENT SETUP
# ---------------------------------------------------------------------------

# Resolve .env path relative to this file's location
SCRIPT_DIR = Path(__file__).resolve().parent
ENV_PATH = SCRIPT_DIR.parent / "backend" / ".env"

if not ENV_PATH.exists():
    print(f"[Eval Error] .env file not found at: {ENV_PATH}")
    print("  Make sure backend/.env exists and contains GEMINI_API_KEY.")
    sys.exit(1)

print(f"🔌 Loading environment variables from: {ENV_PATH}")
load_dotenv(dotenv_path=ENV_PATH)

# Resolve the API key — accept either alias
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

if not GEMINI_API_KEY:
    print("[Eval Error] GEMINI_API_KEY (or GOOGLE_API_KEY) not found in backend/.env")
    sys.exit(1)

# Set both so downstream libraries pick up whichever alias they prefer
os.environ["GEMINI_API_KEY"] = GEMINI_API_KEY
os.environ["GOOGLE_API_KEY"] = GEMINI_API_KEY

# ---------------------------------------------------------------------------
# 2. MONKEYPATCH — silence broken langchain_community import inside ragas
# ---------------------------------------------------------------------------

if "langchain_community.chat_models.vertexai" not in sys.modules:
    dummy = types.ModuleType("langchain_community.chat_models.vertexai")
    dummy.ChatVertexAI = type("ChatVertexAI", (object,), {})
    sys.modules["langchain_community.chat_models.vertexai"] = dummy

# ---------------------------------------------------------------------------
# 3. RAGAS + GOOGLE GENAI IMPORTS
# ---------------------------------------------------------------------------

try:
    from ragas import evaluate, EvaluationDataset, SingleTurnSample
    from ragas.llms import llm_factory
    from ragas.metrics import Faithfulness, ResponseRelevancy
    from ragas.run_config import RunConfig
    from ragas.embeddings.base import embedding_factory
    import  litellm
except ImportError as e:
    print(f"[Import Error] Missing dependency: {e}")
    print("  Run:  pip install ragas google-generativeai python-dotenv")
    sys.exit(1)

# ---------------------------------------------------------------------------
# 4. EMBEDDING WRAPPER
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# 5. JUDGE LLM + EMBEDDINGS FACTORY
# ---------------------------------------------------------------------------

# gemini-3.1-flash-lite is the current judge model (low cost, generous quota).
# Switch to a larger model (e.g. gemini-3.1-flash) only if you have a paid API key.
JUDGE_MODEL = "gemini-3.1-flash-lite"

def build_evaluators():
    llm = llm_factory(
        f"gemini/{JUDGE_MODEL}",
        provider="litellm",
        client=litellm.completion,
    )

    base_embeddings = embedding_factory("litellm", model="gemini/gemini-embedding-001")

    class EmbeddingsCompat:
        """Bridges ragas' modern embed_text/embed_texts interface to the
        legacy embed_query/embed_documents interface that ResponseRelevancy expects."""
        def __init__(self, base):
            self.base = base
        def embed_query(self, text):
            return self.base.embed_text(text)
        def embed_documents(self, texts):
            return self.base.embed_texts(texts)

    embeddings = EmbeddingsCompat(base_embeddings)
    return llm, embeddings

# ---------------------------------------------------------------------------
# 6. GOLDEN TEST DATASET
#    Expand this with real DevMind queries as the system is built out.
# ---------------------------------------------------------------------------

def build_dataset() -> EvaluationDataset:
    samples = [
        SingleTurnSample(
            user_input="DEBUG: def add(a, b): return(a - b)",
            response=(
                "Error identified: the function subtracts instead of adding. "
                "Fix: def add(a, b): return a + b"
            ),
            retrieved_contexts=[
                "The add() function must return the arithmetic sum of two numeric inputs.",
                "Avoid shadowing built-in names; use descriptive identifiers.",
                "Submitted code under review: def add(a, b): return(a - b)"
            ]
        ),
        SingleTurnSample(
            user_input="Generate documentation for a simple sum function.",
            response=(
                "## add(a, b)\n"
                "Returns the arithmetic sum of `a` and `b`.\n\n"
                "**Parameters:** `a: float`, `b: float`\n"
                "**Returns:** `float`\n"
                "**Time Complexity:** O(1)"
            ),
            retrieved_contexts=[
                "The add function signature is add(a, b), accepting two float parameters, "
                "a and b, and returns their sum as a float with O(1) runtime."
            ]
        ),
        SingleTurnSample(
            user_input="How does the semantic cache work in DevMind?",
            response=(
                "DevMind embeds incoming queries using gemini-embedding-001 and computes "
                "cosine similarity against cached responses stored in an in-memory, "
                "process-local Python dict (SEMANTIC_CACHE_STORE). "
                "If similarity meets the threshold of 0.90, the cached answer is returned "
                "immediately without invoking the LLM, reducing token cost. "
                "Each cache entry is scoped per-command via a key of the form "
                "command:prompt.lower(), so hits only match within the same routing intent. "
                "The cache is volatile: it lives only for the life of the process and is "
                "not shared across multiple workers."
            ),
            retrieved_contexts=[
                "The semantic cache stores cached responses as embedding vectors in an in-memory, "
                "process-local Python dict (SEMANTIC_CACHE_STORE) using gemini-embedding-001 "
                "for cosine similarity lookups.",
                "Cache lookup matches only when cosine similarity is at least the threshold of 0.90.",
                "Cache entries are keyed per-command as command:prompt.lower(), so a hit is only "
                "returned when the query shares the same routing command as the cached entry.",
                "The cache is volatile and process-local: entries are lost on process restart "
                "and are not shared across multiple workers.",
                "Cache hits bypass the LangGraph workflow entirely, logging zero token cost to Langfuse.",
                "Incoming queries are embedded before similarity comparison against cached responses."
            ]
        ),
        SingleTurnSample(
            user_input="What agents are in the DevMind LangGraph workflow?",
            response=(
                "DevMind's LangGraph orchestrator routes tasks through four specialist agents: "
                "Code Agent (implementation), Review Agent (security and quality audit), "
                "Debug Agent (error diagnosis), and Docs Agent (documentation generation)."
            ),
            retrieved_contexts=[
                "The LangGraph workflow includes Code, Review, Debug, and Docs specialist agents.",
                "Conditional routing sends rejected Review Agent output to the Debug Agent for repair.",
                "The Code Agent implements code changes, the Review Agent audits for security and "
                "quality issues, the Debug Agent diagnoses errors, and the Docs Agent generates "
                "documentation."
            ]
        ),
    ]
    return EvaluationDataset(samples=samples)

# ---------------------------------------------------------------------------
# 7. MAIN EVALUATION RUNNER
# ---------------------------------------------------------------------------

def main():
    print("🚀 [RAGAs Eval] Starting DevMind evaluation suite...")
    print(f"   Judge model : {JUDGE_MODEL}")
    print(f"   Embed model : gemini-embedding-001\n")

    judge_llm, judge_embeddings = build_evaluators()
    dataset = build_dataset()

    metrics = [
        Faithfulness(llm=judge_llm),
        ResponseRelevancy(llm=judge_llm, embeddings=judge_embeddings),
    ]

    # Conservative rate limiting — keeps well within free tier quotas
    run_cfg = RunConfig(
        max_workers=1,       # one request at a time — avoids per-minute quota bursts
        timeout=120,
        max_retries=3,       # reduced from 10 — fail fast, don't loop on a dead quota
        max_wait=30,
    )

    print(f"📊 Evaluating {len(dataset)} samples...\n")

    try:
        results = evaluate(
            dataset=dataset,
            metrics=metrics,
            show_progress=True,
            run_config=run_cfg,
        )
    except Exception as e:
        print(f"\n💥 [Runtime Error] Evaluation failed: {e}")
        print("\nCommon causes:")
        print("  • Judge model changed — this script now uses gemini-3.1-flash-lite")
        print("  • Daily quota exhausted — wait 24 hours or use a paid API key")
        print("  • Invalid API key — check GEMINI_API_KEY in backend/.env")
        sys.exit(1)

    # Extract scores safely
    results_df = results.to_pandas()
    scores = results_df.mean(numeric_only=True).to_dict()
    scores = {str(k).lower(): float(v) for k, v in scores.items()}

    faithfulness = scores.get("faithfulness", float("nan"))
    relevancy = scores.get("answer_relevancy", float("nan"))

    import pandas as pd
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', None)
    print(results_df[["user_input", "faithfulness"]])
    
    print("\n" + "=" * 42)
    print("   DEVMIND EVALUATION RESULTS")
    print("=" * 42)
    print(results_df.columns.tolist())
    print(results_df)
    print(f"  Faithfulness      : {faithfulness:.4f}" if not math.isnan(faithfulness) else "  Faithfulness      : ERROR (NaN)")
    print(f"  Response Relevancy: {relevancy:.4f}"    if not math.isnan(relevancy)    else "  Response Relevancy: ERROR (NaN)")
    print("=" * 42 + "\n")

    THRESHOLD = 0.80
    failed = []

    if math.isnan(faithfulness):
        failed.append("Faithfulness returned NaN — likely an API/quota error")
    elif faithfulness < THRESHOLD:
        failed.append(f"Faithfulness {faithfulness:.4f} is below threshold {THRESHOLD}")

    if math.isnan(relevancy):
        failed.append("Response Relevancy returned NaN — likely an API/quota error")
    elif relevancy < THRESHOLD:
        failed.append(f"Response Relevancy {relevancy:.4f} is below threshold {THRESHOLD}")

    if failed:
        print("❌ Gate FAILED:")
        for f in failed:
            print(f"   • {f}")
        sys.exit(1)
    else:
        print("✅ Gate PASSED — all metrics above 0.80")
        sys.exit(0)


if __name__ == "__main__":
    main()