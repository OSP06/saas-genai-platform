# Kortex — GenAI SaaS Platform

> An end-to-end AI platform combining a Next.js dashboard with a production FastAPI backend — bringing RAG, autonomous agents, and smart chat routing into a single deployable system.

---

## 🧠 What is Kortex

Kortex is a full-stack GenAI SaaS platform built for teams that need more than a chat interface. It gives you three distinct AI capabilities — **knowledge base search**, **autonomous multi-step agents**, and **direct LLM conversation** — unified under an intelligent routing layer that picks the right tool automatically.

**The problem it solves:** Most AI integrations require separate products for document search, task automation, and chat. Kortex combines all three into one platform with a shared analytics layer, a consistent streaming interface, and a single deployment.

**Who it's for:** Engineering teams building internal AI tooling, product builders prototyping AI-native features, and organizations that want to ground LLM answers in their own documents without hallucinated sources.

---

## 🚀 Key Features

| Feature | What it does |
|---|---|
| **RAG Knowledge Base** | Upload documents (PDF, DOCX, TXT, MD), build a searchable vector index, query it with natural language — answers come back with citations and source snippets |
| **Multi-Step AI Agents** | Describe a task in plain language; the agent plans steps, calls tools (web search, document lookup, text analysis), and synthesizes a final answer |
| **Smart Chat Router** | One chat interface, four modes: Auto uses the LLM to classify intent and route to the right handler; RAG, Agent, and LLM modes are selectable manually |
| **Real-Time Streaming** | Every response streams token by token with observable status signals — no blank screens, no waiting |
| **Analytics Dashboard** | Token usage, cost by module (RAG vs. chat vs. agent), latency percentiles (p50/p95/p99), and 30-day trends — all queryable via API |
| **API Key Management** | Create, preview, and revoke scoped API keys from the Settings UI |
| **OpenAI + Ollama** | OpenAI is the primary model; Ollama is a configurable fallback — every response reports which model was used |

---

## 🖥️ Frontend Overview

The frontend is a **Next.js 16** application using the App Router. It is dark-mode first, built with **Tailwind CSS v4**, **shadcn/ui** components, **Recharts** for data visualization, and **Framer Motion** for transitions.

```
saas-genai-platform/
└── frontend/                  ← Next.js frontend
    ├── app/
    │   ├── (dashboard)/
    │   │   ├── layout.tsx         # Shared AppShell: sidebar + topbar
    │   │   ├── dashboard/         # Overview — metrics, quick actions, activity
    │   │   ├── rag/               # Knowledge Base — upload, list, query, citations
    │   │   ├── agents/            # Agent Workspace — task input, step timeline, live logs
    │   │   ├── chat/              # Smart Chat Router — mode selector, chat window
    │   │   ├── analytics/         # Analytics — usage, costs, latency charts
    │   │   └── settings/          # API keys, model config, preferences
    │   ├── layout.tsx             # Root layout + theme provider
    │   └── page.tsx               # Redirects → /dashboard
    ├── components/
    │   ├── layout/                # AppShell, Sidebar, Topbar
    │   └── ui/                    # shadcn/ui primitives
    ├── hooks/                     # use-mobile, use-toast
    └── lib/
        ├── utils.ts               # cn() helper
        ├── config.ts              # API_BASE_URL constant
        ├── types.ts               # TypeScript interfaces for all API responses
        └── api-client.ts          # Typed HTTP + SSE client
```

### UI Modules

**Dashboard (`/dashboard`)**
Central hub showing quick stats (total documents, active agents, chat sessions, API calls), recent activity, and navigation cards for each module.

**RAG Knowledge Base (`/rag`)**
Drag-and-drop document upload with real-time ingestion progress. A searchable document list shows processing status (pending → ready → error). A chat interface accepts natural language queries and renders answers alongside a citation panel showing source excerpts and relevance scores.

**AI Agent Workspace (`/agents`)**
A task input accepts plain-language instructions. Once submitted, an execution timeline renders each step as it completes — tool calls, outputs, and status — with live log streaming from the backend SSE endpoint. The final synthesized answer appears when the agent finishes.

**Smart Chat Router (`/chat`)**
A unified chat window with a mode selector (Auto / RAG / Agent / LLM). Messages stream in real time. Each response carries a mode badge so users can see which handler was actually used. Conversation history is stored and paginated.

**Analytics (`/analytics`)**
Four chart panels: an overview card with 30-day totals and trend percentages, an area chart for API call volume by module over time, a bar chart for token costs by time bucket, and a line chart for p50/p95/p99 latency.

