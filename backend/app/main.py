import asyncio
import json
import sys
import threading
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Optional

from fastapi import FastAPI, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage

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
        patch["current_agent"] = "docs_agent"

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


def _run_graph_stream(
    initial_state: Dict[str, Any],
    session_id: str,
    queue: asyncio.Queue,
    loop: asyncio.AbstractEventLoop,
) -> None:
    from agents.graph import app_engine

    config = {"configurable": {"thread_id": session_id}}

    try:
        for event in app_engine.stream(initial_state, config):
            for node_name, state_patch in event.items():
                loop.call_soon_threadsafe(
                    queue.put_nowait,
                    _format_sse_payload(node_name, state_patch),
                )
    except Exception as exc:
        error_payload = {
            "active_node": "error",
            "latest_artifact": str(exc),
        }
        loop.call_soon_threadsafe(
            queue.put_nowait,
            f"data: {json.dumps(error_payload)}\n\n",
        )
    finally:
        loop.call_soon_threadsafe(queue.put_nowait, None)


async def agent_stream_generator(
    prompt: str,
    workspace_id: str,
    session_id: str,
    command: Optional[str],
    image_base64: Optional[str],
    image_mime: Optional[str],
) -> AsyncGenerator[str, None]:
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

    while True:
        chunk = await queue.get()
        if chunk is None:
            yield "data: [DONE]\n\n"
            break
        yield chunk


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


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "devmind-backend"}
