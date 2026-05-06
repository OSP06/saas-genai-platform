-- Migration 002: Performance indexes missing from initial schema
-- Run after 001_initial.sql

-- documents: used in WHERE d.user_id = :user_id (list_documents query)
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

-- documents: used in WHERE d.status = 'ready' (similarity search join)
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- IVFFlat maintenance note:
-- Run monthly to re-cluster after bulk inserts degrade recall:
--   REINDEX INDEX CONCURRENTLY idx_chunks_embedding;
-- For >1M vectors, rebuild with higher lists:
--   DROP INDEX idx_chunks_embedding;
--   CREATE INDEX idx_chunks_embedding ON document_chunks
--     USING ivfflat (embedding vector_cosine_ops) WITH (lists = 300);
