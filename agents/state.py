from typing import TypedDict, List, Annotated, Optional, Dict, Any
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    """
    The unified memory and context state tracking object for the DevMind multi-agent system.
    """
    # LangGraph message stream: appends chat history, system logs, and error stack traces
    messages: Annotated[List[BaseMessage], add_messages]
    
    # Session Management
    workspace_id: str
    session_id: str
    
    # Orchestration Pointer
    current_agent: str
    entry_command: Optional[str]
    
    # Artifact Hand-offs
    suggested_code_artifacts: List[str]
    review_approved: bool
    errors_found: Optional[str]
    
    # Sources cited for Guardrail execution compliance
    sources_cited: List[Dict[str, Any]]