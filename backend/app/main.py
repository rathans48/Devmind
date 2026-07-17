import asyncio
import json
import sys
import threading
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Optional
from backend.app.services.optimization import query_semantic_cache, update_semantic_cache, route_model_by_complexity
from fastapi import FastAPI, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage
from backend.app.services.analytics import get_platform_metrics

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT_DIR / "backend" / ".env")
except ImportError:
    pass

app = FastAPI(
    title="DevMind AI Engine",
    description="Production-grade agentic workflow backend for code assistance",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COMMAND_INSTRUCTIONS: Dict[str, str] = {
    "review": (
        "COMMAND ROUTING PATCH [/review]: Prioritize the Review Agent quality gate. "
        "Treat the user prompt as the primary code artifact to inspect before generating new code."
    ),
    "explain": (
        "COMMAND ROUTING PATCH [/explain]: Prioritize clear technical explanation and reasoning. "
        "Favor documentation-style output over net-new implementation."
    ),
    "document": (
        "COMMAND ROUTING PATCH [/document]: Prioritize the Docs Agent after validation. "
        "Generate structured markdown documentation with usage examples."
    ),
    "debug": (
        "COMMAND ROUTING PATCH [/debug]: Prioritize the Debug Agent workflow. "
        "Analyze execution errors and any attached screenshot to produce a corrected solution."
    ),
}


def _normalize_command(command: Optional[str], prompt: str) -> Optional[str]:
    if command:
        normalized = command.strip().lstrip("/").lower()
        if normalized in COMMAND_INSTRUCTIONS:
            return normalized

    prompt_stripped = prompt.strip()
    for key in COMMAND_INSTRUCTIONS:
        prefix = f"/{key}"
        if prompt_stripped.lower().startswith(prefix):
            return key
    return None


def _build_human_message(
    prompt: str,
    image_base64: Optional[str],
    image_mime: Optional[str],
) -> HumanMessage:
    text = prompt.strip() or "Analyze the attached execution error screenshot."

    if not image_base64:
        return HumanMessage(content=text)

    # 1. Add diagnostic metric visibility
    print(f"[Gateway Diagnostic] Image Base64 String Length: {len(image_base64)}")

    # 2. Strip duplicate metadata prefix headers if sent by frontend
    clean_base64 = image_base64.split(",")[1] if "," in image_base64 else image_base64

    # 3. Enforce lowercase strict MIME boundaries
    mime = (image_mime or "image/png").lower().strip()
    
    return HumanMessage(
        content=[
            {"type": "text", "text": text},
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{clean_base64}"},
            },
        ]
    )


def _apply_command_state_patch(
    command: Optional[str],
    prompt: str,
    has_image: bool,
) -> Dict[str, Any]:
    if not command:
        return {}

    patch: Dict[str, Any] = {"current_agent": command}

    if command == "debug":
        error_detail = prompt.strip() or "Execution error reported by the user."
        if has_image:
            error_detail += (
                " A visual error screenshot is attached in the user message for analysis."
            )
        patch["errors_found"] = error_detail
        patch["review_approved"] = False

    elif command == "review" and prompt.strip():
        patch["suggested_code_artifacts"] = [prompt.strip()]
        patch["review_approved"] = False

    elif command == "document":
        patch["review_approved"] = True

    elif command == "explain":
        patch["current_agent"] = "explain"

    return patch


def _extract_latest_artifact(state_patch: Dict[str, Any]) -> Optional[str]:
    artifacts = state_patch.get("suggested_code_artifacts") or []
    if artifacts:
        last_artifact = artifacts[-1]
        if isinstance(last_artifact, str) and last_artifact.strip():
            return last_artifact

    messages = state_patch.get("messages") or []
    if messages:
        last_message = messages[-1]
        content = getattr(last_message, "content", None)
        if isinstance(content, str) and content.strip():
            return content
        if isinstance(content, list):
            text_parts = [
                part.get("text", "")
                for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            ]
            combined = "\n".join(part for part in text_parts if part).strip()
            if combined:
                return combined

    errors_found = state_patch.get("errors_found")
    if isinstance(errors_found, str) and errors_found.strip():
        return errors_found

    return None


