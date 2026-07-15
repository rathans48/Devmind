import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from agents.state import AgentState
from backend.app.services.rag_pipeline import RAGPipelineService

# Initialize the RAG service layer to fetch repository context
rag_service = RAGPipelineService()

def get_gemini_client():
    """
    Initializes a ChatOpenAI client pointing to the Gemini OpenAI-compatible API gateway.
    """
    return ChatOpenAI(
        model="gemini-3.1-flash-lite", # Flagship reasoning model
        openai_api_key=os.getenv("OPENAI_API_KEY"), # Passes your Gemini API Key
        openai_api_base="https://generativelanguage.googleapis.com/v1beta/openai/"
    )

def run_code_agent(state: AgentState) -> dict:
    print("\n[AI Engine] ---> Invoking Code Agent LLM...")
    
    llm = get_gemini_client()
    user_query = state["messages"][-1].content
    workspace_id = state.get("workspace_id", "default_workspace")
    
    # 1. Fetch relevant vector context chunks from Supabase
    context_chunks = rag_service.query_workspace_context(workspace_id=workspace_id, query=user_query, limit=3)
    
    formatted_context = ""
    sources = []
    for chunk in context_chunks:
        file_path = chunk.get("metadata", {}).get("file_path", "unknown")
        formatted_context += f"\n--- Source File: {file_path} ---\n{chunk.get('content')}\n"
        sources.append({"file_path": file_path, "type": "codebase"})
        
    # 2. Enforce structural prompt engineering constraints (Native Guardrails)
    system_instruction = (
        "You are the Core Code Generation Agent for DevMind.\n"
        "Your task is to write clean, production-grade, completely implemented code based on the user request.\n\n"
        "CRITICAL GUARDRAIL COMPLIANCE RULES:\n"
        "1. NO HALLUCINATION: You must base your syntax patterns, class setups, and imports strictly on the provided codebase context when applicable.\n"
        "2. COMPLETE IMPLEMENTATION: Do not use placeholders like '// TODO' or '# Implement later'. Write the full code block.\n"
        "3. CITATION ENFORCEMENT: If you rely on custom functions or classes from the codebase context, you must explicitly state the file source at the top of your code output."
    )
    
    messages = [
        SystemMessage(content=system_instruction),
        HumanMessage(content=f"Workspace Context Files:\n{formatted_context}\n\nUser Feature Request: {user_query}")
    ]
    
    response = llm.invoke(messages)
    
    # 3. Update state tracking artifacts
    return {
        "current_agent": "code_agent",
        "suggested_code_artifacts": state.get("suggested_code_artifacts", []) + [response.content],
        "sources_cited": state.get("sources_cited", []) + sources,
        "messages": [response]
    }