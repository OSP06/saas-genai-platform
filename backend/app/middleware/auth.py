import hashlib

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

_EXEMPT_PREFIXES = ("/health", "/docs", "/redoc", "/openapi.json")


class APIKeyMiddleware(BaseHTTPMiddleware):
    """
    When API_KEY_REQUIRED=True, all /api/* requests must carry a valid
    X-API-Key header matching a non-revoked key in the api_keys table.
    Paths starting with /health, /docs, /redoc, /openapi.json are always exempt.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        if not settings.API_KEY_REQUIRED:
            return await call_next(request)

        path = request.url.path
        if any(path.startswith(p) for p in _EXEMPT_PREFIXES):
            return await call_next(request)

        if not path.startswith("/api/"):
            return await call_next(request)

        raw_key = request.headers.get("X-API-Key", "")
        if not raw_key:
            return JSONResponse(
                status_code=401,
                content={"error": True, "message": "Missing X-API-Key header"},
            )

        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

        try:
            from app.database import AsyncSessionLocal
            from sqlalchemy import select
            from app.models.settings import ApiKey

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(ApiKey).where(
                        ApiKey.key_hash == key_hash,
                        ApiKey.revoked_at.is_(None),
                    )
                )
                key_row = result.scalar_one_or_none()
        except Exception as exc:
            logger.error("api_key_lookup_failed", error=str(exc))
            return JSONResponse(
                status_code=503,
                content={"error": True, "message": "Auth service temporarily unavailable"},
            )

        if key_row is None:
            logger.warning("invalid_api_key_attempt", path=path)
            return JSONResponse(
                status_code=403,
                content={"error": True, "message": "Invalid or revoked API key"},
            )

        return await call_next(request)
