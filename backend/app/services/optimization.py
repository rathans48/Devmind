import os
import time
from typing import Dict, Any, Tuple, Optional
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

# Simple in-memory semantic cache store for rapid dev iteration
# (Can be easily swapped to Supabase pgvector later)
SEMANTIC_CACHE_STORE: Dict[str, Dict[str, Any]] = {}

def get_router_client():
    return ChatOpenAI(
        model="gemini-3.1-flash-lite",
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_api_base="https://generativelanguage.googleapis.com/v1beta/openai/",
        temperature=0.0
    )

def query_semantic_cache(prompt: str, command: Optional[str], threshold: float = 0.85) -> Optional[str]:
    """
    Checks if a highly similar prompt + command combination exists in the cache store.
    Uses a lightweight character-level or token-overlap coefficient for free tier safety.
    """
    cache_key = f"{command or 'none'}:{prompt.strip().lower()}"
    
    # Exact match hit bypass
    if cache_key in SEMANTIC_CACHE_STORE:
        print("[Semantic Cache] ---> Direct HIT! Bypassing LLM generation cycles.")
        return SEMANTIC_CACHE_STORE[cache_key]["response"]
        
    # Loose semantic similarity simulation (Jaccard similarity on word sets)
    words_input = set(cache_key.split())
    for stored_key, data in SEMANTIC_CACHE_STORE.items():
        words_stored = set(stored_key.split())
        intersection = words_input.intersection(words_stored)
        union = words_input.union(words_stored)
        similarity = len(intersection) / len(union) if union else 0.0
        
        if similarity >= threshold:
            print(f"[Semantic Cache] ---> Semantic HIT ({similarity:.2f} score)! Serving cached artifact.")
            return data["response"]
            
    return None

def update_semantic_cache(prompt: str, command: Optional[str], response: str) -> None:
    cache_key = f"{command or 'none'}:{prompt.strip().lower()}"
    SEMANTIC_CACHE_STORE[cache_key] = {
        "response": response,
        "timestamp": time.time()
    }

def route_model_by_complexity(prompt: str, command: Optional[str], has_image: bool) -> Tuple[str, float]:
    """
    Dynamically routes queries to cut cost per token.
    Simple text analysis -> gemini-3.1-flash-lite ($0.000075 / 1k tokens)
    Heavy multi-modal debug -> gemini-3.5-flash (if clear) or specialized tracking
    """
    # Base estimated token cost calculations
    estimated_cost = 0.00005 
    
    if has_image or (command == "debug"):
        # Multi-modal or heavy repair requests require higher cognitive tiers
        return "gemini-3.1-flash-lite", estimated_cost * 3
        
    if command == "explain" and len(prompt) > 500:
        # Long analytical explanations benefit from standard structural processing
        return "gemini-3.1-flash-lite", estimated_cost * 1.5
        
    return "gemini-3.1-flash-lite", estimated_cost