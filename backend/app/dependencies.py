from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.services.agent_service import AgentService
from app.services.analytics_service import AnalyticsService
from app.services.chat_service import ChatService
from app.services.embedding_service import EmbeddingBackend
from app.services.llm_service import LLMService
from app.services.rag_service import RAGService
from app.services.router_service import RouterService
from app.services.storage_service import StorageBackend

settings = get_settings()


def get_llm_service(request: Request) -> LLMService:
    """Returns the startup singleton — shares the HTTPX connection pool across requests."""
    return request.app.state.llm_service


def get_storage(request: Request) -> StorageBackend:
    """Returns the startup singleton — no mkdir overhead per request."""
    return request.app.state.storage_service


def get_embedding_service(request: Request) -> EmbeddingBackend:
    """Retrieved from app.state where it was pre-loaded at startup."""
    return request.app.state.embedding_service


async def get_rag_service(
    db: AsyncSession = Depends(get_db),
    embedding_svc: EmbeddingBackend = Depends(get_embedding_service),
    llm: LLMService = Depends(get_llm_service),
    storage: StorageBackend = Depends(get_storage),
) -> RAGService:
    return RAGService(db, embedding_svc, storage, llm)


def get_agent_service() -> AgentService:
    """
    Returns the module-level singleton agent service that was initialised
    during app startup (in main.py lifespan). The singleton is necessary
    because AgentService owns the in-memory SSE queues.
    """
    from app.services.agent_service import get_global_agent_service

    svc = get_global_agent_service()
    if svc is None:
        raise RuntimeError("AgentService not initialised. Check app startup.")
    return svc


async def get_chat_service(
    db: AsyncSession = Depends(get_db),
    llm: LLMService = Depends(get_llm_service),
    embedding_svc: EmbeddingBackend = Depends(get_embedding_service),
    storage: StorageBackend = Depends(get_storage),
) -> ChatService:
    rag = RAGService(db, embedding_svc, storage, llm)
    router_svc = RouterService(llm)
    return ChatService(db, llm, rag, router_svc)


async def get_analytics_service(
    db: AsyncSession = Depends(get_db),
) -> AnalyticsService:
    return AnalyticsService(db)
