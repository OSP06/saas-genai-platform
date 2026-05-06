import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.analytics import AnalyticsLog
from app.schemas.analytics import (
    AnalyticsLogCreate,
    AnalyticsOverviewResponse,
    AnalyticsTrends,
    CostDataPoint,
    LatencyDataPoint,
    UsageDataPoint,
)

logger = structlog.get_logger()
settings = get_settings()

VALID_GRANULARITIES = {"hour", "day", "week", "month"}


class AnalyticsService:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def record(self, log: AnalyticsLogCreate) -> None:
        """Insert one analytics_logs row. Called from middleware (fire-and-forget)."""
        try:
            entry = AnalyticsLog(
                request_id=log.request_id,
                endpoint=log.endpoint,
                module=log.module,
                model_used=log.model_used,
                tokens_input=log.tokens_input,
                tokens_output=log.tokens_output,
                latency_ms=log.latency_ms,
                cost_usd=Decimal(str(log.cost_usd)),
                status_code=log.status_code,
            )
            self._db.add(entry)
            await self._db.flush()
        except Exception as e:
            logger.warning("analytics_record_failed", error=str(e))

    async def get_overview(self) -> AnalyticsOverviewResponse:
        """
        Computes totals + 30-day trends via 4 parallel DB queries.
        """
        now = datetime.now(timezone.utc)
        thirty_days_ago = now - timedelta(days=30)
        sixty_days_ago = now - timedelta(days=60)

        (
            current_stats,
            prior_stats,
            active_users,
        ) = await asyncio.gather(
            self._period_stats(thirty_days_ago, now),
            self._period_stats(sixty_days_ago, thirty_days_ago),
            self._count_active_users(thirty_days_ago),
        )

        def trend(current: float, prior: float) -> float:
            if prior == 0:
                return 0.0
            return round((current - prior) / prior * 100, 1)

        return AnalyticsOverviewResponse(
            totalRequests=int(current_stats["requests"]),
            totalCost=float(current_stats["cost"]),
            avgLatency=float(current_stats["avg_latency"]),
            activeUsers=int(active_users),
            trends=AnalyticsTrends(
                requestsTrend=trend(current_stats["requests"], prior_stats["requests"]),
                costTrend=trend(current_stats["cost"], prior_stats["cost"]),
                latencyTrend=trend(current_stats["avg_latency"], prior_stats["avg_latency"]),
            ),
        )

    async def _period_stats(self, from_: datetime, to: datetime) -> dict:
        result = await self._db.execute(
            text(
                """
                SELECT
                    COUNT(*)                   AS requests,
                    COALESCE(SUM(cost_usd), 0) AS cost,
                    COALESCE(AVG(latency_ms), 0) AS avg_latency
                FROM analytics_logs
                WHERE created_at BETWEEN :from AND :to
                """
            ),
            {"from": from_, "to": to},
        )
        row = result.mappings().one()
        return {
            "requests": float(row["requests"] or 0),
            "cost": float(row["cost"] or 0),
            "avg_latency": float(row["avg_latency"] or 0),
        }

    async def _count_active_users(self, since: datetime) -> int:
        result = await self._db.execute(
            text(
                "SELECT COUNT(DISTINCT user_id) FROM chat_conversations WHERE created_at >= :since"
            ),
            {"since": since},
        )
        return int(result.scalar() or 0)

    async def get_usage(
        self,
        from_: datetime,
        to: datetime,
        granularity: str,
        module: Optional[str],
    ) -> list[UsageDataPoint]:
        gran = granularity if granularity in VALID_GRANULARITIES else "day"

        module_filter = "AND module = :module" if module else ""
        params: dict = {"from": from_, "to": to}
        if module:
            params["module"] = module

        result = await self._db.execute(
            text(
                f"""
                SELECT
                    date_trunc(:gran, created_at)                              AS bucket,
                    SUM(CASE WHEN module='rag'   THEN 1 ELSE 0 END)::int       AS rag,
                    SUM(CASE WHEN module='agent' THEN 1 ELSE 0 END)::int       AS agent,
                    SUM(CASE WHEN module='chat'  THEN 1 ELSE 0 END)::int       AS chat
                FROM analytics_logs
                WHERE created_at BETWEEN :from AND :to
                  {module_filter}
                GROUP BY 1
                ORDER BY 1 ASC
                """
            ),
            {"gran": gran, **params},
        )
        rows = result.mappings().all()
        return [
            UsageDataPoint(
                date=row["bucket"].strftime("%Y-%m-%d"),
                rag=int(row["rag"] or 0),
                agent=int(row["agent"] or 0),
                chat=int(row["chat"] or 0),
            )
            for row in rows
        ]

    async def get_costs(
        self,
        from_: datetime,
        to: datetime,
        granularity: str,
        model: Optional[str],
    ) -> list[CostDataPoint]:
        gran = granularity if granularity in VALID_GRANULARITIES else "month"

        model_filter = "AND model_used = :model" if model else ""
        params: dict = {"from": from_, "to": to}
        if model:
            params["model"] = model

        result = await self._db.execute(
            text(
                f"""
                SELECT
                    date_trunc(:gran, created_at) AS bucket,
                    COALESCE(
                        SUM(tokens_input)  * {settings.COST_PER_1K_INPUT_TOKENS}  / 1000.0 +
                        SUM(tokens_output) * {settings.COST_PER_1K_OUTPUT_TOKENS} / 1000.0,
                        0
                    ) AS token_cost
                FROM analytics_logs
                WHERE created_at BETWEEN :from AND :to
                  {model_filter}
                GROUP BY 1
                ORDER BY 1 ASC
                """
            ),
            {"gran": gran, **params},
        )
        rows = result.mappings().all()

        # Storage cost: approximate from document sizes
        storage_result = await self._db.execute(
            text("SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes FROM documents"),
        )
        total_bytes = float(storage_result.scalar() or 0)
        storage_per_bucket = (total_bytes / 1e9) * 0.023 / max(len(rows), 1)

        return [
            CostDataPoint(
                month=row["bucket"].strftime("%b %Y"),
                tokens=round(float(row["token_cost"] or 0), 4),
                compute=0.0,  # no separate compute billing at this tier
                storage=round(storage_per_bucket, 4),
            )
            for row in rows
        ]

    async def get_latency(
        self,
        from_: datetime,
        to: datetime,
        granularity: str,
    ) -> list[LatencyDataPoint]:
        gran = granularity if granularity in VALID_GRANULARITIES else "day"

        try:
            # percentile_cont is PostgreSQL-specific; fails on SQLite (dev/test)
            result = await self._db.execute(
                text(
                    """
                    SELECT
                        date_trunc(:gran, created_at) AS bucket,
                        percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50,
                        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
                        percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99
                    FROM analytics_logs
                    WHERE created_at BETWEEN :from AND :to
                    GROUP BY 1
                    ORDER BY 1 ASC
                    """
                ),
                {"gran": gran, "from": from_, "to": to},
            )
            rows = result.mappings().all()
            return [
                LatencyDataPoint(
                    time=row["bucket"].strftime("%Y-%m-%dT%H:%M:%SZ"),
                    p50=float(row["p50"] or 0),
                    p95=float(row["p95"] or 0),
                    p99=float(row["p99"] or 0),
                )
                for row in rows
            ]
        except Exception:
            # Fallback for SQLite (no percentile_cont): approximate with AVG
            result = await self._db.execute(
                text(
                    """
                    SELECT
                        AVG(latency_ms) AS avg_ms,
                        MIN(latency_ms) AS min_ms,
                        MAX(latency_ms) AS max_ms
                    FROM analytics_logs
                    WHERE created_at BETWEEN :from AND :to
                    """
                ),
                {"from": from_, "to": to},
            )
            row = result.mappings().one()
            avg = float(row["avg_ms"] or 0)
            if avg == 0:
                return []
            now_str = from_.strftime("%Y-%m-%dT%H:%M:%SZ")
            return [
                LatencyDataPoint(
                    time=now_str,
                    p50=avg,
                    p95=min(avg * 1.5, float(row["max_ms"] or avg)),
                    p99=min(avg * 2.0, float(row["max_ms"] or avg)),
                )
            ]
