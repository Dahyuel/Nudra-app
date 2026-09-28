"""
OpenAI-compatible proxy → DeepSeek Web
"""

import hashlib
import json
import time
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from loguru import logger

from app.deepseek.client import DeepSeekClient
from app.deepseek.errors import AuthError, DeepSeekError, UpstreamError
from app.deepseek.stream import to_openai_sse
from app.schemas import ChatCompletionRequest, ModelCard, ModelList
from app import store
from app.tool_calling import (
    build_tool_instruction,
    parse_tool_calls,
    strip_tool_calls_from_text,
    to_openai_tool_calls,
    _is_truncated_json,
)

router = APIRouter()

KNOWN_MODELS = [
    ModelCard(id="default", owned_by="deepseek-web"),
    ModelCard(id="expert", owned_by="deepseek-web"),
    ModelCard(id="vision", owned_by="deepseek-web"),
]

TOOL_RESULT_MAX_CHARS = 200_000  # ~64K token context @ 4 chars/token, leaving room for prompt+response
STUCK_RESET_THRESHOLD = 2


# ---------------------------------------------------------------------------
# Utility routes
# ---------------------------------------------------------------------------

@router.get("/v1/models", response_model=ModelList)
async def list_models():
    return ModelList(data=KNOWN_MODELS)


@router.get("/v1/conversations")
async def list_conversations(limit: int = 50):
    return {"object": "list", "data": store.list_sessions(limit)}


@router.delete("/v1/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    store.delete_session(conversation_id)
    return {"deleted": True, "conversation_id": conversation_id}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_model(req: ChatCompletionRequest) -> str:
    return req.model if req.model in {"default", "expert", "vision"} else "default"


def _flatten_content(content) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            b.get("text", "") for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        )
    return str(content)


def _truncate_tool_result(text: str, tool_call_id: str) -> str:
    if len(text) <= TOOL_RESULT_MAX_CHARS:
        return text
    # Keep 1/4 from head, 3/4 from tail — errors and final output are at the end
    head_keep = TOOL_RESULT_MAX_CHARS // 4
    tail_keep = TOOL_RESULT_MAX_CHARS - head_keep
    truncated_len = len(text) - TOOL_RESULT_MAX_CHARS
    head = text[:head_keep]
    tail = text[-tail_keep:]
    logger.warning(
        f"[tool-result] truncated {len(text)} → {TOOL_RESULT_MAX_CHARS} chars "
        f"(dropped {truncated_len}) for tool_call_id={tool_call_id}"
    )
    return f"{head}\n... [{truncated_len} chars truncated] ...\n{tail}"


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _chunk(delta: dict, finish=None, conversation_id=None, model="default") -> str:
    payload = {
        "id": "chatcmpl-deepseek",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }
    if conversation_id:
        payload["conversation_id"] = conversation_id
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _usage_chunk(prompt_tokens: int, completion_tokens: int, model: str) -> str:
    total_tokens = prompt_tokens + completion_tokens
    return _sse({
        "id": "chatcmpl-deepseek",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        },
    })


def _compute_usage(client, prompt_tokens: int, conversation_id: str | None = None) -> dict:
    """
    Compute usage from DeepSeek's accumulated_token_usage.

    DeepSeek sends a single cumulative number. We derive this turn's total by
    comparing with the previous turn's value, then subtract our prompt count to
    get completion tokens. This avoids double-counting prompt tokens.
    """
    last = client.last_token_usage
    prev = client.prev_token_usage

    if last > prev:
        turn_total = last - prev
    else:
        # First turn or per-response cumulative value.
        turn_total = last

    completion_tokens = max(0, turn_total - prompt_tokens)
    usage = {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": turn_total,
    }

    logger.info(
        f"[{conversation_id}] usage "
        f"last={last} prev={prev} turn_total={turn_total} "
        f"prompt={prompt_tokens} completion={completion_tokens}"
    )
    return usage


def _derive_session_key(req: ChatCompletionRequest, request: Request) -> tuple[str, str]:
    h = request.headers

    val = h.get("x-session-affinity")
    if val:
        return val, "x-session-affinity"

    val = h.get("x-session-id")
    if val:
        return val, "x-session-id"

    if req.conversation_id:
        return req.conversation_id, "conversation_id"

    if req.user:
        return req.user, "user"

    for m in req.messages:
        if m.role == "user":
            text = _flatten_content(m.content).strip()
            if text:
                digest = hashlib.sha256(text.encode()).hexdigest()[:16]
                return f"auto-{digest}", "first-message-hash"

    return "opencode-default", "fallback"


