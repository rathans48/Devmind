# DevMind 🧠

### *Multi-Agent AI Software Engineering Assistant*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2-1C3C3C?style=flat&logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![Supabase](https://img.shields.io/badge/Supabase-pgvector-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)](https://docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/rathans48/Devmind/blob/main/LICENSE)

> Runs locally via Docker Compose — see [Local Setup](#local-setup) below. Not yet deployed; live demo and video walkthrough coming later.

---

## What is DevMind?

DevMind is a multi-agent AI system that assists with common developer tasks — explaining code, generating implementations, debugging errors (including from screenshots), reviewing code for issues, and generating documentation — through a single conversational interface backed by a LangGraph-orchestrated pipeline of specialist agents.

Built as a capstone project exploring LLM orchestration, agent design, and LLMOps practices, as part of a 30-day GenAI learning sprint.

---

## Core Features

### 🤖 4-Agent LangGraph Orchestrator
A LangGraph workflow routes requests through up to four specialist agents, with conditional routing based on which command was invoked and whether generated code passes review:

| Agent | Responsibility |
|---|---|
| **Code Agent** | Generates or explains code based on the user's request |
| **Review Agent** | Evaluates code for syntax errors and quality issues, returning a structured pass/fail verdict and score |
| **Debug Agent** | Diagnoses errors from a description or an attached screenshot and returns a corrected solution |
| **Docs Agent** | Produces structured Markdown documentation with usage examples |

When Review rejects generated code, the graph routes to Debug for a fix, then back to Review to re-validate — a real repair loop, not just a linear pipeline.

### 🖼️ Multi-Modal Debugging
The Debug Agent accepts an attached screenshot alongside a text description and passes both directly to the underlying vision-capable model for diagnosis.

### ⚡ Semantic Cache
Incoming queries are embedded and compared against a cached response store using cosine similarity. Cache hits return the stored response immediately, skipping the agent workflow entirely for repeated or near-duplicate queries.

### 📡 Observability
- **Langfuse** — traces agent execution via a LangChain callback handler
- **RAGAs** — automated Faithfulness and Response Relevancy evaluation, run as a real gate in CI (see [Evaluation](#evaluation)) — the pipeline fails the build if either score drops below 0.80

### 🧩 VS Code Extension (early, single-command)
A minimal extension that sends the currently selected code to the Review Agent and inserts the feedback as an inline comment block. One command, no configuration UI yet — see [Roadmap](#roadmap).

---

## Evaluation

DevMind includes a RAGAs-based evaluation suite (`evals/run_evals.py`) that scores Faithfulness and Response Relevancy against a small golden test dataset, using `gemini-3.1-flash-lite` as the judge model. This runs as a real quality gate in CI (`.github/workflows/deploy.yml`) — the pipeline fails if either score drops below 0.80.

**Latest results (4-sample golden dataset):**

| Metric | Score | Gate (0.80) |
|---|---|---|
| Faithfulness | 0.6583 | Not met |
| Response Relevancy | 0.7408 | Not met |

**Why Faithfulness sits below the gate:** Faithfulness works by decomposing each response into atomic claims, then checking whether each claim can be *directly inferred* from the retrieved context — it's a strict, literal-inference check, not a semantic-equivalence check. In this dataset, the lowest-scoring sample restates a context fact using different (but semantically equivalent) wording — e.g. context says "bypasses the LangGraph workflow," response says "without invoking the LLM" — which the judge model marks as unsupported despite the underlying meaning being the same. This is a known sensitivity of NLI-style faithfulness scoring, not a factual error in the response.

Rather than rewriting the dataset to force a passing score, these are left as the real, reproducible numbers — an honest baseline to improve against, not a number tuned to clear an arbitrary threshold.

Run it yourself:
```bash
cd evals
python run_evals.py
```

---

## System Architecture

```
       [ Next.js Web UI ]              [ VS Code Extension ]
              │                          (1 command: inline review)
              │  SSE stream
              ▼
    [ FastAPI Core Gateway ]
              │
    ┌─────────┴──────────┐
    ▼                    ▼
[ Semantic Cache ]   [ LangGraph Orchestrator ]
  (pgvector cosine        │
   similarity)             ├─► 💻 Code Agent
                           ├─► 🔍 Review Agent
                           ├─► 🛠️  Debug Agent
                           └─► 📄 Docs Agent
                                    │
                           [ Supabase / pgvector ]
                           Session state & LangGraph
                           checkpoints (custom checkpointer)

                     [ Observability ]
                        Langfuse · RAGAs
```

*Note: a `pgvector`-backed RAG ingestion service (`rag_pipeline.py`) and schema exist in the codebase but aren't yet wired into the agent flow — see [Roadmap](#roadmap).*

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11, Pydantic v2 |
| AI Orchestration | LangGraph, LangChain |
| LLM Provider | Google Gemini (`gemini-3.1-flash-lite`), via its OpenAI-compatible endpoint |
| Vector Store | Supabase + pgvector |
| Semantic Cache | In-memory, cosine similarity |
| Observability | Langfuse, RAGAs |
| Containerisation | Docker, Docker Compose |
| CI | GitHub Actions (`.github/workflows/deploy.yml`) — runs the RAGAs eval gate and a frontend build check |

---

## Project Structure

```
devmind/
├── .github/workflows/deploy.yml    # CI: RAGAs eval gate + frontend build check
├── agents/
│   ├── graph.py                    # LangGraph workflow definition
│   ├── state.py                    # Shared AgentState schema
│   ├── persistence.py              # Custom Supabase-backed checkpoint saver
│   └── specialist/
│       ├── code_agent.py
│       ├── debug_agent.py
│       ├── review_agent.py
│       └── docs_agent.py
├── backend/
│   ├── DockerFile
│   └── app/
│       ├── main.py                 # FastAPI entrypoint — all routes defined here
│       └── services/
│           ├── rag_pipeline.py     # Chunking/embedding/retrieval (not yet wired in)
│           ├── optimization.py     # Semantic cache logic
│           └── analytics.py        # Usage analytics (mock fallback if Langfuse unset)
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ChatFeedbackStates.tsx
│       │   ├── ChatInterface.tsx   # Main chat workspace
│       │   └── FileUpload.tsx
│       └── hooks/useAgentStream.ts # SSE stream consumer hook
├── vscode-extension/
│   └── extension.js                # Single-command inline review extension
├── supabase/migrations/
│   └── 0001_workspace_documents.sql
├── docs/architecture.md
├── evals/run_evals.py
├── docker-compose.yml
└── README.md
```

---

## Local Setup

### Prerequisites
- Docker and Docker Compose
- Node.js 18+
- Python 3.11+
- API keys: a Gemini API key, Supabase (URL + service role key)

### 1. Clone the repository
```bash
git clone https://github.com/rathans48/Devmind.git
cd Devmind
```

### 2. Configure environment variables
```bash
cp backend/.env.example backend/.env
```

Fill in your keys in `backend/.env`:
```env
# Note: despite the variable name, this should be a Gemini API key —
# all agents call Gemini via its OpenAI-compatible endpoint
OPENAI_API_KEY=your_gemini_key_here
GEMINI_API_KEY=your_gemini_key_here

DATABASE_URL=postgresql://postgres:postgres@db:5432/postgres
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
LANGFUSE_SECRET_KEY=your_langfuse_secret_key
LANGFUSE_HOST=https://cloud.langfuse.com
```

### 3. Start all services
```bash
docker-compose up --build
```

| Service | URL |
|---|---|
| Web App | http://localhost:3000 |
| FastAPI + Swagger Docs | http://localhost:8000/docs |
| PostgreSQL (pgvector) | localhost:5432 |

### 4. Run evaluations
```bash
cd evals
pip install ragas litellm
python run_evals.py
```

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/agent/stream` | Submit a prompt to the multi-agent workflow (SSE stream) |
| `GET` | `/api/analytics/summary` | Retrieve usage/cost analytics (mock data if Langfuse keys are unset) |
| `GET` | `/health` | Health check |

---

## Roadmap

Honest list of what's scaffolded but not yet connected, plus what's next:

- [ ] Wire `RAGPipelineService` (`rag_pipeline.py`) into the agent flow — schema and ingestion logic exist, but no agent currently retrieves or uses this context
- [ ] Connect `route_model_by_complexity`'s output to actual agent LLM calls — currently computed and logged, but every agent hardcodes its own model regardless
- [ ] Human-in-the-loop approval checkpoints before sensitive operations
- [ ] Expand the VS Code extension beyond the single inline-review command
- [ ] Fix `deploy.yml`'s `python-version` key (currently `python-path`, which fails)
- [ ] Voice query support
- [ ] Support for additional LLM providers via LiteLLM

---

## Author

**Rathan S** — Final Year CSE Student, Garden City University, Bengaluru
[LinkedIn](https://www.linkedin.com/in/rathan--s) · [GitHub](https://github.com/rathans48)

---

Built as part of a 30-day GenAI learning sprint · MIT License
