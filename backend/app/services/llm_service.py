import asyncio
import json
import random
from dataclasses import dataclass
from typing import AsyncIterator

import anthropic
import httpx
import structlog

from app.config import get_settings
from app.exceptions import LLMError

logger = structlog.get_logger()
settings = get_settings()

_RETRYABLE_STATUS_CODES = {429, 502, 503, 529}
_MAX_RETRIES = 3


async def _backoff(attempt: int) -> None:
    """Exponential backoff with jitter: 1s, 2s, 4s ± 0-1s."""
    await asyncio.sleep((2 ** attempt) + random.uniform(0, 1))


@dataclass
class LLMTokenUsage:
    input_tokens: int
    output_tokens: int
    model: str
    fallback: bool = False


class LLMService:
    def __init__(self):
        self._anthropic = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self._ollama_base = settings.OLLAMA_BASE_URL

    async def complete(
        self,
        system: str,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int | None = None,
        temperature: float = 0.7,
    ) -> tuple[str, LLMTokenUsage]:
        """Non-streaming completion. Returns (content_text, usage). Falls back to Ollama on error."""
        target_model = model or settings.ANTHROPIC_MODEL
        last_exc: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                response = await self._anthropic.messages.create(
                    model=target_model,
                    max_tokens=max_tokens or settings.MAX_TOKENS,
                    system=system,
                    messages=messages,
                    temperature=temperature,
                )
                content = response.content[0].text if response.content else ""
                usage = LLMTokenUsage(
                    input_tokens=response.usage.input_tokens,
                    output_tokens=response.usage.output_tokens,
                    model=response.model,
                )
                logger.info(
                    "llm_complete",
                    model=usage.model,
                    input_tokens=usage.input_tokens,
                    output_tokens=usage.output_tokens,
                )
                return content, usage
            except anthropic.APIStatusError as e:
                if e.status_code in _RETRYABLE_STATUS_CODES and attempt < _MAX_RETRIES - 1:
                    logger.warning("llm_retry", attempt=attempt + 1, status=e.status_code)
                    await _backoff(attempt)
                    last_exc = e
                    continue
                last_exc = e
                break
            except anthropic.APIError as e:
                last_exc = e
                break

        # All retries exhausted — fall back to Ollama or raise
        if settings.OLLAMA_ENABLED:
            logger.warning("anthropic_fallback_ollama", error=str(last_exc))
            return await self._ollama_complete(
                settings.OLLAMA_MODEL, messages, system, stream=False
            )
        raise LLMError(str(last_exc)) from last_exc

    async def stream(
        self,
        system: str,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int | None = None,
        temperature: float = 0.7,
    ) -> AsyncIterator[tuple[str, LLMTokenUsage | None]]:
        """
        Streaming completion. Yields (text_chunk, None) for each delta.
        Final yield is ("", LLMTokenUsage) with full token counts.
        Falls back to Ollama on Anthropic error.
        """
        target_model = model or settings.ANTHROPIC_MODEL
        last_exc: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                async with self._anthropic.messages.stream(
                    model=target_model,
                    max_tokens=max_tokens or settings.MAX_TOKENS,
                    system=system,
                    messages=messages,
                    temperature=temperature,
                ) as stream:
                    async for text in stream.text_stream:
                        yield text, None
                    final_msg = await stream.get_final_message()
                    usage = LLMTokenUsage(
                        input_tokens=final_msg.usage.input_tokens,
                        output_tokens=final_msg.usage.output_tokens,
                        model=final_msg.model,
                    )
                    logger.info(
                        "llm_stream_complete",
                        model=usage.model,
                        input_tokens=usage.input_tokens,
                        output_tokens=usage.output_tokens,
                    )
                    yield "", usage
                return  # success
            except anthropic.APIStatusError as e:
                if e.status_code in _RETRYABLE_STATUS_CODES and attempt < _MAX_RETRIES - 1:
                    logger.warning("llm_stream_retry", attempt=attempt + 1, status=e.status_code)
                    await _backoff(attempt)
                    last_exc = e
                    continue
                last_exc = e
                break
            except anthropic.APIError as e:
                last_exc = e
                break

        # All retries exhausted
        if settings.OLLAMA_ENABLED:
            logger.warning("anthropic_stream_fallback_ollama", error=str(last_exc))
            async for item in self._ollama_stream(settings.OLLAMA_MODEL, messages, system):
                yield item
            return
        raise LLMError(str(last_exc)) from last_exc

    async def _ollama_complete(
        self,
        model: str,
        messages: list[dict],
        system: str,
        stream: bool = False,
    ) -> tuple[str, LLMTokenUsage]:
        """Calls Ollama /api/chat for non-streaming completion."""
        payload = {
            "model": model,
            "messages": [{"role": "system", "content": system}] + messages,
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(f"{self._ollama_base}/api/chat", json=payload)
                resp.raise_for_status()
                data = resp.json()
                content = data.get("message", {}).get("content", "")
                prompt_tokens = data.get("prompt_eval_count", 0)
                eval_tokens = data.get("eval_count", 0)
                usage = LLMTokenUsage(
                    input_tokens=prompt_tokens,
                    output_tokens=eval_tokens,
                    model=model,
                    fallback=True,
                )
                return content, usage
        except httpx.HTTPError as e:
            raise LLMError(f"Ollama error: {e}") from e

    async def _ollama_stream(
        self,
        model: str,
        messages: list[dict],
        system: str,
    ) -> AsyncIterator[tuple[str, LLMTokenUsage | None]]:
        """Streams from Ollama /api/chat via ndjson."""
        payload = {
            "model": model,
            "messages": [{"role": "system", "content": system}] + messages,
            "stream": True,
        }
        total_input = 0
        total_output = 0
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST", f"{self._ollama_base}/api/chat", json=payload
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        chunk = data.get("message", {}).get("content", "")
                        if chunk:
                            yield chunk, None
                        if data.get("done"):
                            total_input = data.get("prompt_eval_count", 0)
                            total_output = data.get("eval_count", 0)
            usage = LLMTokenUsage(
                input_tokens=total_input,
                output_tokens=total_output,
                model=model,
                fallback=True,
            )
            yield "", usage
        except httpx.HTTPError as e:
            raise LLMError(f"Ollama stream error: {e}") from e

    def build_cost(self, usage: LLMTokenUsage) -> float:
        """Returns estimated USD cost for a completion."""
        input_cost = (usage.input_tokens / 1000) * settings.COST_PER_1K_INPUT_TOKENS
        output_cost = (usage.output_tokens / 1000) * settings.COST_PER_1K_OUTPUT_TOKENS
        return round(input_cost + output_cost, 6)
