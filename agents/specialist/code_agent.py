import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from agents.state import AgentState

def run_code_agent(state: AgentState) -> dict:
    is_explain_mode = state.get("current_agent") == "explain"
    
    print(f"\n[AI Engine] ---> Invoking Code Agent ({'Explanation Mode' if is_explain_mode else 'Generation Mode'})...")
    
    llm = ChatOpenAI(
        model="gemini-3.1-flash-lite",
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_api_base="https://generativelanguage.googleapis.com/v1beta/openai/",
        temperature=0.2
    )
    
    if is_explain_mode:
        system_instruction = (
            "You are the Lead Software Architect Agent at DevMind.\n"
            "Your sole task is to analyze the user's provided code snippet and generate a comprehensive structural breakdown.\n\n"
            "You MUST organize your response into these three markdown sections:\n"
            "1. Architectural Concept\n"
            "2. Step-by-Step Logic Flow\n"
            "3. Algorithmic Bottlenecks or Scaling Considerations"
        )
    else:
        system_instruction = (
            "You are the Expert Software Engineer Agent at DevMind.\n"
            "Your task is to write clean, optimized, and syntactically correct code blocks based on the user's requirements."
        )
        
    # 🧠 MULTI-CHANNEL EXTRACTION: Hunt for the active user input string
    user_raw_input = ""
    
    # Track A: Scan global message history backwards to find the current turn's HumanMessage
    global_messages = state.get("messages", [])
    for msg in reversed(global_messages):
        if getattr(msg, "type", "") == "human" or msg.__class__.__name__ == "HumanMessage":
            user_raw_input = getattr(msg, "content", "")
            break
            
    # Track B: Fall back to the explicit prompt key if the message log is blank
    if not user_raw_input:
        user_raw_input = state.get("prompt", "")
        
    # Track C: Fall back to historical code records if all other channels are dry
    artifacts = state.get("suggested_code_artifacts", [])
    
    # Strip away slash prefixes and command headers cleanly
    clean_input = user_raw_input.replace("EXPLAIN:", "").replace("explain:", "").replace("/explain", "").strip()
    
    if not clean_input and artifacts:
        clean_input = artifacts[-1]
        
    # 🧠 Deliver the finalized dataset to the LLM core execution loop
    if is_explain_mode:
        human_content = f"Please break down and explain this code snippet:\n\n```python\n{clean_input}\n```"
    else:
        human_content = clean_input
        
    messages = [
        SystemMessage(content=system_instruction),
        HumanMessage(content=human_content)
    ]
    
    response = llm.invoke(messages)
    
    if is_explain_mode:
        return {
            "explanation": response.content,
            "messages": [response]
        }
    else:
        return {
            "suggested_code_artifacts": [response.content],
            "messages": [response]
        }