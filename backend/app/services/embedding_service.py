import asyncio
from typing import Protocol, runtime_checkable

import httpx
import structlog

from app.config import get_settings
from app.exceptions import EmbeddingError

logger = structlog.get_logger()
settings = get_settings()


@runtime_checkable
class EmbeddingBackend(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Returns one float vector per input text, all of length EMBEDDING_DIMENSIONS."""
        ...


class SentenceTransformerBackend:
    """
    Loads a SentenceTransformers model once at startup (in a thread pool so the
    event loop is not blocked). Pads or truncates all output vectors to
    EMBEDDING_DIMENSIONS so they match the VECTOR(384) pgvector column.
    """

    def __init__(self, model_name: str, target_dim: int):
        self._model_name = model_name
        self._target_dim = target_dim
        self._model = None

    async def async_load(self) -> None:
        loop = asyncio.get_running_loop()
        try:
            self._model = await loop.run_in_executor(
                None, self._load_model
            )
            logger.info("embedding_model_loaded", model=self._model_name)
        except Exception as e:
            raise EmbeddingError(f"Failed to load embedding model '{self._model_name}': {e}") from e

    def _load_model(self):
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer(self._model_name)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if self._model is None:
            raise EmbeddingError("Embedding model not loaded. Call async_load() first.")
        loop = asyncio.get_running_loop()
        try:
            raw_vectors = await loop.run_in_executor(
                None, lambda: self._model.encode(texts, normalize_embeddings=True).tolist()
            )
        except Exception as e:
            raise EmbeddingError(f"Embedding inference failed: {e}") from e
        return [self._pad_or_truncate(vec) for vec in raw_vectors]

    def _pad_or_truncate(self, vec: list[float]) -> list[float]:
        if len(vec) >= self._target_dim:
            return vec[: self._target_dim]
        return vec + [0.0] * (self._target_dim - len(vec))


class AnthropicEmbeddingBackend:
    """
    Uses the Anthropic Voyage embeddings API (voyage-3).
    Voyage-3 outputs 1024-dimensional vectors; we pad to EMBEDDING_DIMENSIONS.
    """

    def __init__(self, api_key: str, target_dim: int):
        self._api_key = api_key
        self._target_dim = target_dim

    async def async_load(self) -> None:
        logger.info("voyage_embedding_backend_ready")

    async def embed(self, texts: list[str]) -> list[list[float]]:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    "https://api.voyageai.com/v1/embeddings",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json={"model": "voyage-3", "input": texts},
                )
                resp.raise_for_status()
                data = resp.json()
            raw_vectors = [item["embedding"] for item in data["data"]]
            return [self._pad_or_truncate(v) for v in raw_vectors]
        except Exception as e:
            raise EmbeddingError(f"Anthropic/Voyage embedding failed: {e}") from e

    def _pad_or_truncate(self, vec: list[float]) -> list[float]:
        if len(vec) >= self._target_dim:
            return vec[: self._target_dim]
        return vec + [0.0] * (self._target_dim - len(vec))


def get_embedding_service() -> EmbeddingBackend:
    """Factory that returns the configured embedding backend."""
    backend = settings.EMBEDDING_BACKEND
    if backend == "anthropic":
        return AnthropicEmbeddingBackend(
            api_key=settings.OPENAI_API_KEY,
            target_dim=settings.EMBEDDING_DIMENSIONS,
        )
    return SentenceTransformerBackend(
        model_name=settings.EMBEDDING_MODEL,
        target_dim=settings.EMBEDDING_DIMENSIONS,
    )
