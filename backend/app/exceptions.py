import structlog
from fastapi import Request
from fastapi.responses import JSONResponse

logger = structlog.get_logger()


class KortexException(Exception):
    def __init__(self, status_code: int, message: str, detail: str | None = None):
        self.status_code = status_code
        self.message = message
        self.detail = detail
        super().__init__(message)


class DocumentNotFoundError(KortexException):
    def __init__(self, doc_id: str):
        super().__init__(404, f"Document {doc_id} not found")


class TaskNotFoundError(KortexException):
    def __init__(self, task_id: str):
        super().__init__(404, f"Task {task_id} not found")


class ConversationNotFoundError(KortexException):
    def __init__(self, conv_id: str):
        super().__init__(404, f"Conversation {conv_id} not found")


class EmbeddingError(KortexException):
    def __init__(self, detail: str):
        super().__init__(500, "Embedding generation failed", detail)


class LLMError(KortexException):
    def __init__(self, detail: str):
        super().__init__(502, "LLM call failed", detail)


class StorageError(KortexException):
    def __init__(self, detail: str):
        super().__init__(500, "File storage operation failed", detail)


class InvalidFileTypeError(KortexException):
    def __init__(self, file_type: str):
        super().__init__(415, f"Unsupported file type: {file_type}")


class FileTooLargeError(KortexException):
    def __init__(self, max_mb: int):
        super().__init__(413, f"File exceeds {max_mb}MB limit")


async def kortex_exception_handler(request: Request, exc: KortexException) -> JSONResponse:
    logger.error(
        "kortex_error",
        path=request.url.path,
        message=exc.message,
        detail=exc.detail,
        status_code=exc.status_code,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": True, "message": exc.message, "details": exc.detail},
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled_error", path=request.url.path, exc=str(exc))
    from app.config import get_settings as _get_settings
    details = str(exc) if _get_settings().DEBUG else None
    return JSONResponse(
        status_code=500,
        content={"error": True, "message": "Internal server error", "details": details},
    )
