# Frontend Developer Guide — Kortex

Complete guide for developing, extending, and integrating the Kortex Next.js frontend with the FastAPI backend.

---

## Stack & Versions

| Technology | Version | Role |
|---|---|---|
| Next.js | 16.2.4 | Framework (App Router) |
| React | 19 | UI runtime |
| TypeScript | 5.7.3 | Type safety |
| Tailwind CSS | v4 | Utility-first styling |
| shadcn/ui | latest | Accessible UI primitives |
| Recharts | 2.15.0 | Analytics charts |
| Framer Motion | 12 | Transitions |
| pnpm | any | Package manager |

---

## Setup

```bash
cd frontend
pnpm install
cp .env.example .env.local          # set NEXT_PUBLIC_API_URL if needed
pnpm dev                             # http://localhost:3000
```

Requires the backend running on port 8000. See `../backend/README.md`.

---

## Project Layout

```
frontend/
├── app/
│   ├── layout.tsx                   ← Root: Inter font, ThemeProvider
│   ├── page.tsx                     ← redirect("/dashboard")
│   ├── globals.css                  ← Tailwind + OKLCH color vars
│   └── (dashboard)/
│       ├── layout.tsx               ← AppShell wrapper for all pages
│       ├── dashboard/page.tsx       ← Overview
│       ├── chat/page.tsx            ← Multi-mode chat
│       ├── rag/page.tsx             ← Knowledge base
│       ├── agents/page.tsx          ← Task runner
│       ├── analytics/page.tsx       ← Dashboards
│       └── settings/page.tsx        ← Config
│
├── components/
│   ├── layout/
│   │   ├── app-shell.tsx    ← Main wrapper: sidebar + topbar + <main>
│   │   ├── sidebar.tsx      ← Navigation (6 routes + active state)
│   │   ├── topbar.tsx       ← Breadcrumb, notifications, user menu
│   │   └── index.ts         ← { AppShell }
│   ├── ui/                  ← shadcn/ui components (40+ files)
│   └── theme-provider.tsx   ← next-themes <ThemeProvider>
│
├── hooks/
│   ├── use-mobile.ts    ← useIsMobile() — true if width < 768px
│   └── use-toast.ts     ← useToast() — programmatic toast notifications
│
├── lib/
│   ├── utils.ts         ← cn(...classes) — clsx + tailwind-merge
│   ├── config.ts        ← API_BASE_URL constant
│   ├── types.ts         ← All TypeScript interfaces (mirrors Pydantic)
│   └── api-client.ts    ← chatApi, ragApi, agentsApi, analyticsApi, settingsApi
│
├── public/              ← Static assets (icons, placeholders)
├── styles/globals.css   ← Additional global CSS
├── .env.example
├── components.json      ← shadcn/ui config
├── next.config.mjs      ← ignoreBuildErrors: true, images.unoptimized: true
├── package.json
├── tsconfig.json        ← "paths": { "@/*": ["./*"] }
└── pnpm-lock.yaml
```

---

## Path Alias

`@/*` resolves to `frontend/` (relative to `tsconfig.json`):

```typescript
import { cn }              from '@/lib/utils'
import { Button }          from '@/components/ui/button'
import { chatApi }         from '@/lib/api-client'
import type { SSEEvent }   from '@/lib/types'
import { useToast }        from '@/hooks/use-toast'
```

---

## API Client Reference

All backend calls go through `frontend/lib/api-client.ts`. The base URL is read from:

```typescript
// frontend/lib/config.ts
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
```

### Error handling

Every `apiFetch()` call throws `Error` with the message `"API {status}: {body}"` on non-2xx responses. Wrap in try/catch at the component level.

---

## Chat Integration

### Connecting to `POST /api/chat/send` (SSE via fetch)

The chat endpoint returns a Server-Sent Events stream over a POST request. Because `EventSource` only supports GET, the client uses `fetch()` + `ReadableStream`:

```typescript
import { chatApi } from '@/lib/api-client'
import type { SSEEvent } from '@/lib/types'

async function sendMessage(message: string, mode: string) {
  setIsStreaming(true)
  setCurrentStatus('')
  setCurrentContent('')

  try {
    for await (const event of chatApi.stream({ message, mode, conversationId })) {
      if (event.type === 'status') {
        // Show loading state text
        setCurrentStatus(event.message ?? '')
      }
      if (event.type === 'delta') {
        // Append token to displayed message
        setCurrentContent(prev => prev + (event.delta ?? ''))
      }
      if (event.type === 'done') {
        // Finalize message: citations, metadata badge, save to history
        finalizeMessage({
          content: event.content ?? '',
          citations: event.citations ?? [],
          mode: event.mode,
          metadata: event.metadata,
        })
        break
      }
    }
  } catch (err) {
    showError(String(err))
  } finally {
    setIsStreaming(false)
    setCurrentStatus('')
  }
}
```