def _format_sse_payload(active_node: str, state_patch: Dict[str, Any]) -> str:
    payload = {
        "active_node": active_node,
        "latest_artifact": _extract_latest_artifact(state_patch),
    }
    return f"data: {json.dumps(payload)}\n\n"


def _build_initial_state(
    prompt: str,
    workspace_id: str,
    session_id: str,
    command: Optional[str],
    image_base64: Optional[str],
    image_mime: Optional[str],
) -> Dict[str, Any]:
    has_image = bool(image_base64)
    resolved_command = _normalize_command(command, prompt)

    messages = []
    if resolved_command:
        messages.append(SystemMessage(content=COMMAND_INSTRUCTIONS[resolved_command]))

    messages.append(_build_human_message(prompt, image_base64, image_mime))

    initial_state: Dict[str, Any] = {
        "messages": messages,
        "workspace_id": workspace_id,
        "session_id": session_id,
        "current_agent": resolved_command or "code_agent",
        "suggested_code_artifacts": [],
        "review_approved": False,
        "errors_found": None,
        "sources_cited": [],
    }

    initial_state.update(
        _apply_command_state_patch(resolved_command, prompt, has_image)
    )
    return initial_state


def _run_graph_stream(initial_state: dict, session_id: str, queue: asyncio.Queue, loop: asyncio.AbstractEventLoop):
    """
    Background thread worker that executes the LangGraph engine instance.
    Accumulates distinct agent node outputs into a continuous, multi-stage 
    report to prevent subsequent nodes from overwriting previous results.
    """
    from agents.graph import app_engine
    
    config = {"configurable": {"thread_id": session_id}}
    accumulated_nodes = {}  # 🧠 Tracks the final response text per specific agent node
    
    try:
        for chunk in app_engine.stream(initial_state, config, stream_mode="updates"):
            if not chunk:
                continue
            
            nodes = list(chunk.keys())
            if not nodes:
                continue
            node_name = nodes[0]
            node_output = chunk[node_name]
            
            latest_artifact = ""
            
            if isinstance(node_output, dict):
                # Track A: Extract code array components
                artifacts = node_output.get("suggested_code_artifacts", [])
                if artifacts and len(artifacts) > 0:
                    latest_artifact = artifacts[-1]
                    
                # Track B: Extract common dictionary text keys
                if not latest_artifact:
                    for field in ["explanation", "documentation", "feedback", "review_report", "output", "generation", "text", "response"]:
                        if field in node_output and node_output[field]:
                            val = node_output[field]
                            latest_artifact = str(val[-1]) if isinstance(val, list) else str(val)
                            break
                
                # Track C: Extract structured message content strings safely
                if not latest_artifact and "messages" in node_output:
                    msgs = node_output["messages"]
                    if msgs:
                        last_msg = msgs[-1]
                        msg_type = getattr(last_msg, "type", "")
                        if msg_type in ["ai", "assistant"] or last_msg.__class__.__name__ == "AIMessage":
                            latest_artifact = getattr(last_msg, "content", "")
            
            # If the current node successfully produced fresh text, commit it to the run profile
            if latest_artifact and latest_artifact.strip():
                accumulated_nodes[node_name] = latest_artifact.strip()
                
                # Compile a beautifully structured, progressive multi-stage report
                combined_report = ""
                for name, content in accumulated_nodes.items():
                    # Format node names into clean, readable UI headers
                    display_name = name.replace("_", " ").title()
                    if "Debug" in display_name:
                        display_name = "🛠️ " + display_name
                    elif "Doc" in display_name:
                        display_name = "📄 " + display_name
                    elif "Explain" in display_name:
                        display_name = "💡 " + display_name
                    elif "Review" in display_name:
                        display_name = "🔍 " + display_name
                        
                    combined_report += f"## {display_name}\n{content}\n\n---\n\n"
                
                # Trim the trailing markdown rule separator safely
                if combined_report.endswith("\n\n---\n\n"):
                    combined_report = combined_report[:-7]
                    
                payload = {
                    "active_node": node_name,
                    "latest_artifact": combined_report.strip()
                }
                data_string = f"data: {json.dumps(payload)}\n\n"
                asyncio.run_coroutine_threadsafe(queue.put(data_string), loop)
            
    except Exception as e:
        print(f"\n[Graph Stream Error] Processing subsystem crashed: {e}")
    finally:
        asyncio.run_coroutine_threadsafe(queue.put(None), loop)


