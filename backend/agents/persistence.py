import os
import base64
import logging
from typing import Any, Dict, List, Optional, Tuple, Sequence
from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint, CheckpointMetadata, CheckpointTuple
from langchain_core.messages import BaseMessage
from supabase.client import create_client, Client

logger = logging.getLogger("devmind.persistence")

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
    elif isinstance(obj, BaseMessage) and isinstance(obj.content, (dict, list, str)):
        # Rebuild the message with scrubbed content so heavy blobs never reach
        # the serde payload, while keeping it a real BaseMessage instance
        scrubbed_content = _scrub_large_payloads(obj.content)
        if scrubbed_content is not obj.content:
            try:
                return obj.model_copy(update={"content": scrubbed_content})
            except Exception:
                return obj.__class__(content=scrubbed_content)
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
        self._pending_writes: Dict[Tuple[str, str], List[Tuple[str, str, Any]]] = {}  # (thread_id, checkpoint_id) -> [(task_id, channel, value)]


    def put(self, config: dict, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: dict) -> dict:
        """
        Caches state changes instantly in RAM and deeply purges binary string bloat.
        """
        thread_id = config["configurable"]["thread_id"]
        
        # 1. Run the deep recursive payload clean to strip hidden base64 chunks from message histories
        cleaned_checkpoint = _scrub_large_payloads(checkpoint)
        
        # 2. Serialize through LangGraph's own serde so messages persist as real
        #    BaseMessage objects instead of default=str repr strings
        serde_type, serde_data = self.serde.dumps_typed(cleaned_checkpoint)
        
        # 3. Cache the clean, lightweight data profile locally in memory
        self._checkpoint_cache[thread_id] = {
            "checkpoint": cleaned_checkpoint,
            "checkpoint_blob": (serde_type, serde_data),
            "metadata": metadata,
            "versions": new_versions
        }
        
        # 4. Fire a lazy parallel background push to Supabase
        if not self.client:
            return config
            
        payload = self._build_supabase_payload(thread_id)
        
        try:
            self.client.table("chat_sessions").upsert(payload).execute()
        except Exception as e:
            logger.warning("Supabase checkpoint write failed for session %s; local memory buffer remains safe: %s", thread_id, e)
            
        return config

    def _build_supabase_payload(self, thread_id: str) -> Dict[str, Any]:
        snapshot = self._checkpoint_cache[thread_id]
        serde_type, serde_data = snapshot["checkpoint_blob"]
        return {
            "session_id": thread_id,
            "user_preferences": {
                "checkpoint_blob": {
                    "serde_type": serde_type,
                    "serde_data": base64.b64encode(serde_data).decode("ascii"),
                },
                "metadata": snapshot["metadata"],
                "versions": snapshot["versions"],
            }
        }

    def put_writes(self, config: dict, writes: Sequence[Tuple[str, Any]], task_id: str) -> None:
        """Records pending writes per task so LangGraph can tell a task already ran
        for this checkpoint step, preventing duplicate node execution on resume."""
        thread_id = config["configurable"]["thread_id"]
        checkpoint_id = config["configurable"].get("checkpoint_id", "")
        key = (thread_id, checkpoint_id)

        if key not in self._pending_writes:
            self._pending_writes[key] = []

        for channel, value in writes:
            self._pending_writes[key].append((task_id, channel, value))

    def get_tuple(self, config: dict) -> Optional[CheckpointTuple]:
        thread_id = config["configurable"]["thread_id"]
        checkpoint_id = config["configurable"].get("checkpoint_id", "")

        pending = self._pending_writes.get((thread_id, checkpoint_id), [])

        if thread_id in self._checkpoint_cache:
            snapshot = self._checkpoint_cache[thread_id]
            return CheckpointTuple(
                config=config,
                checkpoint=snapshot["checkpoint"],
                metadata=snapshot["metadata"],
                parent_config=None,
                pending_writes=pending
            )

        if not self.client:
            return None

        try:
            res = self.client.table("chat_sessions").select("user_preferences").eq("session_id", thread_id).execute()
            if res.data and len(res.data) > 0:
                stored = res.data[0]["user_preferences"]
                checkpoint = self._load_checkpoint_from_blob(stored, thread_id)
                if checkpoint is None:
                    return None
                snapshot = {
                    "checkpoint": checkpoint,
                    "metadata": stored.get("metadata", {}),
                    "versions": stored.get("versions", {}),
                }
                self._checkpoint_cache[thread_id] = snapshot
                return CheckpointTuple(
                    config=config,
                    checkpoint=checkpoint,
                    metadata=snapshot["metadata"],
                    parent_config=None,
                    pending_writes=pending
                )
        except Exception as e:
            logger.warning("Supabase checkpoint read failed for session %s; starting a fresh thread: %s", thread_id, e)
            return None
        return None

    def _load_checkpoint_from_blob(self, stored: Dict[str, Any], thread_id: str) -> Optional[dict]:
        blob = stored.get("checkpoint_blob")
        if isinstance(blob, dict) and blob.get("serde_type") and blob.get("serde_data"):
            try:
                serde_type = blob["serde_type"]
                serde_data = base64.b64decode(blob["serde_data"])
                return self.serde.loads_typed((serde_type, serde_data))
            except Exception as e:
                logger.warning("Failed to deserialize Supabase checkpoint for session %s; starting a fresh thread: %s", thread_id, e)
                return None
        logger.warning(
            "Stored checkpoint for session %s predates the serde migration or is malformed; "
            "discarding it and starting a fresh thread.",
            thread_id,
        )
        return None

    def flush_to_supabase(self, thread_id: str) -> None:
        """
        Performs a single, consolidated state backup transaction to Supabase at stream termination.
        """
        if not self.client or thread_id not in self._checkpoint_cache:
            return
            
        payload = self._build_supabase_payload(thread_id)
        
        try:
            self.client.table("chat_sessions").upsert(payload).execute()
            print(f"\n[Memory System Sync] ---> Hard persistence layer successfully synchronized for session: {thread_id}")
        except Exception as e:
            print(f"\n[Memory System Error] Final state persistence sync failed: {e}")