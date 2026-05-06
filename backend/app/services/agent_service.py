import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator

import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession  # used in _push_log session param

from app.config import get_settings
from app.exceptions import TaskNotFoundError
from app.models.agent import AgentLog, AgentTask
from app.schemas.agent import AgentLogEvent, AgentStep, AgentTaskDetail
from app.services.llm_service import LLMService
from app.tools.base import BaseTool, ToolResult

logger = structlog.get_logger()
settings = get_settings()

# ------------------------------------------------------------------
# In-memory SSE queue store (Redis upgrade path: replace internals only)
# Key: str(task_id) → asyncio.Queue[AgentLogEvent | None]
# ------------------------------------------------------------------
_task_queues: dict[str, asyncio.Queue] = {}
_task_asyncio_handles: dict[str, asyncio.Task] = {}

# Limit concurrent agent executions to prevent DB pool exhaustion and
# unbounded LLM connection growth. Tasks queue here, not at the HTTP layer.
_execution_semaphore = asyncio.Semaphore(20)

# Max characters of step output sent to the synthesis prompt (~3k tokens).
# Prevents cost explosion when steps produce large outputs.
_MAX_SYNTHESIS_CHARS = 12_000

# Module-level singleton for cross-service access (set in main.py lifespan)
_global_agent_service: "AgentService | None" = None


def get_global_agent_service() -> "AgentService | None":
    return _global_agent_service


def set_global_agent_service(svc: "AgentService") -> None:
    global _global_agent_service
    _global_agent_service = svc


def _get_or_create_queue(task_id: str) -> asyncio.Queue:
    if task_id not in _task_queues:
        _task_queues[task_id] = asyncio.Queue(maxsize=2000)
    return _task_queues[task_id]


def _cleanup_queue(task_id: str) -> None:
    _task_queues.pop(task_id, None)


PLANNING_SYSTEM = """You are a task planning AI. Your job is to decompose a user task into a sequence of concrete steps.

For each step specify which tool to use:
- web_search: search the web for information (input: search query string)
- text_analyzer: analyze/summarize text (input: JSON {"action": "summarize"|"extract"|"sentiment", "text": "..."})
- rag_lookup: search the knowledge base documents (input: search query string)
- none: no tool needed, use your own knowledge to complete this step

Output ONLY a JSON array of step objects. No other text. Example:
[
  {"step_id": "s1", "name": "Research topic", "description": "Search for background information", "tool": "web_search", "input": "artificial intelligence trends 2025"},
  {"step_id": "s2", "name": "Synthesize findings", "description": "Summarize the research findings", "tool": "none", "input": ""}
]

Rules:
- Maximum {max_steps} steps
- Keep each step focused on ONE action
- step_id must be unique strings like s1, s2, s3..."""

SYNTHESIS_SYSTEM = """You are an AI assistant synthesizing research findings into a comprehensive, well-structured response.

Given a user task and the outputs from each research step, produce a final, polished answer.
Be thorough but concise. Use markdown formatting where helpful."""


