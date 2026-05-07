import json
from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # App
    APP_NAME: str = "Kortex"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # Database
    DATABASE_URL: str = Field(..., description="asyncpg DSN: postgresql+asyncpg://user:pass@host/db")
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30

    # OpenAI
    OPENAI_API_KEY: str = Field(..., description="OpenAI API key")
    OPENAI_MODEL: str = "gpt-4o"
    MAX_TOKENS: int = 4096

    # Ollama (fallback)
    OLLAMA_ENABLED: bool = False
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"

    # Embeddings
    EMBEDDING_BACKEND: str = "sentence_transformers"  # "sentence_transformers" | "anthropic" (voyage-3)
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSIONS: int = 384  # all-MiniLM-L6-v2 produces 384 dims; change if switching models

    # RAG
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    MAX_CITATIONS: int = 5
    SIMILARITY_THRESHOLD: float = 0.3  # lower threshold to return results even for small DBs

    # File Storage
    STORAGE_BACKEND: str = "local"  # "local" | "s3"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 50

    # S3
    S3_BUCKET: str = ""
    S3_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""

    # Agent
    AGENT_MAX_STEPS: int = 10
    AGENT_STEP_TIMEOUT: int = 60

    # Analytics / Pricing (gpt-4o rates)
    COST_PER_1K_INPUT_TOKENS: float = 0.005
    COST_PER_1K_OUTPUT_TOKENS: float = 0.015

    # Security
    SECRET_KEY: str = Field(default="", description="Secret key for JWT signing (set in production)")
    API_KEY_PREFIX: str = "kx_"
    API_KEY_REQUIRED: bool = False  # set True in production to enforce key auth on all /api/* routes

    # Optional
    SERPAPI_KEY: str = ""

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [origin.strip() for origin in v.split(",")]
        return v


@lru_cache()
def get_settings() -> Settings:
    return Settings()
