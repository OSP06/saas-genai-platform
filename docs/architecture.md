# Kortex — System Architecture

## Overview

Kortex is a full-stack GenAI SaaS platform. The frontend (Next.js) communicates with the backend (FastAPI) exclusively over HTTP and Server-Sent Events. Both layers are independently deployable.

---

## System Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (Next.js 16)                           │
│                                                                          │
│   /dashboard   /rag   /agents   /chat   /analytics   /settings           │
│                                                                          │
│   lib/api-client.ts                                                      │
│   ├── chatApi      → fetch() + ReadableStream (POST SSE)                 │
│   ├── ragApi       → fetch() (standard JSON)                             │
│   ├── agentsApi    → fetch() + EventSource (GET SSE)                     │
│   ├── analyticsApi → fetch()                                             │
│   └── settingsApi  → fetch()                                             │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │ HTTP / SSE (localhost:8000 | NEXT_PUBLIC_API_URL)
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         FastAPI (Python 3.11+)                           │
│                         localhost:8000                                   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                       Middleware Stack                              │ │
│  │  CORSMiddleware → APIKeyMiddleware → AnalyticsMiddleware            │ │
│  └──────────────────────────┬──────────────────────────────────────────┘ │
│                             │                                            │
│  ┌──────────┐  ┌──────────┐ │ ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │/api/chat │  │ /api/rag │ │ │/api/agent│  │/api/analy│  │/api/sett │ │
│  └────┬─────┘  └────┬─────┘ │ └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       │              │       │      │               │              │      │
│  ┌────▼──────────────▼───────▼──────▼───────────────▼──────────────▼───┐ │
│  │                        Service Layer                                │ │
│  │                                                                     │ │
│  │  ChatService ────────────────────────────────────────────────────── │ │
│  │  ├── RouterService (auto-classify: rag | agent | llm)               │ │
│  │  ├── RAGService (retrieval path)                                    │ │
│  │  ├── AgentService (agent path)                                      │ │
│  │  └── LLMService (direct LLM path)                                  │ │
│  │                                                                     │ │
│  │  RAGService ────────────────────────────────────────────────────── │ │
│  │  ├── EmbeddingService (sentence-transformers / Voyage AI)           │ │
│  │  ├── StorageService (local / S3)                                    │ │
│  │  └── LLMService                                                     │ │
│  │                                                                     │ │
│  │  AgentService ──────────────────────────────────────────────────── │ │
│  │  ├── LLMService (planning + synthesis)                              │ │
│  │  ├── WebSearchTool                                                  │ │
│  │  ├── RAGLookupTool                                                  │ │
│  │  └── TextAnalyzerTool                                               │ │
│  │                                                                     │ │
│  │  AnalyticsService  ·  SettingsService                               │ │
│  └─────────────────────────────┬───────────────────────────────────────┘ │
└────────────────────────────────┼──────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   PostgreSQL 16  │  │  Anthropic API   │  │ File Storage     │
│   + pgvector     │  │  Claude models   │  │ (local / S3)     │
│                  │  │  + Ollama (opt.) │  │                  │
│  documents       │  │                  │  │ ./uploads/       │
│  document_chunks │  │  Retry: 3x       │  │  *.pdf *.docx    │
│  VECTOR(384)     │  │  Backoff: exp.   │  │  *.txt *.md      │
│  IVFFlat cosine  │  │  Fallback:Ollama │  │                  │
│  agent_tasks     │  │                  │  │  OR S3 bucket    │
│  agent_logs      │  └──────────────────┘  └──────────────────┘
│  chat_conv.      │
│  chat_messages   │
│  analytics_logs  │
│  api_keys        │
│  user_settings   │
└──────────────────┘
```

---

## Request Lifecycle

### Chat Request (SSE)

```
1. Browser → POST /api/chat/send
   Body: { message, mode, conversationId? }

2. Middleware chain (inner → outer):
   AnalyticsMiddleware: record start time, generate request_id
   APIKeyMiddleware: validate X-API-Key if API_KEY_REQUIRED=true
   CORSMiddleware: validate Origin header

3. ChatRouter → ChatService._stream()

4. If mode=auto:
   RouterService.classify()
     → LLM call with ROUTER_SYSTEM prompt
     → Parse JSON → "rag" | "agent" | "llm"
     → Fallback to "llm" on parse error

5a. Route=rag:
   yield status("Searching knowledge base…")
   RAGService.query(message)
     → embed query → pgvector search → build context
     → LLM.complete(context + question) → answer + citations
   yield delta(answer) + done(citations, metadata)

5b. Route=agent:
   yield status("Planning steps…")
   AgentService.execute_task(message) → taskId
   yield done(message="Agent task created", taskId, metadata)

5c. Route=llm:
   yield status("Thinking…")
   for chunk in LLMService.stream():
     yield delta(chunk)
   yield done(full_content, metadata)

6. After stream:
   Persist ChatMessage to DB (separate session)
   AnalyticsMiddleware: write analytics_log (async, non-blocking)
```

### RAG Upload Request

```
1. Browser → POST /api/rag/upload (multipart/form-data)

2. Router validates:
   - File extension in {pdf, docx, doc, txt, md}
   - File size ≤ MAX_UPLOAD_SIZE_MB