**Settings (`/settings`)**
API configuration, model selection, notification preferences, and API key management (create, list masked keys, revoke).

---

## ⚙️ Backend Overview

The backend is a **FastAPI** application that is fully async, API-first, and designed around three AI primitives:

- **RAG Service** — ingestion pipeline (chunk → embed → store in pgvector) and query pipeline (embed → cosine similarity search → grounded LLM answer)
- **Agent Service** — task lifecycle manager with a planning LLM call, per-step tool execution, live SSE log queues, and synthesis
- **Chat Service** — SSE streaming orchestrator that routes to the right handler and always emits a `done` event

Supporting layers: `LLMService` (OpenAI + retry + Ollama fallback), `EmbeddingService` (SentenceTransformers, 384 dimensions), `AnalyticsService` (per-request token and latency tracking), and `APIKeyMiddleware` (optional SHA-256 key validation).

Detailed backend documentation: [`backend/README.md`](backend/README.md)

---

## 🔗 How Frontend Connects to Backend

The frontend calls the backend directly over HTTP. All API base URLs point to the FastAPI server (default: `http://localhost:8000`).

### Standard API calls

```typescript
// RAG — upload document
const form = new FormData()
form.append("file", file)
await fetch("http://localhost:8000/api/rag/upload", { method: "POST", body: form })

// RAG — query knowledge base
await fetch("http://localhost:8000/api/rag/query", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "...", maxCitations: 5 }),
})

// Analytics
await fetch("http://localhost:8000/api/analytics/overview")
```

### SSE Streaming — Chat

The chat endpoint streams typed events. The frontend connects with `fetch` and reads the response body as a stream:

```typescript
const res = await fetch("http://localhost:8000/api/chat/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "...", mode: "auto" }),
})

const reader = res.body.getReader()
// Events arrive as: data: {...}\n\n

// Event types the frontend handles:
// { "type": "status",  "message": "Thinking..." }
// { "type": "status",  "message": "Searching knowledge base..." }
// { "type": "delta",   "delta": "partial text", "content": "accumulated text" }
// { "type": "done",    "content": "full answer", "citations": [...],
//                       "sources": [...], "metadata": { "model": "...", "latency_ms": 834 } }
```

The `done` event is **always emitted** — even on errors — so the frontend can reliably stop the loading state.

### SSE Streaming — Agent Logs

```typescript
const es = new EventSource(
  `http://localhost:8000/api/agents/tasks/${taskId}/logs`
)

es.onmessage = (e) => {
  const event = JSON.parse(e.data)
  // { "type": "status"|"warning"|"error", "message": "Step 1 of 3: ...", "stepId": "s1" }
  // { "type": "done", "done": true }  ← stream end signal
}
```

Reconnecting to the logs endpoint replays all historical log entries before resuming live streaming, so the UI recovers correctly after a page refresh.

### Authentication

When `API_KEY_REQUIRED=True` is set on the backend, every request must include the header:

```
X-API-Key: kx_<your-key>
```

Keys are created from the Settings page. When disabled (default), no header is needed.

---

## 🔁 End-to-End User Flow

```
1. SETUP
   User opens Kortex → lands on /dashboard
   Dashboard shows zero-state cards and quick-action buttons

2. KNOWLEDGE BASE
   User navigates to /rag
   Drags a PDF onto the upload zone → POST /api/rag/upload
   Polls document status → GET /api/rag/documents/{id}/status
   Status card shows: pending → processing → ready (with chunk count)

3. RAG QUERY
   User types a question in the RAG chat interface
   Frontend streams POST /api/chat/send (mode: "rag")
   Events:  status("Thinking...") → status("Searching knowledge base...")
            → delta chunks → done(citations, sources)
   Citation panel renders source excerpts with document names and page numbers

4. SMART CHAT
   User navigates to /chat, selects "Auto" mode
   Asks a conversational question → routed to LLM
   Asks "what does the uploaded doc say about X?" → classified as RAG, routed automatically
   Mode badge on each response shows which handler was used

5. AGENT TASK
   User navigates to /agents
   Types: "Research the top 3 open-source vector databases and compare them"
   Frontend calls POST /api/agents/execute → receives taskId
   Connects to GET /api/agents/tasks/{taskId}/logs (SSE)
   Step timeline renders live:
     ✓ Step 1 of 3: Search web
     ✓ Step 2 of 3: Analyze results
     ✓ Step 3 of 3: Synthesize comparison
   Final answer appears in the output panel

6. ANALYTICS
   User navigates to /analytics
   Charts load: total requests, cost this month, avg latency
   Usage graph shows RAG vs. Agent vs. Chat call volume by day
   Cost chart shows token spend by time bucket
