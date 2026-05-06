import json
import structlog

from app.tools.base import BaseTool, ToolResult

logger = structlog.get_logger()

ANALYSIS_PROMPTS = {
    "summarize": (
        "Summarize the following text concisely in 3-5 sentences. "
        "Focus on the key points and main conclusions."
    ),
    "extract": (
        "Extract the key facts, entities, dates, numbers, and important details "
        "from the following text. Present them as a structured bullet list."
    ),
    "sentiment": (
        "Analyze the sentiment of the following text. "
        "Classify it as Positive, Negative, or Neutral, "
        "explain why, and identify any key emotional signals."
    ),
    "outline": (
        "Create a structured outline of the main topics and subtopics "
        "covered in the following text."
    ),
}


class TextAnalyzerTool(BaseTool):
    name = "text_analyzer"
    description = (
        "Analyze, summarize, or extract information from text using AI. "
        "Input: JSON string with {\"action\": \"summarize\"|\"extract\"|\"sentiment\"|\"outline\", \"text\": \"...\"}. "
        "Returns the analysis result."
    )

    def __init__(self, llm=None):
        self._llm = llm

    async def execute(self, input: str) -> ToolResult:
        try:
            data = json.loads(input)
            action = data.get("action", "summarize")
            text = data.get("text", "")
        except (json.JSONDecodeError, AttributeError):
            # If not valid JSON, treat the whole input as text to summarize
            action = "summarize"
            text = input

        if not text.strip():
            return ToolResult(success=False, output="", error="No text provided for analysis")

        action = action.lower()
        if action not in ANALYSIS_PROMPTS:
            action = "summarize"

        system = ANALYSIS_PROMPTS[action]

        if self._llm is None:
            return ToolResult(
                success=False,
                output="",
                error="TextAnalyzerTool requires LLM service (not injected)",
            )

        try:
            result_text, usage = await self._llm.complete(
                system=system,
                messages=[{"role": "user", "content": text[:8000]}],  # cap context
                temperature=0.3,
                max_tokens=1024,
            )
            logger.info(
                "text_analyzer_complete",
                action=action,
                text_len=len(text),
                tokens=usage.input_tokens + usage.output_tokens,
            )
            return ToolResult(success=True, output=result_text)
        except Exception as e:
            logger.error("text_analyzer_failed", action=action, error=str(e))
            return ToolResult(success=False, output="", error=str(e))