def _build_prompt(
    req: ChatCompletionRequest,
    only_last_turn: bool = False,
    turns_already_sent: int = 0,
) -> str:
    """
    Build the prompt string to send to DeepSeek.

    When `only_last_turn` is True (i.e. this is a continuation of an existing
    DeepSeek session), we strip out every prior assistant/user exchange and send
    only the tail of the conversation that the model hasn't seen yet — typically
    the latest user message plus any trailing tool results.  The system prompt is
    always included because DeepSeek doesn't persist it across turns.

    `turns_already_sent` tells us how many complete assistant turns DeepSeek has
    already received, so we can skip exactly that many assistant+following-messages
    blocks from the front of the conversation rather than just looking for the last
    assistant message (which would break when tool calls produce multiple assistant
    messages in a single turn).
    """
    parts = []
    messages = req.messages
    tools = req.tools

    if only_last_turn:
        system_msgs = [m for m in messages if m.role == "system"]
        non_system = [m for m in messages if m.role != "system"]

        logger.info(
            f"[build_prompt] only_last_turn=True | "
            f"total={len(messages)} msgs | "
            f"turns_already_sent={turns_already_sent} | "
            f"roles=[{', '.join(m.role for m in messages)}]"
        )

        if turns_already_sent > 0:
            # Skip the first `turns_already_sent` assistant messages and
            # everything before them — DeepSeek already has that context.
            asst_seen = 0
            cut_idx = None
            for i, m in enumerate(non_system):
                if m.role == "assistant":
                    asst_seen += 1
                    if asst_seen == turns_already_sent:
                        cut_idx = i + 1  # start of new content
                        break

            if cut_idx is not None:
                tail = non_system[cut_idx:]
                logger.info(
                    f"[build_prompt] skipped {turns_already_sent} assistant turn(s) "
                    f"(cut at non_system[{cut_idx}]) "
                    f"-> sending {len(tail)} new msg(s)"
                )
            else:
                # Fewer assistant messages in history than expected —
                # fall back to sending everything after the last assistant msg.
                last_asst_idx = None
                for i in range(len(non_system) - 1, -1, -1):
                    if non_system[i].role == "assistant":
                        last_asst_idx = i
                        break
                if last_asst_idx is not None:
                    tail = non_system[last_asst_idx + 1:]
                    logger.warning(
                        f"[build_prompt] turns_already_sent={turns_already_sent} but "
                        f"only found {asst_seen} assistant msg(s); "
                        f"falling back to last-assistant cut at [{last_asst_idx}] "
                        f"-> sending {len(tail)} msg(s)"
                    )
                else:
                    tail = non_system
                    logger.warning(
                        f"[build_prompt] no assistant msg found despite turns_already_sent={turns_already_sent} "
                        f"-> sending all {len(tail)} non-system msgs"
                    )
        else:
            # turns_already_sent == 0 but only_last_turn is True means this is
            # effectively the first real content turn after session creation.
            # Find the last assistant message the old way.
            last_asst_idx = None
            for i in range(len(non_system) - 1, -1, -1):
                if non_system[i].role == "assistant":
                    last_asst_idx = i
                    break

            if last_asst_idx is not None:
                tail = non_system[last_asst_idx + 1:]
                logger.info(
                    f"[build_prompt] last assistant at non_system[{last_asst_idx}] "
                    f"-> sending {len(tail)} new msg(s) after it"
                )
            else:
                tail = non_system
                logger.warning(
                    f"[build_prompt] no assistant msg in history "
                    f"(agent full-transcript pattern) "
                    f"-> sending all {len(tail)} non-system msgs"
                )

        messages = system_msgs + tail
        logger.info(
            f"[build_prompt] trimmed {len(req.messages)} -> {len(messages)} msgs sent to DeepSeek"
        )
    else:
        logger.info(
            f"[build_prompt] first turn -> sending all {len(messages)} msgs"
        )

    for m in messages:
        role = m.role
        text = _flatten_content(m.content)
        tool_calls = getattr(m, "tool_calls", None)
        tool_call_id = getattr(m, "tool_call_id", None)

        if role == "system":
            if text:
                parts.append(text)

        elif role == "user":
            if text:
                parts.append(f"User: {text}")

        elif role == "assistant":
            has_content = bool(text and text.strip())
            has_tool_calls = bool(tool_calls)

            if has_content and has_tool_calls:
                block = f"Assistant: {text}"
                for tc in tool_calls:
                    fn = tc.get("function", {}) if isinstance(tc, dict) else {}
                    name = fn.get("name", "unknown")
                    args = fn.get("arguments", "{}")
                    block += f"\n[Tool call: {name}({args})]"
                parts.append(block)
            elif has_tool_calls:
                block = "Assistant called tools:"
                for tc in tool_calls:
                    fn = tc.get("function", {}) if isinstance(tc, dict) else {}
                    name = fn.get("name", "unknown")
                    args = fn.get("arguments", "{}")
                    block += f"\n[Tool call: {name}({args})]"
                parts.append(block)
            elif has_content:
                parts.append(f"Assistant: {text}")

        elif role == "tool":
            result_text = _truncate_tool_result(text, str(tool_call_id))
            parts.append(f"[Tool result for {tool_call_id}]: {result_text}")

    transcript = "\n\n".join(parts)

    if tools:
        tool_instr = build_tool_instruction(tools)
        return f"{transcript}\n\n{tool_instr}\n\nRespond now."

    return transcript


