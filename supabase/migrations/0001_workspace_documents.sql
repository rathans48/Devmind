-- Migration: workspace_documents table + vector similarity search
-- Reconstructed from the live Supabase project schema (Aug 2026) to bring
-- this table under version control — it previously existed only in the
-- hosted database with no corresponding migration file in the repo.

-- Requires the pgvector extension (provided by the ankane/pgvector Docker
-- image referenced in docker-compose.yml and .github/workflows/deploy.yml)
create extension if not exists vector;

create table if not exists workspace_documents (
    id            uuid primary key default gen_random_uuid(),
    workspace_id  varchar not null,
    content       text not null,
    metadata      jsonb not null,
    -- Fixed at 768 dimensions to match gemini-embedding-001 called with
    -- outputDimensionality=768 in backend/app/services/rag_pipeline.py.
    -- Do NOT change this without a migration to re-embed all existing rows —
    -- vectors from different dimensions/models are not comparable.
    embedding     vector(768)
);

-- HNSW index for fast approximate cosine-similarity search.
-- vector_cosine_ops matches the <=> cosine-distance operator used in
-- match_workspace_documents() below.
create index if not exists workspace_documents_embedding_idx
    on workspace_documents
    using hnsw (embedding vector_cosine_ops);

-- RPC function called from rag_pipeline.py to retrieve the top-N most
-- similar documents within a workspace, above a similarity threshold.
create or replace function match_workspace_documents(
    query_embedding    vector(768),
    filter_workspace_id varchar,
    match_threshold     float,
    match_count         int
)
returns table (
    id           uuid,
    workspace_id varchar,
    content      text,
    metadata     jsonb,
    similarity   float
)
language plpgsql
as $$
begin
    return query
    select
        workspace_documents.id,
        workspace_documents.workspace_id,
        workspace_documents.content,
        workspace_documents.metadata,
        1 - (workspace_documents.embedding <=> query_embedding) as similarity
    from workspace_documents
    where workspace_documents.workspace_id = filter_workspace_id
        and 1 - (workspace_documents.embedding <=> query_embedding) > match_threshold
    order by workspace_documents.embedding <=> query_embedding
    limit match_count;
end;
$$;