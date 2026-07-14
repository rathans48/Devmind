# DevMind 

A multi-agent AI software engineering assistant that helps developers write, review, debug, and document code seamlessly. 

---

## Core Features & User Stories

### 1. Multi-Source RAG Contextual Ingestion
* **User Story:** As a developer, I want to ingest entire GitHub repositories, stack traces, and API documentation PDFs into a single workspace so that the assistant generates code strictly tailored to my project's existing conventions.

### 2. Multi-Agent LangGraph Orchestration
* **User Story:** As an engineer, I want to submit complex feature requests so that dedicated specialist agents (Code, Debug, Review, Docs) can collaborate, write, validate, and document code without manual handoffs.

### 3. Multi-Modal Vision Debugging
* **User Story:** As a frontend developer, I want to upload a screenshot of a broken UI component or an unhandled console trace directly into the assistant so it can visually identify the issue and cross-reference my source code for a fix.

### 4. Semantic Cache & Cost Optimization Engine
* **User Story:** As an administrator, I want the application to transparently check if a developer's request has been answered previously across the organization to eliminate redundant LLM API calls and lower token expenditure.

### 5. Human-in-the-Loop (HITL) Session Persistence
* **User Story:** As a developer, I want the multi-agent system to pause execution and ask for my explicit permission before it modifies critical production-grade configuration files.

---

## Tech Stack & System Architecture

This project is built as a monorepo utilizing **Next.js** for the frontend, **FastAPI** for the backend engine, **LangGraph** for agent workflows, and **Supabase (pgvector)** for the knowledge base.

*Detailed system architecture diagrams, data flows, and API specifications can be found in the [Architecture Documentation](docs/architecture.md).*

---

## Repository Structure

```text
devmind/
├── .github/workflows/ # Automated CI/CD pipelines
├── agents/            # LangGraph orchestration and specialist agents
├── backend/           # FastAPI service layer, RAG, and caching routes
├── frontend/          # Next.js workspace studio user interface
├── evals/             # RAGAs evaluation automation suite
├── docs/              # System design blueprints and API contracts
├── docker-compose.yml # Local multi-container deployment orchestrator
└── .gitignore         # Staging exclusions matrix