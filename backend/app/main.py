from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import ingest, execution, analytics

app = FastAPI(
    title="DevMind AI Engine",
    description="Production-grade agentic workflow backend for code assistance",
    version="1.0.0"
)

# Configure CORS for Next.js app communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(ingest.router, prefix="/api/v1/ingest", tags=["Ingestion"])
app.include_router(execution.router, prefix="/api/v1/agents", tags=["Agent Execution"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "devmind-backend"}