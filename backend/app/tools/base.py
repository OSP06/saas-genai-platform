from abc import ABC, abstractmethod
from pydantic import BaseModel


class ToolResult(BaseModel):
    success: bool
    output: str
    error: str | None = None


class BaseTool(ABC):
    name: str
    description: str

    @abstractmethod
    async def execute(self, input: str) -> ToolResult:
        """Execute the tool with a plain-string input. Always returns ToolResult."""
        ...

    def to_schema(self) -> dict:
        """Returns an Anthropic tool_use-compatible schema dict."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "input": {
                        "type": "string",
                        "description": "The input string for this tool.",
                    }
                },
                "required": ["input"],
            },
        }