**SSE event sequence guarantee:**
```
status("Thinking…")                     ← always first
[status("Searching knowledge base…")]   ← for RAG path
delta*                                  ← 0 or more tokens
done                                    ← always last, always emitted
```

### Mode values

| `mode` | Backend routing |
|---|---|
| `auto` | RouterService classifies intent → rag/agent/llm |
| `rag` | Always queries knowledge base |
| `agent` | Always starts an agent task |
| `llm` | Direct LLM call, no retrieval |

### done.metadata shape

```typescript
interface DoneMetadata {
  model: string       // "claude-sonnet-4-6"
  latency_ms: number  // total response time in ms
  tokens: number      // output tokens
  fallback: boolean   // true if Ollama was used instead of Claude
}
```

---

## RAG Integration

### Upload flow

```typescript
import { ragApi } from '@/lib/api-client'

async function uploadFile(file: File) {
  // 1. Upload — returns immediately with status=pending
  const doc = await ragApi.upload(file)
  setDocumentId(doc.id)
  setStatus('processing')

  // 2. Poll for completion
  while (true) {
    const statusResponse = await ragApi.getStatus(doc.id)
    setProgress(statusResponse.progress ?? 0)

    if (statusResponse.status === 'ready') {
      setStatus('ready')
      setChunksCreated(statusResponse.chunksCreated)
      break
    }
    if (statusResponse.status === 'error') {
      setStatus('error')
      setError(statusResponse.error ?? 'Unknown error')
      break
    }
    await new Promise(r => setTimeout(r, 1000)) // poll every 1s
  }
}
```

### Query flow

```typescript
const result = await ragApi.query({
  query: userQuestion,
  maxCitations: 5,
  // documentIds: [id1, id2],  // optional: restrict to specific docs
})

// result.answer — LLM answer grounded in documents
// result.citations — array of Citation objects
// result.sources — snippet + score (for UI preview)

for (const citation of result.citations) {
  // citation.documentName, citation.content, citation.page, citation.relevanceScore
}
```

---

## Agent Integration

### Execute + stream

```typescript
import { agentsApi } from '@/lib/api-client'

async function runTask(task: string) {
  // 1. Start task
  const { taskId } = await agentsApi.execute({ task, maxSteps: 8 })

  // 2. Stream logs via EventSource
  const es = agentsApi.streamLogs(taskId, (event) => {
    if (event.type === 'done') {
      es.close()
      loadFinalResult(taskId)
    } else {
      appendLog(event)   // { timestamp, level, message, stepId }
    }
  })

  // 3. Store reference for cleanup
  eventSourceRef.current = es
}

// Cleanup on component unmount
useEffect(() => {
  return () => eventSourceRef.current?.close()
}, [])
```

### Reconnect-safe streaming

If the browser refreshes mid-execution, the server replays all historical `AgentLog` records before resuming live events. Simply reconnect to the same `taskId`:

```typescript
const es = agentsApi.streamLogs(existingTaskId, handleEvent)
// Historical logs arrive first, then live events resume seamlessly
```

### Rendering step status

```typescript
// Map AgentStep.status to UI state
const stepIcon = {
  pending:   '○',
  running:   '⟳',  // spinning
  completed: '✓',
  failed:    '✗',
}
```

---

## Analytics Integration

```typescript
import { analyticsApi } from '@/lib/api-client'

// Overview card (totalRequests, totalCost, avgLatency, trends)
const overview = await analyticsApi.getOverview()

// Usage chart (requests by module per day)
const usage = await analyticsApi.getUsage({
  from: thirtyDaysAgo.toISOString(),
  to: new Date().toISOString(),
  granularity: 'day',
})
// usage: Array<{ date: string, rag: number, agent: number, chat: number }>

// Cost chart (per month breakdown)
const costs = await analyticsApi.getCosts({ granularity: 'month' })
// costs: Array<{ month: string, tokens: number, compute: number, storage: number }>

// Latency chart (p50/p95/p99 per hour)
const latency = await analyticsApi.getLatency({ granularity: 'hour' })
// latency: Array<{ time: string, p50: number, p95: number, p99: number }>
```

---

## Settings Integration

```typescript
import { settingsApi } from '@/lib/api-client'

// Load settings on mount
useEffect(() => {
  settingsApi.get().then(setSettings)
}, [])

// Save partial update
const save = async (updates: SettingsUpdateRequest) => {
  await settingsApi.update(updates)
}

// API key management
const keys = await settingsApi.listApiKeys()
const { key } = await settingsApi.createApiKey({ name: 'CI', permissions: ['read'] })
// IMPORTANT: `key` is shown only once — display immediately and ask user to copy
await settingsApi.deleteApiKey(keyId)
```

