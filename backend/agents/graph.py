import os
from typing import Literal
from langgraph.graph import StateGraph, START, END

from .state import AgentState
from .specialist.code_agent import run_code_agent
from .specialist.review_agent import run_review_agent
from .specialist.debug_agent import run_debug_agent
from .specialist.docs_agent import run_docs_agent
from .persistence import SupabaseCheckpointSaver

def entry_router(state: AgentState) -> Literal["code_agent", "debug_agent", "docs_agent", "review_agent"]:
    """ Inspects the initial command token to route to the correct starting node. """
    agent = state.get("current_agent", "code_agent")
    if agent in ["debug", "debug_agent"]:
        return "debug_agent"
    elif agent in ["document", "docs_agent"]:
        return "docs_agent"
    elif agent in ["explain"]:
        return "code_agent"
    elif agent in ["review", "review_agent"]:
        return "review_agent"
    return "code_agent"

def post_code_router(state: AgentState) -> Literal["review_agent", "__end__"]:
    if state.get("entry_command") == "explain":
        return END
    return "review_agent"

def evaluation_router(state: AgentState) -> Literal["docs_agent", "debug_agent"]:
    print(f"[DEBUG] evaluation_router sees review_approved={state.get('review_approved')!r}")
    if state.get("review_approved", False):
        return "docs_agent"
    return "debug_agent"

def evaluation_router(state: AgentState) -> Literal["docs_agent", "debug_agent"]:
    if state.get("review_approved", False):
        return "docs_agent"
    return "debug_agent"

def post_debug_router(state: AgentState) -> Literal["review_agent", "__end__"]:
    if state.get("entry_command") in ["debug", "debug_agent"]:
        return END
    return "review_agent"   

# Assemble complete execution graph layout structure
builder = StateGraph(AgentState)

builder.add_node("code_agent", run_code_agent)
builder.add_node("review_agent", run_review_agent)
builder.add_node("debug_agent", run_debug_agent)
builder.add_node("docs_agent", run_docs_agent)

# Bind the entry point configurations
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

# 🧠 FIX: Replace the old static builder.add_edge("code_agent", "review_agent")
# with this conditional rule layout
builder.add_conditional_edges(
    "code_agent",
    post_code_router,
    {
        "review_agent": "review_agent",
        END: END
    }
)

builder.add_conditional_edges(
    "review_agent",
    evaluation_router,
    {
        "docs_agent": "docs_agent",
        "debug_agent": "debug_agent"
    }
)

builder.add_conditional_edges(
    "debug_agent",
    post_debug_router,
    {
        "review_agent": "review_agent",
        END: END
    }
)
builder.add_edge("docs_agent", END)

database_checkpointer = SupabaseCheckpointSaver()
app_engine = builder.compile(checkpointer=database_checkpointer)