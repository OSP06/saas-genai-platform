# Kortex Backend

Fully async FastAPI backend powering the Kortex GenAI SaaS platform. Implements RAG, multi-step autonomous agents, smart LLM routing, and real-time SSE streaming. Connects to PostgreSQL + pgvector for vector search and Anthropic Claude as the primary LLM.

---

## Architecture Overview

```
HTTP Request
    │
    ▼
┌───────────────────────────────────────────────────────────────┐
│                    FastAPI Application                        │
│                                                               │
│  CORSMiddleware → APIKeyMiddleware → AnalyticsMiddleware      │
│                            │                                  │
│  ┌──────────┐  ┌──────────┐│┌──────────┐  ┌──────────────┐  │
│  │ /api/chat│  │ /api/rag ││││/api/agents│ │/api/analytics│  │
│  └────┬─────┘  └────┬─────┘│└────┬──────┘  └──────┬───────┘  │
│       │              │      │     │                  │         │
│  ┌────▼──────────────▼──────▼─────▼──────────────────▼──────┐ │
│  │                    Service Layer                          │ │
│  │  ChatService  ·  RAGService  ·  AgentService             │ │
│  │  LLMService   ·  EmbeddingService  ·  StorageService     │ │
│  │  RouterService  ·  AnalyticsService                      │ │
│  └────────────────────────┬──────────────────────────────────┘ │
└───────────────────────────┼───────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
  │ PostgreSQL  │  │  Anthropic   │  │ Local / S3   │
  │ + pgvector  │  │  Claude API  │  │  Storage     │
  │  VECTOR(384)│  │  + Ollama    │  │              │
  └─────────────┘  └──────────────┘  └──────────────┘
```

---

## Project Structure

```
backend/
├── app/
│   ├── main.py           ← FastAPI app factory, lifespan, health, rate limiting
│   ├── config.py         ← Pydantic Settings — all configuration from env
│   ├── database.py       ← SQLAlchemy async engine + session factory
│   ├── dependencies.py   ← FastAPI Depends() injectors (singleton services)
│   ├── exceptions.py     ← Custom exception classes + handlers
│   │
│   ├── middleware/
│   │   ├── auth.py       ← API key validation (SHA-256 hash, X-API-Key header)
│   │   ├── cors.py       ← CORS (env-driven ALLOWED_ORIGINS)
│   │   └── analytics.py  ← Per-request latency + token tracking
│   │
│   ├── models/           ← SQLAlchemy ORM (async, mapped_column)
│   │   ├── document.py   ← Document, DocumentChunk (with VECTOR(384))
│   │   ├── agent.py      ← AgentTask, AgentLog
│   │   ├── chat.py       ← ChatConversation, ChatMessage
│   │   ├── analytics.py  ← AnalyticsLog
│   │   └── settings.py   ← UserSettings, ApiKey
│   │
│   ├── schemas/          ← Pydantic v2 request/response schemas
│   │   ├── chat.py       ← ChatSendRequest, ChatHistoryResponse, …
│   │   ├── rag.py        ← RAGQueryRequest, DocumentUploadResponse, Citation, …
│   │   ├── agent.py      ← AgentExecuteRequest, AgentTaskDetail, AgentStep, …
│   │   ├── analytics.py  ← AnalyticsOverviewResponse, UsageDataPoint, …
│   │   └── settings.py   ← SettingsResponse, ApiKeyCreateRequest, …
│   │
│   ├── routers/          ← FastAPI routers (one per module)
│   │   ├── chat.py       ← /api/chat/*
│   │   ├── rag.py        ← /api/rag/*
│   │   ├── agents.py     ← /api/agents/*
│   │   ├── analytics.py  ← /api/analytics/*
│   │   └── settings.py   ← /api/settings/*
│   │
│   ├── services/         ← Business logic layer
│   │   ├── chat_service.py      ← SSE orchestrator + routing
│   │   ├── rag_service.py       ← Ingestion + similarity search
│   │   ├── agent_service.py     ← Planning + step execution + SSE queues
│   │   ├── llm_service.py       ← Claude + retry + Ollama fallback
│   │   ├── router_service.py    ← Auto-classify message to rag/agent/llm
│   │   ├── embedding_service.py ← SentenceTransformers / Voyage AI
│   │   ├── storage_service.py   ← Local filesystem / S3
│   │   └── analytics_service.py ← Aggregation queries
│   │
│   └── tools/            ← Agent tool implementations
│       ├── base.py       ← BaseTool protocol + ToolResult dataclass
│       ├── web_search.py ← SerpAPI (DuckDuckGo fallback)
│       ├── rag_lookup.py ← Queries internal knowledge base
│       └── text_analyzer.py ← Summarize/classify/extract via LLM
│
├── migrations/
│   ├── 001_initial.sql               ← Full schema + pgvector + indexes
│   ├── 002_fix_vector_dimension.sql  ← Changes VECTOR(1536) → VECTOR(384)
│   └── 003_performance_indexes.sql   ← Additional indexes on documents table
│
├── tests/
│   ├── conftest.py        ← Fixtures: SQLite DB, mock LLM, mock embedding
│   ├── test_chat.py
│   ├── test_rag.py
│   ├── test_agents.py
│   └── test_analytics.py
│
├── Dockerfile
├── docker-compose.yml    ← Standalone: db + api (+ optional ollama)
├── requirements.txt
├── pytest.ini
└── .env.example
```

