import uuid

import structlog
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from app.dependencies import get_chat_service
from app.exceptions import LLMError
from app.main import limiter
from app.schemas.chat import (
    ChatDeleteRequest,
    ChatDeleteResponse,
    ChatHistoryResponse,
    ChatSendRequest,
    ConversationsResponse,
)
from app.services.chat_service import ChatService

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = structlog.get_logger()


@router.post("/send")
@limiter.limit("60/minute")
async def send_message(
    request: Request,
    req: ChatSendRequest,
    svc: ChatService = Depends(get_chat_service),
):
    """
    Send a message. Streams the response via SSE.
    Format per event: data: {id, role, delta, content, mode, citations?, metadata}\\n\\n
    Each event carries the new chunk in `delta` and the full accumulated text in `content`.
    Final event includes done=true and full metadata.
    """
    try:
        stream = await svc.send_message(
            message=req.message,
            mode=req.mode,
            conversation_id=req.conversationId,
            request=request,
        )

        async def event_gen():
            async for chunk in stream:
                yield chunk

        return StreamingResponse(
            event_gen(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )
    except Exception as exc:
        logger.error("chat_send_failed", error=str(exc))
        raise LLMError(f"Chat send failed: {exc}")


@router.get("/history", response_model=ChatHistoryResponse)
async def get_history(
    conversation_id: uuid.UUID = Query(..., description="Conversation to fetch"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    svc: ChatService = Depends(get_chat_service),
):
    """Return paginated message history for a conversation."""
    return await svc.get_history(conversation_id, limit, offset)


@router.get("/conversations/{conversation_id}/messages", response_model=ChatHistoryResponse)
async def get_messages(
    conversation_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    svc: ChatService = Depends(get_chat_service),
):
    """Return paginated message history for a conversation."""
    return await svc.get_history(conversation_id, limit, offset)


@router.delete("/history", response_model=ChatDeleteResponse)
async def delete_history(
    req: ChatDeleteRequest,
    svc: ChatService = Depends(get_chat_service),
):
    """Clear messages for a conversation (or all conversations if no ID)."""
    success = await svc.delete_history(req.conversationId)
    return ChatDeleteResponse(success=success)


@router.get("/conversations", response_model=ConversationsResponse)
async def list_conversations(svc: ChatService = Depends(get_chat_service)):
    """Return all conversations for the default user."""
    return await svc.list_conversations(user_id="default")
