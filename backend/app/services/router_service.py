import json
import structlog

from app.exceptions import LLMError
from app.services.llm_service import LLMService

logger = structlog.get_logger()

VALID_ROUTES = {"rag", "agent", "llm"}

ROUTER_SYSTEM = """You are an intelligent request router for an AI platform.

Classify the user's message into exactly ONE of these routes:
- rag: The user is asking a question about documents, uploaded files, or a knowledge base. Includes questions like "what does the document say", "find information about X", "summarize the report".
- agent: The user wants a multi-step task executed, research done, analysis performed, or external information fetched. Includes requests like "research X", "analyze Y", "find and compare Z", "write a report on W".
- llm: General conversation, simple factual questions, creative writing, explanations, or anything that doesn't need document lookup or tool execution.

Return ONLY valid JSON in this exact format:
{"route": "rag"|"agent"|"llm", "confidence": 0.0-1.0, "reason": "one sentence explanation"}

No other text. No markdown. Just the JSON object."""


class RouterService:
    def __init__(self, llm: LLMService):
        self._llm = llm

    async def classify(self, message: str) -> dict:
        """
        LLM-based intent classification.
        Returns {"route": "rag"|"agent"|"llm", "confidence": float, "reason": str}.
        Falls back to "llm" route on any parse failure.
        """
        try:
            response_text, _ = await self._llm.complete(
                system=ROUTER_SYSTEM,
                messages=[{"role": "user", "content": message}],
                temperature=0.0,  # deterministic classification
                max_tokens=128,
            )

            # Strip any accidental markdown fences
            clean = response_text.strip().strip("```json").strip("```").strip()
            result = json.loads(clean)

            route = result.get("route", "llm")
            if route not in VALID_ROUTES:
                route = "llm"

            classification = {
                "route": route,
                "confidence": float(result.get("confidence", 0.8)),
                "reason": str(result.get("reason", "")),
            }
            logger.info(
                "router_classified",
                route=route,
                confidence=classification["confidence"],
                msg_preview=message[:80],
            )
            return classification

        except (json.JSONDecodeError, LLMError, KeyError, ValueError) as e:
            logger.warning("router_fallback", error=str(e), message=message[:80])
            return {"route": "llm", "confidence": 0.5, "reason": "classification fallback"}