---

## Local Setup

### Prerequisites

- Python 3.11+
- PostgreSQL 15+ with pgvector extension
- Anthropic API key

### 1. Environment

```bash
cd backend
python -m venv .venv && source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env — set DATABASE_URL and ANTHROPIC_API_KEY at minimum
```

### 2. Database

Using Docker (recommended):
```bash
docker run -d --name kortex-db \
  -e POSTGRES_USER=kortex \
  -e POSTGRES_PASSWORD=kortex \
  -e POSTGRES_DB=kortex \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

Run migrations in order:
```bash
psql postgresql://kortex:kortex@localhost:5432/kortex -f migrations/001_initial.sql
psql postgresql://kortex:kortex@localhost:5432/kortex -f migrations/002_fix_vector_dimension.sql
psql postgresql://kortex:kortex@localhost:5432/kortex -f migrations/003_performance_indexes.sql
```

### 3. Start the API

```bash
# Development (single worker required for SSE)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Verify
curl http://localhost:8000/health
# → {"status":"ok","version":"1.0.0","services":{...}}
```

### Full Stack with Docker Compose

```bash
cd backend
docker compose up --build

# With Ollama fallback LLM
docker compose --profile ollama up --build
```

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | asyncpg DSN: `postgresql+asyncpg://user:pass@host/db` |
| `ANTHROPIC_API_KEY` | Anthropic API key (`sk-ant-…`) |

