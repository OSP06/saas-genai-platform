# Kortex API Reference

**Base URL:** `http://localhost:8000` (local) / `https://your-backend.com` (production)

All request/response bodies are `application/json` unless noted.
All UUIDs are returned as strings.
All timestamps are ISO 8601 UTC.

---

## Authentication

When `API_KEY_REQUIRED=true`:

```
X-API-Key: kx_<your-key>
```

Keys are created via `POST /api/settings/api-keys`. The raw key is shown **once only** — store it immediately.

**Exempt from auth:** `GET /health`, `GET /docs`, `GET /redoc`, `GET /openapi.json`

---

## Error Format

```json
{
  "error": true,
  "message": "Human-readable description",
  "details": null
}
```

| Status | Meaning |
|---|---|
| 400 | Bad request |
| 401 | Missing or invalid API key |
| 404 | Resource not found |
| 413 | File too large |
| 415 | Unsupported file type |
| 422 | Pydantic validation error |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## System

### `GET /health`

Returns service status. Never requires authentication.

**Response:**
```json
{
  "status": "ok",
  "checks": {
    "db": "ok",
    "embedding": "ok",
    "agent": "ok"
  },
  "version": "1.0.0",
  "app": "Kortex"
}
```

`status` is `"degraded"` if any check fails.

---

## Chat — `/api/chat`

### `POST /api/chat/send`

Send a message. Returns a Server-Sent Events stream.

**Rate limit:** 60 requests/minute

**Request:**
```json
{
  "message": "What is the refund policy?",
  "mode": "auto",
  "conversationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | string | yes | 1–10000 chars |
| `mode` | string | no | `auto` (default), `rag`, `agent`, `llm` |
| `conversationId` | UUID | no | Omit to start new conversation |

**SSE stream format:**

```
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"type":"status","message":"Thinking…"}\n\n
data: {"type":"status","message":"Searching knowledge base…"}\n\n
data: {"type":"delta","delta":"The refund ","content":"The refund "}\n\n
data: {"type":"delta","delta":"policy states","content":"The refund policy states"}\n\n
data: {"type":"done","role":"assistant","content":"The refund policy states…","mode":"rag","citations":[…],"metadata":{"model":"claude-sonnet-4-6","latency_ms":1234,"tokens":87,"fallback":false}}\n\n
```

**SSE event types:**

| `type` | When | Key fields |
|---|---|---|
| `status` | Immediately, and at routing decision | `message` |
| `delta` | Each token (LLM path) | `delta` (new), `content` (accumulated) |
| `done` | Always last — even on error | `content`, `citations`, `metadata` |

The `done` event is **always emitted**. The frontend can rely on this to stop the loading state.

**done.metadata:**
```json
{
  "model": "claude-sonnet-4-6",
  "latency_ms": 1234,
  "tokens": 87,
  "fallback": false
}
```

---

### `GET /api/chat/conversations`

List all conversations for the default user.

**Response:**
```json
{
  "conversations": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "New Conversation",
      "messageCount": 5,
      "createdAt": "2026-05-01T12:00:00Z",
      "updatedAt": "2026-05-01T12:05:00Z"
    }
  ]
}
```

---

### `GET /api/chat/history`

Paginated message history for a conversation.

**Query parameters:**

| Param | Type | Required | Default |
|---|---|---|---|
| `conversation_id` | UUID | yes | — |
| `limit` | int | no | 50 (max 200) |
| `offset` | int | no | 0 |

**Response:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "What is the refund policy?",
      "mode": null,
      "citations": null,
      "metadata": {},
      "timestamp": "2026-05-01T12:00:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "The refund policy states…",
      "mode": "rag",
      "citations": [{"documentName":"policy.pdf","relevanceScore":0.87,"content":"…","page":3}],
      "metadata": {"model":"claude-sonnet-4-6","latency_ms":1234},
      "timestamp": "2026-05-01T12:00:02Z"
    }
  ],
  "conversationId": "uuid",
  "totalCount": 2
}
```

---

### `DELETE /api/chat/history`

Delete messages for one or all conversations.

**Request:**
```json
{
  "conversationId": "uuid"
}
```

Omit `conversationId` to delete **all** conversations and messages.

**Response:** `{"success": true}`

---

## RAG — `/api/rag`

### `POST /api/rag/upload`

Upload a document for ingestion into the knowledge base.

**Rate limit:** 20 requests/minute

**Content-Type:** `multipart/form-data`

**Form field:** `file` (UploadFile)

**Allowed types:** `.pdf`, `.docx`, `.doc`, `.txt`, `.md`

**Max size:** `MAX_UPLOAD_SIZE_MB` env var (default 50 MB)

