from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional


class DocumentUploadResponse(BaseModel):
    id: UUID
    name: str
    size: int           # raw bytes — frontend formats
    status: str
    createdAt: datetime

    model_config = {"from_attributes": True}


class DocumentListItem(BaseModel):
    id: UUID
    name: str
    type: str
    size: str           # pre-formatted "2.4 MB"
    chunks: int
    uploadedAt: datetime

    model_config = {"from_attributes": True}


class DocumentDeleteResponse(BaseModel):
    success: bool


class DocumentStatusResponse(BaseModel):
    id: UUID
    status: str         # pending | processing | ready | error
    progress: Optional[float] = None    # 0.0–1.0
    chunksCreated: Optional[int] = None
    error: Optional[str] = None

    model_config = {"from_attributes": True}


class Citation(BaseModel):
    id: UUID
    documentId: UUID
    documentName: str
    content: str
    page: Optional[int] = None
    relevanceScore: float

    model_config = {"from_attributes": True}


class SourceSnippet(BaseModel):
    snippet: str
    score: float


class RAGQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    documentIds: Optional[list[UUID]] = None
    maxCitations: int = Field(default=5, ge=1, le=20)


class RAGQueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    sources: list[SourceSnippet] = []
