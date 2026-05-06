-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,           -- pdf | docx | txt | md
    size_bytes  BIGINT NOT NULL,
    file_path   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending', -- pending | processing | ready | error
    error_msg   TEXT,
    user_id     TEXT NOT NULL DEFAULT 'default',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content      TEXT NOT NULL,
    chunk_index  INTEGER NOT NULL,
    page_number  INTEGER,
    embedding    VECTOR(384),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IVFFlat index for cosine similarity search
-- lists=100 is suitable for up to ~1M vectors; tune after data grows
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);

-- ============================================================
-- AGENT TASKS + LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_tasks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prompt      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed | cancelled
    steps       JSONB NOT NULL DEFAULT '[]',
    output      TEXT,
    tools       JSONB NOT NULL DEFAULT '[]',
    max_steps   INTEGER NOT NULL DEFAULT 10,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status  ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON agent_tasks(created_at DESC);

CREATE TABLE IF NOT EXISTS agent_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id     UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level       TEXT NOT NULL,   -- info | debug | warn | error
    message     TEXT NOT NULL,
    step_id     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_task_id  ON agent_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON agent_logs(task_id, timestamp ASC);

-- ============================================================
-- CHAT
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_conversations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       TEXT NOT NULL DEFAULT 'New Conversation',
    user_id     TEXT NOT NULL DEFAULT 'default',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user
    ON chat_conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,   -- user | assistant | system
    content         TEXT NOT NULL,
    mode            TEXT,            -- auto | rag | agent | llm
    citations       JSONB,
    metadata        JSONB NOT NULL DEFAULT '{}',  -- {model, tokens, latency}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON chat_messages(conversation_id, created_at ASC);

-- ============================================================
-- ANALYTICS
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id      TEXT NOT NULL,
    endpoint        TEXT NOT NULL,
    module          TEXT,            -- rag | agent | chat | analytics | settings
    model_used      TEXT,
    tokens_input    INTEGER DEFAULT 0,
    tokens_output   INTEGER DEFAULT 0,
    latency_ms      INTEGER NOT NULL,
    cost_usd        NUMERIC(10,6) DEFAULT 0,
    status_code     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_module  ON analytics_logs(module, created_at DESC);

-- ============================================================
-- SETTINGS + API KEYS
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    key_hash    TEXT NOT NULL UNIQUE,  -- sha256 of the raw key
    key_preview TEXT NOT NULL,         -- "kx_abc...xyz" shown in UI
    permissions JSONB NOT NULL DEFAULT '["read"]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_settings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         TEXT NOT NULL UNIQUE,
    api_config      JSONB NOT NULL DEFAULT '{}',
    model_config    JSONB NOT NULL DEFAULT '{}',
    notifications   JSONB NOT NULL DEFAULT '{}',
    preferences     JSONB NOT NULL DEFAULT '{}',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_documents_updated') THEN
        CREATE TRIGGER trg_documents_updated
            BEFORE UPDATE ON documents
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_agent_tasks_updated') THEN
        CREATE TRIGGER trg_agent_tasks_updated
            BEFORE UPDATE ON agent_tasks
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_conversations_updated') THEN
        CREATE TRIGGER trg_conversations_updated
            BEFORE UPDATE ON chat_conversations
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_settings_updated') THEN
        CREATE TRIGGER trg_settings_updated
            BEFORE UPDATE ON user_settings
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END;
$$;
