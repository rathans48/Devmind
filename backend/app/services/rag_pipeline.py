import os
import http.client
import json
from typing import List, Dict, Any
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter
from supabase.client import create_client, Client

class RAGPipelineService:
    def __init__(self):
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.api_key = os.getenv("OPENAI_API_KEY") # Uses your Google AI Studio Key
        
        if supabase_url and "your-project-id" not in supabase_url and supabase_key:
            self.supabase_client: Client = create_client(supabase_url, supabase_key)
        else:
            self.supabase_client = None

    def _get_native_embedding(self, text: str) -> List[float]:
        """
        Calls Google's native gemini-embedding-001 API via a direct, high-speed REST connection.
        Pinned to 768 dimensions to match the existing pgvector column schema.
        """
        try:
            conn = http.client.HTTPSConnection("generativelanguage.googleapis.com")
            payload = json.dumps({"model": "models/gemini-embedding-001", "content": {"parts": [{"text": text}]}, "outputDimensionality": 768})
            headers = {'Content-Type': 'application/json'}
            
            conn.request("POST", f"/v1beta/models/gemini-embedding-001:embedContent?key={self.api_key}", payload, headers)
            res = conn.getresponse()
            data = json.loads(res.read().decode("utf-8"))
            
            return data["embedding"]["values"]
        except Exception as e:
            # If network fails or key limits hit, fall back to a clean placeholder array matching 768 dimensions, pinned via outputDimensionality above
            # the pgvector column's fixed dimension (768), pinned via outputDimensionality above
            return [0.0] * 768

    def chunk_and_ingest_code(self, workspace_id: str, file_path: str, raw_content: str):
        if not self.supabase_client:
            return

        ext = file_path.split('.')[-1].lower()
        lang_mapping = {"py": Language.PYTHON, "ts": Language.TYPESCRIPT, "tsx": Language.TYPESCRIPT, "js": Language.JS, "java": Language.JAVA}
        target_lang = lang_mapping.get(ext, None)
        
        splitter = RecursiveCharacterTextSplitter.from_language(language=target_lang, chunk_size=1200, chunk_overlap=150) if target_lang else RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = splitter.split_text(raw_content)
        
        for i, chunk in enumerate(chunks):
            metadata = {"source_type": "codebase", "file_path": file_path, "chunk_index": i}
            embedding_vector = self._get_native_embedding(chunk)
            
            self.supabase_client.table("workspace_documents").insert({
                "workspace_id": workspace_id,
                "content": chunk,
                "metadata": metadata,
                "embedding": embedding_vector
            }).execute()

    def query_workspace_context(self, workspace_id: str, query: str, limit: int = 3) -> List[Dict[str, Any]]:
        if not self.supabase_client:
            return []
        try:
            query_vector = self._get_native_embedding(query)
            response = self.supabase_client.rpc(
                "match_workspace_documents",
                {
                    "query_embedding": query_vector,
                    "match_threshold": 0.2,
                    "match_count": limit,
                    "filter_workspace_id": workspace_id
                }
            ).execute()
            return response.data if response.data else []
        except Exception:
            return []