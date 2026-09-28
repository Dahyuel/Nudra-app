from typing import Any, Literal
from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str | list[dict[str, Any]] | None = None
    tool_calls: list[dict[str, Any]] | None = None
    tool_call_id: str | None = None
    name: str | None = None


class ChatCompletionRequest(BaseModel):
    model: str = "default"
    messages: list[ChatMessage]
    stream: bool = False
    temperature: float | None = None
    top_p: float | None = None
    max_tokens: int | None = None
    thinking_enabled: bool = False
    search_enabled: bool = False

    # Tool calling (OpenAI-compatible)
    tools: list[dict] | None = None
    tool_choice: str | dict | None = "auto"

    # Multi-turn: pass the same conversation_id to keep context across calls.
    # If omitted, the server generates one and returns it in the response.
    conversation_id: str | None = None

    # Standard OpenAI field. OpenCode and other clients send a session-scoped
    # identifier here. We use it as a fallback conversation_id so sessions
    # stay sticky even when the client doesn't send conversation_id.
    user: str | None = None

    stream_options: dict | None = None

    model_config = {"extra": "allow"}


class ModelCard(BaseModel):
    id: str
    object: str = "model"
    created: int = 0
    owned_by: str = "deepseek-web"


class ModelList(BaseModel):
    object: str = "list"
    data: list[ModelCard]
