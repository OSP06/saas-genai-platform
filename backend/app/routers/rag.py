import uuid
from pathlib import Path

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile

from app.config import get_settings
from app.dependencies import get_llm_service, get_rag_service
from app.services.llm_service import LLMService
from app.exceptions import FileTooLargeError, InvalidFileTypeError
from app.main import limiter
from app.schemas.rag import (
    DocumentDeleteResponse,
    DocumentListItem,
    DocumentStatusResponse,
    DocumentUploadResponse,
    RAGQueryRequest,
    RAGQueryResponse,
    SourceSnippet,
)
from app.services.rag_service import RAGService

router = APIRouter(prefix="/api/rag", tags=["rag"])
logger = structlog.get_logger()
settings = get_settings()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".md"}


def _trim_to_sentence(text: str, max_chars: int = 250) -> str:
    """Trim to nearest sentence boundary for clean UI snippets."""
    if len(text) <= max_chars:
        return text
    window = text[:max_chars]
    for i in range(len(window) - 1, -1, -1):
        if window[i] in ".?!\n":
            return window[: i + 1].strip()
    return window.strip()


@router.post("/upload", response_model=DocumentUploadResponse)
@limiter.limit("20/minute")
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    svc: RAGService = Depends(get_rag_service),
):
    """Upload a document and trigger background ingestion pipeline."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise InvalidFileTypeError(suffix or "unknown")

    file_bytes = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise FileTooLargeError(settings.MAX_UPLOAD_SIZE_MB)

    try:
        doc = await svc.save_document_record(file.filename or "unnamed", len(file_bytes), suffix)
        background_tasks.add_task(svc.ingest_document, doc.id, file_bytes, suffix)
        logger.info("document_upload_started", doc_id=str(doc.id), name=file.filename)
        return DocumentUploadResponse(
            id=doc.id,
            name=doc.name,
            size=doc.size_bytes,
            status=doc.status,
            createdAt=doc.created_at,
        )
    except Exception as exc:
        logger.error("upload_failed", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/documents", response_model=list[DocumentListItem])
async def list_documents(svc: RAGService = Depends(get_rag_service)):
    """Return all documents for the default user with chunk counts."""
    try:
        return await svc.list_documents(user_id="default")
    except Exception as exc:
        logger.error("list_documents_failed", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/documents/{document_id}", response_model=DocumentDeleteResponse)
async def delete_document(
    document_id: uuid.UUID,
    svc: RAGService = Depends(get_rag_service),
):
    """Delete a document and all its chunks."""
    success = await svc.delete_document(document_id)
    return DocumentDeleteResponse(success=success)


@router.post("/query", response_model=RAGQueryResponse)
async def query_knowledge_base(
    request: Request,
    req: RAGQueryRequest,
    svc: RAGService = Depends(get_rag_service),
    llm: LLMService = Depends(get_llm_service),
):
    """Query the RAG knowledge base; returns grounded answer + citations."""
    try:
        answer, citations, usage = await svc.query(req.query, req.documentIds, req.maxCitations)
        if usage:
            request.state.tokens_input = usage.input_tokens
            request.state.tokens_output = usage.output_tokens
            request.state.model_used = usage.model
            request.state.cost_usd = llm.build_cost(usage)
        sources = [
            SourceSnippet(snippet=_trim_to_sentence(c.content), score=c.relevanceScore)
            for c in citations
        ]
        return RAGQueryResponse(answer=answer, citations=citations, sources=sources)
    except Exception as exc:
        logger.error("rag_query_failed", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/documents/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: uuid.UUID,
    svc: RAGService = Depends(get_rag_service),
):
    """Poll ingestion status for a specific document."""
    return await svc.get_document_status(document_id)
