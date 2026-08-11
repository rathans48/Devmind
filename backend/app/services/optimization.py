import os
import time
import math
from typing import Dict, Any, Tuple, Optional
from langchain_openai import ChatOpenAI
from google import genai

# Real-time semantic memory matrix tracking embeddings alongside text records
SEMANTIC_CACHE_STORE: Dict[str, Dict[str, Any]] = {}

def get_router_client():
    return ChatOpenAI(
        model="gemini-3.1-flash-lite",
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_api_base="https://generativelanguage.googleapis.com/v1beta/openai/",
        temperature=0.0
    )

# ==========================================
# 📐 VECTOR SPACE COSINE SIMILARITY MATH
# ==========================================
def _get_embedding(text: str) -> list[float]:
    """Generates a dense vector footprint using gemini-embedding-001.

    Raises on any failure instead of silently returning None. A silent None
    was the root cause of the cache never populating — callers (main.py) catch
    and log, then skip the cache for that request only.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Semantic cache embedding failed: no GEMINI_API_KEY / GOOGLE_API_KEY / OPENAI_API_KEY configured."
        )

    client = genai.Client(api_key=api_key)
    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text.strip()
    )
    return response.embeddings[0].values

def _calculate_cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """Computes the spatial dot-product cosine angle between two vector footprints."""
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    magnitude_a = math.sqrt(sum(a * a for a in vec1))
    magnitude_b = math.sqrt(sum(b * b for b in vec2))
    
    if magnitude_a == 0.0 or magnitude_b == 0.0:
        return 0.0
        
    return dot_product / (magnitude_a * magnitude_b)

# ==========================================
# 🛡️ SEMANTIC CACHING SUBSYSTEM
# ==========================================
def query_semantic_cache(prompt: str, command: Optional[str], threshold: float = 0.90) -> Optional[str]:
    """
    Evaluates vector spatial metrics across cached footprints. 
    Bypasses LLM compute cycles completely if confidence hits target limits.
    """
    # 1. Generate target query vector matrix
    input_vector = _get_embedding(prompt)

    highest_similarity = -1.0
    matched_response = None
    target_command = command or 'none'

    # 2. Scan semantic cache memory blocks
    for data in SEMANTIC_CACHE_STORE.values():
        # Command Routing Isolation Gate: Ensure target context intent matches perfectly
        if data["command"] != target_command:
            continue
            
        cached_vector = data["embedding"]
        similarity = _calculate_cosine_similarity(input_vector, cached_vector)
        
        if similarity > highest_similarity:
            highest_similarity = similarity
            if similarity >= threshold:
                matched_response = data["response"]

    if matched_response:
        print(f"🔥 [Semantic Cache HIT] Cosine Confidence: {highest_similarity:.4f} >= Threshold ({threshold}). Serving artifact.")
        return matched_response
        
    print(f"❄️ [Semantic Cache MISS] Best match distance was: {max(highest_similarity, 0.0):.4f}")
    return None

def update_semantic_cache(prompt: str, command: Optional[str], response: str) -> None:
    """Commits pristine response outputs and their calculated embedding matrix to storage."""
    if not response or not response.strip():
        return
        
    vector = _get_embedding(prompt)

    # Use a deterministic signature mapping to build clear record indexes
    cache_key = f"{command or 'none'}:{prompt.strip().lower()}"
    
    SEMANTIC_CACHE_STORE[cache_key] = {
        "command": command or 'none',
        "prompt": prompt,
        "embedding": vector,
        "response": response,
        "timestamp": time.time()
    }
    print(f"💾 [Semantic Cache Update] Successfully committed vector entry footprint for: {cache_key}")

# ==========================================
# 📊 DYNAMIC INTELLIGENCE MODEL ROUTER
# ==========================================
def route_model_by_complexity(prompt: str, command: Optional[str], has_image: bool) -> Tuple[str, float]:
    """Dynamically routes queries to minimize costs per token context window."""
    estimated_cost = 0.000075 
    
    if has_image or (command == "debug"):
        return "gemini-2.0-flash", estimated_cost * 3
        
    if command == "explain" and len(prompt) > 500:
        return "gemini-2.0-flash-lite", estimated_cost * 1.5
        
    return "gemini-2.0-flash-lite", estimated_cost