class AgentService:
    def __init__(
        self,
        llm: LLMService,
        tools: dict[str, BaseTool],
    ):
        self._llm = llm
        self._tools = tools

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def create_task(
        self,
        prompt: str,
        tool_names: list[str] | None,
        max_steps: int,
    ) -> AgentTask:
        """
        INSERT agent_tasks row, launch background execution, return ORM object.
        Uses its own DB session so it doesn't entangle with the request session.
        """
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            task = AgentTask(
                id=uuid.uuid4(),
                prompt=prompt,
                status="pending",
                steps=[],
                tools=tool_names or list(self._tools.keys()),
                max_steps=max_steps,
            )
            session.add(task)
            await session.commit()
            await session.refresh(task)

        task_id_str = str(task.id)
        _get_or_create_queue(task_id_str)

        # Launch execution as an asyncio background task so it outlives the HTTP request
        asyncio_task = asyncio.create_task(
            self._execute_task(task.id),
            name=f"agent_task_{task_id_str}",
        )
        _task_asyncio_handles[task_id_str] = asyncio_task
        logger.info("agent_task_created", task_id=task_id_str, prompt=prompt[:80])
        return task

    async def get_task(self, task_id: uuid.UUID) -> AgentTaskDetail:
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AgentTask).where(AgentTask.id == task_id)
            )
            task = result.scalar_one_or_none()
            if task is None:
                raise TaskNotFoundError(str(task_id))
            return self._to_detail(task)

    async def list_tasks(self) -> list[AgentTaskDetail]:
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AgentTask).order_by(AgentTask.created_at.desc()).limit(50)
            )
            tasks = result.scalars().all()
            return [self._to_detail(t) for t in tasks]

    async def cancel_task(self, task_id: uuid.UUID) -> bool:
        task_id_str = str(task_id)
        asyncio_task = _task_asyncio_handles.get(task_id_str)
        if asyncio_task and not asyncio_task.done():
            asyncio_task.cancel()

        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AgentTask).where(AgentTask.id == task_id)
            )
            task = result.scalar_one_or_none()
            if task is None:
                raise TaskNotFoundError(task_id_str)
            task.status = "cancelled"
            await session.commit()

        await self._push_log(task_id_str, "info", "Task cancelled by user")
        q = _task_queues.get(task_id_str)
        if q:
            await q.put(None)
        _cleanup_queue(task_id_str)
        logger.info("agent_task_cancelled", task_id=task_id_str)
        return True

    async def stream_logs(self, task_id: uuid.UUID) -> AsyncIterator[AgentLogEvent]:
        """
        1. Replay historical logs from DB (reconnect resilience)
        2. If task is terminal (done/failed/cancelled): yield historical + return
        3. Otherwise: subscribe to live queue until None sentinel
        """
        task_id_str = str(task_id)

        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AgentTask).where(AgentTask.id == task_id)
            )
            task = result.scalar_one_or_none()
            if task is None:
                raise TaskNotFoundError(task_id_str)

            # Replay historical logs
            log_result = await session.execute(
                select(AgentLog)
                .where(AgentLog.task_id == task_id)
                .order_by(AgentLog.timestamp.asc())
            )
            historical_logs = log_result.scalars().all()

        for log in historical_logs:
            yield AgentLogEvent(
                timestamp=log.timestamp,
                level=log.level,
                message=log.message,
                stepId=log.step_id,
            )

        # Terminal tasks: historical replay is sufficient
        terminal_statuses = {"completed", "failed", "cancelled"}
        if task.status in terminal_statuses:
            return

        # Live queue subscription
        queue = _get_or_create_queue(task_id_str)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25.0)
                    if event is None:
                        break
                    yield event
                    queue.task_done()
                except asyncio.TimeoutError:
                    # SSE keep-alive: an SSE comment line resets proxy idle timers
                    yield AgentLogEvent(
                        timestamp=datetime.now(timezone.utc),
                        level="ping",
                        message="keep-alive",
                        stepId=None,
                    )
        finally:
            # Remove queue to prevent unbounded memory growth across many tasks
            _task_queues.pop(task_id_str, None)

    # ------------------------------------------------------------------
    # Background execution loop
    # ------------------------------------------------------------------

    async def _execute_task(self, task_id: uuid.UUID) -> None:
        """
        Full agent loop:
        1. Set running
        2. LLM planning → JSON step plan
        3. Execute each step with appropriate tool
        4. Synthesis completion
        5. Set completed

        Uses a single AsyncSession for the entire execution to minimise pool
        pressure. expire_on_commit=False means task attributes remain accessible
        after each commit without a re-fetch.
        """
        task_id_str = str(task_id)

        from app.database import AsyncSessionLocal

        # Acquire concurrency slot — released in finally block below.
        # Caps simultaneous executions to prevent DB pool exhaustion.
        await _execution_semaphore.acquire()
        _task_start = time.perf_counter()

        try:
            async with AsyncSessionLocal() as session:
                # Load task once; reuse via SQLAlchemy identity map throughout.
                db_result = await session.execute(
                    select(AgentTask).where(AgentTask.id == task_id)
                )
                task = db_result.scalar_one_or_none()
                if task is None:
                    return

                task.status = "running"
                await self._push_log(task_id_str, "info", "Task execution started", session=session)
                await session.commit()

                # ---- Planning ----
                await self._push_log(task_id_str, "info", "Planning task execution steps...", session=session)
                await session.commit()

                planning_prompt = PLANNING_SYSTEM.replace("{max_steps}", str(settings.AGENT_MAX_STEPS))
                plan_response, _ = await self._llm.complete(
                    system=planning_prompt,
                    messages=[{"role": "user", "content": f"Task: {task.prompt}"}],
                    temperature=0.2,
                    max_tokens=2048,
                )

                steps = self._parse_plan(plan_response, task.max_steps)
                task.steps = steps
                await self._push_log(task_id_str, "info", f"Plan created: {len(steps)} steps", session=session)
                await session.commit()

                # ---- Execute each step ----
                context_outputs: list[str] = []
                total_steps = len(steps)

                for step_num, step in enumerate(steps, start=1):
                    step_id = step["step_id"]
                    step_name = step.get("name", step_id)
                    step_desc = step.get("description", "")
                    tool_name = step.get("tool", "none")
                    tool_input = step.get("input", "")

                    step_label = f"Step {step_num} of {total_steps}: {step_name}"
                    if step_desc:
                        step_label += f" — {step_desc[:80]}"

                    # Mark step running — inline update on the tracked task object
                    now_iso = datetime.now(timezone.utc).isoformat()
                    task.steps = [
                        {**s, "status": "running", "startedAt": now_iso}
                        if s.get("step_id") == step_id else s
                        for s in task.steps
                    ]
                    await self._push_log(task_id_str, "info", step_label, step_id=step_id, session=session)
                    await session.commit()

                    try:
                        result_output = await asyncio.wait_for(
                            self._run_step(tool_name, tool_input, context_outputs),
                            timeout=settings.AGENT_STEP_TIMEOUT,
                        )
                        context_outputs.append(f"[{step_name}]: {result_output}")
                        now_iso = datetime.now(timezone.utc).isoformat()
                        task.steps = [
                            {**s, "status": "completed", "completedAt": now_iso,
                             "output": result_output[:2000]}
                            if s.get("step_id") == step_id else s
                            for s in task.steps
                        ]
                        await self._push_log(
                            task_id_str, "info",
                            f"✓ Step {step_num} of {total_steps} completed: {result_output[:100]}",
                            step_id=step_id, session=session,
                        )
                        await session.commit()

                    except asyncio.TimeoutError:
                        err_msg = f"⚠ Step {step_num} of {total_steps} timed out after {settings.AGENT_STEP_TIMEOUT}s"
                        context_outputs.append(f"[{step_name}]: TIMEOUT")
                        now_iso = datetime.now(timezone.utc).isoformat()
                        task.steps = [
                            {**s, "status": "failed", "completedAt": now_iso, "output": err_msg}
                            if s.get("step_id") == step_id else s
                            for s in task.steps
                        ]
                        await self._push_log(task_id_str, "warn", err_msg, step_id=step_id, session=session)
                        await session.commit()

                    except Exception as step_exc:
                        err_msg = f"⚠ Step {step_num} of {total_steps} failed: {step_exc}"
                        context_outputs.append(f"[{step_name}]: ERROR — {step_exc}")
                        now_iso = datetime.now(timezone.utc).isoformat()
                        task.steps = [
                            {**s, "status": "failed", "completedAt": now_iso, "output": err_msg}
                            if s.get("step_id") == step_id else s
                            for s in task.steps
                        ]
                        await self._push_log(task_id_str, "error", err_msg, step_id=step_id, session=session)
                        await session.commit()

                # ---- Synthesis ----
                await self._push_log(task_id_str, "info", "Synthesizing final answer...", session=session)
                await session.commit()

                # Truncate context to avoid cost explosion on long multi-step tasks
                truncated: list[str] = []
                total_chars = 0
                for output in context_outputs:
                    if total_chars + len(output) > _MAX_SYNTHESIS_CHARS:
                        remaining = _MAX_SYNTHESIS_CHARS - total_chars
                        if remaining > 200:
                            truncated.append(output[:remaining] + "\n[truncated]")
                        break
                    truncated.append(output)
                    total_chars += len(output)
                context_block = "\n\n".join(truncated) or "No step outputs collected."

                synthesis_user = (
                    f"Original task: {task.prompt}\n\n"
                    f"Research outputs:\n{context_block}\n\n"
                    "Please produce a comprehensive, well-structured final answer."
                )
                final_answer, _ = await self._llm.complete(
                    system=SYNTHESIS_SYSTEM,
                    messages=[{"role": "user", "content": synthesis_user}],
                    temperature=0.5,
                    max_tokens=settings.MAX_TOKENS,
                )

                task.status = "completed"
                task.output = final_answer
                duration_ms = int((time.perf_counter() - _task_start) * 1000)
                await self._push_log(
                    task_id_str, "info",
                    f"✅ Task completed in {duration_ms / 1000:.1f}s",
                    session=session,
                )
                await session.commit()
                logger.info("agent_task_completed", task_id=task_id_str, duration_ms=duration_ms)

        except asyncio.CancelledError:
            async with AsyncSessionLocal() as s:
                await s.execute(
                    text("UPDATE agent_tasks SET status='cancelled', updated_at=NOW() WHERE id=:id"),
                    {"id": task_id},
                )
                await s.commit()
            await self._push_log(task_id_str, "warn", "Task was cancelled")
            logger.info("agent_task_cancelled", task_id=task_id_str)

        except Exception as exc:
            async with AsyncSessionLocal() as s:
                await s.execute(
                    text("UPDATE agent_tasks SET status='failed', updated_at=NOW() WHERE id=:id"),
                    {"id": task_id},
                )
                await s.commit()
            await self._push_log(task_id_str, "error", f"Task failed: {exc}")
            logger.error("agent_task_failed", task_id=task_id_str, error=str(exc))

        finally:
            _execution_semaphore.release()
            # Signal SSE stream end
            q = _task_queues.get(task_id_str)
            if q:
                await q.put(None)
            _task_asyncio_handles.pop(task_id_str, None)

    async def _run_step(
        self, tool_name: str, tool_input: str, prior_context: list[str]
    ) -> str:
        """Execute one step: dispatch to tool or LLM-only reasoning."""
        if tool_name == "none" or tool_name not in self._tools:
            # LLM reasoning step — synthesize from context so far
            context = "\n".join(prior_context[-3:]) if prior_context else "No prior context."
            response, _ = await self._llm.complete(
                system="You are a helpful research assistant. Use the provided context to complete the step.",
                messages=[
                    {
                        "role": "user",
                        "content": f"Context from prior steps:\n{context}\n\nComplete this step: {tool_input or 'Reason about the task so far.'}",
                    }
                ],
                temperature=0.5,
                max_tokens=1024,
            )
            return response

        tool: BaseTool = self._tools[tool_name]
        result: ToolResult = await tool.execute(tool_input)
        if result.success:
            return result.output
        return f"Tool error: {result.error}"

    async def _push_log(
        self,
        task_id_str: str,
        level: str,
        message: str,
        step_id: str | None = None,
        *,
        session: "AsyncSession | None" = None,
    ) -> None:
        """
        Persist AgentLog and push to SSE queue.

        When `session` is provided, adds the log to the session without committing —
        the caller is responsible for committing at the appropriate boundary.
        When `session` is None, opens its own short-lived session (used by cancel,
        error handlers, and other paths outside _execute_task).
        """
        now = datetime.now(timezone.utc)
        event = AgentLogEvent(timestamp=now, level=level, message=message, stepId=step_id)

        if session is not None:
            session.add(AgentLog(
                id=uuid.uuid4(),
                task_id=uuid.UUID(task_id_str),
                timestamp=now,
                level=level,
                message=message,
                step_id=step_id,
            ))
        else:
            from app.database import AsyncSessionLocal
            try:
                async with AsyncSessionLocal() as standalone:
                    standalone.add(AgentLog(
                        id=uuid.uuid4(),
                        task_id=uuid.UUID(task_id_str),
                        timestamp=now,
                        level=level,
                        message=message,
                        step_id=step_id,
                    ))
                    await standalone.commit()
            except Exception as e:
                logger.warning("log_persist_failed", error=str(e))

        queue = _task_queues.get(task_id_str)
        if queue:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("sse_queue_full", task_id=task_id_str)

    async def _update_step_status(
        self,
        task_id: uuid.UUID,
        step_id: str,
        status: str,
        output: str | None = None,
    ) -> None:
        """Update the status + output of a step inside the JSONB steps array."""
        now = datetime.now(timezone.utc).isoformat()
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AgentTask).where(AgentTask.id == task_id)
            )
            task = result.scalar_one_or_none()
            if task is None:
                return
            updated_steps = []
            for step in task.steps:
                if step.get("step_id") == step_id:
                    step = dict(step)
                    step["status"] = status
                    if status == "running":
                        step["startedAt"] = now
                    elif status in ("completed", "failed"):
                        step["completedAt"] = now
                    if output is not None:
                        step["output"] = output
                updated_steps.append(step)
            task.steps = updated_steps
            await session.commit()

    def _parse_plan(self, plan_text: str, max_steps: int) -> list[dict]:
        """Parse LLM planning response into a list of step dicts."""
        clean = plan_text.strip().strip("```json").strip("```").strip()
        try:
            steps = json.loads(clean)
            if not isinstance(steps, list):
                raise ValueError("Plan must be a JSON array")
        except (json.JSONDecodeError, ValueError):
            # Fallback: single generic step
            logger.warning("plan_parse_failed", raw=plan_text[:200])
            steps = [
                {
                    "step_id": "s1",
                    "name": "Execute task",
                    "description": "Complete the task using available knowledge",
                    "tool": "none",
                    "input": "",
                }
            ]

        # Normalise and cap
        normalised = []
        for i, step in enumerate(steps[:max_steps]):
            normalised.append(
                {
                    "step_id": step.get("step_id", f"s{i+1}"),
                    "name": step.get("name", f"Step {i+1}"),
                    "description": step.get("description", ""),
                    "tool": step.get("tool", "none"),
                    "input": step.get("input", ""),
                    "status": "pending",
                    "startedAt": None,
                    "completedAt": None,
                    "output": None,
                }
            )
        return normalised

    @staticmethod
    def _to_detail(task: AgentTask) -> AgentTaskDetail:
        steps = []
        for s in task.steps:
            steps.append(
                AgentStep(
                    id=s.get("step_id", ""),
                    name=s.get("name", ""),
                    description=s.get("description", ""),
                    status=s.get("status", "pending"),
                    startedAt=s.get("startedAt"),
                    completedAt=s.get("completedAt"),
                    output=s.get("output"),
                )
            )
        return AgentTaskDetail(
            id=task.id,
            prompt=task.prompt,
            status=task.status,
            steps=steps,
            output=task.output,
            createdAt=task.created_at,
        )
