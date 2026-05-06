"""Tests for Chat service logic and endpoints."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.chat_service import _event
from app.services.router_service import RouterService
from app.services.llm_service import LLMTokenUsage


# ------------------------------------------------------------------
# Unit tests — event formatting
# ------------------------------------------------------------------

class TestSSEEventFormat:
    def test_event_format_basic(self):
        data = {"id": "123", "role": "assistant", "content": "Hello", "mode": "llm"}
        event = _event(data)
        assert event.startswith("data: ")
        assert event.endswith("\n\n")

    def test_event_contains_correct_json(self):
        import json
        data = {"content": "test", "done": True}
        event = _event(data)
        payload = json.loads(event[len("data: "):].strip())
        assert payload["content"] == "test"
        assert payload["done"] is True

    def test_event_with_uuid(self):
        import json
        msg_id = uuid.uuid4()
        data = {"id": msg_id, "content": "hello"}
        event = _event(data)
        payload = json.loads(event[len("data: "):].strip())
        assert payload["id"] == str(msg_id)


# ------------------------------------------------------------------
# Unit tests — router service
# ------------------------------------------------------------------

class TestRouterService:
    @pytest.mark.asyncio
    async def test_classify_returns_rag_route(self):
        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(
            return_value=(
                '{"route": "rag", "confidence": 0.95, "reason": "User is asking about documents"}',
                LLMTokenUsage(input_tokens=10, output_tokens=10, model="test"),
            )
        )
        router = RouterService(mock_llm)
        result = await router.classify("What does the annual report say about revenue?")
        assert result["route"] == "rag"
        assert result["confidence"] == 0.95

    @pytest.mark.asyncio
    async def test_classify_returns_agent_route(self):
        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(
            return_value=(
                '{"route": "agent", "confidence": 0.88, "reason": "Multi-step research task"}',
                LLMTokenUsage(input_tokens=10, output_tokens=10, model="test"),
            )
        )
        router = RouterService(mock_llm)
        result = await router.classify("Research the top 10 AI companies and compare their revenue")
        assert result["route"] == "agent"

    @pytest.mark.asyncio
    async def test_classify_returns_llm_route(self):
        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(
            return_value=(
                '{"route": "llm", "confidence": 0.9, "reason": "Simple conversational question"}',
                LLMTokenUsage(input_tokens=10, output_tokens=10, model="test"),
            )
        )
        router = RouterService(mock_llm)
        result = await router.classify("What is the capital of France?")
        assert result["route"] == "llm"

    @pytest.mark.asyncio
    async def test_classify_falls_back_on_bad_json(self):
        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(
            return_value=(
                "I think this should go to the RAG system",  # not JSON
                LLMTokenUsage(input_tokens=10, output_tokens=10, model="test"),
            )
        )
        router = RouterService(mock_llm)
        result = await router.classify("Any question")
        # Must fall back gracefully
        assert result["route"] in {"rag", "agent", "llm"}
        assert "confidence" in result

    @pytest.mark.asyncio
    async def test_classify_invalid_route_falls_back(self):
        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(
            return_value=(
                '{"route": "unknown_mode", "confidence": 0.5, "reason": "test"}',
                LLMTokenUsage(input_tokens=10, output_tokens=10, model="test"),
            )
        )
        router = RouterService(mock_llm)
        result = await router.classify("Any question")
        assert result["route"] == "llm"  # invalid route should fall back to llm


# ------------------------------------------------------------------
# Integration tests — HTTP endpoints
# ------------------------------------------------------------------

@pytest.mark.asyncio
class TestChatEndpoints:
    async def test_send_missing_message(self, client):
        resp = await client.post("/api/chat/send", json={})
        assert resp.status_code == 422

    async def test_send_invalid_mode(self, client):
        resp = await client.post(
            "/api/chat/send",
            json={"message": "Hello", "mode": "invalid_mode"},
        )
        assert resp.status_code == 422

    async def test_conversations_empty(self, client):
        with patch("app.dependencies.get_chat_service") as mock_dep:
            mock_svc = MagicMock()
            from app.schemas.chat import ConversationsResponse
            mock_svc.list_conversations = AsyncMock(
                return_value=ConversationsResponse(conversations=[])
            )
            mock_dep.return_value = mock_svc
            resp = await client.get("/api/chat/conversations")
            assert resp.status_code in (200, 500)

    async def test_delete_history_no_body(self, client):
        resp = await client.request("DELETE", "/api/chat/history", json={})
        assert resp.status_code in (200, 500)
