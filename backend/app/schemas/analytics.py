from pydantic import BaseModel
from typing import Optional


class AnalyticsTrends(BaseModel):
    requestsTrend: float
    costTrend: float
    latencyTrend: float


class AnalyticsOverviewResponse(BaseModel):
    totalRequests: int
    totalCost: float
    avgLatency: float
    activeUsers: int
    trends: AnalyticsTrends


class UsageDataPoint(BaseModel):
    date: str
    rag: int
    agent: int
    chat: int


class CostDataPoint(BaseModel):
    month: str
    tokens: float
    compute: float
    storage: float


class LatencyDataPoint(BaseModel):
    time: str
    p50: float
    p95: float
    p99: float


class AnalyticsLogCreate(BaseModel):
    request_id: str
    endpoint: str
    module: Optional[str] = None
    model_used: Optional[str] = None
    tokens_input: int = 0
    tokens_output: int = 0
    latency_ms: int
    cost_usd: float = 0.0
    status_code: Optional[int] = None
