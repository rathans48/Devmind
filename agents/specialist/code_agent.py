import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage
from agents.state import AgentState

def get_gemini_client():
    return ChatOpenAI(
        model="gemini-3.1-flash-lite",
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_api_base="https://generativelanguage.googleapis.com/v1beta/openai/"
    )

def run_code_agent(state: AgentState) -> dict:
    print("\n[AI Engine] ---> Invoking Code Agent LLM...")
    llm = get_gemini_client()
    
    system_instruction = (
        "You are the Core Code Specialist Agent for DevMind.\n"
        "Generate clean, functional code implementations based on the user instructions."
    )
    
    messages = [SystemMessage(content=system_instruction)] + state["messages"]
    
    response = llm.invoke(messages)
    
    return {
        "current_agent": "code_agent",
        "suggested_code_artifacts": state.get("suggested_code_artifacts", []) + [response.content]
    }