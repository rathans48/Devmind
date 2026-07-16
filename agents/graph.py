import os
from typing import Literal
from langgraph.graph import StateGraph, START, END

from agents.state import AgentState
from agents.specialist.code_agent import run_code_agent
from agents.specialist.review_agent import run_review_agent
from agents.specialist.debug_agent import run_debug_agent
from agents.specialist.docs_agent import run_docs_agent
from agents.persistence import SupabaseCheckpointSaver

def entry_router(state: AgentState) -> Literal["code_agent", "debug_agent", "docs_agent", "review_agent"]:
    """
    Inspects the initial routing token state to dispatch payloads directly 
    to the specialist agent equipped to handle the target task command format.
    """
    agent = state.get("current_agent", "code_agent")
    if agent in ["debug", "debug_agent"]:
        return "debug_agent"
    elif agent in ["document", "explain", "docs_agent"]:
        return "docs_agent"
    elif agent in ["review", "review_agent"]:
        return "review_agent"
    return "code_agent"

def evaluation_router(state: AgentState) -> Literal["docs_agent", "debug_agent"]:
    if state.get("review_approved", False):
        return "docs_agent"
    return "debug_agent"

# Assemble complete execution graph layout structure
builder = StateGraph(AgentState)

builder.add_node("code_agent", run_code_agent)
builder.add_node("review_agent", run_review_agent)
builder.add_node("debug_agent", run_debug_agent)
builder.add_node("docs_agent", run_docs_agent)

# Bind the dynamic entry router rule to the start node transition layer
builder.add_conditional_edges(
    START,
    entry_router,
    {
        "code_agent": "code_agent",
        "debug_agent": "debug_agent",
        "docs_agent": "docs_agent",
        "review_agent": "review_agent"
    }
)

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

database_checkpointer = SupabaseCheckpointSaver()
app_engine = builder.compile(checkpointer=database_checkpointer)