3. StorageService.save(filename, data)
   - Local: write to UPLOAD_DIR / {uuid}_{filename}
   - S3: upload to bucket with boto3

4. Document record created (status=pending)

5. BackgroundTask: RAGService.ingest_document(document_id)
   - Extract text (thread pool — non-blocking)
   - chunk_text(text, size=1000, overlap=200)
   - asyncio.Semaphore(3) — max 3 concurrent
   - EmbeddingService.embed(chunks) — thread pool
   - Bulk INSERT into document_chunks (VECTOR(384))
   - Document.status = "ready"

6. Response: { id, name, size, status="pending", createdAt }
   (Client polls GET /api/rag/documents/{id}/status)
```

### Agent Execution Request

```
1. Browser → POST /api/agents/execute
   Body: { task, tools?, maxSteps }

2. AgentService.execute_task()
   - asyncio.Semaphore(20) — cap concurrent
   - AgentTask created (status=running)
   - asyncio.Queue created for SSE

3. Planning: LLMService.complete(PLANNING_SYSTEM + task)
   - Returns JSON: [{id, name, description, tool}]
   - _parse_plan() normalizes and caps at maxSteps

4. Step loop:
   for step in plan:
     push log("Step N of M: name")
     await asyncio.wait_for(tool.execute(input), timeout=60)
     push log("✓ Step N completed: output[:200]")
     UPDATE agent_tasks.steps (JSONB replace)
     commit to DB

5. Synthesis:
   push log("Synthesizing final answer…")
   LLMService.complete(all step outputs) → final answer
   AgentTask.output = final_answer
   AgentTask.status = "completed"
   push log("✅ Task completed in Xs")

6. finally:
   queue.put(None) — sentinel
   _task_queues.pop(task_id)
   _task_asyncio_handles.pop(task_id)
```

---

## Data Flow: SSE Architecture

### Chat SSE (POST + fetch ReadableStream)

```
Client                              Server
  │                                   │
  ├── POST /api/chat/send ────────────>│
  │   (JSON body)                      │
  │<── HTTP 200 text/event-stream ─────┤
  │<── data: {"type":"status",...}\n\n─┤  ← immediate
  │<── data: {"type":"delta",...}\n\n──┤  ← per token
  │<── data: {"type":"done",...}\n\n───┤  ← always emitted
  │                                   │
  │   [connection closes]             │
```

EventSource cannot be used for POST. The frontend uses:
```javascript
const res = await fetch(url, { method: 'POST', body: JSON.stringify(body) })
const reader = res.body.getReader()
// Read chunks, split on \n, parse "data: " lines
```

### Agent SSE (GET + EventSource)

```
Client                              Server
  │                                   │
  ├── GET /api/agents/tasks/{id}/logs >│
  │<── HTTP 200 text/event-stream ─────┤
  │<── [historical logs replayed] ─────┤  ← reconnect-safe
  │<── data: {"type":"log",...}\n\n────┤  ← live events
  │<── : keep-alive\n\n ───────────────┤  ← every 25s
  │<── data: {"type":"done",...}\n\n───┤  ← stream end
```

The server replays all `AgentLog` DB records before entering the live queue. This means a browser refresh mid-execution loses no log history.

---

## Dependency Injection

Services are registered as singletons on `app.state` during the lifespan startup:

```python
# main.py lifespan
app.state.llm_service = LLMService(settings)
app.state.embedding_service = embedding_svc
app.state.storage_service = get_storage_service()
set_global_agent_service(AgentService(llm_service))
```

FastAPI `Depends()` injectors read from `app.state` — no re-initialization per request:

```python
def get_llm_service(request: Request) -> LLMService:
    return request.app.state.llm_service

def get_storage(request: Request) -> StorageBackend:
    return request.app.state.storage_service
```

Database sessions use a separate per-request factory:

```python
async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
```

---

## Concurrency Model

| Resource | Bound | Mechanism |
|---|---|---|
| Concurrent agent tasks | 20 | `asyncio.Semaphore(20)` |
| Concurrent document ingestions | 3 | `asyncio.Semaphore(3)` |
| DB connection pool | 10 (max 30) | SQLAlchemy pool_size + max_overflow |
| SSE queues | 1 per active agent task | `asyncio.Queue(maxsize=2000)` |
| Agent step timeout | 60s | `asyncio.wait_for()` |
| LLM retry | 3 attempts | Exponential backoff |
| CPU-bound work | Thread pool | `loop.run_in_executor(None, fn)` |

CPU-bound operations (embedding inference, text extraction) run in the default thread pool executor to avoid blocking the event loop.

---

## Monorepo Layout

```
saas-genai-platform/
├── frontend/          ← Next.js 16 application
│   ├── lib/
│   │   ├── api-client.ts  ← All backend calls (5 namespaces)
│   │   ├── types.ts       ← TypeScript interfaces (mirrors Pydantic)
│   │   └── config.ts      ← API_BASE_URL from env
│   └── ...
├── backend/           ← FastAPI application (zero dependency on frontend)
│   ├── app/
│   └── ...
├── docs/              ← Product and API documentation
├── infra/             ← nginx / k8s / terraform
├── docker-compose.yml ← Full-stack orchestration (from repo root)
└── .env.example       ← Combined env template
```

Frontend and backend share no code. The contract between them is the HTTP API defined in `docs/api-reference.md`.
