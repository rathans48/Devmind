import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from agents.state import AgentState

def get_gemini_client():
    return ChatOpenAI(
        model="gemini-3.1-flash-lite",
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_api_base="https://generativelanguage.googleapis.com/v1beta/openai/"
    )

def run_debug_agent(state: AgentState) -> dict:
    print("\n[AI Engine] ---> Invoking Debug Agent LLM...")
    llm = get_gemini_client()
    
    # Extract the broken code artifact and the error logs from the state
    latest_artifact = state.get("suggested_code_artifacts", [""])[-1]
    error_context = state.get("errors_found", "Unknown compilation or runtime exception.")
    
    system_instruction = (
        "You are the Core Debugging Agent for DevMind.\n"
        "Your sole task is to take a broken code artifact, analyze the provided error log, and output a corrected, fully functional version.\n\n"
        "CRITICAL COMPLIANCE RULES:\n"
        "1. FIX THE BUG: Address the specific structural error or missing configuration identified in the report.\n"
        "2. COMPLETE IMPLEMENTATION: Do not omit sections or leave placeholders. Output the entire repaired code block.\n"
        "3. MAINTAIN PARADIGM: Do not break the original structural design patterns unless strictly necessary to clear the bug."
    )
    
    prompt = (
        f"Broken Code Artifact:\n```\n{latest_artifact}\n```\n\n"
        f"Validation Errors Surfaced:\n{error_context}\n\n"
        f"Please provide the complete corrected code solution."
    )
    
    messages = [
        SystemMessage(content=system_instruction),
        HumanMessage(content=prompt)
    ]
    
    response = llm.invoke(messages)
    
    # Append the repaired code to our structural artifact history stack
    return {
        "current_agent": "debug_agent",
        "suggested_code_artifacts": state.get("suggested_code_artifacts", []) + [response.content],
        "errors_found": None # Clear out the error code so the next review pass can fresh scan
    }