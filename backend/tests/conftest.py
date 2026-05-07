"""
Test configuration and fixtures.

Sets required environment variables BEFORE any app module is imported,
then uses an in-memory SQLite database so tests run without Postgres.
Embedding and LLM calls are mocked to avoid hitting external services.
"""
import os

# Must be set before any app import that calls get_settings()
os.environ.setdefault("OPENAI_API_KEY", "sk-test-key")
os.environ.setdefault("SECRET_KEY", "test-secret-key-minimum-32-characters-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import asyncio
import uuid
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.services.llm_service import LLMTokenUsage

# ------------------------------------------------------------------
# In-memory SQLite database for tests
# ------------------------------------------------------------------
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def init_db():
    # Create tables that don't use Postgres-specific types
    # (pgvector VECTOR and JSONB are not available in SQLite — models are
    #  imported but column types degrade gracefully for schema creation in tests)
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ------------------------------------------------------------------
# Mock services
# ------------------------------------------------------------------

class MockEmbeddingBackend:
    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * 384 for _ in texts]


MOCK_LLM_RESPONSE = "This is a mock LLM response for testing."
MOCK_USAGE = LLMTokenUsage(input_tokens=10, output_tokens=20, model="gpt-4o")


class MockLLMService:
    def build_cost(self, usage: LLMTokenUsage) -> float:
        return 0.0001

    async def complete(self, system, messages, **kwargs) -> tuple[str, LLMTokenUsage]:
        return MOCK_LLM_RESPONSE, MOCK_USAGE

    async def stream(self, system, messages, **kwargs):
        for word in MOCK_LLM_RESPONSE.split():
            yield word + " ", None
        yield "", MOCK_USAGE


@pytest.fixture
def mock_llm() -> MockLLMService:
    return MockLLMService()


@pytest.fixture
def mock_embedding() -> MockEmbeddingBackend:
    return MockEmbeddingBackend()


# ------------------------------------------------------------------
# HTTP test client
# ------------------------------------------------------------------

@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    from app.main import app
    from app.dependencies import get_embedding_service

    async def override_get_db():
        yield db_session

    def override_embedding(request=None):
        return MockEmbeddingBackend()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_embedding_service] = override_embedding

    # Inject mock embedding into app.state so lifespan code doesn't crash
    app.state.embedding_service = MockEmbeddingBackend()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
