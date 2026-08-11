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

def run_debug_agent(state: AgentState) -> dict:
    print("\n[AI Engine] ---> Invoking Debug Agent LLM...")
    llm = get_gemini_client()
    
    system_instruction = (
        "You are the Core Debugging Agent for DevMind.\n"
        "Your task is to review the attached multi-modal screenshot code error image, "
        "locate the bug, and write the complete corrected script solution inside standard markdown code blocks."
    )
    
    # Prepend the system guidance rules while preserving the underlying multi-modal image blocks
    messages = [SystemMessage(content=system_instruction)] + state["messages"]
    
    response = llm.invoke(messages)
    
    return {
        "current_agent": "debug_agent",
        "suggested_code_artifacts": state.get("suggested_code_artifacts", []) + [response.content],
        "errors_found": None
    }