async def agent_stream_generator(
    prompt: str,
    workspace_id: str,
    session_id: str,
    command: Optional[str],
    image_base64: Optional[str],
    image_mime: Optional[str],
) -> AsyncGenerator[str, None]:
    
    has_image = bool(image_base64)
    
    # 1. Run Semantic Cache Lookup to protect quotas and tokens
    cached_response = query_semantic_cache(prompt, command)
    if cached_response:
        payload = {
            "active_node": "semantic_cache_hit",
            "latest_artifact": cached_response,
        }
        yield f"data: {json.dumps(payload)}\n\n"
        return

    # 2. Dynamic Model Routing Metrics
    target_model, cost_factor = route_model_by_complexity(prompt, command, has_image)
    print(f"[Model Router] ---> Assigning target token engine: {target_model} (Est. Cost Factor: {cost_factor})")

    initial_state = _build_initial_state(
        prompt=prompt,
        workspace_id=workspace_id,
        session_id=session_id,
        command=command,
        image_base64=image_base64,
        image_mime=image_mime,
    )

    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    worker = threading.Thread(
        target=_run_graph_stream,
        args=(initial_state, session_id, queue, loop),
        daemon=True,
    )
    worker.start()

    accumulated_final_text = ""
    
    # 3. Pristine, Uninterrupted Stream Processing Loop
    while True:
        chunk = await queue.get()
        if chunk is None:
            # Update the local semantic optimization cache store
            if accumulated_final_text.strip():
                try:
                    update_semantic_cache(prompt, command, accumulated_final_text)
                except Exception:
                    pass
            
            # Fire the database synchronization completely out-of-band to a background thread pool.
            # This allows the loop to break naturally and lets FastAPI close the HTTP context natively.
            try:
                from agents.graph import database_checkpointer
                if hasattr(database_checkpointer, "flush_to_supabase"):
                    asyncio.create_task(asyncio.to_thread(database_checkpointer.flush_to_supabase, session_id))
            except Exception as e:
                print(f"[Background Task Error] Failed to schedule database sync: {e}")
                
            break
            
        # Safely capture text updates for the cache without throwing type exceptions
        try:
            chunk_str = chunk.decode("utf-8") if isinstance(chunk, bytes) else str(chunk)
            if "latest_artifact" in chunk_str:
                # Basic string processing fallback to locate response content text frames
                clean_json = chunk_str.replace("data: ", "").strip()
                parsed_chunk = json.loads(clean_json)
                if isinstance(parsed_chunk, dict) and parsed_chunk.get("latest_artifact"):
                    accumulated_final_text = parsed_chunk["latest_artifact"]
        except Exception:
            pass
            
        # Yield the raw chunk exactly as it was generated by the core specialist agents
        yield chunk
        
        # Microscopic pacing break to allow the Windows OS network stack to flush TCP buffers
        await asyncio.sleep(0.02)


@app.post("/api/agent/stream")
async def agent_stream(
    prompt: str = Form(...),
    workspace_id: str = Form("default_workspace"),
    session_id: str = Form("default_session"),
    command: Optional[str] = Form(None),
    image_base64: Optional[str] = Form(None),
    image_mime: Optional[str] = Form(None),
):
    return StreamingResponse(
        agent_stream_generator(
            prompt=prompt,
            workspace_id=workspace_id,
            session_id=session_id,
            command=command,
            image_base64=image_base64,
            image_mime=image_mime,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/analytics/summary")
async def analytics_summary():
    """
    Exposes aggregated system latency, model cost tracking, 
    and operational usage stats to the monitoring dashboard.
    """
    metrics = get_platform_metrics()
    return metrics

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "devmind-backend"}

