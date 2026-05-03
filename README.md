# GenAI Intelligence Platform

A comprehensive SaaS dashboard for managing AI-powered workflows including RAG (Retrieval-Augmented Generation), autonomous agents, and smart chat routing.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Styling:** Tailwind CSS v4 with CSS variables for theming
- **UI Components:** shadcn/ui
- **Charts:** Recharts
- **Animations:** Framer Motion
- **Icons:** Lucide React

## Project Structure

```
app/
├── (dashboard)/
│   ├── layout.tsx          # Dashboard layout with AppShell
│   ├── dashboard/          # Main dashboard overview
│   ├── rag/                # RAG Knowledge Base module
│   ├── agents/             # AI Agent Workspace module
│   ├── chat/               # Smart Chat Router module
│   ├── analytics/          # Analytics Dashboard
│   └── settings/           # Settings page
├── layout.tsx              # Root layout
├── page.tsx                # Redirects to /dashboard
└── globals.css             # Theme variables and global styles

components/
├── layout/
│   ├── app-shell.tsx       # Main layout wrapper
│   ├── sidebar.tsx         # Navigation sidebar
│   └── topbar.tsx          # Top navigation bar
└── ui/                     # shadcn/ui components
```

---

## Pages

### 1. Dashboard (`/dashboard`)

**Purpose:** Central hub providing an overview of all platform modules and recent activity.

**Components:**
- `QuickStats` - Displays key metrics (documents, agents, chats, API calls)
- `RecentActivity` - Timeline of recent platform events

**Features:**
- Module cards with quick navigation
- Real-time activity feed
- Quick action buttons

---

### 2. RAG Knowledge Base (`/rag`)

**Purpose:** Upload documents, build a knowledge base, and query it using natural language with citations.

**Components:**
- `DocumentUploader` - Drag-and-drop file upload with progress tracking
- `DocumentList` - Searchable list of uploaded documents with status indicators
- `ChatInterface` - Chat UI for querying the knowledge base
- `CitationPanel` - Side panel showing source citations for answers

**Features:**
- Supports PDF, TXT, MD, DOCX, CSV file formats
- Document processing status (processing, indexed, error)
- Citation highlighting with relevance scores
- Streaming responses

**API Endpoints (to be implemented):**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/rag/upload` | Upload documents to knowledge base |
| `GET` | `/api/rag/documents` | List all documents |
| `DELETE` | `/api/rag/documents/:id` | Delete a document |
| `POST` | `/api/rag/query` | Query the knowledge base |
| `GET` | `/api/rag/documents/:id/status` | Get document processing status |

**Request/Response Examples:**

```typescript
// POST /api/rag/upload
// Content-Type: multipart/form-data
// Body: file (File)

