import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.schemas.analytics import AnalyticsLogCreate

logger = structlog.get_logger()

MODULE_MAP = {
    "/api/rag": "rag",
    "/api/agents": "agent",
    "/api/chat": "chat",
    "/api/analytics": "analytics",
    "/api/settings": "settings",
}


class AnalyticsMiddleware(BaseHTTPMiddleware):
    """
    Intercepts every request to record timing, token usage, and cost.
    Services attach token data to request.state; we read it after the response.
    Uses a fire-and-forget asyncio.create_task() to avoid blocking the response.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.monotonic()
        request_id = str(uuid.uuid4())

        # Make request_id available to services for structured logging
        request.state.request_id = request_id
        request.state.tokens_input = 0
        request.state.tokens_output = 0
        request.state.model_used = None
        request.state.cost_usd = 0.0

        try:
            response = await call_next(request)
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            self._schedule_record(request, request_id, latency_ms, 500)
            raise

        latency_ms = int((time.monotonic() - start) * 1000)
        self._schedule_record(request, request_id, latency_ms, response.status_code)

        response.headers["X-Request-Id"] = request_id
        return response

    def _schedule_record(
        self,
        request: Request,
        request_id: str,
        latency_ms: int,
        status_code: int,
    ) -> None:
        """Fire-and-forget DB insert so we never slow down the HTTP response."""
        module = next(
            (m for prefix, m in MODULE_MAP.items() if request.url.path.startswith(prefix)),
            None,
        )
        log = AnalyticsLogCreate(
            request_id=request_id,
            endpoint=request.url.path,
            module=module,
            model_used=getattr(request.state, "model_used", None),
            tokens_input=getattr(request.state, "tokens_input", 0),
            tokens_output=getattr(request.state, "tokens_output", 0),
            latency_ms=latency_ms,
            cost_usd=getattr(request.state, "cost_usd", 0.0),
            status_code=status_code,
        )
        import asyncio

        asyncio.create_task(self._persist(log))

    @staticmethod
    async def _persist(log: AnalyticsLogCreate) -> None:
        from app.database import AsyncSessionLocal
        from app.services.analytics_service import AnalyticsService

        try:
            async with AsyncSessionLocal() as session:
                svc = AnalyticsService(session)
                await svc.record(log)
                await session.commit()
        except Exception as e:
            logger.warning("analytics_persist_failed", error=str(e))
