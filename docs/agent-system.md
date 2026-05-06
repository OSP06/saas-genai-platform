# Agent System — Kortex

The agent system executes autonomous multi-step tasks: given a plain-language goal, it plans a sequence of tool calls, executes each step with timeout protection, persists results, and synthesizes a final answer — all streamed live via SSE.

---

## Architecture

```
POST /api/agents/execute { task, tools?, maxSteps }
        │
        ▼
AgentService.execute_task()
        │
        ├── asyncio.Semaphore(20)  ← cap concurrent runs
        │
        ├── AgentTask created (status=running)
        │
        ├── asyncio.Queue created for SSE log stream
        │
        ├── asyncio.create_task(_execute_task()) ← non-blocking
        │
        └── return { taskId, status="running", createdAt }

_execute_task() runs concurrently:
        │
        ├── PLANNING PHASE
        │   LLMService.complete(PLANNING_SYSTEM + task)
        │   → parse JSON: [{id, name, description, tool}]
        │   → normalize: cap at maxSteps, assign fallback tools
        │
        ├── EXECUTION LOOP
        │   for each step in plan:
        │     push_log("Step N of M: {name}")
        │     asyncio.wait_for(tool.execute(input), timeout=60s)
        │     on success: push_log("✓ Step N of M completed")
        │     on timeout: push_log("⚠ Step N of M timed out")
        │     on failure: push_log("⚠ Step N of M failed: {error}")
        │     UPDATE agent_tasks.steps (JSONB array replacement)
        │     session.commit()
        │
        ├── SYNTHESIS PHASE
        │   push_log("Synthesizing final answer…")
        │   LLMService.complete(all step outputs) → final_answer
        │   AgentTask.output = final_answer
        │   AgentTask.status = "completed"
        │   push_log("✅ Task completed in {duration}s")
        │
        └── finally (always runs):
            queue.put(None)  ← sentinel for SSE termination
            _task_queues.pop(task_id)
            _task_asyncio_handles.pop(task_id)
```

---

## SSE Log Stream

```
GET /api/agents/tasks/{task_id}/logs
        │
        ├── Fetch all existing AgentLog records from DB
        │   (replay historical logs — safe to reconnect)
        │
        ├── Subscribe to asyncio.Queue for live events
        │
        ├── yield each event as SSE data
        │
        ├── Every 25s: send ": keep-alive\n\n" comment
        │   (prevents proxy/browser idle timeout)
        │
        └── None sentinel received → stream terminates
```

**SSE event format:**
```json
{
  "type": "log",
  "timestamp": "2026-05-01T12:00:01.234Z",
  "level": "info",
  "message": "Step 1 of 3: Search for competitors",
  "stepId": "step_1"
}
```

**Terminal event:**
```json
{
  "type": "done",
  "timestamp": "2026-05-01T12:00:15.000Z",
  "level": "info",
  "message": "✅ Task completed in 14.2s",
  "stepId": null
}
```

---

## Planning System

The planning phase sends a structured prompt to the LLM asking for a JSON step plan:

```
PLANNING_SYSTEM:
  "You are a task planner. Given a goal, return a JSON array of steps.
   Each step: { id, name, description, tool }.
   Available tools: web_search, rag_lookup, text_analyzer.
   Maximum steps: {maxSteps}.
   Return ONLY the JSON array, no other text."
```

`_parse_plan()` handles:
- Valid JSON array → use directly
- Invalid JSON → fallback to single "analyze" step using `text_analyzer`
- Steps > maxSteps → truncate
- Missing `tool` field → default to `text_analyzer`

---

## Tool System

All tools implement `BaseTool`:

```python
class BaseTool(Protocol):
    name: str         # identifier used in step plan
    description: str  # shown to LLM during planning

    async def execute(self, input: str) -> ToolResult: ...

@dataclass
class ToolResult:
    success: bool
    output: str
    error: str | None = None
```

### `web_search` — WebSearchTool

Searches the web for current information.

**With `SERPAPI_KEY`:** Calls SerpAPI for structured results (title, snippet, URL).
**Without key:** Falls back to DuckDuckGo HTML scraping.

Input: search query string
Output: formatted search results with titles and URLs

### `rag_lookup` — RAGLookupTool

Queries the internal knowledge base (same pgvector index as `POST /api/rag/query`).

Input: search query string
Output: answer from knowledge base + source citations

