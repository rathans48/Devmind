# DevMind System Architecture Documentation

![DevMind High-Level Architecture](./architecture-diagram.png)

This document outlines the production-grade engineering specifications, data design, and multi-agent lifecycle workflows for **DevMind**, an AI-driven Software Engineering Assistant.

---

## 1. Executive Design Goals

DevMind is designed to act as an autonomous ecosystem capable of writing, auditing, fixing, and explaining complex, workspace-level codebases. The engineering objectives are guided by three pillars:
* **Contextual Isolation:** Keeping repository knowledge isolated per session using high-speed vector spaces.
* **Deterministic Autonomy:** Utilizing agentic loops via LangGraph that enforce quality control gates before returning data to the client.
* **Cost Efficiency:** Offloading recurrent workflows through semantic caching to optimize downstream LLM operational expenses.

---

## 2. Unified State Schema Definition (`AgentState`)

The entire multi-agent workflow operates on a single state-passing paradigm. The central LangGraph orchestrator processes, appends, and queries a state tracking object, `AgentState`. 

```python
from typing import TypedDict, List, Annotated, Optional
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    """
    Tracks the continuous operational workspace context within the LangGraph lifecycle.
    """
    messages: Annotated[list, add_messages]     # Thread execution stream (inputs, traces, outputs)
    workspace_id: str                          # Current isolated directory identifier
    session_id: str                            # Active user execution session token
    current_agent: str                         # Pointer track of the active specialist node
    suggested_code_artifacts: List[str]        # Generated raw code blocks ready for validation
    review_approved: bool                      # Quality assurance checklist status flag
    errors_found: Optional[str]                # Compilation/runtime errors surfaced during validation
```

### State Fields Directory

| Attribute | Storage Type | Vector / Graph Objective |
| :--- | :--- | :--- |
| `messages` | `Annotated[list, add_messages]` | Appends state histories seamlessly. Tracks conversation history and system messages dynamically. |
| `workspace_id` | `str` | Limits RAG search operations to the user's uploaded repository context. |
| `review_approved` | `bool` | Serves as the primary conditional variable for terminating or looping graph states. |
| `errors_found` | `Optional[str]` | Contains compiler execution outputs or visual vision descriptions passed to the Debug Agent. |

---

## 3. LangGraph Topology & Routing Logic

The core execution layer uses a directed acyclic/cyclic layout built on **LangGraph**. Nodes behave as isolated computing specialists executing specific prompts, while conditional edges calculate the flow direction based on the current state attributes.

```
                  [ Graph Ingestion Entry ]
                             │
                             ▼
                    〔 Code Agent Node 〕
                             │
                             ▼
                   〔 Review Agent Node 〕
                             │
              ┌──────────────┴──────────────┐
              ▼ (False)                     ▼ (True)
    〔 Debug Agent Node 〕          〔 Docs Agent Node 〕
              ▲                             │
              └─────────────────────────────┘
```

### Node Mechanics & Task Allocation
* **Code Agent:** Consumes the initial prompt alongside retrieved vector chunks. Outputs structural modifications and updates `suggested_code_artifacts`.
* **Review Agent:** Acts as an LLM-based static analyzer. It evaluates syntax, security bugs, and design patterns. Sets `review_approved` to `True` or `False`.
* **Debug Agent:** Invoked exclusively when execution errors exist or when the Review Agent rejects the code artifacts. Corrects errors and pushes code back to the Review Agent.
* **Docs Agent:** Generates deployment adjustments, inline document changes, and functional markdown syntax explanations.

### Conditional Routing Pseudocode

```python
def route_after_review(state: AgentState) -> str:
    """
    Calculates execution pathway based on the Review Agent evaluation gate.
    """
    if state["review_approved"]:
        return "docs_agent"
    else:
        return "debug_agent"

# LangGraph structural wireframe integration
workflow.add_conditional_edges(
    "review_agent",
    route_after_review,
    {
        "docs_agent": "docs_agent",
        "debug_agent": "debug_agent"
    }
)
```

---

## 4. Multi-Source RAG Pipeline Specification

To prevent context drift and hallucinations, DevMind runs a customized Multi-Source Retrieval-Augmented Generation (RAG) architecture using Abstract Syntax Tree (AST) analysis and vector lookup.

