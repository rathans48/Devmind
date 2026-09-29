import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage
from ..state import AgentState

def get_gemini_client():
    return ChatOpenAI(
        model="gemini-3.1-flash-lite",
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_api_base="https://generativelanguage.googleapis.com/v1beta/openai/"
    )

def run_docs_agent(state: AgentState) -> dict:
    print("\n[AI Engine] ---> Invoking Documentation Agent LLM...")
    llm = get_gemini_client()
    
    is_concise = bool(state.get("concise", False))
    if is_concise:
        system_instruction = (
            "Review the approved, validated code block and produce a short, direct summary. "
            "Do not restate the code or prior context, and do not include role-play framing, "
            "self-referential preamble, or a closing signature/attribution line.\n\n"
            "For simple or trivial code (single function, straightforward snippet), collapse to a "
            "1-3 sentence functional summary only — no section headers, no Functional Summary / "
            "Complexity Analysis / Usage Example / Constraints breakdown, no complexity math, no "
            "usage example.\n\n"
            "Only if the code is genuinely complex (multiple modules, intricate logic, non-obvious "
            "algorithms, significant API surface) fall back to the full breakdown: functional summary, "
            "complexity analysis, clean usage examples, and constraints.\n\n"
            "Keep everything terser than usual but stay correct and complete."
        )
    else:
        system_instruction = (
            "Review the approved, validated code block and generate clear technical markdown documentation. "
            "Do not include role-play framing, self-referential preamble, or a closing signature/attribution line — "
            "end the response with the last relevant content section.\n\n"
            "Include: A summary of functionality, runtime/space complexity estimation, and clean usage examples."
        )
    
    messages = [SystemMessage(content=system_instruction)] + state["messages"]
    
    response = llm.invoke(messages)
    
    # Append the documentation text block into the message history array
    return {
        "current_agent": "docs_agent",
        "messages": [response]
    }