# ---------------------------------------------------------------------------
# Title generation
# ---------------------------------------------------------------------------

_TITLE_GEN_MARKERS = (
    "title generator",
    "thread title",
    "generate a brief title",
    "you output only a thread title",
)


def _is_title_generation_request(messages) -> bool:
    for m in messages:
        if m.role == "system":
            sys_prompt = _flatten_content(m.content).lower()
            return any(marker in sys_prompt for marker in _TITLE_GEN_MARKERS)
    return False


async def _handle_title_generation(req: ChatCompletionRequest):
    title = ""
    for m in reversed(req.messages):
        if m.role == "user":
            title = _flatten_content(m.content).strip().splitlines()[0][:50]
            break

    async def _title_stream():
        yield _chunk({"role": "assistant", "content": title})
        yield _chunk({}, finish="stop")
        yield "data: [DONE]\n\n"

    if req.stream:
        return StreamingResponse(
            _title_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    return {
        "id": "chatcmpl-title",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": req.model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": title}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


# ---------------------------------------------------------------------------
# Session management — with auto-reset on stagnation
# ---------------------------------------------------------------------------

async def _get_or_create_deepseek_session(
    client: DeepSeekClient,
    conversation_id: str,
    model_type: str,
    is_first_turn: bool,
) -> tuple[str, int | None]:
    """
    Return (chat_session_id, parent_message_id).

    Auto-resets the DeepSeek session if the message tree stops advancing:
    last_message_id is stuck at the same value as the previous turn's parent,
    AND the previous turn produced an empty stream.
    """
    existing = store.get_session(conversation_id)

    # ---- no existing session → create fresh ----
    if not (existing and existing.get("chat_session_id")) or is_first_turn:
        reason = "first-turn" if is_first_turn else "no-session"
        logger.info(f"[{conversation_id}] new DS session (reason={reason})")
        chat_session_id = await client.create_session()
        store.upsert_session(
            conversation_id=conversation_id,
            chat_session_id=chat_session_id,
            last_message_id=None,
            model_type=model_type,
            last_parent_seen=None,
            stuck_count=0,
            last_stream_empty=0,
        )
        return chat_session_id, None

    last_id = existing.get("last_message_id")
    last_parent_seen = existing.get("last_parent_seen")
    stuck_count = existing.get("stuck_count") or 0
    last_empty = existing.get("last_stream_empty") or 0

    is_stagnant = (
        last_id is None
        or (last_parent_seen is not None and last_id == last_parent_seen)
    )

    if is_stagnant and last_empty:
        stuck_count += 1
        logger.warning(
            f"[{conversation_id}] parent_msg stuck at {last_id} "
            f"(stuck_count={stuck_count}, prev_empty={last_empty})"
        )
    else:
        stuck_count = 0

    if stuck_count >= STUCK_RESET_THRESHOLD:
        logger.error(
            f"[{conversation_id}] parent_msg stuck for {stuck_count} turns — "
            f"resetting DS session to recover"
        )
        chat_session_id = await client.create_session()
        store.upsert_session(
            conversation_id=conversation_id,
            chat_session_id=chat_session_id,
            last_message_id=None,
            model_type=model_type,
            last_parent_seen=None,
            stuck_count=0,
            last_stream_empty=0,
        )
        return chat_session_id, None

    logger.debug(
        f"[{conversation_id}] reusing DS session "
        f"(parent_msg={last_id}, stuck_count={stuck_count})"
    )
    return existing["chat_session_id"], last_id


# ---------------------------------------------------------------------------
# Tool call response builder
# ---------------------------------------------------------------------------

def _emit_tool_call_chunks(tool_calls, conversation_id, model_type):
    """
    Emit tool calls as incremental SSE chunks.

    The AI SDK's tool-call tracker is sensitive to sparse indices and to
    receiving the complete call in a single chunk. We emit:
      1. role chunk
      2. one chunk per tool call with id/name/type (no arguments)
      3. one chunk per tool call with the argument JSON delta
      4. finish_reason: tool_calls
    """
    oc_tool_calls = to_openai_tool_calls(tool_calls)

    yield _chunk(
        {"role": "assistant", "content": None},
        conversation_id=conversation_id,
        model=model_type,
    )

    # First announce each tool call (id + name).
    for tc in oc_tool_calls:
        yield _sse({
            "id": "chatcmpl-deepseek",
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": model_type,
            "conversation_id": conversation_id,
            "choices": [{
                "index": 0,
                "delta": {
                    "tool_calls": [{
                        "index": tc["index"],
                        "id": tc["id"],
                        "type": "function",
                        "function": {"name": tc["function"]["name"]},
                    }]
                },
                "finish_reason": None,
            }],
        })

    # Then stream the argument deltas.
    for tc in oc_tool_calls:
        yield _sse({
            "id": "chatcmpl-deepseek",
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": model_type,
            "conversation_id": conversation_id,
            "choices": [{
                "index": 0,
                "delta": {
                    "tool_calls": [{
                        "index": tc["index"],
                        "id": tc["id"],
                        "type": "function",
                        "function": {"arguments": tc["function"]["arguments"]},
                    }]
                },
                "finish_reason": None,
            }],
        })

    yield _chunk({}, finish="tool_calls", conversation_id=conversation_id, model=model_type)


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------

def _record_turn_state(conversation_id, chat_session_id, model_type,
                       parent_message_id, client, success: bool = True):
    """Persist the outcome of this turn so the next turn can detect stagnation."""
    existing = store.get_session(conversation_id)
    prev_parent = parent_message_id
    new_last_id = client.last_message_id
    stream_empty = 1 if getattr(client, "last_stream_empty", False) else 0

    if stream_empty and new_last_id is not None and new_last_id == prev_parent:
        new_stuck = (existing.get("stuck_count") or 0) + 1 if existing else 1
    else:
        new_stuck = 0

    # Only increment turns_sent when DeepSeek actually produced a response
    prev_turns = (existing.get("turns_sent") or 0) if existing else 0
    new_turns = prev_turns + 1 if success else prev_turns

    store.upsert_session(
        conversation_id=conversation_id,
        chat_session_id=chat_session_id,
        last_message_id=new_last_id,
        model_type=model_type,
        last_parent_seen=prev_parent,
        stuck_count=new_stuck,
        last_stream_empty=stream_empty,
        turns_sent=new_turns,
    )


async def _stream_with_client(req: ChatCompletionRequest, conversation_id: str):
    model_type = _resolve_model(req)
    existing = store.get_session(conversation_id)
    is_first_turn = not (existing and existing.get("chat_session_id"))
    turns_already_sent = (existing.get("turns_sent") or 0) if existing else 0

    async with DeepSeekClient() as client:
        chat_session_id, parent_message_id = await _get_or_create_deepseek_session(
            client, conversation_id, model_type, is_first_turn
        )

        prompt = _build_prompt(
            req,
            only_last_turn=not is_first_turn,
            turns_already_sent=turns_already_sent,
        )
        prompt_tokens = client.count_prompt_tokens(prompt)

        logger.info(
            f"[{conversation_id}] stream "
            f"(ds={chat_session_id[:8]}, first={is_first_turn}, "
            f"only_last_turn={not is_first_turn}, "
            f"turns_already_sent={turns_already_sent}, "
            f"prompt_len={len(prompt)}, prompt_tokens={prompt_tokens}, "
            f"parent_msg={parent_message_id})"
        )

        events = client.completion(
            chat_session_id=chat_session_id,
            prompt=prompt,
            parent_message_id=parent_message_id,
            model_type=model_type,
            thinking_enabled=req.thinking_enabled,
            search_enabled=req.search_enabled,
            max_tokens=req.max_tokens,
        )

        include_usage = (
            isinstance(req.stream_options, dict)
            and req.stream_options.get("include_usage")
        )

        if req.tools:
            buffer = ""
            async for ev in events:
                data = ev.get("data")
                if not isinstance(data, dict):
                    continue
                if "v" in data and isinstance(data["v"], dict) and "response" in data["v"]:
                    for frag in data["v"]["response"].get("fragments", []):
                        if frag.get("content"):
                            buffer += frag["content"]
                elif set(data.keys()) == {"v"} and isinstance(data["v"], str):
                    buffer += data["v"]
                elif data.get("p") == "response/status" and data.get("v") == "FINISHED":
                    break

            _record_turn_state(conversation_id, chat_session_id, model_type,
                               parent_message_id, client, success=bool(buffer.strip()))

            # ---- EMPTY RESPONSE GUARD ----
            if not buffer.strip():
                logger.error(
                    f"[{conversation_id}] DeepSeek returned EMPTY response "
                    f"(prompt_len={len(prompt)}, parent_msg={parent_message_id}, "
                    f"last_msg_id={client.last_message_id})"
                )
                error_payload = json.dumps({
                    "error": {
                        "message": "DeepSeek returned an empty response. "
                                   "The session may be stale. Retry or start a new chat.",
                        "type": "upstream_error",
                        "code": 502,
                    }
                }, ensure_ascii=False)
                yield f"data: {error_payload}\n\n"
                yield "data: [DONE]\n\n"
                return

            truncated = _is_truncated_json(buffer)
            if truncated:
                logger.warning(
                    f"[{conversation_id}] DeepSeek response appears truncated "
                    f"(len={len(buffer)}) — attempting parse anyway"
                )

            tool_calls = parse_tool_calls(buffer)
            if tool_calls:
                logger.info(
                    f"[{conversation_id}] parsed {len(tool_calls)} tool call(s): "
                    f"{[tc['name'] for tc in tool_calls]}"
                )
                for chunk in _emit_tool_call_chunks(tool_calls, conversation_id, model_type):
                    yield chunk
                if include_usage:
                    usage = _compute_usage(client, prompt_tokens, conversation_id)
                    yield _usage_chunk(usage["prompt_tokens"], usage["completion_tokens"], model_type)
                yield "data: [DONE]\n\n"
                client.prev_token_usage = client.last_token_usage
                return

            cleaned = strip_tool_calls_from_text(buffer)
            logger.debug(f"[{conversation_id}] no tool calls found, emitting text")
            yield _chunk(
                {"role": "assistant", "content": None},
                conversation_id=conversation_id,
                model=model_type,
            )
            if cleaned:
                yield _chunk(
                    {"content": cleaned},
                    conversation_id=conversation_id,
                    model=model_type,
                )
            finish = "length" if truncated else "stop"
            yield _chunk({}, finish=finish, conversation_id=conversation_id, model=model_type)
            if include_usage:
                usage = _compute_usage(client, prompt_tokens, conversation_id)
                yield _usage_chunk(usage["prompt_tokens"], usage["completion_tokens"], model_type)
            yield "data: [DONE]\n\n"
            client.prev_token_usage = client.last_token_usage
            return

        # No tools — stream normally
        async for chunk in to_openai_sse(events, conversation_id):
            if chunk == "data: [DONE]\n\n":
                _record_turn_state(conversation_id, chat_session_id, model_type,
                                   parent_message_id, client)

                if include_usage:
                    usage = _compute_usage(client, prompt_tokens, conversation_id)
                    yield _usage_chunk(usage["prompt_tokens"], usage["completion_tokens"], model_type)
                client.prev_token_usage = client.last_token_usage
            yield chunk


# ---------------------------------------------------------------------------
# Non-streaming
# ---------------------------------------------------------------------------

async def _handle_completion(req: ChatCompletionRequest, conversation_id: str):
    model_type = _resolve_model(req)
    existing = store.get_session(conversation_id)
    is_first_turn = not (existing and existing.get("chat_session_id"))
    turns_already_sent = (existing.get("turns_sent") or 0) if existing else 0

    async with DeepSeekClient() as client:
        chat_session_id, parent_message_id = await _get_or_create_deepseek_session(
            client, conversation_id, model_type, is_first_turn
        )

        prompt = _build_prompt(
            req,
            only_last_turn=not is_first_turn,
            turns_already_sent=turns_already_sent,
        )
        prompt_tokens = client.count_prompt_tokens(prompt)

        logger.info(
            f"[{conversation_id}] non-stream "
            f"(ds={chat_session_id[:8]}, first={is_first_turn}, "
            f"only_last_turn={not is_first_turn}, "
            f"turns_already_sent={turns_already_sent}, "
            f"prompt_len={len(prompt)}, prompt_tokens={prompt_tokens}, "
            f"parent_msg={parent_message_id})"
        )

        events = client.completion(
            chat_session_id=chat_session_id,
            prompt=prompt,
            parent_message_id=parent_message_id,
            model_type=model_type,
            thinking_enabled=req.thinking_enabled,
            search_enabled=req.search_enabled,
            max_tokens=req.max_tokens,
        )

        text = ""
        async for ev in events:
            data = ev.get("data")
            if not isinstance(data, dict):
                continue
            if "v" in data and isinstance(data["v"], dict) and "response" in data["v"]:
                for frag in data["v"]["response"].get("fragments", []):
                    if frag.get("content"):
                        text += frag["content"]
            elif set(data.keys()) == {"v"} and isinstance(data["v"], str):
                text += data["v"]
            elif data.get("p") == "response/status" and data.get("v") == "FINISHED":
                break

        _record_turn_state(conversation_id, chat_session_id, model_type,
                           parent_message_id, client)

        usage = _compute_usage(client, prompt_tokens, conversation_id)
        client.prev_token_usage = client.last_token_usage

        if req.tools:
            if not text.strip():
                logger.error(f"[{conversation_id}] non-stream: empty DeepSeek response")
                raise UpstreamError("DeepSeek returned an empty response")

            truncated = _is_truncated_json(text)
            if truncated:
                logger.warning(
                    f"[{conversation_id}] non-stream response appears truncated "
                    f"(len={len(text)}) — attempting parse anyway"
                )

            tool_calls = parse_tool_calls(text)
            if tool_calls:
                logger.info(
                    f"[{conversation_id}] parsed {len(tool_calls)} tool call(s): "
                    f"{[tc['name'] for tc in tool_calls]}"
                )
                return {
                    "id": f"chatcmpl-{chat_session_id[:8]}",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": model_type,
                    "conversation_id": conversation_id,
                    "choices": [{
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": to_openai_tool_calls(tool_calls),
                        },
                        "finish_reason": "tool_calls",
                    }],
                    "usage": usage,
                }

            tool_choice = getattr(req, "tool_choice", "auto")
            is_required = tool_choice == "required" or (
                isinstance(tool_choice, dict) and tool_choice.get("type") == "function"
            )
            if is_required:
                logger.warning(f"[{conversation_id}] tool_choice=required but no tool call received")
                return {
                    "id": f"chatcmpl-{chat_session_id[:8]}",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": model_type,
                    "conversation_id": conversation_id,
                    "choices": [{
                        "index": 0,
                        "message": {"role": "assistant", "content": None, "tool_calls": []},
                        "finish_reason": "tool_calls",
                    }],
                    "usage": usage,
                }

        finish = "length" if (_is_truncated_json(text) and text.strip()) else "stop"
        return {
            "id": f"chatcmpl-{chat_session_id[:8]}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model_type,
            "conversation_id": conversation_id,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": finish,
            }],
            "usage": usage,
        }


# ---------------------------------------------------------------------------
# Main route
# ---------------------------------------------------------------------------

@router.post("/v1/chat/completions")
async def chat_completions(req: ChatCompletionRequest, request: Request):
    try:
        if _is_title_generation_request(req.messages):
            logger.debug("[title-gen] intercepted — not forwarding to DeepSeek")
            return await _handle_title_generation(req)

        conversation_id, source = _derive_session_key(req, request)
        logger.info(
            f"[session] id={conversation_id} source={source} "
            f"msgs={len(req.messages)} tools={len(req.tools or [])} stream={req.stream}"
        )

        if req.stream:
            return StreamingResponse(
                _stream_with_client(req, conversation_id),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Accel-Buffering": "no",
                    "Connection": "keep-alive",
                    "X-Conversation-Id": conversation_id,
                },
            )

        return await _handle_completion(req, conversation_id)

    except AuthError as e:
        raise HTTPException(status_code=401, detail=f"DeepSeek auth failed: {e}")
    except UpstreamError as e:
        raise HTTPException(status_code=502, detail=f"DeepSeek error: {e}")
    except DeepSeekError as e:
        raise HTTPException(status_code=500, detail=str(e))
