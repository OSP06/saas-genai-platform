import asyncio
import json
import time
import uuid
from datetime import datetime
from typing import AsyncIterator

import structlog
from sqlalchemy import select, func, delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.exceptions import ConversationNotFoundError
from app.models.chat import ChatConversation, ChatMessage
from app.schemas.analytics import AnalyticsLogCreate
from app.schemas.chat import (
    ChatHistoryResponse,
    ChatMessageResponse,
    ConversationSummary,
    ConversationsResponse,
)
from app.schemas.rag import Citation
from app.services.llm_service import LLMService
from app.services.rag_service import RAGService
from app.services.router_service import RouterService

logger = structlog.get_logger()


class ChatService:
    def __init__(
        self,
        db: AsyncSession,
        llm: LLMService,
        rag: RAGService,
        router: RouterService,
    ):
        self._db = db
        self._llm = llm
        self._rag = rag
        self._router = router

    async def send_message(
        self,
        message: str,
        mode: str,
        conversation_id: uuid.UUID | None,
        user_id: str = "default",
        request: Request | None = None,
    ) -> AsyncIterator[str]:
        """
        Main orchestrator. Yields SSE-formatted strings.
        Each yield: "data: {json}\\n\\n"
        """
        start_time = time.perf_counter()

        # Resolve or create conversation
        conversation = await self._resolve_conversation(conversation_id, message, user_id)

        # Persist user message
        user_msg = ChatMessage(
            id=uuid.uuid4(),
            conversation_id=conversation.id,
            role="user",
            content=message,
            mode=mode,
            metadata_={},
        )
        self._db.add(user_msg)
        await self._db.flush()

        # Determine actual routing mode
        if mode == "auto":
            classification = await self._router.classify(message)
            actual_mode = classification["route"]
        else:
            actual_mode = mode

        assistant_id = uuid.uuid4()
        accumulated_content = ""
        citations: list[Citation] = []
        usage_info: dict = {}

        async def _stream() -> AsyncIterator[str]:
            nonlocal accumulated_content, citations, usage_info

            # Feature 5: initial "thinking" signal before any processing
            yield _event({"type": "status", "message": "Thinking..."})

            if actual_mode == "rag":
                yield _event({"type": "status", "message": "Searching knowledge base..."})
                yield _event({"type": "delta", "id": str(assistant_id), "role": "assistant",
                              "delta": "", "content": "", "mode": actual_mode,
                              "citations": None, "metadata": {}})

                rag_usage = None
                try:
                    answer, rag_citations, rag_usage = await self._rag.query(message, None, 5)
                except Exception as exc:
                    logger.error("rag_query_error", error=str(exc))
                    answer = "An error occurred while searching the knowledge base."
                    rag_citations = []
                citations = rag_citations
                accumulated_content = answer

                if rag_usage:
                    request_id = getattr(request.state, "request_id", str(uuid.uuid4())) if request else str(uuid.uuid4())
                    _fire_chat_analytics(
                        request_id=request_id,
                        module="rag",
                        model=rag_usage.model,
                        tokens_input=rag_usage.input_tokens,
                        tokens_output=rag_usage.output_tokens,
                        cost_usd=self._llm.build_cost(rag_usage),
                        latency_ms=int((time.perf_counter() - start_time) * 1000),
                    )
                    usage_info = {
                        "model": rag_usage.model,
                        "tokens": rag_usage.input_tokens + rag_usage.output_tokens,
                        "latency_ms": int((time.perf_counter() - start_time) * 1000),
                        "fallback": rag_usage.fallback,
                    }

                # Single event with the full RAG answer — true streaming would
                # require the RAG LLM call itself to stream, which is a future enhancement
                yield _event({
                    "type": "delta",
                    "id": str(assistant_id),
                    "role": "assistant",
                    "delta": answer,
                    "content": answer,
                    "mode": actual_mode,
                    "citations": None,
                    "metadata": {},
                })

            elif actual_mode == "agent":
                from app.services.agent_service import get_global_agent_service

                agent_svc = get_global_agent_service()
                if agent_svc is None:
                    # Fallback to LLM if agent service not initialized
                    async for chunk, usage in self._llm.stream(
                        system="You are a helpful AI assistant.",
                        messages=[{"role": "user", "content": message}],
                    ):
                        if chunk:
                            accumulated_content += chunk
                            yield _event({
                                "type": "delta",
                                "id": str(assistant_id), "role": "assistant",
                                "delta": chunk, "content": accumulated_content, "mode": "llm",
                                "citations": None, "metadata": {},
                            })
                        elif usage:
                            usage_info = {
                                "model": usage.model,
                                "tokens": usage.input_tokens + usage.output_tokens,
                                "latency_ms": int((time.perf_counter() - start_time) * 1000),
                                "fallback": usage.fallback,
                            }
                            if request:
                                request.state.tokens_input = usage.input_tokens
                                request.state.tokens_output = usage.output_tokens
                                request.state.model_used = usage.model
                                request.state.cost_usd = self._llm.build_cost(usage)
                else:
                    yield _event({"type": "status", "message": "Planning steps..."})
                    task = await agent_svc.create_task(message, None, 5)
                    msg = f"Running agent task `{task.id}`... check /api/agents/tasks/{task.id}/logs for live progress."
                    accumulated_content = msg
                    yield _event({
                        "type": "delta",
                        "id": str(assistant_id), "role": "assistant",
                        "delta": msg, "content": msg,
                        "mode": actual_mode, "citations": None, "metadata": {},
                    })
                    usage_info = {
                        "model": "agent",
                        "tokens": 0,
                        "latency_ms": int((time.perf_counter() - start_time) * 1000),
                        "fallback": False,
                    }

            else:  # llm
                final_usage = None
                try:
                    async for chunk, usage in self._llm.stream(
                        system="You are a helpful, concise AI assistant.",
                        messages=[{"role": "user", "content": message}],
                    ):
                        if chunk:
                            accumulated_content += chunk
                            # Yield delta (new chunk) AND content (full accumulated) so
                            # clients can use whichever they prefer
                            yield _event({
                                "type": "delta",
                                "id": str(assistant_id),
                                "role": "assistant",
                                "delta": chunk,
                                "content": accumulated_content,
                                "mode": actual_mode,
                                "citations": None,
                                "metadata": {},
                            })
                        elif usage:
                            final_usage = usage
                            usage_info = {
                                "model": usage.model,
                                "tokens": usage.input_tokens + usage.output_tokens,
                                "latency_ms": int((time.perf_counter() - start_time) * 1000),
                                "fallback": usage.fallback,
                            }
                    # The analytics middleware reads request.state BEFORE the SSE generator
                    # runs, so token counts in middleware are always 0 for streaming responses.
                    # Fire a corrective analytics record here after the stream completes.
                    if final_usage:
                        request_id = getattr(request.state, "request_id", str(uuid.uuid4())) if request else str(uuid.uuid4())
                        _fire_chat_analytics(
                            request_id=request_id,
                            model=final_usage.model,
                            tokens_input=final_usage.input_tokens,
                            tokens_output=final_usage.output_tokens,
                            cost_usd=self._llm.build_cost(final_usage),
                            latency_ms=int((time.perf_counter() - start_time) * 1000),
                        )
                except Exception as exc:
                    logger.error("chat_llm_stream_error", error=str(exc))
                    if not accumulated_content:
                        accumulated_content = "An error occurred while generating the response."

            # Final event with full metadata + citations
            if not usage_info:
                usage_info = {
                    "model": "rag",
                    "tokens": 0,
                    "latency_ms": int((time.perf_counter() - start_time) * 1000),
                    "fallback": False,
                }

            citation_dicts = [c.model_dump() for c in citations] if citations else None
            sources = (
                [{"snippet": _trim_to_sentence(c["content"]), "score": c["relevanceScore"],
                  "document": c.get("documentName", "")}
                 for c in citation_dicts]
                if citation_dicts else None
            )
            yield _event({
                "type": "done",
                "id": str(assistant_id),
                "role": "assistant",
                "content": accumulated_content,
                "mode": actual_mode,
                "citations": citation_dicts,
                "sources": sources,
                "metadata": usage_info,
                "done": True,
            })

            # Persist assistant message
            from app.database import AsyncSessionLocal
            async with AsyncSessionLocal() as persist_session:
                asst_msg = ChatMessage(
                    id=assistant_id,
                    conversation_id=conversation.id,
                    role="assistant",
                    content=accumulated_content,
                    mode=actual_mode,
                    citations=[c.model_dump() for c in citations] if citations else None,
                    metadata_=usage_info,
                )
                persist_session.add(asst_msg)
                # Update conversation title from first message
                await persist_session.execute(
                    text("UPDATE chat_conversations SET updated_at=NOW() WHERE id=:id"),
                    {"id": conversation.id},
                )
                await persist_session.commit()

        return _stream()

    async def _resolve_conversation(
        self, conversation_id: uuid.UUID | None, first_message: str, user_id: str
    ) -> ChatConversation:
        if conversation_id:
            result = await self._db.execute(
                select(ChatConversation).where(ChatConversation.id == conversation_id)
            )
            conv = result.scalar_one_or_none()
            if conv is None:
                raise ConversationNotFoundError(str(conversation_id))
            return conv

        # Create new conversation with title from first 60 chars of message
        title = first_message[:60].strip() + ("..." if len(first_message) > 60 else "")
        conv = ChatConversation(
            id=uuid.uuid4(),
            title=title,
            user_id=user_id,
        )
        self._db.add(conv)
        await self._db.flush()
        return conv

    async def get_history(
        self,
        conversation_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> ChatHistoryResponse:
        result = await self._db.execute(
            select(ChatConversation).where(ChatConversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv is None:
            raise ConversationNotFoundError(str(conversation_id))

        count_result = await self._db.execute(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.conversation_id == conversation_id
            )
        )
        total = count_result.scalar() or 0

        msg_result = await self._db.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.asc())
            .limit(limit)
            .offset(offset)
        )
        messages = msg_result.scalars().all()

        msg_responses = []
        for m in messages:
            citation_objs = None
            if m.citations:
                try:
                    citation_objs = [Citation(**c) for c in m.citations]
                except Exception:
                    citation_objs = None
            msg_responses.append(
                ChatMessageResponse(
                    id=m.id,
                    role=m.role,
                    content=m.content,
                    mode=m.mode,
                    citations=citation_objs,
                    metadata=m.metadata_ or {},
                    timestamp=m.created_at,
                )
            )

        return ChatHistoryResponse(
            messages=msg_responses,
            conversationId=conversation_id,
            totalCount=int(total),
        )

    async def delete_history(self, conversation_id: uuid.UUID | None) -> bool:
        if conversation_id:
            await self._db.execute(
                delete(ChatMessage).where(ChatMessage.conversation_id == conversation_id)
            )
        else:
            await self._db.execute(delete(ChatMessage))
        await self._db.flush()
        return True

    async def list_conversations(self, user_id: str = "default") -> ConversationsResponse:
        from sqlalchemy import text

        result = await self._db.execute(
            text(
                """
                SELECT c.id, c.title, c.created_at, c.updated_at,
                       COUNT(m.id) AS message_count
                FROM chat_conversations c
                LEFT JOIN chat_messages m ON m.conversation_id = c.id
                WHERE c.user_id = :user_id
                GROUP BY c.id
                ORDER BY c.updated_at DESC
                """
            ),
            {"user_id": user_id},
        )
        rows = result.mappings().all()
        conversations = [
            ConversationSummary(
                id=row["id"],
                title=row["title"],
                messageCount=int(row["message_count"]),
                createdAt=row["created_at"],
                updatedAt=row["updated_at"],
            )
            for row in rows
        ]
        return ConversationsResponse(conversations=conversations)