```

---

## 🧪 Running Full Stack Locally

### Prerequisites

- Python 3.11+
- Node.js 18+ and pnpm
- PostgreSQL 15+ with pgvector extension
- OpenAI API key

### 1. Start the backend

```bash
cd backend

python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL and OPENAI_API_KEY at minimum

# Run migrations
psql $DATABASE_URL -f migrations/001_initial.sql
psql $DATABASE_URL -f migrations/002_fix_vector_dimension.sql
psql $DATABASE_URL -f migrations/003_performance_indexes.sql

# Start server (single worker — required for SSE)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Verify: `curl http://localhost:8000/health` → `{"status":"ok",...}`

### 2. Start the frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Frontend runs at `http://localhost:3000` and connects to the backend at `http://localhost:8000`.

### Minimal `.env` for the backend

```dotenv
DATABASE_URL=postgresql+asyncpg://kortex:kortex@localhost:5432/kortex
OPENAI_API_KEY=sk-...
DEBUG=True
ALLOWED_ORIGINS=http://localhost:3000
```

### Quick database setup with Docker

```bash
docker run -d \
  --name kortex-db \
  -e POSTGRES_USER=kortex \
  -e POSTGRES_PASSWORD=kortex \
  -e POSTGRES_DB=kortex \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

---

## 📡 API Integration Notes

### Base URL

| Environment | URL |
|---|---|
| Local development | `http://localhost:8000` |
| Production | `https://your-backend-domain.com` |

### Authentication

```
# Header (when API_KEY_REQUIRED=True)
X-API-Key: kx_<key>

# Endpoints that never require a key:
GET /health
GET /docs
GET /redoc
```

### Streaming format

All SSE responses follow this contract:

```
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no

data: {"type": "status", "message": "..."}\n\n
data: {"type": "delta",  "delta": "...", "content": "..."}\n\n
data: {"type": "done",   "content": "...", "metadata": {...}, "done": true}\n\n
```

- `status` — informational signal; do not append to message content
- `delta` — append `delta` to the displayed message; `content` is the full accumulated text (use either)
- `done` — always the final event; signals the frontend to stop the loading state and render citations/sources

### Rate limits

| Endpoint | Limit |
|---|---|
| `POST /api/rag/upload` | 20 requests / minute |
| `POST /api/agents/execute` | 10 requests / minute |
| `POST /api/chat/send` | 60 requests / minute |
| All other endpoints | 200 requests / minute |

Exceeded limits return `429 Too Many Requests`.

---

## 📊 Demo Walkthrough

This walkthrough covers the full platform in approximately 5 minutes.

### Step 1 — Health and overview (30 seconds)

Open `http://localhost:3000`. The dashboard shows the zero-state platform. Point out the four module cards (RAG, Agents, Chat, Analytics) and the quick-action buttons.

> **Highlight:** The platform is live — every card connects to a real backend endpoint.

### Step 2 — Upload a document (60 seconds)

Navigate to **Knowledge Base (`/rag`)**.

1. Drag any PDF or text file onto the upload area
2. Watch the status card flip from `pending` → `processing` → `ready` with a chunk count
3. Note the document appears in the list below with its file type and size

> **Highlight:** The backend extracted, chunked, and embedded the document into a 384-dimension pgvector index. No external vector service needed.

### Step 3 — Query the knowledge base (60 seconds)

In the RAG chat interface, type a question about the document you just uploaded.

Watch the event sequence in real time:
- **"Thinking…"** — backend received the query
- **"Searching knowledge base…"** — pgvector cosine similarity search running
- Text streams in token by token
- Citation panel populates with source excerpts, document names, and relevance scores

> **Highlight:** The answer is grounded. Point to a citation — the backend returned the exact chunk, page number, and similarity score. No hallucination.

### Step 4 — Smart chat with auto-routing (60 seconds)

Navigate to **Chat (`/chat`)**, leave mode set to **Auto**.

Send two messages back-to-back:
- *"What is the capital of France?"* → observe the mode badge shows **LLM** (direct answer, no search needed)
- *"What does the uploaded document say about [topic]?"* → observe the mode badge flips to **RAG** automatically

> **Highlight:** The routing decision happens in real time via an LLM classifier. The user never manually switches modes.

### Step 5 — Run an agent task (90 seconds)

Navigate to **Agents (`/agents`)**.

Enter a multi-step task — for example:
> *"Find the latest developments in pgvector and summarize the top 3 use cases"*

