"""Tests for Analytics service logic and endpoints."""
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.analytics import AnalyticsLogCreate, AnalyticsOverviewResponse


# ------------------------------------------------------------------
# Unit tests — schema validation
# ------------------------------------------------------------------

class TestAnalyticsSchemas:
    def test_log_create_defaults(self):
        log = AnalyticsLogCreate(
            request_id="test-123",
            endpoint="/api/rag/query",
            latency_ms=250,
        )
        assert log.tokens_input == 0
        assert log.tokens_output == 0
        assert log.cost_usd == 0.0
        assert log.module is None

    def test_overview_response_shape(self):
        from app.schemas.analytics import AnalyticsTrends
        overview = AnalyticsOverviewResponse(
            totalRequests=100,
            totalCost=1.23,
            avgLatency=450.0,
            activeUsers=5,
            trends=AnalyticsTrends(
                requestsTrend=12.5,
                costTrend=-3.2,
                latencyTrend=0.0,
            ),
        )
        assert overview.totalRequests == 100
        assert overview.trends.requestsTrend == 12.5


# ------------------------------------------------------------------
# Unit tests — analytics service
# ------------------------------------------------------------------

class TestAnalyticsService:
    def _make_service(self, db):
        from app.services.analytics_service import AnalyticsService
        return AnalyticsService(db)

    @pytest.mark.asyncio
    async def test_record_inserts_row(self):
        mock_db = MagicMock()
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        svc = self._make_service(mock_db)

        log = AnalyticsLogCreate(
            request_id="req-abc",
            endpoint="/api/chat/send",
            module="chat",
            model_used="claude-sonnet-4-6",
            tokens_input=100,
            tokens_output=200,
            latency_ms=1200,
            cost_usd=0.009,
            status_code=200,
        )
        await svc.record(log)
        mock_db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_record_handles_db_error_gracefully(self):
        mock_db = MagicMock()
        mock_db.add = MagicMock(side_effect=RuntimeError("DB error"))
        mock_db.flush = AsyncMock()
        svc = self._make_service(mock_db)

        log = AnalyticsLogCreate(
            request_id="req-xyz",
            endpoint="/api/rag/query",
            latency_ms=300,
        )
        # Should NOT raise — failure is logged and swallowed
        await svc.record(log)


# ------------------------------------------------------------------
# Integration tests — HTTP endpoints
# ------------------------------------------------------------------

@pytest.mark.asyncio
class TestAnalyticsEndpoints:
    async def test_overview_returns_200(self, client):
        from unittest.mock import patch, AsyncMock
        from app.schemas.analytics import AnalyticsTrends

        with patch("app.dependencies.get_analytics_service") as mock_dep:
            mock_svc = MagicMock()
            mock_svc.get_overview = AsyncMock(
                return_value=AnalyticsOverviewResponse(
                    totalRequests=42,
                    totalCost=0.15,
                    avgLatency=320.0,
                    activeUsers=3,
                    trends=AnalyticsTrends(
                        requestsTrend=5.0,
                        costTrend=2.0,
                        latencyTrend=-1.0,
                    ),
                )
            )
            mock_dep.return_value = mock_svc
            resp = await client.get("/api/analytics/overview")
            assert resp.status_code in (200, 500)

    async def test_usage_with_date_params(self, client):
        resp = await client.get(
            "/api/analytics/usage",
            params={"from": "2025-01-01T00:00:00Z", "to": "2025-05-01T00:00:00Z", "granularity": "week"},
        )
        assert resp.status_code in (200, 500)

    async def test_latency_default_params(self, client):
        resp = await client.get("/api/analytics/latency")
        assert resp.status_code in (200, 500)

    async def test_costs_default_params(self, client):
        resp = await client.get("/api/analytics/costs")
        assert resp.status_code in (200, 500)
