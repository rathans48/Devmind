<div align="center">

# DevMind 🧠
 
### *Production-Grade Multi-Agent AI Software Engineering Assistant*
 
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2-1C3C3C?style=flat&logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![Supabase](https://img.shields.io/badge/Supabase-pgvector-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)](https://docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
 
**[Live Demo](https://devmind.vercel.app)** · **[API Docs](https://devmind-api.railway.app/docs)** · **[Demo Video (3 min)](https://loom.com/your-link)**
 
<!-- Replace the line below with an actual demo GIF once the app is running -->
<!-- ![DevMind Demo](docs/assets/demo.gif) -->
 
</div>
---
 
## What is DevMind?
 
DevMind is a full-stack, multi-agent AI system that assists developers across the software development lifecycle. You describe a task in natural language — *"add JWT auth to this Express app"* — and a coordinated team of specialist AI agents writes the code, audits it for security flaws, fixes any issues, and generates the documentation. No manual handoffs. No context switching.
 
Built as a capstone project demonstrating production patterns in LLM orchestration, RAG pipelines, multi-modal AI, and LLMOps.

---
 
## Core Features
 
### 🔗 Multi-Source RAG Pipeline
Ingests context from GitHub repositories, PDF documentation, and Stack Overflow threads into a unified `pgvector` knowledge base. Responses are grounded in *your* codebase — not generic training data.
 
### 🤖 4-Agent LangGraph Orchestrator
A central LangGraph workflow routes tasks through four specialist agents with conditional logic and automatic retries:
 
| Agent | Responsibility |
|---|---|
| **Code Agent** | Generates implementations matching your project's conventions and dependency versions |
| **Review Agent** | Audits output for security vulnerabilities, performance issues, and style violations |
| **Debug Agent** | Diagnoses errors from screenshot uploads and stack traces using GPT-4o Vision |
| **Docs Agent** | Produces structured Markdown documentation with usage examples and runtime notes |
 
### 🖼️ Multi-Modal Debugging
Upload a screenshot of a broken UI or a terminal error trace. The Debug Agent visually identifies the issue, cross-references your source files via RAG, and returns a targeted fix with confidence scoring.
 
### ⚡ Semantic Cache + Model Router
- Incoming queries are embedded and compared against a cached response store using **cosine similarity** (threshold ≥ 0.92)
- Cache hits bypass the agent workflow entirely — **zero token cost**
- A model complexity router automatically selects GPT-4o-mini for simple queries and GPT-4o for complex ones
- Combined, these reduce LLM inference costs by **40%+** in testing
### ⏸️ Human-in-the-Loop (HITL) Checkpoints
The LangGraph graph pauses before sensitive operations (e.g. database migrations, rewriting `docker-compose.yml`) and waits for explicit user approval. The execution state is persisted via `PostgresSaver` so nothing is lost during the pause.
 
### 📡 Full Observability
- **LangSmith** — traces every agent node, input, output, and latency
- **Langfuse** — tracks token consumption and cost per query in real time
- **RAGAs** — automated faithfulness and relevancy evaluation on every deployment
---
 
## RAGAs Evaluation Results
 
Automated quality gates run on every deployment via GitHub Actions CI/CD.
 
| Metric | Target | Score | Status |
|:---|:---:|:---:|:---:|
| Faithfulness | > 0.80 | **0.8742** | ✅ Pass |
| Answer Relevancy | > 0.80 | **0.8415** | ✅ Pass |
 
---
 
## System Architecture
 
```
       [ Next.js Web UI ] ◄──────────────────► [ VS Code Extension (stub) ]
              │
              │  REST / SSE / WebSockets
              ▼
    [ FastAPI Core Gateway ]
              │
    ┌─────────┴──────────┐
    ▼                    ▼
[ Optimization Layer ]   [ LangGraph Orchestrator ]
  ├─ Semantic Cache            │
  │  (pgvector cosine sim)     ├─► 💻 Code Agent
  └─ Model Complexity          ├─► 🔍 Review Agent
     Router                    ├─► 🛠️  Debug Agent
     (mini vs full)            └─► 📄 Docs Agent
                                        │
                               [ Supabase / pgvector ]
                               Session state, vector store,
                               LangGraph checkpoints
 
                     [ Observability ]
                     LangSmith · Langfuse · RAGAs
```
 
---
 
## Tech Stack
 
| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11, Pydantic v2 |
| AI Orchestration | LangGraph, LangChain |
| LLM Providers | OpenAI GPT-4o / GPT-4o-mini, Whisper API |
| Vector Store | Supabase + pgvector |
| Semantic Cache | Supabase pgvector (cosine similarity) |
| Observability | LangSmith, Langfuse, RAGAs |
| Deployment | Vercel (frontend), Railway (backend) |
| CI/CD | GitHub Actions |
| Containerisation | Docker, Docker Compose |
 
---
 
## Project Structure
 
```
devmind/
├── .github/workflows/ci-cd.yml     # CI/CD pipeline
├── agents/
│   ├── graph.py                    # LangGraph workflow definition
│   ├── state.py                    # Shared AgentState schema
│   ├── persistence.py              # Supabase Connection
│   └── specialist/
│       ├── code_agent.py
│       ├── debug_agent.py
│       ├── review_agent.py
│       └── docs_agent.py
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entrypoint
│   │   ├── config.py               # Environment config (Pydantic)
│   │   └── api/endpoints/
│   │       ├── ingest.py           # Repo & document ingestion
│   │       ├── execution.py        # Agent graph invocation
│   │       └── analytics.py        # Cost & cache analytics
│   ├── services/
│   │   ├── rag_pipeline.py         # Chunking, embedding, retrieval
│   │   ├── optimization.py         # Semantic cache logic
│   │   └── analytics.py            # Analytics of usage and more  
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/components/
│       ├── ChatFeedbackState.tsx       
│       ├── ChatInterface.tsx       # Main chat workspace
│       └── FileUpload.tsx          # File Upload component 
├── evals/
│   └── run_evals.py                # RAGAs evaluation runner
├── docker-compose.yml
└── README.md
```
 
---
 
## Local Setup
 
### Prerequisites
- Docker and Docker Compose
- Node.js 18+
- Python 3.11+
- API keys: OpenAI, Supabase (URL + anon key)
### 1. Clone the repository
```bash
git clone https://github.com/yourusername/devmind.git
cd devmind
```
 
### 2. Configure environment variables
```bash
cp backend/.env.example backend/.env
```
 
Fill in your keys in `backend/.env`:
```env
OPENAI_API_KEY=your_key_here
DATABASE_URL=postgresql://postgres:postgres@db:5432/postgres
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
LANGCHAIN_API_KEY=your_langsmith_key
LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
LANGFUSE_SECRET_KEY=your_langfuse_secret_key
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
pip install ragas
python run_evals.py
```
 
---
 
## API Overview
 
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/ingest/repo` | Ingest a GitHub repository into the vector store |
| `POST` | `/api/v1/agents/execute` | Submit a prompt to the multi-agent workflow (SSE stream) |
| `POST` | `/api/v1/debug/vision` | Upload a screenshot for visual error diagnosis |
| `POST` | `/api/v1/agents/resume` | Approve or reject a HITL checkpoint |
| `GET` | `/api/v1/analytics/costs` | Retrieve token usage and cache hit analytics |
 
Full OpenAPI spec available at `/docs` when running locally.
 
---
 
## Deployment
 
The application is split across two platforms:
 
- **Frontend** → Vercel. Push to `main` triggers automatic deployment.
- **Backend** → Railway. Dockerfile in `backend/` is used for the container build. Environment variables are set in the Railway dashboard.
Both are connected to a shared **Supabase** project for the vector store, session state, and LangGraph checkpoints.
 
---
 
## Roadmap
 
- [ ] VS Code extension (full implementation)
- [ ] Voice query support via Whisper API
- [ ] Workspace collaboration (multi-user sessions)
- [ ] Support for additional LLM providers via LiteLLM
---
 
## Author
 
**Rathan** — Final Year CSE Student, Garden City University, Bengaluru
[LinkedIn](https://linkedin.com/in/yourprofile) · [GitHub](https://github.com/yourusername)
 
---
 
<div align="center">
Built as part of a 30-day GenAI learning sprint · MIT License
</div>
