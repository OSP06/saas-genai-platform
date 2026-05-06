from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, Query

from app.dependencies import get_analytics_service
from app.schemas.analytics import (
    AnalyticsOverviewResponse,
    CostDataPoint,
    LatencyDataPoint,
    UsageDataPoint,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
logger = structlog.get_logger()


def _default_from() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=30)


def _default_to() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def get_overview(svc: AnalyticsService = Depends(get_analytics_service)):
    """Return summary metrics and 30-day trends."""
    return await svc.get_overview()


@router.get("/usage", response_model=list[UsageDataPoint])
async def get_usage(
    from_: Optional[datetime] = Query(default=None, alias="from"),
    to: Optional[datetime] = Query(default=None),
    granularity: str = Query(default="day"),
    module: Optional[str] = Query(default=None),
    svc: AnalyticsService = Depends(get_analytics_service),
):
    """Return request counts per module over time."""
    return await svc.get_usage(
        from_=from_ or _default_from(),
        to=to or _default_to(),
        granularity=granularity,
        module=module,
    )


@router.get("/costs", response_model=list[CostDataPoint])
async def get_costs(
    from_: Optional[datetime] = Query(default=None, alias="from"),
    to: Optional[datetime] = Query(default=None),
    granularity: str = Query(default="month"),
    model: Optional[str] = Query(default=None),
    svc: AnalyticsService = Depends(get_analytics_service),
):
    """Return cost breakdown (tokens, compute, storage) over time."""
    return await svc.get_costs(
        from_=from_ or _default_from(),
        to=to or _default_to(),
        granularity=granularity,
        model=model,
    )


@router.get("/latency", response_model=list[LatencyDataPoint])
async def get_latency(
    from_: Optional[datetime] = Query(default=None, alias="from"),
    to: Optional[datetime] = Query(default=None),
    granularity: str = Query(default="hour"),
    svc: AnalyticsService = Depends(get_analytics_service),
):
    """Return p50/p95/p99 latency percentiles over time."""
    return await svc.get_latency(
        from_=from_ or _default_from(),
        to=to or _default_to(),
        granularity=granularity,
    )