**Response:**
```json
{
  "id": "uuid",
  "name": "Q4-Report.pdf",
  "size": 204800,
  "status": "pending",
  "createdAt": "2026-05-01T12:00:00Z"
}
```

Ingestion runs in the background. Poll `GET /api/rag/documents/{id}/status` to track progress.

---

### `GET /api/rag/documents`

List all documents with chunk counts.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Q4-Report.pdf",
    "type": "pdf",
    "size": "200 KB",
    "chunks": 42,
    "uploadedAt": "2026-05-01T12:00:00Z"
  }
]
```

---

### `GET /api/rag/documents/{document_id}/status`

Poll document ingestion status.

**Path:** `document_id` (UUID)

**Response:**
```json
{
  "id": "uuid",
  "status": "ready",
  "progress": 1.0,
  "chunksCreated": 42,
  "error": null
}
```

`status` values: `pending` → `processing` → `ready` | `error`

---

### `DELETE /api/rag/documents/{document_id}`

Delete a document and all its vector chunks.

**Response:** `{"success": true}`

---

### `POST /api/rag/query`

Query the knowledge base with a natural language question.

**Request:**
```json
{
  "query": "What does the policy say about refunds after 30 days?",
  "documentIds": ["uuid-1", "uuid-2"],
  "maxCitations": 5
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `query` | string | yes | 1–2000 chars |
| `documentIds` | UUID[] | no | Omit to search all documents |
| `maxCitations` | int | no | 1–20, default 5 |

**Response:**
```json
{
  "answer": "After 30 days, the policy states that refunds require manager approval…",
  "citations": [
    {
      "id": "uuid",
      "documentId": "uuid",
      "documentName": "refund-policy.pdf",
      "content": "Refunds requested after 30 days must be approved by a manager…",
      "page": 3,
      "relevanceScore": 0.87
    }
  ],
  "sources": [
    {
      "snippet": "Refunds requested after 30 days…",
      "score": 0.87
    }
  ]
}
```

If no relevant chunks are found (all scores below `SIMILARITY_THRESHOLD`), `answer` is `"I couldn't find relevant information in the knowledge base."` and `citations` is `[]`.

---

## Agents — `/api/agents`

### `POST /api/agents/execute`

Start an autonomous multi-step task.

**Rate limit:** 10 requests/minute

**Request:**
```json
{
  "task": "Research the top 3 vector databases and compare their performance characteristics",
  "tools": ["web_search", "rag_lookup"],
  "maxSteps": 8
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `task` | string | yes | 1–5000 chars |
| `tools` | string[] | no | Subset of `web_search`, `rag_lookup`, `text_analyzer`; all enabled if omitted |
| `maxSteps` | int | no | 1–25, default 10 |

**Response:**
```json
{
  "taskId": "uuid",
  "status": "running",
  "createdAt": "2026-05-01T12:00:00Z"
}
```

Connect to `GET /api/agents/tasks/{taskId}/logs` immediately for live progress.

---

### `GET /api/agents/tasks`

List 50 most recent tasks.

**Response:**
```json
{
  "tasks": [
    {
      "id": "uuid",
      "prompt": "Research the top 3 vector databases…",
      "status": "completed",
      "steps": [
        {
          "id": "step_1",
          "name": "Search for vector databases",
          "description": "Find current options",
          "status": "completed",
          "startedAt": "2026-05-01T12:00:01Z",
          "completedAt": "2026-05-01T12:00:04Z",
          "output": "Found: Pinecone, Weaviate, Qdrant…"
        }
      ],
      "output": "Here is a comparison of the top 3 vector databases…",
      "createdAt": "2026-05-01T12:00:00Z"
    }
  ]
}
```

`status` values: `pending` | `running` | `completed` | `failed` | `cancelled`

---

### `GET /api/agents/tasks/{task_id}`

Get full task detail including all steps and final output.

**Response:** Same as a single item in `tasks` array above.

---

### `GET /api/agents/tasks/{task_id}/logs`

Stream task logs as SSE.

**Note:** This is a GET endpoint — use `EventSource` in the browser.

**SSE stream:**

```
data: {"type":"log","timestamp":"2026-05-01T12:00:01Z","level":"info","message":"Step 1 of 3: Search for competitors","stepId":"step_1"}\n\n
data: {"type":"log","timestamp":"2026-05-01T12:00:04Z","level":"info","message":"✓ Step 1 of 3 completed: Found 8 results","stepId":"step_1"}\n\n
data: {"type":"log","timestamp":"2026-05-01T12:00:04Z","level":"warn","message":"⚠ Step 2 of 3 failed: Tool timeout","stepId":"step_2"}\n\n
data: {"type":"log","timestamp":"2026-05-01T12:00:12Z","level":"info","message":"Synthesizing final answer…"}\n\n
data: {"type":"done","timestamp":"2026-05-01T12:00:15Z","level":"info","message":"✅ Task completed in 14.2s"}\n\n
```

Keep-alive pings are sent every 25 seconds as SSE comments (`": keep-alive\n\n"`).

Historical logs are replayed before live events — reconnecting after a page refresh replays the full log history.

---

### `POST /api/agents/tasks/{task_id}/cancel`

Cancel a running task.

**Response:** `{"success": true}`

The task status is set to `cancelled` and the SSE stream terminates.

---

## Analytics — `/api/analytics`

### `GET /api/analytics/overview`

Aggregated 30-day metrics with trend percentages vs. prior 30 days.

**Response:**
```json
{
  "totalRequests": 1240,
  "totalCost": 3.42,
  "avgLatency": 820.5,
  "activeUsers": 1,
  "trends": {
    "requestsTrend": 12.5,
    "costTrend": -3.1,
    "latencyTrend": 0.8
  }
}
```

`*Trend` is a percentage change (positive = increase vs. prior period).

---

### `GET /api/analytics/usage`

Request counts per module over time.

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `from` | datetime | 30 days ago | ISO 8601 |
| `to` | datetime | now | ISO 8601 |
| `granularity` | string | `day` | `day`, `week`, `month` |
| `module` | string | all | `rag`, `agent`, `chat` |

**Response:**
```json
[
  {"date": "2026-05-01", "rag": 12, "agent": 3, "chat": 45},
  {"date": "2026-05-02", "rag": 8,  "agent": 1, "chat": 32}
]
```

---

### `GET /api/analytics/costs`

Token cost breakdown over time.

**Query parameters:** `from`, `to`, `granularity` (default `month`), `model`

**Response:**
```json
[
  {"month": "May 2026", "tokens": 1.23, "compute": 0.45, "storage": 0.05}
]
```

---

### `GET /api/analytics/latency`

Latency percentiles over time.

**Query parameters:** `from`, `to`, `granularity` (default `hour`)

**Response:**
```json
[
  {"time": "2026-05-01T12:00:00Z", "p50": 340, "p95": 820, "p99": 1200}
]
```

All latency values are milliseconds.

---

## Settings — `/api/settings`

### `GET /api/settings`

Get current settings. API key values are masked (first 4 + `...` + last 4 chars).

**Response:**
```json
{
  "apiConfiguration": {
    "openaiApiKey": "",
    "anthropicApiKey": "sk-a...xyz",
    "vectorDbUrl": "",
    "webhookUrl": null
  },
  "modelConfiguration": {
    "ragQueryModel": "claude-sonnet-4-6",
    "agentExecutionModel": "claude-sonnet-4-6",
    "embeddingModel": "all-MiniLM-L6-v2"
  },
  "notifications": {
    "agentTaskCompletions": true,
    "documentProcessing": true,
    "usageAlerts": false,
    "errorNotifications": true
  },
  "preferences": {
    "theme": "dark",
    "compactMode": false,
    "showTimestamps": true
  }
}
```

---

### `PATCH /api/settings`

Partial update. Only provided fields are changed.

**Request:**
```json
{
  "modelConfiguration": {
    "ragQueryModel": "claude-opus-4-7"
  },
  "preferences": {
    "theme": "light"
  }
}
```

**Response:** `{"success": true}`

---

### `GET /api/settings/api-keys`

List active (non-revoked) API keys.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "CI pipeline",
    "keyPreview": "kx_abc...xyz",
    "permissions": ["read"],
    "createdAt": "2026-05-01T12:00:00Z"
  }
]
```

---

### `POST /api/settings/api-keys`

Create a new API key. **The raw key is returned once only.**

**Request:**
```json
{
  "name": "CI pipeline",
  "permissions": ["read"]
}
```

**Response:**
```json
{
  "id": "uuid",
  "key": "kx_abc123def456...",
  "createdAt": "2026-05-01T12:00:00Z",
  "permissions": ["read"]
}
```

Store the `key` value immediately — it cannot be retrieved again.

---

### `DELETE /api/settings/api-keys/{key_id}`

Revoke an API key (soft delete via `revoked_at` timestamp).

**Response:** `{"success": true}`

---

## Rate Limits

| Endpoint | Limit |
|---|---|
| `POST /api/chat/send` | 60/minute |
| `POST /api/rag/upload` | 20/minute |
| `POST /api/agents/execute` | 10/minute |
| All other `/api/*` endpoints | 200/minute |

Exceeded limits return `429 Too Many Requests`.
