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
    
    # 🧠 Defensive Check: fall back through multiple sources.   
    # Priority: 1) code approved via the code_agent/debug_agent pipeline,
    #           2) a "prompt" field if set,
    #           3) the most recent user message — needed when /document is called
    #              standalone, bypassing code_agent/debug_agent entirely
    artifacts = state.get("suggested_code_artifacts", [])
    if artifacts:
        approved_artifact = artifacts[-1]
    elif state.get("prompt"):
        approved_artifact = state["prompt"]
    else:
        user_messages = [m for m in state.get("messages", []) if isinstance(m, HumanMessage)]
        approved_artifact = user_messages[-1].content if user_messages else ""
    
    system_instruction = (
        "Review the approved, validated code block and generate clear technical markdown documentation. "
        "Do not include role-play framing, self-referential preamble, or a closing signature/attribution line — "
        "end the response with the last relevant content section.\n\n"
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