---

## UI State Patterns

### Loading state for API calls

```typescript
const [data, setData] = useState<T | null>(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)

useEffect(() => {
  ragApi.listDocuments()
    .then(setData)
    .catch(e => setError(String(e)))
    .finally(() => setLoading(false))
}, [])
```

### Optimistic updates

For mutations (delete document, cancel task), update local state first then call the API:

```typescript
const deleteDoc = async (id: string) => {
  setDocuments(prev => prev.filter(d => d.id !== id))  // optimistic
  try {
    await ragApi.deleteDocument(id)
  } catch {
    setDocuments(prev)  // rollback on error
  }
}
```

---

## Adding a New Page

1. Create `frontend/app/(dashboard)/my-page/page.tsx`
2. Add entry to `frontend/components/layout/sidebar.tsx` (the `navItems` array)
3. Use `@/components/ui/card`, `@/components/ui/button`, etc. for UI
4. Fetch data with the appropriate `*Api` function from `@/lib/api-client`

Example skeleton:
```tsx
'use client'

import { useEffect, useState } from 'react'
import { analyticsApi } from '@/lib/api-client'
import type { AnalyticsOverviewResponse } from '@/lib/types'

export default function MyPage() {
  const [data, setData] = useState<AnalyticsOverviewResponse | null>(null)

  useEffect(() => {
    analyticsApi.getOverview().then(setData)
  }, [])

  if (!data) return <div>Loading…</div>
  return <div>{data.totalRequests}</div>
}
```

---

## Adding shadcn/ui Components

```bash
cd frontend
npx shadcn-ui@latest add <component-name>
# Adds to frontend/components/ui/
```

The `components.json` config resolves all paths relative to `frontend/`:
```json
{
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

---

## Theming

Colors are OKLCH CSS variables in `frontend/app/globals.css`:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  /* ... */
}
.dark {
  --background: oklch(0.141 0.005 285.823);
  /* ... */
}
```

Dark/light mode is toggled via `next-themes`:
```typescript
import { useTheme } from 'next-themes'
const { theme, setTheme } = useTheme()
setTheme('dark')
```

---

## TypeScript Configuration

`tsconfig.json` key settings:

```json
{
  "compilerOptions": {
    "paths": { "@/*": ["./*"] },
    "strict": true,
    "jsx": "react-jsx",
    "moduleResolution": "bundler"
  }
}
```

`next.config.mjs` suppresses type errors at build time (`ignoreBuildErrors: true`). Run `npx tsc --noEmit` (after `pnpm install`) to check types manually.

---

## Current Integration Status & Wiring Guide

All UI components exist. The `api-client.ts` is complete. The remaining work is replacing mock data in each component with real API calls:

| Component | Mock to replace | API function |
|---|---|---|
| `chat/components/chat-window.tsx` | `simulateStreaming()` | `chatApi.stream()` |
| `rag/components/document-uploader.tsx` | `simulateUpload()` | `ragApi.upload()` + `ragApi.getStatus()` |
| `rag/components/document-list.tsx` | `mockDocuments` array | `ragApi.listDocuments()` |
| `rag/components/chat-interface.tsx` | `mockCitations` + setTimeout | `ragApi.query()` |
| `agents/page.tsx` | `runAgent()` with setInterval | `agentsApi.execute()` + `agentsApi.streamLogs()` |
| `analytics/components/analytics-overview.tsx` | hardcoded `stats` | `analyticsApi.getOverview()` |
| `analytics/components/usage-graph.tsx` | hardcoded `data` | `analyticsApi.getUsage()` |
| `analytics/components/cost-chart.tsx` | hardcoded `data` | `analyticsApi.getCosts()` |
| `analytics/components/latency-chart.tsx` | hardcoded `data` | `analyticsApi.getLatency()` |
| `dashboard/components/quick-stats.tsx` | hardcoded metrics | `analyticsApi.getOverview()` |
| `dashboard/components/recent-activity.tsx` | hardcoded activities | `chatApi.listConversations()` + `agentsApi.listTasks()` |
| `settings/page.tsx` | no handler | `settingsApi.get()` + `settingsApi.update()` + key CRUD |

---

## Deployment

### Vercel (recommended)

1. Set root directory to `frontend/`
2. Framework preset: Next.js (auto-detected)
3. Environment variable: `NEXT_PUBLIC_API_URL=https://your-backend.com`
4. Deploy

### Local Docker

```bash
cd frontend
# Build image
docker build -t kortex-frontend .

# Or use root docker-compose (frontend profile)
cd ..
docker compose --profile frontend up
```

The root `docker-compose.yml` frontend service sets `NEXT_PUBLIC_API_URL=http://api:8000` — the internal Docker network name.
