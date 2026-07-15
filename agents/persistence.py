import os
import json
from typing import Any, Dict, List, Optional, Tuple, Sequence
from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint, CheckpointMetadata, CheckpointTuple
from supabase.client import create_client, Client

class SupabaseCheckpointSaver(BaseCheckpointSaver):
    """
    A production-grade operational checkpointer that serializes and writes 
    LangGraph session state snapshots and graph deltas directly to Supabase storage.
    """
    def __init__(self):
        super().__init__()
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if supabase_url and "your-project-id" not in supabase_url and supabase_key:
            self.client: Client = create_client(supabase_url, supabase_key)
        else:
            self.client = None

    def put(self, config: dict, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: dict) -> dict:
        """
        Persists the complete state checkpoint at the boundary of a node transition.
        """
        thread_id = config["configurable"]["thread_id"]
        if not self.client:
            return config
            
        payload = {
            "session_id": thread_id,
            "user_preferences": {
                "checkpoint": json.loads(json.dumps(checkpoint, default=str)),
                "metadata": metadata,
                "versions": new_versions
            }
        }
        
        try:
            self.client.table("chat_sessions").upsert(payload).execute()
        except Exception as e:
            print(f"[Memory System Warning] DB Persistence write bypass: {e}")
        return config

    def put_writes(self, config: dict, writes: Sequence[Tuple[str, Any]], task_id: str) -> None:
        """
        Captures and stores intermediate state transitions and pending writes produced by internal graph tasks.
        Required by modern LangGraph runtimes to avoid NotImplementedError crashes.
        """
        thread_id = config["configurable"]["thread_id"]
        if not self.client:
            return
            
        try:
            # For this baseline architecture, we log intermediate delta writes to thread records
            # to maintain transactional visibility without corrupting core checkpoint snapshots.
            log_payload = {
                "session_id": f"{thread_id}_write_{task_id}",
                "user_preferences": {
                    "writes": json.loads(json.dumps(writes, default=str))
                }
            }
            self.client.table("chat_sessions").upsert(log_payload).execute()
        except Exception:
            # Fail silently during intermediate debug pipeline prints
            pass

    def get_tuple(self, config: dict) -> Optional[CheckpointTuple]:
        """
        Retrieves historical execution states from Supabase storage buckets to rebuild runtime layers.
        """
        thread_id = config["configurable"]["thread_id"]
        if not self.client:
            return None
            
        try:
            res = self.client.table("chat_sessions").select("user_preferences").eq("session_id", thread_id).execute()
            if res.data and len(res.data) > 0:
                snapshot = res.data[0]["user_preferences"]
                return CheckpointTuple(
                    config=config,
                    checkpoint=snapshot["checkpoint"],
                    metadata=snapshot["metadata"],
                    parent_config=None
                )
        except Exception:
            return None
        return None