def _event(data: dict) -> str:
    """Format a dict as a Server-Sent Events data line."""
    return f"data: {json.dumps(data, default=str)}\n\n"


def _trim_to_sentence(text: str, max_chars: int = 250) -> str:
    """Trim text to a sentence boundary within max_chars for clean snippets."""
    if len(text) <= max_chars:
        return text
    window = text[:max_chars]
    for i in range(len(window) - 1, -1, -1):
        if window[i] in ".?!\n":
            return window[: i + 1].strip()
    return window.strip()


def _fire_chat_analytics(
    *,
    request_id: str,
    model: str,
    tokens_input: int,
    tokens_output: int,
    cost_usd: float,
    latency_ms: int,
    module: str = "chat",
) -> None:
    """
    Fire a corrective analytics record from inside the SSE generator.
    The middleware's record for this request will already exist with 0 tokens,
    so this adds a second accurate row attributed to the correct module.
    """
    from app.middleware.analytics import AnalyticsMiddleware

    log = AnalyticsLogCreate(
        request_id=request_id,
        endpoint="/api/chat/send",
        module=module,
        model_used=model,
        tokens_input=tokens_input,
        tokens_output=tokens_output,
        latency_ms=latency_ms,
        cost_usd=cost_usd,
        status_code=200,
    )
    asyncio.create_task(AnalyticsMiddleware._persist(log))