Watch the execution timeline build live:
- **Planning** — LLM generates a step plan
- **Step 1 of N** — tool call fires (web search or document lookup)
- **✓ Step N completed** — output preview appears
- **Synthesizing final answer…**
- **✅ Task completed in X.Xs** — full result renders

> **Highlight:** Each step is tracked, persisted, and streamed. The agent can be cancelled mid-run. If the browser refreshes, reconnecting to the SSE endpoint replays the full log history.

### Step 6 — Analytics (30 seconds)

Navigate to **Analytics (`/analytics`)**.

Show the overview cards — total requests, total cost, average latency, active users. Scroll to the usage chart (requests by module over time) and the latency chart (p50/p95/p99).

> **Highlight:** The RAG query from Step 3 generated a separate analytics record attributed to the `rag` module — token cost is tracked per subsystem, not just per endpoint.

---

## ⚠️ Limitations

### Single-instance SSE
Agent log streaming uses in-process `asyncio.Queue` objects. The backend **must run with one worker**. Running multiple workers would cause live agent logs to be delivered to the wrong worker. A Redis Pub/Sub layer resolves this for horizontal scaling.

### Background ingestion
Document ingestion runs inside the web process as a FastAPI background task. There is no external job queue — if the server restarts mid-ingestion, the document is reset to `error` status and can be re-uploaded. Concurrent ingestion is bounded at 3 documents simultaneously by an internal semaphore.

### Single-user
All data lives under a single `user_id="default"`. There is no authentication boundary between users — Kortex is designed as a single-user or internal-team tool in its current form. Multi-tenant isolation requires a future JWT auth layer.

### No persistence for SSE chat
If a client disconnects before the chat stream completes, the assistant message is not persisted to the conversation history. This is intentional — no partial state is written.

---

## 🧭 Roadmap

| Priority | Item | Why |
|---|---|---|
| High | **Redis Pub/Sub for SSE** | Unblocks horizontal scaling and multi-worker deployments |
| High | **External job queue (ARQ / Celery)** | Durable document ingestion with retry, visibility, and crash recovery |
| High | **Multi-tenant auth (JWT + RLS)** | Per-user data isolation, team accounts, scoped API keys |
| Medium | **Streaming RAG answers** | Currently RAG LLM call completes before streaming starts; true token streaming would reduce perceived latency |
| Medium | **Scalable vector store** | Pinecone / Qdrant / Weaviate for >10M vectors |
| Medium | **Conversation memory in agents** | Inject recent chat history into agent context for continuity |
| Low | **Webhook notifications** | POST to a configured URL on agent task completion |
| Low | **Usage quotas and billing** | Per-key request limits and cost caps |

---

## 📁 Repository Structure

```
saas-genai-platform/
├── README.md                  ← you are here
├── .env.example               ← combined env template (frontend + backend)
├── docker-compose.yml         ← full-stack orchestration
│
├── frontend/                  ← Next.js 16 application
│   ├── app/                   ← App Router pages
│   ├── components/            ← React components (layout + shadcn/ui)
│   ├── hooks/                 ← Custom React hooks
│   ├── lib/
│   │   ├── api-client.ts      ← Typed HTTP + SSE client
│   │   ├── types.ts           ← TypeScript interfaces
│   │   ├── config.ts          ← API base URL
│   │   └── utils.ts           ← cn() helper
│   ├── public/                ← Static assets
│   ├── styles/                ← Global CSS
│   ├── package.json           ← Frontend dependencies
│   └── tsconfig.json          ← TypeScript config (@/* alias)
│
├── backend/                   ← FastAPI application
│   ├── README.md              ← Backend-specific documentation
│   ├── app/                   ← Application code
│   ├── migrations/            ← PostgreSQL SQL migrations
│   ├── tests/                 ← pytest test suite
│   ├── Dockerfile             ← Container image
│   └── requirements.txt       ← Python dependencies
│
├── docs/                      ← Product and API documentation
│   ├── architecture.md
│   ├── api-reference.md
│   ├── rag-system.md
│   ├── agent-system.md
│   ├── deployment.md
│   └── frontend-guide.md
│
└── infra/                     ← Infrastructure (nginx, k8s, terraform)
    ├── nginx/
    ├── k8s/
    └── terraform/
```

---

## 📌 Conclusion

Kortex is a working foundation for AI-native applications that need structured answers, autonomous task execution, and real-time observability — not just a chat box. The frontend and backend are built to the same API contract, deploy independently, and are designed so each layer can evolve without breaking the other.

The current architecture is deliberately simple: one server process, one database, no external queues. Everything in the roadmap above is an additive upgrade — there is no architectural rewrite required to go from prototype to production scale.