### Optional (with defaults)

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Claude model ID |
| `MAX_TOKENS` | `4096` | Max tokens per LLM completion |
| `OLLAMA_ENABLED` | `false` | Enable Ollama as LLM fallback |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.1:8b` | Ollama model name |
| `EMBEDDING_BACKEND` | `sentence_transformers` | `sentence_transformers` or `anthropic` |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Sentence transformer model |
| `EMBEDDING_DIMENSIONS` | `384` | Vector size — must match DB VECTOR column |
| `CHUNK_SIZE` | `1000` | Characters per document chunk |
| `CHUNK_OVERLAP` | `200` | Overlap between adjacent chunks |
| `MAX_CITATIONS` | `5` | Max chunks returned per RAG query |
| `SIMILARITY_THRESHOLD` | `0.3` | Min cosine similarity to include chunk |
| `STORAGE_BACKEND` | `local` | `local` or `s3` |
| `UPLOAD_DIR` | `./uploads` | Upload directory (local backend) |
| `MAX_UPLOAD_SIZE_MB` | `50` | Max file size |
| `AGENT_MAX_STEPS` | `10` | Hard cap on agent steps |
| `AGENT_STEP_TIMEOUT` | `60` | Seconds before step is force-cancelled |
| `ALLOWED_ORIGINS` | `["http://localhost:3000"]` | CORS origins (JSON array or CSV) |
| `API_KEY_REQUIRED` | `false` | Enforce `X-API-Key` on all `/api/*` routes |
| `SECRET_KEY` | `""` | Reserved for future JWT signing |
| `COST_PER_1K_INPUT_TOKENS` | `0.003` | USD cost per 1K input tokens |
| `COST_PER_1K_OUTPUT_TOKENS` | `0.015` | USD cost per 1K output tokens |
| `DEBUG` | `false` | Enable debug logging + stack traces in responses |
| `SERPAPI_KEY` | `""` | SerpAPI key for agent web search tool |

---

## API Overview

All endpoints are under `/api/{module}`. Full specification: [`../docs/api-reference.md`](../docs/api-reference.md)

| Module | Prefix | Endpoints |
|---|---|---|
| Chat | `/api/chat` | send (SSE), history, conversations, delete |
| RAG | `/api/rag` | upload, list, status, query, delete |
| Agents | `/api/agents` | execute, list, get, logs (SSE), cancel |
| Analytics | `/api/analytics` | overview, usage, costs, latency |
| Settings | `/api/settings` | get, update, api-keys CRUD |
| System | `/health` | health check |

Rate limits: chat/send 60/min · rag/upload 20/min · agents/execute 10/min · others 200/min

---

## RAG Pipeline

### Ingestion

```
POST /api/rag/upload
  → validate type (pdf/docx/txt/md) + size
  → StorageService.save() → write to UPLOAD_DIR
  → Document record created (status=pending)
  → BackgroundTask: RAGService.ingest_document()
       → extract text (pypdf / python-docx / plain read)
       → chunk_text() — 1000-char window, 200-char overlap
       → asyncio.Semaphore(3) — max 3 concurrent ingestions
       → EmbeddingService.embed(chunks) → list[list[float]] (384 dims)
       → bulk INSERT into document_chunks (VECTOR(384))
       → Document.status = "ready"
```

### Query

```
POST /api/rag/query
  → EmbeddingService.embed([query]) → 384-dim vector
  → SELECT chunks WHERE embedding <=> query_vec ORDER BY score LIMIT max_citations
  → filter: score >= SIMILARITY_THRESHOLD (0.3)
  → if no results: return early message, no LLM call
  → build context from top-K chunks
  → LLMService.complete(system + context + question)
  → return answer + citations (documentName, page, content, relevanceScore)
```

### Supported File Types

| Extension | Parser |
|---|---|
| `.pdf` | pypdf |
| `.docx`, `.doc` | python-docx |
| `.txt`, `.md` | plain read |

---

## Agent System

### Execution Flow

```
POST /api/agents/execute
  → asyncio.Semaphore(20) — caps concurrent runs
  → AgentService.execute_task()
       → LLM: generate JSON step plan [{id, name, description, tool}]
       → for each step:
            → select tool (web_search | rag_lookup | text_analyzer)
            → asyncio.wait_for(tool.execute(), timeout=AGENT_STEP_TIMEOUT)
            → push log event to asyncio.Queue
            → persist step result to DB (JSONB steps array replaced each time)
       → LLM: synthesize final answer from all step outputs
       → emit done event to SSE queue
       → finally: push None sentinel, clean up queue + task handle
```

### Available Tools

| Tool | Class | Requires |
|---|---|---|
| `web_search` | `WebSearchTool` | `SERPAPI_KEY` (falls back to DuckDuckGo) |
| `rag_lookup` | `RAGLookupTool` | pgvector + embeddings |
| `text_analyzer` | `TextAnalyzerTool` | LLM only |

### SSE Log Stream

```
GET /api/agents/tasks/{id}/logs
  → replay all historical AgentLog records first (reconnect-safe)
  → subscribe to asyncio.Queue
  → keep-alive ping every 25s (": keep-alive\n\n")
  → stream live events as they arrive
  → None sentinel in queue → stream terminates
```

---

## Chat Service

### Routing Logic

```
POST /api/chat/send
  → mode=auto: RouterService.classify() → "rag" | "agent" | "llm"
  → mode=rag|agent|llm: used directly
  → SSE stream begins immediately (status event first)

Code paths:
  rag   → RAGService.query() → single delta with full answer + citations
  agent → AgentService (creates task, returns taskId in done metadata)
  llm   → LLMService.stream() → token-by-token deltas
  
All paths → done event (always, even on exception)
  done.metadata = { model, latency_ms, tokens, fallback }
```

### SSE Event Contract

```
data: {"type":"status","message":"Thinking…"}
data: {"type":"status","message":"Searching knowledge base…"}
data: {"type":"delta","delta":"partial ","content":"partial "}
data: {"type":"done","role":"assistant","content":"…","mode":"llm","citations":[],"metadata":{…}}
```

---

## LLM Service

- Primary: Anthropic Claude (configurable model via `ANTHROPIC_MODEL`)
- Retry: exponential backoff × 3 on HTTP 429, 502, 503, 529
- Fallback: Ollama (any local model) when `OLLAMA_ENABLED=true` and retries exhausted
- Token usage: `LLMTokenUsage(input_tokens, output_tokens, model, fallback)` returned from every call
- Cost: `build_cost(usage)` → USD float using configurable per-1K-token rates

---

## Analytics

Every request is instrumented via `AnalyticsMiddleware`:
- `request_id` (UUID) generated per request
- `latency_ms` measured with `time.monotonic()` (immune to clock drift)
- `tokens_input`, `tokens_output`, `cost_usd` read from `request.state` after handler runs
- Written asynchronously (`asyncio.create_task`) — never blocks the response

RAG queries fire a corrective analytics record with `module="rag"` after the LLM completes (the middleware captures the endpoint but can't distinguish RAG LLM calls from the router).

---

## Security

| Mechanism | Implementation |
|---|---|
| API key auth | `X-API-Key` header, SHA-256 hash stored, compared per-request |
| Auth bypass | `/health`, `/docs`, `/redoc`, `/openapi.json` are exempt |
| CORS | `ALLOWED_ORIGINS` env var, credentials allowed, methods/headers wildcard |
| File upload | Type allowlist + size cap, `Path(filename).name` prevents path traversal |
| Error responses | Stack traces suppressed in production (`DEBUG=false`) |
| Logging | No API keys, no file contents, no user data in log fields |

**Production checklist:**
- Set `API_KEY_REQUIRED=true`
- Set `ALLOWED_ORIGINS` to your frontend domain only
- Set `DEBUG=false`
- Use `STORAGE_BACKEND=s3` for multi-instance deployment
- Run with `gunicorn --workers 1` (SSE requires single worker)

---

## Running Tests

```bash
cd backend
pytest                    # All tests
pytest tests/test_rag.py  # Specific module
pytest -v                 # Verbose output
```

Tests use SQLite in-memory + mock LLM + mock embedding. No external services required.

**Test coverage:**
- Unit: chunking, text extraction, event formatting, schema validation
- HTTP: all major endpoints via ASGI test client
- Gaps: no auth middleware tests, no E2E pipeline tests, no cost calculation tests

---

## Database Schema (Summary)

| Table | Key Columns |
|---|---|
| `documents` | id, name, type, status, user_id |
| `document_chunks` | document_id (FK), content, embedding VECTOR(384), chunk_index |
| `chat_conversations` | id, title, user_id |
| `chat_messages` | conversation_id (FK), role, content, mode, citations JSONB |
| `agent_tasks` | id, prompt, status, steps JSONB, output |
| `agent_logs` | task_id (FK), level, message, step_id |
| `analytics_logs` | endpoint, module, tokens_input, tokens_output, latency_ms, cost_usd |
| `api_keys` | name, key_hash (SHA-256), key_preview, permissions JSONB, revoked_at |
| `user_settings` | user_id (UNIQUE), api_config, model_config, notifications, preferences JSONB |

pgvector IVFFlat index: `idx_chunks_embedding` on `document_chunks(embedding vector_cosine_ops)` (lists=100)

All timestamps are `TIMESTAMPTZ`. All IDs are `UUID`. All JSON columns use `JSONB`.

---

## Known Limitations

| Limitation | Impact | Solution |
|---|---|---|
| Single-worker SSE | Agent log streams break across workers | Redis Pub/Sub |
| In-process background tasks | Ingestion lost on restart | ARQ / Celery queue |
| Single user (`user_id="default"`) | No multi-tenancy | JWT auth + row-level security |
| SQLite tests | Vector types don't work in SQLite | pgvector test container |
| No circuit breaker on LLM | Slow retries under sustained outage | Add circuit breaker |
