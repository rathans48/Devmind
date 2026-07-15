import os
from pydantic import BaseModel, Field
from typing import Optional
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from agents.state import AgentState

# Define the structured quality gate blueprint
class ReviewValidationResult(BaseModel):
    review_approved: bool = Field(description="Set to true if code contains zero compiler syntax errors or security vulnerabilities. False otherwise.")
    errors_found: Optional[str] = Field(description="Detailed error trace, structural missing items, or style violations if rejected. Null if approved.")
    quality_score: int = Field(description="An engineering evaluation score from 1 to 100.")

def run_review_agent(state: AgentState) -> dict:
    print("\n[AI Engine] ---> Invoking Review Agent Static Quality Gate...")
    
    # Initialize LLM with OpenAI compatibility layer
    llm = ChatOpenAI(
        model="gemini-3.1-flash-lite",
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_api_base="https://generativelanguage.googleapis.com/v1beta/openai/",
        temperature=0.0 # Set temperature to 0 for highly stable diagnostic analysis
    )
    
    # Force the model to return structured data matching our Pydantic class
    structured_llm = llm.with_structured_output(ReviewValidationResult)
    
    latest_artifact = state.get("suggested_code_artifacts", [""])[-1]
    
    system_instruction = (
        "You are an elite automated Senior Code Reviewer at DevMind.\n"
        "Analyze the provided code artifact string for: syntactic correctness, logic flaws, missing brackets, or hidden vulnerabilities.\n"
        "You must return a structured payload outlining whether it passes or requires debugging."
    )
    
    messages = [
        SystemMessage(content=system_instruction),
        HumanMessage(content=f"Code Block Under Review:\n{latest_artifact}")
    ]
    
    # Execute validation analysis
    result: ReviewValidationResult = structured_llm.invoke(messages)
    
    print(f"[Review Gate Output] Approved: {result.review_approved} | Score: {result.quality_score}")
    if result.errors_found:
        print(f"[Review Gate Feedback] Errors Surfaced: {result.errors_found}")
        
    return {
        "current_agent": "review_agent",
        "review_approved": result.review_approved,
        "errors_found": result.errors_found
    }