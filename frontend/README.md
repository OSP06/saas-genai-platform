# Kortex Frontend

Next.js 16 dashboard for the Kortex GenAI SaaS platform. Connects to a FastAPI backend that provides RAG, autonomous agents, and smart LLM routing over a shared REST + SSE interface.

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.4 |
| Runtime | React | 19 |
| Language | TypeScript | 5.7.3 |
| Styling | Tailwind CSS | v4 |
| Components | shadcn/ui (Radix UI) | latest |
| Charts | Recharts | 2.15.0 |
| Animation | Framer Motion | 12 |
| Package manager | pnpm | any |

---

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Backend running on port 8000 (see `../backend/README.md`)

---

## Getting Started

```bash
cd frontend

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Default NEXT_PUBLIC_API_URL=http://localhost:8000 works for local dev

# Start dev server
pnpm dev
# → http://localhost:3000
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API base URL |

Create `frontend/.env.local` (not committed):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

For production (Vercel), set `NEXT_PUBLIC_API_URL` to your deployed backend URL.

---

## Folder Structure

```
frontend/
├── app/
│   ├── layout.tsx                    ← Root layout: fonts, ThemeProvider
│   ├── page.tsx                      ← Redirect → /dashboard
│   ├── globals.css                   ← Tailwind directives + OKLCH color tokens
│   └── (dashboard)/
│       ├── layout.tsx                ← Wraps all pages with AppShell
│       ├── dashboard/
│       │   ├── page.tsx              ← Overview stats + quick actions
│       │   └── components/
│       │       ├── quick-stats.tsx   ← Key metrics cards
│       │       └── recent-activity.tsx ← Activity feed
│       ├── chat/
│       │   ├── page.tsx              ← Multi-mode chat page
│       │   └── components/
│       │       ├── chat-window.tsx   ← Main chat UI + streaming handler
│       │       ├── message-bubble.tsx ← Message renderer
│       │       └── mode-selector.tsx  ← auto/rag/agent/llm toggle
│       ├── rag/
│       │   ├── page.tsx              ← RAG knowledge base page
│       │   └── components/
│       │       ├── document-uploader.tsx ← Drag-drop upload
│       │       ├── document-list.tsx     ← Document index + status
│       │       ├── chat-interface.tsx    ← RAG query + answer
│       │       └── citation-panel.tsx   ← Source excerpts
│       ├── agents/
│       │   ├── page.tsx              ← Agent task runner page
│       │   └── components/
│       │       ├── task-input.tsx        ← Task prompt input
│       │       ├── execution-timeline.tsx ← Step-by-step progress
│       │       ├── agent-logs.tsx         ← Live log stream
│       │       └── agent-output.tsx       ← Final synthesized answer
│       ├── analytics/
│       │   ├── page.tsx              ← Analytics dashboard
│       │   └── components/
│       │       ├── analytics-overview.tsx ← Summary metrics
│       │       ├── usage-graph.tsx        ← Requests by module over time
│       │       ├── cost-chart.tsx         ← Token cost breakdown
│       │       └── latency-chart.tsx      ← p50/p95/p99 latency
│       └── settings/
│           └── page.tsx              ← API keys, model config, preferences
│
├── components/
│   ├── layout/
│   │   ├── app-shell.tsx    ← Main layout wrapper (sidebar + topbar + main)
│   │   ├── sidebar.tsx      ← Navigation sidebar with 6 routes
│   │   ├── topbar.tsx       ← Header: breadcrumb, notifications, user menu
│   │   └── index.ts         ← Barrel export
│   ├── ui/                  ← 40+ shadcn/ui primitives (auto-generated)
│   └── theme-provider.tsx   ← next-themes dark/light wrapper
│
├── hooks/
│   ├── use-mobile.ts    ← Responsive breakpoint hook (< 768px)
│   └── use-toast.ts     ← Toast notification hook
│
├── lib/
│   ├── utils.ts         ← cn() helper (clsx + tailwind-merge)
│   ├── config.ts        ← API_BASE_URL from NEXT_PUBLIC_API_URL
│   ├── types.ts         ← All TypeScript interfaces mirroring Pydantic schemas
│   └── api-client.ts    ← Typed HTTP + SSE client (5 namespaces, 25 endpoints)
│
├── public/              ← Static assets (icons, placeholders)
├── styles/
│   └── globals.css      ← Additional global styles
│
├── .env.example         ← Environment template
├── components.json      ← shadcn/ui configuration
├── next.config.mjs      ← Next.js config (ignoreBuildErrors, unoptimized images)
├── package.json
├── pnpm-lock.yaml
├── postcss.config.mjs
└── tsconfig.json        ← TypeScript config (@/* alias → ./)
```

---

## Path Alias

`@/*` resolves to `frontend/` (configured in `tsconfig.json`):

```typescript
import { cn }        from '@/lib/utils'
import { Button }    from '@/components/ui/button'
import { chatApi }   from '@/lib/api-client'
import type { SSEEvent } from '@/lib/types'
```

---

## API Client

All backend communication goes through `frontend/lib/api-client.ts`. Each module maps to a backend router.

### Import

```typescript
import { chatApi, ragApi, agentsApi, analyticsApi, settingsApi } from '@/lib/api-client'
```

### Base URL

Configured in `frontend/lib/config.ts`:
```typescript
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
```

---

## How Each Module Connects to the Backend

### Chat — `chatApi`

The chat module uses an SSE stream over a `POST` request (not EventSource, which only supports GET).

```typescript
// Stream a chat message
for await (const event of chatApi.stream({ message: 'Hello', mode: 'auto' })) {
  switch (event.type) {
    case 'status':
      // Show status text ("Thinking…", "Searching knowledge base…")
      setStatus(event.message)
      break
    case 'delta':
      // Append token to displayed message
      appendToken(event.delta ?? '')
      break
    case 'done':
      // Finalize: render citations, update metadata badge
      finalize(event.content, event.citations, event.metadata)
      break
  }
}

// Conversation management
const { conversations } = await chatApi.listConversations()
const history = await chatApi.getHistory(conversationId, 50, 0)
await chatApi.deleteHistory({ conversationId })
```

**Backend endpoint:** `POST /api/chat/send`
**SSE event sequence:** `status → [status] → delta* → done`
The `done` event is **always emitted**, even on error.

### RAG — `ragApi`

```typescript
// Upload document (multipart/form-data)
const doc = await ragApi.upload(file)
// → { id, name, size, status: 'pending', createdAt }

// Poll until ready
let status = await ragApi.getStatus(doc.id)
while (status.status !== 'ready' && status.status !== 'error') {
  await delay(1000)
  status = await ragApi.getStatus(doc.id)
}

// List all documents
const docs = await ragApi.listDocuments()

// Query knowledge base
const result = await ragApi.query({ query: 'What is the refund policy?', maxCitations: 5 })
// → { answer, citations: [{ documentName, content, page, relevanceScore }], sources }

// Delete document + all chunks
await ragApi.deleteDocument(doc.id)
```

**Backend endpoints:** `POST /api/rag/upload`, `GET /api/rag/documents`, `GET /api/rag/documents/{id}/status`, `POST /api/rag/query`, `DELETE /api/rag/documents/{id}`

### Agents — `agentsApi`

Agent log streaming uses `EventSource` (GET endpoint, unlike chat which uses fetch+POST).

```typescript
// Start a task
const { taskId } = await agentsApi.execute({
  task: 'Research pgvector alternatives and compare them',
  maxSteps: 8,
})

// Stream live logs (returns an EventSource — caller must close it)
const es = agentsApi.streamLogs(taskId, (event) => {
  // event: { type, timestamp, level, message, stepId? }
  if (event.type === 'done') {
    es.close()
    loadFinalResult()
  } else {
    appendLog(event)
  }
})

// Get full task with steps
const task = await agentsApi.getTask(taskId)
// → { id, prompt, status, steps: [{ id, name, status, output }], output }

// Cancel a running task
await agentsApi.cancelTask(taskId)
```

**Backend endpoints:** `POST /api/agents/execute`, `GET /api/agents/tasks`, `GET /api/agents/tasks/{id}`, `GET /api/agents/tasks/{id}/logs` (SSE), `POST /api/agents/tasks/{id}/cancel`

### Analytics — `analyticsApi`

```typescript
const overview = await analyticsApi.getOverview()
// → { totalRequests, totalCost, avgLatency, activeUsers, trends }

const usage = await analyticsApi.getUsage({ granularity: 'day' })
// → [{ date, rag, agent, chat }]

const costs = await analyticsApi.getCosts({ granularity: 'month' })
// → [{ month, tokens, compute, storage }]

const latency = await analyticsApi.getLatency({ granularity: 'hour' })
// → [{ time, p50, p95, p99 }]
```

### Settings — `settingsApi`

```typescript
const settings = await settingsApi.get()
// → { apiConfiguration, modelConfiguration, notifications, preferences }

await settingsApi.update({ preferences: { theme: 'light' } })

const keys = await settingsApi.listApiKeys()
const { key } = await settingsApi.createApiKey({ name: 'CI pipeline', permissions: ['read'] })
// key shown only once — must be stored immediately
await settingsApi.deleteApiKey(keyId)
```

---

## SSE Streaming Architecture

### Chat SSE (fetch + ReadableStream)

The chat endpoint is `POST` — EventSource only supports GET — so the client uses `fetch()` with `ReadableStream`:

```
Browser                          Backend
   |                                |
   |── POST /api/chat/send ────────>|
   |   { message, mode }            |
   |                                |── classify route
   |<── Content-Type: text/event-stream ──|
   |<── data: {"type":"status",...} ──|    ← immediate signal
   |<── data: {"type":"delta",...}  ──|    ← token stream
   |<── data: {"type":"done",...}   ──|    ← always emitted
```

The `done` event carries the full accumulated `content`, optional `citations`, and `metadata` (model name, latency_ms, token count, fallback flag).

### Agent SSE (EventSource)

Agent logs stream over GET, so standard `EventSource` works:

```
Browser                                Backend
   |                                      |
   |── GET /api/agents/tasks/{id}/logs ──>|
   |<── historical logs replayed first  ──|   ← reconnect-safe
   |<── live log events as they arrive  ──|
   |<── keep-alive ping every 25s       ──|   ← prevents proxy timeout
   |<── data: {"type":"done",...}        ──|   ← stream terminates
```

Reconnecting replays all historical logs before resuming live events — page refreshes don't lose progress.

---

## UI State Management

The frontend uses React's built-in state (`useState`, `useEffect`, `useRef`) — no global state library. Each page manages its own state independently.

**Pattern for streaming:**
```typescript
const [status, setStatus] = useState('')
const [content, setContent] = useState('')
const [isStreaming, setIsStreaming] = useState(false)
const abortRef = useRef<AbortController | null>(null)

const sendMessage = async (message: string) => {
  abortRef.current = new AbortController()
  setIsStreaming(true)
  setContent('')

  try {
    for await (const event of chatApi.stream({ message, mode })) {
      if (event.type === 'status') setStatus(event.message ?? '')
      if (event.type === 'delta') setContent(c => c + (event.delta ?? ''))
      if (event.type === 'done') {
        finalize(event)
        break
      }
    }
  } finally {
    setIsStreaming(false)
    setStatus('')
  }
}
```

---

## Current Integration Status

| Module | UI | API Client | Backend Wired |
|---|---|---|---|
| Chat streaming | ✓ | ✓ | ✗ (mock) |
| RAG upload | ✓ | ✓ | ✗ (mock) |
| RAG document list | ✓ | ✓ | ✗ (mock) |
| RAG query + citations | ✓ | ✓ | ✗ (mock) |
| Agent execution | ✓ | ✓ | ✗ (mock) |
| Agent log streaming | ✓ | ✓ | ✗ (mock) |
| Analytics dashboards | ✓ | ✓ | ✗ (mock) |
| Settings persistence | ✓ | ✓ | ✗ (no handler) |

The `api-client.ts` is complete and correct. All 25 backend endpoints are implemented and typed. **The remaining work is replacing mock data in each component with the corresponding `*Api` call.**

### Wiring guide per component

| Component | Mock to replace | API call to use |
|---|---|---|
| `chat-window.tsx` | `simulateStreaming()` + `mockResponses` | `chatApi.stream()` |
| `document-uploader.tsx` | `simulateUpload()` | `ragApi.upload()` + `ragApi.getStatus()` |
| `document-list.tsx` | `mockDocuments` array | `ragApi.listDocuments()` |
| `chat-interface.tsx` | `mockCitations` + setTimeout | `ragApi.query()` |
| `agents/page.tsx` | `runAgent()` with setInterval | `agentsApi.execute()` + `agentsApi.streamLogs()` |
| `analytics-overview.tsx` | hardcoded `stats` | `analyticsApi.getOverview()` |
| `usage-graph.tsx` | hardcoded `data` | `analyticsApi.getUsage()` |
| `cost-chart.tsx` | hardcoded `data` | `analyticsApi.getCosts()` |
| `latency-chart.tsx` | hardcoded `data` | `analyticsApi.getLatency()` |
| `quick-stats.tsx` | hardcoded `stats` | `analyticsApi.getOverview()` |
| `settings/page.tsx` | no handler | `settingsApi.get()` + `settingsApi.update()` |

---

## Adding shadcn/ui Components

```bash
cd frontend
npx shadcn-ui@latest add <component-name>
# Components are added to frontend/components/ui/
```

---

## Build & Deploy

### Local build
```bash
cd frontend
pnpm build
pnpm start
```

### Vercel

1. Set root directory to `frontend/`
2. Framework preset: Next.js
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-backend.com`
4. Deploy

### Docker

The root `docker-compose.yml` includes a `frontend` service (under the `frontend` profile):
```bash
docker compose --profile frontend up
```

Note: The Docker frontend service is suitable for production build testing. For development, run `pnpm dev` locally.

---

## Scripts

```bash
pnpm dev        # Start development server (localhost:3000)
pnpm build      # Production build
pnpm start      # Run production build
pnpm lint       # ESLint check
```
