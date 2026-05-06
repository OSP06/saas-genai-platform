from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional


class AgentExecuteRequest(BaseModel):
    task: str = Field(..., min_length=1, max_length=5000)
    tools: Optional[list[str]] = None
    maxSteps: int = Field(default=10, ge=1, le=25)


class AgentExecuteResponse(BaseModel):
    taskId: UUID
    status: str
    createdAt: datetime

    model_config = {"from_attributes": True}


class AgentStep(BaseModel):
    id: str
    name: str
    description: str
    status: str         # pending | running | completed | failed
    startedAt: Optional[datetime] = None
    completedAt: Optional[datetime] = None
    output: Optional[str] = None


class AgentTaskDetail(BaseModel):
    id: UUID
    prompt: str
    status: str
    steps: list[AgentStep]
    output: Optional[str] = None
    createdAt: datetime

    model_config = {"from_attributes": True}


class AgentTasksListResponse(BaseModel):
    tasks: list[AgentTaskDetail]


class AgentCancelResponse(BaseModel):
    success: bool


class AgentLogEvent(BaseModel):
    timestamp: datetime
    level: str          # info | debug | warn | error
    message: str
    stepId: Optional[str] = None
