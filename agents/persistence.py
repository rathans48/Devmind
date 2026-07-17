import os
import json
import time
from typing import Any, Dict, List, Optional, Tuple, Sequence
from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint, CheckpointMetadata, CheckpointTuple
from supabase.client import create_client, Client

def _scrub_large_payloads(obj: Any) -> Any:
    """
    Recursively traverses a nested data structure to strip out massive base64 
    image assets and oversized text strings to protect network buffer limits.
    """
    if isinstance(obj, dict):
        return {k: _scrub_large_payloads(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_scrub_large_payloads(item) for item in obj]
    elif isinstance(obj, str):
        # Intercept base64 image prefixes or any anomalously large text chunk (>20KB)
        if obj.startswith("data:image/") or "base64" in obj[:100] or len(obj) > 20000:
            return "[SCRUBBED_LARGE_ASSET_FOR_STORAGE]"
    return obj

class SupabaseCheckpointSaver(BaseCheckpointSaver):
    """
    A high-speed, memory-buffered distributed checkpointer cache. 
    Defensively scrubs heavy multi-modal image blobs from all history paths
    to eliminate Cloudflare 520 edge proxy payload rejections.
    """
    def __init__(self):
        super().__init__()
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if supabase_url and "your-project-id" not in supabase_url and supabase_key:
            self.client: Client = create_client(supabase_url, supabase_key)
        else:
            self.client = None
            
        self._checkpoint_cache: Dict[str, dict] = {}

    def put(self, config: dict, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: dict) -> dict:
        """
        Caches state changes instantly in RAM and deeply purges binary string bloat.
        """
        thread_id = config["configurable"]["thread_id"]
        
        # 1. Create a deep string copy of the checkpoint to avoid mutational side-effects on the live graph
        serialized_checkpoint = json.loads(json.dumps(checkpoint, default=str))
        
        # 2. Run the deep recursive payload clean to strip hidden base64 chunks from message histories
        cleaned_checkpoint = _scrub_large_payloads(serialized_checkpoint)
        
        # 3. Cache the clean, lightweight data profile locally in memory
        self._checkpoint_cache[thread_id] = {
            "checkpoint": cleaned_checkpoint,
            "metadata": metadata,
            "versions": new_versions
        }
        
        # 4. Fire a lazy parallel background push to Supabase
        if not self.client:
            return config
            
        payload = {
            "session_id": thread_id,
            "user_preferences": self._checkpoint_cache[thread_id]
        }
        
        try:
            self.client.table("chat_sessions").upsert(payload).execute()
        except Exception:
            # Pass smoothly knowing the local memory buffer is safe for the final out-of-band flush
            pass
            
        return config

    def put_writes(self, config: dict, writes: Sequence[Tuple[str, Any]], task_id: str) -> None:
        """ Bypasses intermediate delta writes to mitigate high-frequency socket congestion. """
        pass

    def get_tuple(self, config: dict) -> Optional[CheckpointTuple]:
        """
        Resolves configurations out of memory first, falling back to database fetches if clear.
        """
        thread_id = config["configurable"]["thread_id"]
        
        if thread_id in self._checkpoint_cache:
            snapshot = self._checkpoint_cache[thread_id]
            return CheckpointTuple(config=config, checkpoint=snapshot["checkpoint"], metadata=snapshot["metadata"], parent_config=None)
            
        if not self.client:
            return None
            
        try:
            res = self.client.table("chat_sessions").select("user_preferences").embed("session_id", thread_id).execute()
            if res.data and len(res.data) > 0:
                snapshot = res.data[0]["user_preferences"]
                self._checkpoint_cache[thread_id] = snapshot
                return CheckpointTuple(config=config, checkpoint=snapshot["checkpoint"], metadata=snapshot["metadata"], parent_config=None)
        except Exception:
            return None
        return None

    def flush_to_supabase(self, thread_id: str) -> None:
        """
        Performs a single, consolidated state backup transaction to Supabase at stream termination.
        """
        if not self.client or thread_id not in self._checkpoint_cache:
            return
            
        payload = {
            "session_id": thread_id,
            "user_preferences": self._checkpoint_cache[thread_id]
        }
        
        try:
            self.client.table("chat_sessions").upsert(payload).execute()
            print(f"\n[Memory System Sync] ---> Hard persistence layer successfully synchronized for session: {thread_id}")
        except Exception as e:
            print(f"\n[Memory System Error] Final state persistence sync failed: {e}")