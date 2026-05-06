from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings

settings = get_settings()


def add_cors_middleware(app):
    """Register CORS middleware with settings from config."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id", "Content-Type"],
    )
