from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional
from app.schemas.rag import Citation


class ChatSendRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)
    mode: str = Field(default="auto", pattern="^(auto|rag|agent|llm)$")
    conversationId: Optional[UUID] = None


class ChatMessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    mode: Optional[str] = None
    citations: Optional[list[Citation]] = None
    metadata: dict = Field(default_factory=dict)
    timestamp: datetime

    model_config = {"from_attributes": True}


class ChatHistoryResponse(BaseModel):
    messages: list[ChatMessageResponse]
    conversationId: UUID
    totalCount: int


class ChatDeleteRequest(BaseModel):
    conversationId: Optional[UUID] = None


class ChatDeleteResponse(BaseModel):
    success: bool


class ConversationSummary(BaseModel):
    id: UUID
    title: str
    messageCount: int
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}


class ConversationsResponse(BaseModel):
    conversations: list[ConversationSummary]
