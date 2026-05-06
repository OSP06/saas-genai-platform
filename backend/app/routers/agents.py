import json
import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.dependencies import get_agent_service
from app.main import limiter
from app.schemas.agent import (
    AgentCancelResponse,
    AgentExecuteRequest,
    AgentExecuteResponse,
    AgentTaskDetail,
    AgentTasksListResponse,
)
from app.services.agent_service import AgentService

router = APIRouter(prefix="/api/agents", tags=["agents"])
logger = structlog.get_logger()


@router.post("/execute", response_model=AgentExecuteResponse)
@limiter.limit("10/minute")
async def execute_agent(
    request: Request,
    req: AgentExecuteRequest,
    svc: AgentService = Depends(get_agent_service),
):
    """Start a new multi-step agent task. Execution runs in the background."""
    try:
        task = await svc.create_task(req.task, req.tools, req.maxSteps)
        return AgentExecuteResponse(
            taskId=task.id,
            status=task.status,
            createdAt=task.created_at,
        )
    except Exception as exc:
        logger.error("agent_execute_failed", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/tasks", response_model=AgentTasksListResponse)
async def list_tasks(svc: AgentService = Depends(get_agent_service)):
    """Return the 50 most recent agent tasks."""
    try:
        tasks = await svc.list_tasks()
        return AgentTasksListResponse(tasks=tasks)
    except Exception as exc:
        logger.error("list_tasks_failed", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/tasks/{task_id}", response_model=AgentTaskDetail)
async def get_task(
    task_id: uuid.UUID,
    svc: AgentService = Depends(get_agent_service),
):
    """Return full details for one agent task."""
    return await svc.get_task(task_id)


@router.get("/tasks/{task_id}/logs")
async def stream_task_logs(
    task_id: uuid.UUID,
    svc: AgentService = Depends(get_agent_service),
):
    """
    SSE stream of task logs.
    Replays historical logs first, then streams live events.
    Format per event: data: {timestamp, level, message, stepId?}\\n\\n
    """

    async def log_stream():
        try:
            async for event in svc.stream_logs(task_id):
                if event.level == "ping":
                    # SSE comment — resets proxy/LB idle timers without sending data
                    yield ": keep-alive\n\n"
                    continue
                _type_map = {"info": "status", "warn": "warning", "error": "error"}
                data = json.dumps(
                    {
                        "type": _type_map.get(event.level, event.level),
                        "timestamp": event.timestamp.isoformat(),
                        "level": event.level,
                        "message": event.message,
                        "stepId": event.stepId,
                    }
                )
                yield f"data: {data}\n\n"
        except Exception as exc:
            err = json.dumps({"type": "error", "level": "error", "message": str(exc)})
            yield f"data: {err}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'done': True})}\n\n"

    return StreamingResponse(
        log_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/tasks/{task_id}/cancel", response_model=AgentCancelResponse)
async def cancel_task(
    task_id: uuid.UUID,
    svc: AgentService = Depends(get_agent_service),
):
    """Cancel a running agent task."""
    success = await svc.cancel_task(task_id)
    return AgentCancelResponse(success=success)