```
[ Codebase / Docs ] ──► [ AST / Recursive Text Splitter ] ──► [ text-embedding-3-small ] ──► [ pgvector / Supabase ]
```

### Ingestion & Vector Subsystem Rules
* **Structural AST Chunking:** Code elements are parsed via target language parsers rather than naive token length limits. Classes, imports, and methods remain bound within identical vector documents to maintain logical context.
* **Embedding Model Vector Dimensions:** Chunks are translated into dense vector arrays via `text-embedding-3-small` producing 1536 dimensions.
* **Similarity Indexing Engine:** Calculations utilize Cosine Similarity distances inside Supabase PostgreSQL vector containers (`pgvector`), layered with Hierarchical Navigable Small World (`HNSW`) indexing structures for sub-millisecond lookups.

---

## 5. Gateway Routing & Semantic Cache Engine

Every incoming textual query undergoes evaluation at the FastAPI gateway to intercept redundant workflows and avoid resource-intensive agent loops.

```
                       [ Incoming User Prompt ]
                                  │
                                  ▼
                    [ Extract Query Vector Array ]
                                  │
                                  ▼
            [ Calculate Cosine Proximity Against Cache Store ]
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
      Cosine Similarity >= 0.92        Cosine Similarity < 0.92
          [ CACHE HIT ]                   [ CACHE MISS ]
     Instant Reply to Client          Execute LangGraph Engine
```

> ### ⚠️ Operational Cache Rule
> If vector processing returns an index match where the Cosine Similarity metric is greater than or equal to **0.92**, the payload is intercepted immediately. The system returns the historical output stored in Redis, bypassing token expenditure and achieving zero downstream latency.

---

## 6. Human-in-the-Loop (HITL) & State Persistence

Certain workflows—such as structural filesystem edits or data migration commands—require explicit manual verification. DevMind implements a persistent state machine using a transactional database backing system (`PostgresSaver`).

### The Interruption Lifecycle

1. **State Interruption:** As the graph encounters a node executing sensitive system commands, it hits a predefined compilation **Breakpoint**.
2. **Serialization Layer:** The execution instance is paused. The current values inside `AgentState` are serialized into JSON binary forms and stored within Supabase's persistence table collections.
3. **Event Polling:** The system generates a notification alert containing code structural diff highlights and exposes a secure callback gateway.
4. **Resumption Payload Processing:** When a developer submits an `APPROVE` signal via the workspace client dashboard, the engine deserializes the memory footprint using the active `thread_id` parameter and resumes execution seamlessly.

---

## 7. Production Infrastructure Environment Specifications

DevMind runs across isolated computing zones, synchronized via environment key validations. Below is the operational framework required for staging and deployment configurations.

```
                     ┌─────────────────────────┐
                     │    Next.js Frontend     │
                     │    (Deployed: Vercel)   │
                     └────────────┬────────────┘
                                  │ HTTP / WebSockets
                                  ▼
                     ┌─────────────────────────┐
                     │     FastAPI Backend     │
                     │   (Deployed: Railway)   │
                     └─────┬─────────────┬─────┘
                           │             │
              ┌────────────┘             └────────────┐
              ▼                                       ▼
  ┌───────────────────────┐               ┌───────────────────────┐
  │   Supabase Postgres   │               │      Redis Cache      │
  │  (pgvector + Storage) │               │  (Semantic Key Store) │
  └───────────────────────┘               └───────────────────────┘
```

### Required Configuration Matrix

```bash
# Infrastructure Service Gateways
DATABASE_URL="postgresql://postgres:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require"
REDIS_URL="redis://:default:[PASSWORD]@redis-production.railway.internal:6379"

# Core LLM Engine & Observability API Keys
OPENAI_API_KEY="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx"
LANGCHAIN_TRACING_V2="true"
LANGCHAIN_API_KEY="lsv2_pt_xxxxxxxxxxxxxxxxxxxxxxxx"
LANGCHAIN_PROJECT="devmind-core-orchestrator"
LANGFUSE_PUBLIC_KEY="pk-lf-xxxxxxxxxxxxxxxxxxxxxxxx"
LANGFUSE_SECRET_KEY="sk-lf-xxxxxxxxxxxxxxxxxxxxxxxx"
``` 