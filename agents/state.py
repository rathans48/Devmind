from typing import TypedDict, List, Annotated, Optional
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    """
    Tracks the unified continuous state workspace through the LangGraph architecture.
    """
    messages: Annotated[list, add_messages]
    workspace_id: str
    session_id: str
    current_agent: str
    suggested_code_artifacts: List[str]
    review_approved: bool
    errors_found: Optional[str]