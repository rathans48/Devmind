import os
from typing import Literal
from langgraph.graph import StateGraph, START, END

from agents.state import AgentState
from agents.specialist.code_agent import run_code_agent
from agents.specialist.review_agent import run_review_agent
from agents.specialist.debug_agent import run_debug_agent  # Hooked Real Node
from agents.specialist.docs_agent import run_docs_agent    # Hooked Real Node
from agents.persistence import SupabaseCheckpointSaver    # Hooked Real Memory

def evaluation_router(state: AgentState) -> Literal["docs_agent", "debug_agent"]:
    if state.get("review_approved", False):
        return "docs_agent"
    return "debug_agent"

# Assemble complete execution graph
builder = StateGraph(AgentState)

builder.add_node("code_agent", run_code_agent)
builder.add_node("review_agent", run_review_agent)
builder.add_node("debug_agent", run_debug_agent)
builder.add_node("docs_agent", run_docs_agent)

builder.add_edge(START, "code_agent")
builder.add_edge("code_agent", "review_agent")

builder.add_conditional_edges(
    "review_agent",
    evaluation_router,
    {
        "docs_agent": "docs_agent",
        "debug_agent": "debug_agent"
    }
)

builder.add_edge("debug_agent", "review_agent")
builder.add_edge("docs_agent", END)

# Initialize true persistent memory storage connections
database_checkpointer = SupabaseCheckpointSaver()
app_engine = builder.compile(checkpointer=database_checkpointer)