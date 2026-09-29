import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage
from ..state import AgentState

def run_code_agent(state: AgentState) -> dict:
    is_explain_mode = state.get("current_agent") == "explain"
    is_concise = bool(state.get("concise", False))
    
    print(f"\n[AI Engine] ---> Invoking Code Agent ({'Explanation Mode' if is_explain_mode else 'Generation Mode'}{', Concise' if is_concise else ''})...")
    
    llm = ChatOpenAI(
        model="gemini-3.1-flash-lite",
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_api_base="https://generativelanguage.googleapis.com/v1beta/openai/",
        temperature=0.2
    )
    
    if is_explain_mode:
        if is_concise:
            system_instruction = (
                "Explain the provided code tersely. Do not restate the code or prior context.\n"
                "Give a short structural summary, then only flag genuinely non-obvious bottlenecks or "
                "scaling concerns. Skip multi-section breakdowns for simple one-liners and skip lengthy "
                "explanations of trivial or obvious code. Stay correct and complete, just brief."
            )
        else:
            system_instruction = (
                "You explain code clearly and directly, without unnecessary preamble or role-play framing.\n"
                "Analyze the user's provided code snippet and generate a structural breakdown.\n\n"
                "Organize your response into these three markdown sections:\n"
                "1. Architectural Concept\n"
                "2. Step-by-Step Logic Flow\n"
                "3. Algorithmic Bottlenecks or Scaling Considerations"
            )
    elif is_concise:
        system_instruction = (
            "Write clean, correct, syntactically valid code for the user's request.\n"
            "Do not restate the request or prior context, and do not include role-play framing. "
            "For simple one-line requests, return the code plus at most a one-line note. "
            "Skip lengthy explanations of trivial or obvious code — keep it terser but correct and complete."
        )
    else:
        system_instruction = (
            "Write clean, optimized, and syntactically correct code based on the user's requirements. "
            "Do not include role-play framing or self-referential preamble — just the code and brief necessary context."
        )
        
    messages = [SystemMessage(content=system_instruction)] + state["messages"]
    
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