```python
answer, citations, _ = await rag.query(
    query_text=query,
    document_ids=None,
    max_citations=3,
)
```

This tool reuses the same `RAGService` as the RAG router — uploads available to RAG queries are also available to agents.

### `text_analyzer` — TextAnalyzerTool

Performs LLM-based text analysis: summarize, classify, extract entities, or answer questions from provided text.

Input: instruction + text to analyze
Output: analysis result as text

---

## Step Execution Details

```python
async def _run_step(self, step, session):
    tool = self._tools.get(step["tool"])
    if tool is None:
        return ToolResult(success=False, output="", error="Unknown tool")

    try:
        result = await asyncio.wait_for(
            tool.execute(step["description"]),
            timeout=settings.AGENT_STEP_TIMEOUT,  # default 60s
        )
        return result
    except asyncio.TimeoutError:
        return ToolResult(success=False, output="", error="Step timed out")
    except Exception as e:
        return ToolResult(success=False, output="", error=str(e))
```

Each step result is persisted to `agent_tasks.steps` (JSONB) by **replacing the entire array** — never mutating in place. This avoids SQLAlchemy's JSONB mutation-tracking issues.

---

## Task Lifecycle

```
pending
   │
   ▼ (on execute_task start)
running
   │
   ├── [normal completion] → completed
   ├── [any unhandled exception] → failed
   └── [cancel_task called] → cancelled
```

### Cancellation

```python
# AgentService.cancel_task()
asyncio_task.cancel()
# CancelledError caught in _execute_task():
#   AgentTask.status = "cancelled"
#   queue.put(None)  ← SSE stream terminates
```

The asyncio task is cancelled at the Python level — the current tool call is interrupted (tool must handle `CancelledError` gracefully, which `asyncio.wait_for` does automatically via timeout wrapper).

---

## Concurrency & Memory

| Resource | Limit | Mechanism |
|---|---|---|
| Concurrent tasks | 20 | `asyncio.Semaphore(20)` |
| SSE queue size | 2000 events | `asyncio.Queue(maxsize=2000)` |
| Per-step timeout | 60s | `asyncio.wait_for()` |
| Queue cleanup | On task completion/failure/cancel | `finally` block in `_execute_task` |
| Task handle cleanup | On task completion/failure/cancel | `finally` block |

**SSE queues are in-memory.** With a single backend worker, each active task has one queue. With multiple workers, log events arrive only at the worker running the task — clients connected to other workers see nothing. This is the primary scaling limitation.

---

## DB Persistence

### AgentTask table

```
id: UUID
prompt: TEXT
status: TEXT (pending|running|completed|failed|cancelled)
steps: JSONB [{id, name, description, tool, status, output, startedAt, completedAt}]
output: TEXT (final synthesized answer)
tools: JSONB (requested tool list)
max_steps: INTEGER
created_at: TIMESTAMPTZ
updated_at: TIMESTAMPTZ
```

### AgentLog table

```
id: UUID
task_id: UUID (FK → agent_tasks, CASCADE DELETE)
timestamp: TIMESTAMPTZ
level: TEXT (info|debug|warn|error)
message: TEXT
step_id: TEXT (nullable)
created_at: TIMESTAMPTZ
```

All logs are persisted to `agent_logs` in addition to being pushed to the SSE queue. This enables:
- Reconnect-safe SSE (historical replay)
- Task log inspection after completion
- Analytics on agent execution patterns

---

## Failure Recovery

| Failure | Behaviour |
|---|---|
| Step times out (>60s) | Logged as `⚠ Step N timed out`, execution continues with next step |
| Step tool fails | Logged as `⚠ Step N failed: {error}`, execution continues |
| Planning LLM fails | Task marked `failed`, done event emitted |
| Synthesis LLM fails | Task marked `failed`, done event emitted |
| Server restart during task | Task stays in `running` status — no auto-recovery. Re-submit the task. |
| All steps fail | Synthesis still runs with empty outputs, produces best-effort answer |

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `AGENT_MAX_STEPS` | 10 | Hard cap on steps per task (overrides request `maxSteps`) |
| `AGENT_STEP_TIMEOUT` | 60 | Seconds before a step is force-cancelled |
| `SERPAPI_KEY` | `""` | Required for `web_search` via SerpAPI (DuckDuckGo fallback if empty) |