// Response
{
  "id": "doc_123",
  "name": "company-handbook.pdf",
  "size": 2048576,
  "status": "processing",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

```typescript
// POST /api/rag/query
{
  "query": "What is the company vacation policy?",
  "documentIds": ["doc_123", "doc_456"], // optional filter
  "maxCitations": 5
}

// Response (streaming)
{
  "answer": "According to the company handbook...",
  "citations": [
    {
      "documentId": "doc_123",
      "documentName": "company-handbook.pdf",
      "text": "Employees are entitled to 20 days...",
      "page": 15,
      "relevance": 0.95
    }
  ]
}
```

---

### 3. AI Agent Workspace (`/agents`)

**Purpose:** Create and monitor autonomous AI agents that execute multi-step tasks.

**Components:**
- `TaskInput` - Natural language task input with example prompts
- `ExecutionTimeline` - Visual timeline of agent execution steps
- `AgentLogs` - Real-time log output with severity levels
- `AgentOutput` - Final results and artifacts display

**Features:**
- Step-by-step execution visualization
- Real-time log streaming
- Tool call tracking (search, analyze, generate, etc.)
- Execution time and token usage metrics

**API Endpoints (to be implemented):**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/agents/execute` | Start a new agent task |
| `GET` | `/api/agents/tasks` | List all tasks |
| `GET` | `/api/agents/tasks/:id` | Get task details |
| `GET` | `/api/agents/tasks/:id/logs` | Stream task logs |
| `POST` | `/api/agents/tasks/:id/cancel` | Cancel running task |

**Request/Response Examples:**

```typescript
// POST /api/agents/execute
{
  "task": "Research the top 5 competitors in the AI chatbot market and create a comparison report",
  "tools": ["web_search", "analyze", "generate"], // optional
  "maxSteps": 10
}

// Response
{
  "taskId": "task_789",
  "status": "running",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

```typescript
// GET /api/agents/tasks/:id/logs (SSE stream)
data: {"timestamp": "2024-01-15T10:30:01Z", "level": "info", "message": "Starting task execution..."}
data: {"timestamp": "2024-01-15T10:30:02Z", "level": "info", "message": "Tool call: web_search('AI chatbot competitors')"}
data: {"timestamp": "2024-01-15T10:30:05Z", "level": "success", "message": "Found 15 relevant results"}
```

---

### 4. Smart Chat Router (`/chat`)

**Purpose:** Unified chat interface that intelligently routes queries to the appropriate backend (RAG, Agent, or direct LLM).

**Components:**
- `ModeSelector` - Toggle between Auto, RAG, Agent, and LLM modes
- `ChatWindow` - Main chat interface with streaming support
- `MessageBubble` - Individual message display with mode badges

**Modes:**
- **Auto:** AI automatically determines the best routing
- **RAG:** Forces queries through the knowledge base
- **Agent:** Executes multi-step tasks
- **LLM:** Direct conversation with the language model

**API Endpoints (to be implemented):**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat/send` | Send a message |
| `GET` | `/api/chat/history` | Get chat history |
| `DELETE` | `/api/chat/history` | Clear chat history |
| `GET` | `/api/chat/conversations` | List conversations |

**Request/Response Examples:**

```typescript
// POST /api/chat/send
{
  "message": "What were our Q4 sales figures?",
  "mode": "auto", // "auto" | "rag" | "agent" | "llm"
  "conversationId": "conv_123" // optional
}

// Response (streaming)
{
  "id": "msg_456",
  "role": "assistant",
  "content": "Based on the Q4 report...",
  "mode": "rag", // actual mode used
  "citations": [...], // if RAG mode
  "metadata": {
    "model": "gpt-4",
    "tokens": 150,
    "latency": 1200
  }
}
```

---

### 5. Analytics (`/analytics`)

**Purpose:** Monitor platform usage, costs, and performance metrics.

**Components:**
- `AnalyticsOverview` - Key metric cards with trend indicators
- `UsageGraph` - API calls over time (area chart)
- `CostChart` - Cost breakdown by model (bar chart)
- `LatencyChart` - Response time percentiles (line chart)

**Metrics Tracked:**
- Total API calls
- Token usage (input/output)
- Cost by model
- Response latency (p50, p95, p99)
- Error rates

**API Endpoints (to be implemented):**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/overview` | Get summary metrics |
| `GET` | `/api/analytics/usage` | Get usage over time |
| `GET` | `/api/analytics/costs` | Get cost breakdown |
| `GET` | `/api/analytics/latency` | Get latency metrics |

**Query Parameters:**

```
?from=2024-01-01&to=2024-01-31  # Date range
?granularity=day                 # day | hour | week
?model=gpt-4                     # Filter by model
```

---

### 6. Settings (`/settings`)

**Purpose:** Configure API keys, model preferences, and platform settings.

**Sections:**
- **API Configuration** - Manage API keys and endpoints
- **Model Settings** - Select default models and parameters
- **Notifications** - Email and alert preferences
- **Security** - Two-factor authentication and session management

**API Endpoints (to be implemented):**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/settings` | Get all settings |
| `PATCH` | `/api/settings` | Update settings |
| `POST` | `/api/settings/api-keys` | Create new API key |
| `DELETE` | `/api/settings/api-keys/:id` | Revoke API key |

---

## Environment Variables

```env
# Database
DATABASE_URL=

# AI Provider
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Vector Store (for RAG)
PINECONE_API_KEY=
PINECONE_ENVIRONMENT=

# File Storage
BLOB_READ_WRITE_TOKEN=

# Authentication
NEXTAUTH_SECRET=
NEXTAUTH_URL=
```

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

---

## Theming

The platform uses CSS variables for theming with dark mode as the default. Theme tokens are defined in `app/globals.css`:

- `--background` / `--foreground` - Base colors
- `--card` / `--card-foreground` - Card surfaces
- `--primary` / `--primary-foreground` - Primary actions
- `--muted` / `--muted-foreground` - Subtle text
- `--success` / `--warning` / `--destructive` - Status colors

To switch to light mode, add the `light` class to the root `<html>` element.

---

## Architecture Notes

1. **Server Components by Default** - All pages are React Server Components unless client interactivity is needed.

2. **Streaming Responses** - Chat and agent interfaces use streaming for real-time feedback.

3. **Modular Design** - Each module (RAG, Agents, Chat) is self-contained with its own components directory.

4. **Mock Data** - Currently uses mock data for demonstration. Replace with actual API calls when backends are implemented.

---

## Future Enhancements

- [ ] Implement actual API endpoints
- [ ] Add database integration (Supabase/Neon)
- [ ] Add authentication with Supabase Auth
- [ ] Implement vector store for RAG
- [ ] Add webhook support for async agent tasks
- [ ] Add team/organization support
- [ ] Implement usage quotas and rate limiting
