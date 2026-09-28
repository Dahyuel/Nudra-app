import json as _json
import time as _time

from loguru import logger

from app.tool_calling import (
    parse_tool_calls,
    strip_tool_calls_from_text,
    to_openai_tool_calls,
)


# Markers that indicate a tool call is being emitted in the stream.
# If we see any of these, we switch to "buffer" mode: hold text until the
# stream finishes, then parse out tool calls instead of forwarding raw text.
_DSML_MARKERS = ("<|DSML|", "<｜｜DSML｜｜", "<tool_call>", "<|tool_call|>")


def _looks_like_tool_call(text: str) -> bool:
    if not text:
        return False
    if "DSML" in text:
        return True
    for marker in _DSML_MARKERS:
        if marker in text:
            return True
    return False


def _sse_raw(payload: dict) -> str:
    return f"data: {_json.dumps(payload, ensure_ascii=False)}\n\n"


async def to_openai_sse(events, conversation_id: str | None = None):
    """
    Convert DeepSeek SSE events to OpenAI SSE chunks.

    Buffers assistant content while streaming.  If the accumulated text
    contains tool-call markup (DSML or <tool_call> blocks), it parses them
    and emits OpenAI tool_calls chunks instead of raw text.  Otherwise it
    forwards the text as normal content chunks.

    Reasoning/thinking fragments are always forwarded immediately because
    they never contain tool calls.
    """
    cid = "chatcmpl-deepseek"
    created = int(_time.time())
    model = "deepseek-web"

    def chunk(delta, finish=None):
        payload = {
            "id": cid,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
        }
        if conversation_id:
            payload["conversation_id"] = conversation_id
        return f"data: {_json.dumps(payload, ensure_ascii=False)}\n\n"

    yield chunk({"role": "assistant", "content": ""})

    text_buffer: list[str] = []
    buffering = False
    emitted_text_len = 0

    try:
        async for ev in events:
            if "event" in ev and "data" not in ev:
                evt = ev["event"]
                if evt == "close":
                    break
                if evt in ("continue", "auto_continue"):
                    continue
                continue

            data = ev.get("data")
            if not isinstance(data, dict):
                continue

            reasoning = None
            content = None
            if "v" in data and isinstance(data["v"], dict) and "response" in data["v"]:
                for frag in data["v"]["response"].get("fragments", []):
                    if not isinstance(frag, dict):
                        continue
                    if frag.get("reasoning_content") or frag.get("thinking") or frag.get("reasoning"):
                        reasoning = (
                            frag.get("reasoning_content")
                            or frag.get("thinking")
                            or frag.get("reasoning")
                        )
                    elif frag.get("content"):
                        content = frag["content"]
            elif data.get("o") == "APPEND" and "v" in data:
                content = data["v"]
            elif set(data.keys()) == {"v"} and isinstance(data["v"], str):
                content = data["v"]

            if reasoning:
                # Reasoning never contains tool calls — forward immediately.
                yield chunk({"reasoning_content": reasoning})

            if content:
                text_buffer.append(content)

                if not buffering:
                    partial = "".join(text_buffer)
                    if _looks_like_tool_call(partial):
                        buffering = True
                    else:
                        # Hold back a small tail in case a marker is split
                        # across chunks.  Only forward what we're confident is
                        # plain prose.
                        safe_len = max(0, len(partial) - 32)
                        if safe_len > emitted_text_len:
                            new_text = partial[emitted_text_len:safe_len]
                            emitted_text_len = safe_len
                            if new_text:
                                yield chunk({"content": new_text})

            if reasoning or content:
                continue

            if data.get("p") == "response/status" and data.get("v") == "FINISHED":
                break

    except Exception as e:
        logger.error(f"stream error: {e}")

    # ---- Stream done. Decide what to do with the buffer. ----
    full_text = "".join(text_buffer)

    if _looks_like_tool_call(full_text):
        parsed = parse_tool_calls(full_text)
        if parsed:
            oc_tool_calls = to_openai_tool_calls(parsed)

            for tc in oc_tool_calls:
                yield _sse_raw({
                    "id": cid,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model,
                    **({"conversation_id": conversation_id} if conversation_id else {}),
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
                yield _sse_raw({
                    "id": cid,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model,
                    **({"conversation_id": conversation_id} if conversation_id else {}),
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

            yield chunk({}, finish="tool_calls")
            yield "data: [DONE]\n\n"
            return

        # No parseable tool calls — fall back to emitting the stripped text.
        logger.warning(
            f"DSML markers seen but no tool calls parsed. "
            f"Raw text (first 500 chars): {full_text[:500]!r}"
        )
        stripped = strip_tool_calls_from_text(full_text)
        if stripped:
            if len(stripped) > emitted_text_len:
                remaining = stripped[emitted_text_len:]
                if remaining:
                    yield chunk({"content": remaining})
    else:
        # No tool calls. Flush any tail we held back.
        if len(full_text) > emitted_text_len:
            remaining = full_text[emitted_text_len:]
            if remaining:
                yield chunk({"content": remaining})

    yield chunk({}, finish="stop")
    yield "data: [DONE]\n\n"
