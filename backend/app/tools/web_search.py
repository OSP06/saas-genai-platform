import urllib.parse

import httpx
import structlog

from app.config import get_settings
from app.tools.base import BaseTool, ToolResult

logger = structlog.get_logger()
settings = get_settings()


class WebSearchTool(BaseTool):
    name = "web_search"
    description = (
        "Search the web for current information. "
        "Input: a plain search query string. "
        "Returns top search results as formatted text."
    )

    async def execute(self, input: str) -> ToolResult:
        """
        Tries SerpAPI if SERPAPI_KEY is configured, otherwise falls back
        to the DuckDuckGo Instant Answer API (free, no key required).
        """
        query = input.strip()
        if not query:
            return ToolResult(success=False, output="", error="Empty search query")

        if settings.SERPAPI_KEY:
            return await self._serpapi_search(query)
        return await self._duckduckgo_search(query)

    async def _duckduckgo_search(self, query: str) -> ToolResult:
        encoded = urllib.parse.quote_plus(query)
        url = f"https://api.duckduckgo.com/?q={encoded}&format=json&no_redirect=1&no_html=1"
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(url, headers={"Accept-Language": "en-US"})
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as e:
            logger.warning("duckduckgo_search_failed", error=str(e))
            return ToolResult(success=False, output="", error=f"Search request failed: {e}")

        results: list[str] = []

        abstract = data.get("Abstract", "")
        if abstract:
            source = data.get("AbstractSource", "")
            results.append(f"Summary ({source}): {abstract}")

        for topic in data.get("RelatedTopics", [])[:5]:
            if isinstance(topic, dict) and topic.get("Text"):
                url_ref = topic.get("FirstURL", "")
                results.append(f"• {topic['Text']}")
                if url_ref:
                    results.append(f"  Source: {url_ref}")

        if not results:
            return ToolResult(
                success=True,
                output=f"No results found for '{query}'. Try rephrasing the query.",
            )

        output = f"Search results for '{query}':\n\n" + "\n".join(results)
        logger.info("web_search_complete", query=query[:80], results=len(results))
        return ToolResult(success=True, output=output)

    async def _serpapi_search(self, query: str) -> ToolResult:
        encoded = urllib.parse.quote_plus(query)
        url = (
            f"https://serpapi.com/search.json"
            f"?q={encoded}&api_key={settings.SERPAPI_KEY}&num=5&hl=en"
        )
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as e:
            logger.warning("serpapi_search_failed", error=str(e))
            return await self._duckduckgo_search(query)  # fallback

        organic = data.get("organic_results", [])[:5]
        if not organic:
            return ToolResult(success=True, output=f"No results found for '{query}'.")

        lines = [f"Search results for '{query}':\n"]
        for r in organic:
            lines.append(f"• {r.get('title', '')}")
            lines.append(f"  {r.get('snippet', '')}")
            lines.append(f"  Source: {r.get('link', '')}\n")

        output = "\n".join(lines)
        logger.info("serpapi_search_complete", query=query[:80], results=len(organic))
        return ToolResult(success=True, output=output)
