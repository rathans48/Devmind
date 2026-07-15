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

def run_docs_agent(state: AgentState) -> dict:
    print("\n[AI Engine] ---> Invoking Documentation Agent LLM...")
    llm = get_gemini_client()
    
    approved_artifact = state.get("suggested_code_artifacts", [""])[-1]
    
    system_instruction = (
        "You are the Technical Documentation Specialist Agent for DevMind.\n"
        "Your task is to review the approved, validated code block and generate clear technical markdown documentation.\n\n"
        "Include: A summary of functionality, runtime/space complexity estimation, and clean usage examples."
    )
    
    messages = [
        SystemMessage(content=system_instruction),
        HumanMessage(content=f"Approved Code Blueprint:\n\n{approved_artifact}")
    ]
    
    response = llm.invoke(messages)
    
    # Append the documentation text block into the message history array
    return {
        "current_agent": "docs_agent",
        "messages": [response]
    }