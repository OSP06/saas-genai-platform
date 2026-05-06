import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.config import get_settings
from app.database import engine, AsyncSessionLocal
from app.exceptions import KortexException, kortex_exception_handler, generic_exception_handler
from app.middleware.analytics import AnalyticsMiddleware
from app.middleware.auth import APIKeyMiddleware
from app.middleware.cors import add_cors_middleware
from app.routers import rag, agents, chat, analytics
from app.routers import settings as settings_router
from app.services.embedding_service import get_embedding_service
from app.services.agent_service import AgentService, set_global_agent_service
from app.services.llm_service import LLMService
from app.services.storage_service import get_storage_service
from app.tools.web_search import WebSearchTool
from app.tools.text_analyzer import TextAnalyzerTool
from app.tools.rag_lookup import RAGLookupTool
from sqlalchemy import text

# Module-level limiter so routers can import it
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

settings = get_settings()
logger = structlog.get_logger()

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer() if settings.DEBUG else structlog.processors.JSONRenderer(),
    ]
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    logger.info("kortex_starting", version=settings.APP_VERSION, debug=settings.DEBUG)

    # Reset documents stuck in 'processing' from a prior server crash.
    # BackgroundTasks have no restart recovery, so these would hang forever otherwise.
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    "UPDATE documents SET status='error', "
                    "error_msg='Server restarted during ingestion', "
                    "updated_at=NOW() WHERE status='processing'"
                )
            )
            await session.commit()
            if result.rowcount:
                logger.warning("ingestion_recovery", reset_count=result.rowcount)
    except Exception as e:
        logger.warning("ingestion_recovery_failed", error=str(e))

    # Pre-load embedding model (avoids cold start on first request)
    embedding_svc = get_embedding_service()
    if hasattr(embedding_svc, "async_load"):
        await embedding_svc.async_load()
    app.state.embedding_service = embedding_svc
    logger.info("embedding_service_ready", backend=settings.EMBEDDING_BACKEND)

    # Initialise LLM service as singleton — shared HTTP client + TLS session reuse
    llm = LLMService()
    app.state.llm_service = llm

    # Storage service (needed by RAGLookupTool)
    storage_svc = get_storage_service()

    # Build tool registry — RAGLookupTool creates its own DB session per execution
    tools = {
        "web_search": WebSearchTool(),
        "text_analyzer": TextAnalyzerTool(llm),
        "rag_lookup": RAGLookupTool(llm=llm, embedding_svc=embedding_svc, storage=storage_svc),
    }

    # Create and register global AgentService singleton
    agent_svc = AgentService(llm=llm, tools=tools)
    set_global_agent_service(agent_svc)
    app.state.agent_service = agent_svc
    logger.info("agent_service_ready", tools=list(tools.keys()))

    logger.info("kortex_ready", host="0.0.0.0", port=8000)
    yield

    # Shutdown: mark in-flight agent tasks as failed so they don't stay "running" forever
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text(
                    "UPDATE agent_tasks SET status='failed', updated_at=NOW() "
                    "WHERE status IN ('running', 'pending')"
                )
            )
            await session.commit()
    except Exception as e:
        logger.warning("shutdown_task_cleanup_failed", error=str(e))

    # Dispose DB connection pool
    await engine.dispose()
    logger.info("kortex_shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Kortex API",
        version=settings.APP_VERSION,
        description="Production GenAI SaaS Platform Backend",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # Rate limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    # Middleware registration order (Starlette executes in reverse):
    # execution order: CORS → APIKeyMiddleware → AnalyticsMiddleware → route
    add_cors_middleware(app)
    app.add_middleware(AnalyticsMiddleware)
    app.add_middleware(APIKeyMiddleware)

    # Exception handlers
    app.add_exception_handler(KortexException, kortex_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)

    # Routers
    app.include_router(rag.router)
    app.include_router(agents.router)
    app.include_router(chat.router)
    app.include_router(analytics.router)
    app.include_router(settings_router.router)

    @app.get("/health", tags=["system"])
    async def health(request: Request):
        checks: dict[str, str] = {}

        # Database reachability
        try:
            async with AsyncSessionLocal() as s:
                await s.execute(text("SELECT 1"))
            checks["db"] = "ok"
        except Exception as e:
            checks["db"] = f"error: {e}"

        # Embedding model loaded
        emb = request.app.state.embedding_service
        model_loaded = getattr(emb, "_model", True) is not None
        checks["embedding"] = "ok" if model_loaded else "not_loaded"

        # Agent service initialized
        checks["agent"] = "ok" if request.app.state.agent_service is not None else "not_initialized"

        overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
        return {
            "status": overall,
            "checks": checks,
            "version": settings.APP_VERSION,
            "app": settings.APP_NAME,
        }

    return app


app = create_app()
