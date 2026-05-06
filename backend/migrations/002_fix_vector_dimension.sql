-- Migration: fix vector column dimension from 1536 to 384
-- Run on existing deployments where 001_initial.sql was applied with the old VECTOR(1536) column.
-- After running this, re-ingest all documents so embeddings are regenerated at 384 dims.

ALTER TABLE document_chunks ALTER COLUMN embedding TYPE VECTOR(384);

DROP INDEX IF EXISTS idx_chunks_embedding;
CREATE INDEX idx_chunks_embedding
    ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
