import structlog

from app.tools.base import BaseTool, ToolResult

logger = structlog.get_logger()


class RAGLookupTool(BaseTool):
    name = "rag_lookup"
    description = (
        "Query the document knowledge base to find relevant information. "
        "Input: a plain search query string. "
        "Returns relevant document excerpts with source citations."
    )

    def __init__(self, llm=None, embedding_svc=None, storage=None):
        self._llm = llm
        self._embedding = embedding_svc
        self._storage = storage

    async def execute(self, input: str) -> ToolResult:
        query = input.strip()
        if not query:
            return ToolResult(success=False, output="", error="Empty query string")

        if self._llm is None or self._embedding is None or self._storage is None:
            return ToolResult(
                success=False,
                output="",
                error="RAGLookupTool not fully configured (missing llm, embedding, or storage)",
            )

        try:
            from app.database import AsyncSessionLocal
            from app.services.rag_service import RAGService

            async with AsyncSessionLocal() as session:
                rag = RAGService(session, self._embedding, self._storage, self._llm)
                answer, citations, _ = await rag.query(
                    query_text=query,
                    document_ids=None,
                    max_citations=3,
                )

            citation_lines = []
            for c in citations:
                page_info = f" (p.{c.page})" if c.page else ""
                citation_lines.append(
                    f"[{c.documentName}{page_info}, score={c.relevanceScore:.2f}]: {c.content[:300]}"
                )

            output = answer
            if citation_lines:
                output += "\n\nSources:\n" + "\n".join(citation_lines)

            logger.info("rag_lookup_complete", query=query[:80], citations=len(citations))
            return ToolResult(success=True, output=output)
        except Exception as e:
            logger.error("rag_lookup_failed", query=query[:80], error=str(e))
            return ToolResult(success=False, output="", error=str(e))
